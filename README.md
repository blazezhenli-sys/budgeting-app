# Tehran Budgeting App (YNAB-Style Prototype)

A desktop-first personal budgeting app built with Next.js + Postgres + Prisma.

## What it covers in v1
- Single-user email/password login
- Cash/checking/savings account tracking
- Category groups + categories
- Monthly envelope budgeting with rollover behavior
- Month close/reopen lock
- Transaction ledger with transfer support
- Split expense transactions
- Cash reconciliation adjustments
- Basic recurring transaction rules (weekly/monthly)
- Recurring queue with selective generation
- One-time template CSV import with dry run + commit
- Monthly summary report and CSV exports
- Fast capture page for quick entry
- Health endpoint + backup runbook docs

## Currency behavior
- All authoritative amounts are stored in **USD cents**.
- You can choose a **display currency** in Settings (`USD`, `EUR`, `GBP`, `JPY`, `CAD`, `AUD`, `TWD`).
- UI amounts and amount-form inputs are converted at render/submit time; storage remains USD.

## Tech stack
- Next.js App Router (TypeScript)
- Prisma ORM
- PostgreSQL
- Vitest for tests

## Quick start
1. Copy envs and adjust values:
```bash
cp .env.example .env
```

2. Start production-like app + Postgres with Docker Compose:
```bash
docker compose --profile prod up -d --build
```

3. Open the app:
```bash
http://localhost:3000
```

The `app` service runs `db:push` and `db:seed` automatically on startup.

## Live-reload container mode (no rebuilds for code changes)
Use this when you want repo changes to apply directly inside the container:

```bash
docker compose --profile dev up -d app-dev
docker compose logs -f app-dev
```

This mode bind-mounts the repo into the container and runs `next dev` with hot reload.
If you ever see a stale dev UI/hydration mismatch after big UI edits, restart the dev service:
```bash
docker compose --profile dev restart app-dev
```

## Local development mode (host Next.js + Docker Postgres)
If you prefer running Next.js directly on your machine while using Docker Postgres:

```bash
docker compose up -d db
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Log in with `APP_USER_EMAIL` / `APP_USER_PASSWORD`.
Optional: set `APP_USER_EMAIL_2` / `APP_USER_PASSWORD_2` for a second login to the same account.

## CSV import template
Required CSV columns:
- `date` (`YYYY-MM-DD`)
- `account`
- `payee`
- `memo`
- `amount` (signed, decimal)
- `category` (blank allowed for transfer token rows)
- `status` (`cleared` or `uncleared`, optional; defaults to `uncleared`)

Transfer rows can use memo token format `transfer:token-name` and must appear exactly twice with offsetting amounts.

## API surface
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET|POST|PATCH /api/accounts`
- `POST /api/accounts/reconcile`
- `GET|POST|PATCH /api/categories`
- `GET /api/budget/:month`
- `PUT /api/budget/:month/assignments`
- `PUT /api/budget/:month/status`
- `POST /api/budget/:month/fund-targets`
- `GET|POST|PATCH|DELETE /api/transactions`
- `GET|POST|PATCH /api/recurring/rules`
- `POST /api/recurring/generate`
- `GET /api/recurring/queue`
- `POST /api/import/csv`
- `GET /api/export/csv?type=transactions|assignments|balances`
- `GET /api/reports/monthly?month=YYYY-MM`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/health`

## Tests
```bash
npm test
```

## Operations docs
- Backup runbook: `docs/BACKUP_RUNBOOK.md`
- Coolify deployment notes: `docs/DEPLOY_COOLIFY.md`
