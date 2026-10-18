// Prefers TEST_DATABASE_URL; otherwise swaps the DATABASE_URL schema to `test`
// so tests never touch development (`public`) data.
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit && !explicit.includes('CHANGE_ME')) {
    return explicit;
  }

  const base = process.env.DATABASE_URL;
  if (!base || base.includes('CHANGE_ME')) {
    throw new Error(
      'TEST_DATABASE_URL is required to run the test suite (or set DATABASE_URL so an ' +
        'isolated "test" schema can be derived). See the root .env.example.',
    );
  }

  return swapSchema(base, 'test');
}

/** Replace an existing `schema=` query param, or add one. Keeps other params intact. */
function swapSchema(url: string, schema: string): string {
  if (/([?&])schema=/.test(url)) {
    return url.replace(/([?&]schema=)[^&]*/, `$1${schema}`);
  }
  return `${url}${url.includes('?') ? '&' : '?'}schema=${schema}`;
}
