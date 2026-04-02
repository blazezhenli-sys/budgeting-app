# Postgres Backup Runbook

## Nightly backup job
Use a cron job from the host or Coolify service:

```bash
pg_dump "$DATABASE_URL" --format=custom --file="/backups/budgeting_app_$(date +%F).dump"
```

## Retention policy
Keep:
- 14 daily snapshots
- 8 weekly snapshots

Example cleanup command:

```bash
find /backups -name "budgeting_app_*.dump" -type f -mtime +90 -delete
```

## Weekly restore drill
1. Create a scratch database.
2. Restore most recent backup.
3. Run a smoke check query and compare row counts.

```bash
createdb budgeting_restore_check
pg_restore --clean --if-exists --no-owner --dbname=budgeting_restore_check /backups/budgeting_app_YYYY-MM-DD.dump
psql budgeting_restore_check -c "SELECT COUNT(*) FROM \"Transaction\";"
```

## Emergency restore
```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /backups/budgeting_app_YYYY-MM-DD.dump
```
