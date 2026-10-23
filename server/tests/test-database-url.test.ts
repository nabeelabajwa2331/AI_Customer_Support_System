import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertSafeTestDatabase,
  getTestDatabaseSchema,
  quotePostgresIdentifier,
} from './test-database-url.js';

const MAIN_URL = 'postgresql://user:pass@127.0.0.1:5432/ai_customer_support?schema=public';
const TEST_URL = 'postgresql://user:pass@127.0.0.1:5432/ai_customer_support_test';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('assertSafeTestDatabase', () => {
  it('accepts a separate test database', () => {
    expect(assertSafeTestDatabase(TEST_URL, MAIN_URL)).toBe(TEST_URL);
  });

  it('accepts an explicit public schema', () => {
    const url = `${TEST_URL}?schema=public`;
    expect(assertSafeTestDatabase(url, MAIN_URL)).toBe(url);
  });

  it('rejects a missing TEST_DATABASE_URL', () => {
    expect(() => assertSafeTestDatabase(undefined, MAIN_URL)).toThrow(
      /TEST_DATABASE_URL is required/,
    );
  });

  it('rejects a raw CHANGE_ME placeholder', () => {
    expect(() =>
      assertSafeTestDatabase(
        'postgresql://user:CHANGE_ME@127.0.0.1:5432/ai_customer_support_test',
        MAIN_URL,
      ),
    ).toThrow(/TEST_DATABASE_URL is required/);
  });

  it('rejects a percent-encoded CHANGE_ME placeholder', () => {
    expect(() =>
      assertSafeTestDatabase(
        'postgresql://user:CHANGE%5FME@127.0.0.1:5432/ai_customer_support_test',
        MAIN_URL,
      ),
    ).toThrow(/TEST_DATABASE_URL is required/);
  });

  it('rejects a percent-encoded DATABASE_URL placeholder', () => {
    expect(() =>
      assertSafeTestDatabase(
        TEST_URL,
        'postgresql://user:CHANGE%5FME@127.0.0.1:5432/ai_customer_support',
      ),
    ).toThrow(/DATABASE_URL is required/);
  });

  it('rejects an invalid URL', () => {
    expect(() => assertSafeTestDatabase('not-a-url', MAIN_URL)).toThrow(
      /valid PostgreSQL connection URL/,
    );
  });

  it('rejects a non-PostgreSQL URL', () => {
    expect(() =>
      assertSafeTestDatabase('mysql://user:pass@127.0.0.1:5432/ai_customer_support_test', MAIN_URL),
    ).toThrow(/postgresql:\/\//);
  });

  it('rejects a URL without a database name', () => {
    expect(() =>
      assertSafeTestDatabase('postgresql://user:pass@127.0.0.1:5432/', MAIN_URL),
    ).toThrow(/database name/);
  });

  it('rejects a trailing slash', () => {
    expect(() => assertSafeTestDatabase(`${TEST_URL}/`, MAIN_URL)).toThrow(/database name/);
  });

  it('rejects additional path segments', () => {
    expect(() => assertSafeTestDatabase(`${TEST_URL}/extra`, MAIN_URL)).toThrow(/database name/);
  });

  it('rejects encoded path separators', () => {
    expect(() => assertSafeTestDatabase(`${TEST_URL}%2Fextra`, MAIN_URL)).toThrow(
      /path separators/,
    );
  });

  it('rejects a URL fragment', () => {
    expect(() => assertSafeTestDatabase(`${TEST_URL}#frag`, MAIN_URL)).toThrow(/fragment/);
  });

  it('rejects an empty schema', () => {
    expect(() => assertSafeTestDatabase(`${TEST_URL}?schema=`, MAIN_URL)).toThrow(
      /schema must not be empty/,
    );
  });

  it('rejects a whitespace-only schema', () => {
    expect(() => assertSafeTestDatabase(`${TEST_URL}?schema=%20`, MAIN_URL)).toThrow(
      /schema must not be empty/,
    );
  });

  it('rejects the legacy test schema', () => {
    expect(() => assertSafeTestDatabase(`${TEST_URL}?schema=test`, MAIN_URL)).toThrow(
      /public.*schema/,
    );
  });

  it('rejects other non-public schemas', () => {
    expect(() => assertSafeTestDatabase(`${TEST_URL}?schema=custom`, MAIN_URL)).toThrow(
      /public.*schema/,
    );
  });

  it('rejects case variants of public', () => {
    expect(() => assertSafeTestDatabase(`${TEST_URL}?schema=PUBLIC`, MAIN_URL)).toThrow(
      /public.*schema/,
    );
  });

  it('rejects duplicate schema parameters', () => {
    expect(() =>
      assertSafeTestDatabase(`${TEST_URL}?schema=public&schema=test`, MAIN_URL),
    ).toThrow(/at most one schema parameter/);
  });

  it('rejects invalid schema identifiers', () => {
    expect(() => assertSafeTestDatabase(`${TEST_URL}?schema=1test`, MAIN_URL)).toThrow(
      /valid PostgreSQL identifier/,
    );
  });

  it('rejects injection-shaped schema identifiers', () => {
    expect(() =>
      assertSafeTestDatabase(`${TEST_URL}?schema=${encodeURIComponent('public"; DROP TABLE users; --')}`, MAIN_URL),
    ).toThrow(/valid PostgreSQL identifier/);
  });

  it('rejects the main database', () => {
    expect(() => assertSafeTestDatabase(MAIN_URL, MAIN_URL)).toThrow(/different database/);
  });

  it('rejects the main database with different casing', () => {
    expect(() =>
      assertSafeTestDatabase(
        'postgresql://user:pass@127.0.0.1:5432/AI_CUSTOMER_SUPPORT',
        MAIN_URL,
      ),
    ).toThrow(/different database/);
  });

  it('rejects an encoded main database name', () => {
    expect(() =>
      assertSafeTestDatabase(
        'postgresql://user:pass@127.0.0.1:5432/%61i_customer_support',
        MAIN_URL,
      ),
    ).toThrow(/different database/);
  });

  it('rejects the legacy test schema on the main database', () => {
    expect(() =>
      assertSafeTestDatabase(
        'postgresql://user:pass@127.0.0.1:5432/ai_customer_support?schema=test',
        MAIN_URL,
      ),
    ).toThrow(/different database/);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => assertSafeTestDatabase(TEST_URL, undefined)).toThrow(/DATABASE_URL is required/);
  });

  it('rejects a placeholder DATABASE_URL', () => {
    expect(() =>
      assertSafeTestDatabase(
        TEST_URL,
        'postgresql://user:CHANGE_ME@127.0.0.1:5432/ai_customer_support',
      ),
    ).toThrow(/DATABASE_URL is required/);
  });

  it('rejects a malformed DATABASE_URL', () => {
    expect(() => assertSafeTestDatabase(TEST_URL, 'not-a-url')).toThrow(
      /valid PostgreSQL connection URL/,
    );
  });

  it('accepts a postgres:// URL', () => {
    const url = 'postgres://user:pass@127.0.0.1:5432/ai_customer_support_test';
    expect(assertSafeTestDatabase(url, MAIN_URL)).toBe(url);
  });

  it('accepts an uppercase scheme', () => {
    const url = 'POSTGRESQL://user:pass@127.0.0.1:5432/ai_customer_support_test';
    expect(assertSafeTestDatabase(url, MAIN_URL)).toBe(url);
  });

  it('accepts URL-encoded credentials', () => {
    const url =
      'postgresql://user:p%40ss%3Aword@127.0.0.1:5432/ai_customer_support_test';
    expect(assertSafeTestDatabase(url, MAIN_URL)).toBe(url);
  });

  it('accepts IPv6 hosts', () => {
    const url = 'postgresql://user:pass@[::1]:5432/ai_customer_support_test';
    expect(assertSafeTestDatabase(url, MAIN_URL)).toBe(url);
  });

  it('rejects malformed percent-encoded credentials', () => {
    expect(() =>
      assertSafeTestDatabase(
        'postgresql://user:%E0%A4%A@127.0.0.1:5432/ai_customer_support_test',
        MAIN_URL,
      ),
    ).toThrow(/percent-encoded credentials/);
  });
});

