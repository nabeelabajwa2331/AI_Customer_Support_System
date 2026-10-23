import 'dotenv/config';

import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

import {
  getTestDatabaseSchema,
  quotePostgresIdentifier,
  resolveTestDatabaseUrl,
} from './test-database-url.js';

// Creates the configured test schema if needed and applies migrations to the
// dedicated test database. resolveTestDatabaseUrl rejects TEST_DATABASE_URL when
// it targets the same database as DATABASE_URL, so development data is untouched.
export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = resolveTestDatabaseUrl();
  const schema = getTestDatabaseSchema(testDatabaseUrl);

  const bootstrap = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    // quotePostgresIdentifier validates and quotes the identifier, so the value
    // cannot escape this SQL identifier.
    await bootstrap.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS ${quotePostgresIdentifier(schema)}`,
    );
  } finally {
    await bootstrap.$disconnect();
  }

  execSync('npx prisma migrate deploy --schema=prisma/schema.prisma', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });
}
