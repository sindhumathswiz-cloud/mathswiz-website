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

Two Windows scheduled tasks (Task Scheduler → Task Scheduler Library), both run hidden at logon:

| Task | Runs | Does |
|---|---|---|
| **Mathswiz Live Site** | `ops\windows\start-live.ps1` | Serves the live build on port 3000; restarts it within 5 seconds if it stops |
| **Mathswiz Tunnel** | `ops\windows\start-tunnel.ps1` | Runs `cloudflared tunnel run mathswiz`; reconnects within 10 seconds if it stops |

Each task also runs again every 5 minutes as a watchdog: while its script is still running the extra run is ignored,
and if the script itself was stopped, it starts again. To start them now without logging out:

```powershell
Start-ScheduledTask -TaskName 'Mathswiz Live Site'; Start-ScheduledTask -TaskName 'Mathswiz Tunnel'
```

The PC is set never to sleep while plugged in (`powercfg /change standby-timeout-ac 0`; it was 5 minutes). On
battery it still sleeps after 3 minutes, which takes the site offline, so keep it plugged in and the lid open.

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
