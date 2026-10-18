import 'dotenv/config';

import { resolveTestDatabaseUrl } from './test-database-url.js';

// Runs before app modules load so config sees the test values.

process.env.NODE_ENV = 'test';

// Point DATABASE_URL at the isolated test schema.
process.env.DATABASE_URL = resolveTestDatabaseUrl();

// Deterministic, non-secret test values.
process.env.AUTH_SECRET ??= 'test-only-auth-secret-do-not-use-in-production-0123456789';
process.env.BCRYPT_ROUNDS ??= '10';
