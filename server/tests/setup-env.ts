import 'dotenv/config';

import { resolveTestDatabaseUrl } from './test-database-url.js';

// Runs before app modules load so config sees the test values.

process.env.NODE_ENV = 'test';

// Validate TEST_DATABASE_URL and point DATABASE_URL at the dedicated test
// database. This also covers module-level PrismaClient instances in application
// and repository modules, which read DATABASE_URL when they are imported.
process.env.DATABASE_URL = resolveTestDatabaseUrl();

// Deterministic, non-secret test values.
process.env.AUTH_SECRET ??= 'test-only-auth-secret-do-not-use-in-production-0123456789';
process.env.BCRYPT_ROUNDS ??= '10';
