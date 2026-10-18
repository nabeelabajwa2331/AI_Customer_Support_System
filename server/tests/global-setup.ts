import 'dotenv/config';

import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

import { resolveTestDatabaseUrl } from './test-database-url.js';

function resolveSchema(url: string): string {
  try {
    return new URL(url).searchParams.get('schema') ?? 'public';
  } catch {
    return 'public';
  }
}

// Creates the isolated test schema if needed and applies migrations to it.
// Never touches the development `public` schema.
export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = resolveTestDatabaseUrl();
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
