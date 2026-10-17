# Milestone 3 — Learning Notes (Database & Authentication)

These notes explain, in beginner-friendly language, what we built in Milestone 3
and *why*. Some sections also list what is still missing before this could be
considered production-ready.

---

## 1. What Prisma ORM does

**Prisma** is an *ORM* (Object-Relational Mapper). It lets you work with a
PostgreSQL database using TypeScript objects and methods instead of writing raw
SQL by hand.

Instead of:

```sql
SELECT * FROM users WHERE email = 'ada@example.com';
```

you write:

```ts
const user = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
```

Prisma gives you three main things:

1. **A schema** (`server/prisma/schema.prisma`) — a single, readable file that
   describes your tables, columns, relations, and enums.
2. **A generated client** — type-safe code (run `npx prisma generate`) so your
   editor knows the exact shape of every query result. Import it as
   `@prisma/client`.
3. **Migrations** — versioned SQL files that evolve the database to match the
   schema.

**Version note:** we chose Prisma **6.19.3**. Prisma 7 changed the default
client generator (it now requires a driver adapter and a custom output folder),
which adds friction with our ESM + `tsx` + `tsc` setup. Prisma 6 is stable,
documented, and supports our Node.js version.

---

## 2. How the Express API connects to PostgreSQL

```
HTTP request
   │
   ▼
Express route  ──►  Service (business logic)  ──►  Prisma Client  ──►  PostgreSQL
```

- `src/lib/prisma.ts` creates **one** shared `PrismaClient`. We reuse a single
  instance so we don't open a new connection pool on every request (and on every
  hot-reload in development).
- Prisma reads its connection string from the `DATABASE_URL` environment
  variable (`postgresql://user:password@host:port/database?schema=...`).
- We only **generate** the client and **migrate** the schema in this milestone.
  A real `.env` file holds the real connection string and is **git-ignored**;
  only `.env.example` (with placeholders) is committed.

---

## 3. What a schema and a migration are

- **Schema** = the desired *shape* of the database (tables, columns, types,
  constraints, relations). Ours defines `User`, `RefreshToken`, and the `Role`
  enum.
- **Migration** = a numbered, committed SQL file that *transforms* the database
  from its current shape to the next. Example: `prisma/migrations/…_init/migration.sql`.

Why migrations matter: they are **repeatable and reviewable**. You can apply the
same changes to a teammate's machine, a test database, or production in a
predictable order. Prisma records which migrations have run in a special
`_prisma_migrations` table.

Key commands:

| Command               | What it does                                                       |
| --------------------- | ------------------------------------------------------------------ |
| `prisma migrate dev`  | Creates a new migration from schema changes and applies it (dev).  |
| `prisma migrate deploy` | Applies already-committed migrations (used for tests/production). |
| `prisma migrate status` | Shows whether the database is up to date.                        |
| `prisma generate`     | Regenerates the type-safe client from the schema.                  |
| `prisma studio`       | Opens a GUI to browse data (local convenience only).               |

---

## 4. Authentication vs. authorization

- **Authentication** = *"Who are you?"* — proving identity (logging in).
- **Authorization** = *"What are you allowed to do?"* — checking permissions
  (roles).

In our code:

- `authenticate` middleware = authentication. It checks the token and loads the
  user.
- `authorize('ADMIN')` middleware = authorization. It checks the user's role.

You can be authenticated but not authorized: a logged-in `CUSTOMER` is
authenticated, but gets **403 Forbidden** when hitting an admin-only route.

---

## 5. Why password hashing is necessary

If you store passwords as plain text, anyone who reads the database (a leak, a
backup, a curious insider) instantly has every user's password — and people
reuse passwords across sites.

**Hashing** runs the password through a one-way function so:

- You can verify a login by hashing the attempt and comparing.
- You **cannot** reverse the hash to recover the password.

We use **bcrypt** with a **cost factor of 12**. bcrypt:

- Generates a random **salt** per password (so identical passwords get different
  hashes), and stores the salt inside the hash string.
- Is deliberately **slow**, making offline brute-force attacks expensive.

Real stored value looks like `$2b$12$...`. The plaintext password is never
persisted and never returned by the API.

> We chose `bcryptjs` (pure JavaScript) over the native `bcrypt`/`argon2`
> packages because native modules can require a compiler toolchain on very new
> Node versions. `bcryptjs` works everywhere with no build step. For very high
> throughput, a native/Argon2id library would be a reasonable upgrade.

---

## 6. How the session/token strategy works

We use a **two-token** approach:

