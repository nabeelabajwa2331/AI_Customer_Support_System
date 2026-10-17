import type { User } from '@prisma/client';

import { config } from '../config/env.js';
import { conflict, unauthorized } from '../lib/errors.js';
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

// Lazily-computed bcrypt hash used only to equalize login timing for unknown
// emails. It is never a valid password for any account.
let dummyHashPromise: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('not-a-real-password-value');
  return dummyHashPromise;
}

/**
 * Issue a new access token and a new refresh token. When rotating, the
 * previous refresh token row is revoked in the same transaction.
 */
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
      // Public registration is hard-limited to CUSTOMER. Privileged roles are
      // assigned only through trusted, out-of-band processes.
      role: 'CUSTOMER',
    },
  });

  return toPublicUser(user);
}

export async function login(input: LoginInput): Promise<AuthTokens> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always run a bcrypt comparison so response timing does not reveal whether
  // the email exists.
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
    // A revoked token presented again can indicate replay/theft. Revoke every
    // active token for this user as a precaution.
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

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw unauthorized('Authentication required');
  }
  return toPublicUser(user);
}
