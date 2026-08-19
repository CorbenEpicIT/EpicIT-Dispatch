# HVAC App Demo

## To run:

1. Fill out .env file from example in both frontend and backend (can copy)
2. ``docker compose up`` from project root

```
localhost:5173 --- Frontend
localhost:3000 --- Backend
localhost:3001 --- Grafana Telemetry
   - Grafana login is admin/admin
```

## Testing

### Frontend

1. Run Frontend & Backend
2. `npm run test:e2e:ui` or `npm run test:e2e`

### Backend

1. Run Backend
2. `npm run test`
### Unit tests and CI

Both packages have `npm test` (vitest), `npm run typecheck`, and `npm run test:coverage`.
`.github/workflows/ci.yml` runs typecheck, lint, unit tests, and a fresh `prisma migrate deploy`
+ drift check on every PR and push to `dev`/`main`.

## Deploying (Render)

The backend has no Dockerfile on Render; the service uses a build command and a start command.
They must be:

```
build: npm ci && npx prisma generate && npm run build
start: npx prisma migrate deploy && npm run start
```

`generated/prisma` is gitignored and Prisma 7 has no postinstall generate hook, so the build
fails with `TS2307 ../generated/prisma/client.js` if `prisma generate` is not run explicitly.

Before a release that contains migrations:

1. Take a Render Postgres snapshot — there are no down migrations.
2. Pre-flight anything a migration asserts (the `20260805120000` migration refuses to run if any
   `inventory_item.quantity`/`low_stock_threshold` ≥ 100,000,000).
3. After deploy, confirm `_prisma_migrations` shows every new migration with `finished_at`, and
   run any one-off data scripts the release notes call for (e.g. `prisma/scripts/normalizeUnits.ts`
   for orgs with legacy free-text units).
4. Permission additions (e.g. the `*_projects` permissions) are granted to existing roles by a data
   migration, but users must log out and back in for their JWT permissions to refresh.

Never run `prisma/seed.ts` against production — it creates demo accounts with known passwords.
