# End-to-end tests

The suite logs in through the real UI and **wipes and recreates** accounts, questions, tests and attempts on every
run. It therefore runs against the **staging database** (where admins import and approve content), never the
live one. Its rows are recognised by their markers and are never promoted to the live site.

## One-time setup

1. Create a second, empty Postgres database. A second free Supabase project works well.
2. Create `frontend/.env.staging` (it is git-ignored) containing:

   ```
   STAGING_DATABASE_URL=postgresql://...your staging database...
   ```

   See `e2e/env.example`.
3. Create its tables:

   ```
   npm run e2e:db:push
   ```

## Running

```
npm run test:e2e
```

The suite starts its own web server on **port 3100** with its own build folder (`.next-e2e`), connected to the test
database. Your normal `npm run dev` on port 3000 can keep running and is not touched.

## Safety

- If `STAGING_DATABASE_URL` is missing, unreadable, or points at the same database as `DATABASE_URL` in `.env.local`, the
  run stops before doing anything and says why (`src/lib/test-database-guard.ts`).
- The seed and the database helpers refuse to run unless the test database has been selected.
- The suite never reuses an already-running server, because one on port 3000 is connected to real data.

Other settings (auth secret, AI keys, rate limits) are still read from `.env.local`.
