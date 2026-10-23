// Resolves and validates the isolated database used by the automated test suite.
//
// A dedicated test database is required. Deriving the legacy `test` schema from
// DATABASE_URL is intentionally unsupported: pgvector's `vector` type lives in
// `public`, which is not on that schema's search_path.

interface DatabaseTarget {
  readonly url: string;
  readonly database: string;
  readonly schema: string | null;
}

const POSTGRES_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_IDENTIFIER_LENGTH = 63;

let resolvedTestDatabaseUrl: string | undefined;

function assertValidPostgresIdentifier(value: string, label: string): void {
  if (
    value.length === 0 ||
    value.length > MAX_IDENTIFIER_LENGTH ||
    !POSTGRES_IDENTIFIER.test(value)
  ) {
    throw new Error(`${label} must be a valid PostgreSQL identifier.`);
  }
}

/** Quotes an identifier only after validating it as a PostgreSQL identifier. */
export function quotePostgresIdentifier(value: string): string {
  assertValidPostgresIdentifier(value, 'Schema');
  // Validated identifiers cannot contain quotes, but escaping is cheap defense
  // in depth if this helper is reused.
  return `"${value.replace(/"/g, '""')}"`;
}

function decodeCredential(value: string, label: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`${label} must include valid percent-encoded credentials.`);
  }
}

function hasChangeMePlaceholder(value: string): boolean {
  if (value.includes('CHANGE_ME')) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  try {
    return [parsed.username, parsed.password].some((credential) =>
      decodeURIComponent(credential).includes('CHANGE_ME'),
    );
  } catch {
    return false;
  }
}

function parseSchema(searchParams: URLSearchParams, label: string): string | null {
  const schemas = searchParams.getAll('schema');

  if (schemas.length === 0) {
    return null;
  }

  if (schemas.length > 1) {
    throw new Error(`${label} must include at most one schema parameter.`);
  }

  const schema = schemas[0]!;

  if (schema.trim() === '') {
    throw new Error(`${label} schema must not be empty.`);
  }

  assertValidPostgresIdentifier(schema, `${label} schema`);

  return schema;
}

function parseDatabaseTarget(value: string, label: string): DatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL connection URL.`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`${label} must use a postgresql:// or postgres:// URL.`);
  }

  if (value.includes('#')) {
    throw new Error(`${label} must not contain a URL fragment.`);
  }

  if (!/^\/[^/]+$/.test(parsed.pathname)) {
    throw new Error(
      `${label} must include exactly one database name segment ` +
        '(no trailing slash or additional path segments).',
    );
  }

  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error(`${label} must include a valid database name.`);
  }

  if (!database) {
    throw new Error(`${label} must include a database name.`);
  }

  if (database.includes('/') || database.includes('\\')) {
    throw new Error(`${label} database name must not contain encoded path separators.`);
  }

  // Reject malformed credentials even when they do not contain the placeholder.
  decodeCredential(parsed.username, label);
  decodeCredential(parsed.password, label);

  const schema = parseSchema(parsed.searchParams, label);

  return { url: value, database, schema };
}

function assertSupportedTestSchema(schema: string | null): void {
  if (schema !== null && schema !== 'public') {
    throw new Error(
      'TEST_DATABASE_URL must use the "public" schema or omit the schema parameter. ' +
        'The legacy "test" schema is not supported because pgvector is installed in public.',
    );
  }
}

/**
 * Validates that a test database URL is explicitly configured and isolated from
 * the main database. Exported so it can be unit-tested without touching env vars.
 */
export function assertSafeTestDatabase(
  testDatabaseUrl: string | undefined,
  mainDatabaseUrl: string | undefined,
): string {
  if (!testDatabaseUrl || hasChangeMePlaceholder(testDatabaseUrl)) {
    throw new Error(
      'TEST_DATABASE_URL is required and must point to a separate test database ' +
        '(for example ai_customer_support_test). The legacy "test" schema in the ' +
        'main database is not supported. See .env.example.',
    );
  }

  if (!mainDatabaseUrl || hasChangeMePlaceholder(mainDatabaseUrl)) {
    throw new Error(
      'DATABASE_URL is required and must be configured so the test database can be ' +
        'verified as separate from the main database. See .env.example.',
    );
  }

  const testTarget = parseDatabaseTarget(testDatabaseUrl, 'TEST_DATABASE_URL');
  const mainTarget = parseDatabaseTarget(mainDatabaseUrl, 'DATABASE_URL');

  if (testTarget.database.toLowerCase() === mainTarget.database.toLowerCase()) {
    throw new Error(
      'TEST_DATABASE_URL must target a different database than DATABASE_URL ' +
        `(both resolve to "${mainTarget.database}"). Use a dedicated test database ` +
        'such as ai_customer_support_test, not the legacy "test" schema.',
    );
  }

  assertSupportedTestSchema(testTarget.schema);

  return testTarget.url;
}

/** Returns the validated schema for a test database URL. */
export function getTestDatabaseSchema(testDatabaseUrl: string): string {
  const target = parseDatabaseTarget(testDatabaseUrl, 'TEST_DATABASE_URL');
  assertSupportedTestSchema(target.schema);
  return target.schema ?? 'public';
}

/** Resolves and caches the validated test database URL from the environment. */
export function resolveTestDatabaseUrl(): string {
  if (resolvedTestDatabaseUrl) {
    return resolvedTestDatabaseUrl;
  }

  resolvedTestDatabaseUrl = assertSafeTestDatabase(
    process.env.TEST_DATABASE_URL,
    process.env.DATABASE_URL,
  );

  return resolvedTestDatabaseUrl;
}

/**
 * Returns the URL resolved earlier by tests/setup-env.ts. Throws when setup has
 * not run, so repository modules cannot silently fall back to DATABASE_URL.
 */
export function getResolvedTestDatabaseUrl(): string {
  if (!resolvedTestDatabaseUrl) {
    throw new Error(
      'The test database URL has not been resolved. Ensure tests/setup-env.ts runs ' +
        'before importing application or repository modules.',
    );
  }

  return resolvedTestDatabaseUrl;
}
