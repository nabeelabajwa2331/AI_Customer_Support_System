import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

// Google's published signing keys; jose caches them and refetches on rotation.
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let googleKeys: JWTVerifyGetKey | undefined;

export interface GoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

interface VerifyOptions {
  clientId: string;
  /** Overrides Google's key set (used by tests with locally generated keys). */
  keys?: JWTVerifyGetKey;
}

/**
 * Verifies a Google Identity Services ID token: signature against Google's
 * keys, issuer, audience (our client ID) and expiry. Throws on any failure.
 */
export async function verifyGoogleIdToken(
  credential: string,
  { clientId, keys }: VerifyOptions,
): Promise<GoogleIdentity> {
  googleKeys ??= createRemoteJWKSet(GOOGLE_JWKS_URL);

  const { payload } = await jwtVerify(credential, keys ?? googleKeys, {
    issuer: GOOGLE_ISSUERS,
    audience: clientId,
    algorithms: ['RS256'],
  });

  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Google token is missing the subject or email.');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : null,
  };
}
