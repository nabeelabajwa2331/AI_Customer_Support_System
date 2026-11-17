import type { User } from '@prisma/client';

import { config } from '../config/env.js';
import { AppError, conflict, unauthorized } from '../lib/errors.js';
import { verifyGoogleIdToken, type GoogleIdentity } from '../lib/google.js';
import { signAccessToken } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { generateOpaqueToken, hashToken } from '../lib/tokens.js';
import type { LoginInput, RegisterInput } from '../schemas/auth.schemas.js';

/** User shape safe to return to clients (never includes `passwordHash`). */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: User['role'];
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: PublicUser;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function refreshTokenExpiry(): Date {
  return new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

// Dummy bcrypt hash used to equalize login timing for unknown emails.
let dummyHashPromise: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('not-a-real-password-value');
  return dummyHashPromise;
}

// Issues a fresh access + refresh token; when rotating, revokes the old row in
// the same transaction.
async function issueTokens(user: User, rotateFromTokenId?: string): Promise<AuthTokens> {
  const accessToken = await signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = generateOpaqueToken();

  const createRefresh = prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
    },
  });

  if (rotateFromTokenId) {
    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: rotateFromTokenId },
        data: { revokedAt: new Date() },
      }),
      createRefresh,
    ]);
  } else {
    await createRefresh;
  }

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: config.jwtExpiresIn,
    user: toPublicUser(user),
  };
}

export async function register(input: RegisterInput): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('An account with this email already exists');
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      // Public registration is always CUSTOMER; privileged roles are trusted-only.
      role: 'CUSTOMER',
    },
  });

  return toPublicUser(user);
}

export async function login(input: LoginInput): Promise<AuthTokens> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always compare so timing does not reveal whether the email exists.
  const passwordHash = user?.passwordHash ?? (await getDummyHash());
  const passwordValid = await verifyPassword(input.password, passwordHash);

  if (!user || !passwordValid) {
    throw unauthorized('Invalid email or password');
  }

  return issueTokens(user);
}

export async function refresh(rawToken: string): Promise<AuthTokens> {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });

  if (!record) {
    throw unauthorized('Invalid or expired refresh token');
  }

  if (record.revokedAt) {
    // A reused revoked token can mean theft, so revoke all of the user's tokens.
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Invalid or expired refresh token');
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('Invalid or expired refresh token');
  }

  return issueTokens(record.user, record.id);
}

export async function logout(rawToken: string): Promise<void> {
  // Idempotent: revoking an unknown/already-revoked token is a no-op.
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Signs in with a Google ID token. Matches an existing account by verified
 * email; otherwise creates a CUSTOMER account. Google sign-in never grants a
 * staff role on its own.
 */
export async function loginWithGoogle(
  credential: string,
  keys?: Parameters<typeof verifyGoogleIdToken>[1]['keys'],
): Promise<AuthTokens> {
  if (!config.googleClientId) {
    throw new AppError(404, 'GOOGLE_AUTH_DISABLED', 'Google sign-in is not enabled');
  }

  let identity: GoogleIdentity;
  try {
    identity = await verifyGoogleIdToken(credential, { clientId: config.googleClientId, keys });
  } catch {
    throw unauthorized('Google sign-in failed');
  }

  if (!identity.emailVerified) {
    throw unauthorized('Your Google account email is not verified');
  }

  const email = identity.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) return issueTokens(existing);

  const user = await prisma.user.create({
    data: {
      name: (identity.name ?? email.split('@')[0] ?? 'Customer').slice(0, 120),
      email,
      // Google-only accounts get an unguessable password, so password login is
      // impossible until a password-reset feature exists.
      passwordHash: await hashPassword(generateOpaqueToken()),
      role: 'CUSTOMER',
    },
  });

  return issueTokens(user);
}

export async function updateProfile(userId: string, name: string): Promise<PublicUser> {
  const user = await prisma.user.update({ where: { id: userId }, data: { name } });
  return toPublicUser(user);
}

/**
 * Changes the password after verifying the current one, revokes every refresh
 * token (signing out other devices), and returns a fresh session for this one.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<AuthTokens> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('Authentication required');

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'The current password is incorrect');
  }

  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new AppError(
      400,
      'PASSWORD_UNCHANGED',
      'Choose a password different from the current one',
    );
  }

  const passwordHash = await hashPassword(newPassword);
  // Old sessions are deleted rather than marked revoked: a revoked token being
  // reused triggers theft detection, which would also end the new session.
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ]);

  return issueTokens(updated);
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw unauthorized('Authentication required');
  }
  return toPublicUser(user);
}
