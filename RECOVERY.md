# Mathswiz backup and recovery runbook

## Recovery objectives

- Target recovery time (RTO): restore service within four hours.
- Target recovery point (RPO): no more than 24 hours of database loss on a paid Supabase plan. Free projects require an off-site logical export at least weekly and therefore have a longer RPO.
- Run `npm run recovery:check` from `frontend` before every production deployment.

## Backup policy

1. In Supabase, open **Database → Backups** and confirm the newest backup is within the expected RPO.
2. Paid production projects should retain automatic daily backups. Enable Point-in-Time Recovery only when the required RPO justifies its separate cost.
3. Free projects must create scheduled logical exports with `supabase db dump` or `pg_dump` and store encrypted copies outside Supabase.
4. Database backups do not contain Storage objects. Export uploaded teaching materials separately and maintain an inventory of buckets.
5. Keep OAuth configuration, environment-variable names, DNS records, and deployment settings documented outside the Supabase project.

## Quarterly restore drill

1. Create an isolated temporary Supabase project; never test restoration over production.
2. Restore the newest backup or logical dump into the temporary project.
3. Apply pending Prisma migrations with `prisma migrate deploy`.
4. Point a temporary deployment at the restored database.
5. Verify administrator login, teacher batch access, student test submission, parent linkage, payment records, and recent audit logs.
6. Record the restore start/end times, backup timestamp, missing data, and corrective actions.
7. Delete the temporary project only after the drill evidence has been retained.

## Incident recovery

1. Stop writes by enabling deployment maintenance mode.
2. Record the incident time and select the closest safe backup before it.
3. Confirm replication slots/subscriptions do not block restoration.
4. Restore through Supabase **Database → Backups**. Expect the project to be unavailable during restoration.
5. Reapply migrations and rotate any credentials suspected of exposure.
6. Run `npm run recovery:check`, then verify the critical role journeys before reopening traffic.

Supabase reference: <https://supabase.com/docs/guides/platform/backups>
