# Running the live site from this PC

Until the site moves to a server, the live site runs on this Windows PC from its own copy of the code, so editing,
testing and the staging site in the main checkout never affect it. Cloudflare Tunnel connects it to the domain.

| What | Where |
|---|---|
| Public address | `https://www.sindhusmathswizclasses.com` (the bare domain and plain http redirect here) |
| Main checkout (editing, staging on :3200, dev server) | `D:\Mathswiz WebAppln\mathswiz-website` |
| Live copy (a git worktree, detached at a commit) | `D:\Mathswiz WebAppln\mathswiz-live` |
| Live site on this PC | `http://localhost:3000` (production build, `next start`) |
| Live settings | `mathswiz-live\frontend\.env.local`: a copy of the main one, plus `QB_PRIVATE_STORAGE_ROOT`, and `NEXTAUTH_URL` / `CANONICAL_HOST` set to the public address |
| Book page images | the main checkout's `frontend\.private\book-ingestion`, shared with staging |
| Tunnel settings | `%USERPROFILE%\.cloudflared\config.yml` (tunnel `mathswiz`); its credentials sit beside it, never in the repo |
| Logs | `mathswiz-live\frontend\logs\live-YYYY-MM-DD.log` and `tunnel-YYYY-MM-DD.log` |

## What keeps it running

Two Windows scheduled tasks (Task Scheduler → Task Scheduler Library). `register-tasks.ps1` creates them; run it
again if they are ever deleted or changed:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Mathswiz WebAppln\mathswiz-live\ops\windows\register-tasks.ps1"
```

Each runs its script through `conhost --headless`, so there is no window to close by mistake: a closed console
window stops the site.

| Task | Runs | Does |
|---|---|---|
| **Mathswiz Live Site** | `ops\windows\start-live.ps1` | Serves the live build on port 3000; restarts it within 5 seconds if it stops |
| **Mathswiz Tunnel** | `ops\windows\start-tunnel.ps1` | Runs `cloudflared tunnel run mathswiz`; reconnects within 10 seconds if it stops |

Each task starts at logon and also every 5 minutes as a watchdog: while its script is still running the extra run
is ignored, and if the script itself was stopped, it starts again. To start them now without logging out:

```powershell
Start-ScheduledTask -TaskName 'Mathswiz Live Site'; Start-ScheduledTask -TaskName 'Mathswiz Tunnel'
```

While plugged in, the PC is set never to sleep (`powercfg /change standby-timeout-ac 0`; it was 5 minutes) and never
to turn the screen off (`powercfg /change monitor-timeout-ac 0`; it was 5 minutes). Both are needed. This laptop
uses Modern Standby, so when the screen turns off on its own, the laptop goes into standby and the site goes offline.
Turning the brightness down is fine. On battery it still sleeps after 3 minutes, so keep it plugged in and the lid
open; closing the lid or pressing the power button also puts it into standby.

## Database backups

The free Supabase plan keeps no backups, so this PC does. The **Mathswiz Database Backup** task runs
`backup-db.ps1` every night at 02:00, or as soon as the PC is back if it was off or asleep then. Each run writes
`D:\Mathswiz Backups\mathswiz-YYYY-MM-DD_HHmm.dump` and keeps the 14 newest. Results are in
`D:\Mathswiz Backups\backup.log`; a failed run writes a `FAILED:` line there. The backups hold student names, mobile
numbers and payment records, so keep that folder private.

- Each backup covers the `public` schema, which holds every table the app uses. Supabase's own `auth` and `storage`
  schemas are empty here.
- The PostgreSQL 17 client tools (`pg_dump`, `pg_restore`, `psql`) are in `D:\Mathswiz WebAppln\tools\pgsql\bin`,
  taken from the official EDB Windows zip.
- Back up now: `powershell -ExecutionPolicy Bypass -File "D:\Mathswiz WebAppln\mathswiz-live\ops\windows\backup-db.ps1"`
- Recreate the nightly task: the same command with `-Register`.

Restore into an **empty** Postgres 17 database, for example a new Supabase project or the future VPS, never over
the live one. The app's tables use the `vector` and `uuid-ossp` extensions, so create those first:

```powershell
$bin = 'D:\Mathswiz WebAppln\tools\pgsql\bin'
& "$bin\psql.exe" "<new database URL>" -c 'create extension if not exists vector; create extension if not exists "uuid-ossp";'
& "$bin\pg_restore.exe" --no-owner --no-privileges --dbname "<new database URL>" "D:\Mathswiz Backups\<backup>.dump"
```

## Put new code live

Commit to `main` in the main checkout, then:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Mathswiz WebAppln\mathswiz-live\ops\windows\deploy-live.ps1"
```

It builds the new version beside the running one and switches over with a few seconds of downtime. If the build
fails, the site keeps running the previous version.

## Change a live setting

Edit `mathswiz-live\frontend\.env.local`, then stop the server process on port 3000; `start-live.ps1` restarts it
with the new settings within five seconds.

## Sign-in with Google or Microsoft

Their consoles must list the live callback addresses:

- Google Cloud Console → Credentials → the OAuth client → Authorized redirect URIs:
  `https://www.sindhusmathswizclasses.com/api/auth/callback/google`
- Azure portal → App registrations → the app → Authentication → Redirect URIs:
  `https://www.sindhusmathswizclasses.com/api/auth/callback/azure-ad`