1. **Access token** — a short-lived **JWT** (default 15 minutes), signed with
   `AUTH_SECRET` (HS256). Sent as `Authorization: Bearer <token>` on each
   request. It is *stateless*: verifying it needs no database lookup for the
   signature, though we still load the user to reflect role changes.
2. **Refresh token** — an **opaque random string** (256 bits). It is stored in
   the database **only as a SHA-256 hash**. Used to obtain a new access token.

Login flow:

```
POST /api/auth/login  ──►  verify bcrypt hash  ──►  return accessToken + refreshToken
```

Refresh flow (rotation):

```
POST /api/auth/refresh ──► look up hash ──► revoke old row ──► issue a NEW access+refresh pair
```

Logout flow:

```
POST /api/auth/logout  ──► mark the refresh token row as revoked
```

### Honest trade-off: what logout does and does not do

- Logout **immediately invalidates the refresh token** (it is marked revoked in
  the database, and reuse of a revoked token also revokes all of the user's
  active tokens as a theft precaution).
- Logout does **NOT** invalidate an already-issued **access token**. A JWT is
  self-contained and stays valid until it expires. This is why the access token
  lifetime is kept short (15 minutes).
- If you need immediate access-token revocation, you must add a server-side
  denylist (e.g. store each token's `jti` until expiry) — a deliberate
  trade-off between statelessness and instant revocation. We did **not** claim
  JWT logout is instant; that would be misleading.

Other security properties:

- Only the **hash** of the refresh token is stored, so a database leak cannot be
  replayed as a valid token.
- `AUTH_SECRET` must be long and random (≥ 32 chars) and kept in the environment.
- Refresh tokens **rotate**: each use issues a new one and revokes the old one.

---

## 7. Important security choices

- **Public registration always creates `CUSTOMER`.** The service hard-codes the
  role; client-supplied fields like `role` are stripped by validation. You can't
  self-register as staff or admin.
- **No default/hardcoded accounts.** There is deliberately no seeded admin — a
  known default password is a common way systems get compromised.
- **Generic login errors.** Both "wrong password" and "unknown email" return the
  same `Invalid email or password` message. We also run a bcrypt comparison even
  when the email is unknown, so response *timing* doesn't reveal whether an
  account exists.
- **Request validation** with Zod: shapes are checked and values normalized
  (emails trimmed + lower-cased) before reaching the database.
- **Never return password hashes.** A `toPublicUser` mapper selects only safe
  fields; `passwordHash` never leaves the service layer.
- **Rate limiting** on auth endpoints (`express-rate-limit`) slows down
  credential-stuffing/brute-force attempts.
- **Secrets stay in `.env`**, which is git-ignored. Logs never include passwords,
  tokens, or the connection string; the error handler never returns stack traces.
- **Least-data principle** in the database: unique email, enum-constrained role,
  and a cascading delete from `users` to `refresh_tokens`.

### Database model

```
User                         RefreshToken
────                         ────────────
id (uuid, PK)                id (uuid, PK)
name                         user_id  ──► User.id (cascade delete)
email (unique, lower-cased)  token_hash (unique, sha-256)
password_hash (bcrypt)       expires_at
role (enum)                  revoked_at (nullable)
created_at / updated_at      created_at
```

---

## 8. Remaining production tasks (not done yet)

These are intentionally **out of scope** for this milestone but must be
addressed before real-world use:

1. **Email verification** — requires an email provider (e.g. SMTP/SES/Resend)
   and a verification-token flow. Not implemented.
2. **Password reset** — requires the same email infrastructure plus
   single-use, expiring reset tokens. Not implemented.
3. **Refresh-token cookie transport** — for browser clients, deliver the refresh
   token as an `HttpOnly`, `Secure`, `SameSite` cookie instead of a JSON body.
4. **Access-token denylist** — if immediate logout everywhere is required.
5. **Expired-token cleanup** — periodically delete expired/revoked refresh
   token rows.
6. **Multi-factor authentication (MFA)** for privileged roles.
7. **Audit logging** of auth events (who logged in, when, from where).
8. **Account lockout / progressive delays** beyond simple rate limiting.
9. **Stricter email validation** and normalization (Unicode, plus-addressing).
10. **HTTPS/TLS everywhere**, secure headers (helmet), and strict CORS in front
    of a real deployment.

---

## 9. Testing approach

- Tests live in `server/tests/` and run with **Vitest** + **supertest**.
- They run against a **separate schema** (`?schema=test`) so the development
  database is never touched, dropped, or wiped. `tests/global-setup.ts` creates
  that schema (if needed) and applies migrations to it before the suite runs.
- Each test resets only the test schema's tables between cases.
