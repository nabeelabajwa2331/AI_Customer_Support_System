import 'dotenv/config';

import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

function resolveSchema(url: string): string {
  try {
    return new URL(url).searchParams.get('schema') ?? 'public';
  } catch {
    return 'public';
  }
}

/**
 * Global test setup: prepare an isolated database target.
 *
 * We create the schema named in TEST_DATABASE_URL (typically `test`) if it does
 * not exist, then apply the committed migrations to it. This never drops or
 * modifies the development `public` schema.
 */
export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl || testDatabaseUrl.includes('CHANGE_ME')) {
    throw new Error('TEST_DATABASE_URL is required to run the test suite.');
  }

  const schema = resolveSchema(testDatabaseUrl);
  const bootstrap = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    await bootstrap.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await bootstrap.$disconnect();
  }

  execSync('npx prisma migrate deploy --schema=prisma/schema.prisma', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });
}
