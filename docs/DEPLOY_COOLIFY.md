# Coolify Deployment Notes

## Services
1. **App service**
- Build from this repository using `Dockerfile`.
- Expose port `3000`.
- Set environment variables from `.env.example`.
- Container startup now runs DB prep automatically via `scripts/startup.sh`:
  - `prisma migrate deploy` when migration files exist
  - otherwise `prisma db push`
  - optional seeding controlled by `RUN_DB_SEED_ON_STARTUP` (default `true`)

2. **Database service**
- Use Postgres 16.
- Persist volume storage.
- Set `DATABASE_URL` in app service to this DB.

## First deploy steps
1. Deploy DB.
2. Deploy app.
3. App startup handles schema prep and seed automatically.
