import 'dotenv/config';

// This file runs before any application/test module is imported, so the config
// module (which validates process.env at import time) sees the test values.

process.env.NODE_ENV = 'test';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl || testDatabaseUrl.includes('CHANGE_ME')) {
  throw new Error(
    'TEST_DATABASE_URL is required to run the test suite.\n' +
      'Add it to server/.env (see the root .env.example). Example:\n' +
      '  TEST_DATABASE_URL="postgresql://postgres:<password>@127.0.0.1:5432/ai_customer_support?schema=test"',
  );
}

// Application code reads DATABASE_URL; point it at the isolated test schema so
// tests never touch the development data.
process.env.DATABASE_URL = testDatabaseUrl;

// Deterministic, non-secret test values.
process.env.AUTH_SECRET ??= 'test-only-auth-secret-do-not-use-in-production-0123456789';
process.env.BCRYPT_ROUNDS ??= '10';
