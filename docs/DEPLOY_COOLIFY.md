# Coolify Deployment Notes

## Services
1. **App service**
- Build from this repository using `Dockerfile`.
- Expose port `3000`.
- Set environment variables from `.env.example`.

2. **Database service**
- Use Postgres 16.
- Persist volume storage.
- Set `DATABASE_URL` in app service to this DB.

## First deploy steps
1. Deploy DB.
2. Deploy app.
3. Run migrations:
```bash
npm run db:push
```
4. Seed initial user:
```bash
npm run db:seed
```
