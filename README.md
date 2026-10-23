# AI_Customer_Support_System

## Testing

The automated test suite requires a dedicated PostgreSQL database. Configure it in
`server/.env`:

```env
DATABASE_URL="postgresql://.../ai_customer_support?schema=public"
TEST_DATABASE_URL="postgresql://.../ai_customer_support_test"
```

`TEST_DATABASE_URL` is validated before tests run. The suite fails fast if it is
missing, malformed, contains a fragment or an ambiguous database path, uses an
empty or non-public schema, or targets the same database as `DATABASE_URL`. Use
the `public` schema or omit the `schema` parameter. `schema=test` is rejected
because the legacy `test` schema can reproduce the pgvector `vector` type and
search-path failure.

Run the suite from `server/` with `npm test`. The full suite is not read-only:
integration setup applies Prisma migrations to `TEST_DATABASE_URL`, and the
repository integration test inserts and deletes test rows. Use a disposable test
database, never a production database. Unit-only checks:

```bash
npx vitest run --config vitest.unit.config.ts
```