describe('getTestDatabaseSchema', () => {
  it('defaults to public when the schema is omitted', () => {
    expect(getTestDatabaseSchema(TEST_URL)).toBe('public');
  });

  it('returns an explicit public schema', () => {
    expect(getTestDatabaseSchema(`${TEST_URL}?schema=public`)).toBe('public');
  });

  it('rejects the legacy test schema', () => {
    expect(() => getTestDatabaseSchema(`${TEST_URL}?schema=test`)).toThrow(/public.*schema/);
  });

  it('rejects an empty schema', () => {
    expect(() => getTestDatabaseSchema(`${TEST_URL}?schema=`)).toThrow(
      /schema must not be empty/,
    );
  });

  it('rejects fragments', () => {
    expect(() => getTestDatabaseSchema(`${TEST_URL}#frag`)).toThrow(/fragment/);
  });
});

describe('quotePostgresIdentifier', () => {
  it('quotes a valid identifier', () => {
    expect(quotePostgresIdentifier('public')).toBe('"public"');
  });

  it('accepts a valid custom identifier', () => {
    expect(quotePostgresIdentifier('test_schema_1')).toBe('"test_schema_1"');
  });

  it('accepts an identifier at the maximum length', () => {
    const identifier = 'a'.repeat(63);
    expect(quotePostgresIdentifier(identifier)).toBe(`"${identifier}"`);
  });

  it('rejects an empty identifier', () => {
    expect(() => quotePostgresIdentifier('')).toThrow(/valid PostgreSQL identifier/);
  });

  it('rejects an overlong identifier', () => {
    expect(() => quotePostgresIdentifier('a'.repeat(64))).toThrow(
      /valid PostgreSQL identifier/,
    );
  });

  it('rejects injection-shaped identifiers', () => {
    expect(() => quotePostgresIdentifier('public"; DROP TABLE users; --')).toThrow(
      /valid PostgreSQL identifier/,
    );
  });
});

describe('resolveTestDatabaseUrl', () => {
  it('reads and caches the validated URL from the environment', async () => {
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', MAIN_URL);
    vi.stubEnv('TEST_DATABASE_URL', TEST_URL);

    const module = await import('./test-database-url.js');

    expect(module.resolveTestDatabaseUrl()).toBe(TEST_URL);
    expect(module.getResolvedTestDatabaseUrl()).toBe(TEST_URL);

    // The validated URL is cached; later env changes do not retarget the suite.
    vi.stubEnv('TEST_DATABASE_URL', 'postgresql://user:pass@127.0.0.1:5432/other_test');
    expect(module.resolveTestDatabaseUrl()).toBe(TEST_URL);
  });

  it('fails when setup has not resolved the URL', async () => {
    vi.resetModules();

    const module = await import('./test-database-url.js');

    expect(() => module.getResolvedTestDatabaseUrl()).toThrow(/has not been resolved/);
  });
});
