# Running the live site from this PC

Until the site moves to a server, the live site runs on this Windows PC from its own copy of the code, so editing,
testing and the staging site in the main checkout never affect it.

| What | Where |
|---|---|
| Main checkout (editing, staging on :3200, dev server) | `D:\Mathswiz WebAppln\mathswiz-website` |
| Live copy (a git worktree, detached at a commit) | `D:\Mathswiz WebAppln\mathswiz-live` |
| Live site | `http://localhost:3000` (production build, `next start`) |
| Live settings | `mathswiz-live\frontend\.env.local` (a copy of the main one, plus `QB_PRIVATE_STORAGE_ROOT`) |
| Book page images | the main checkout's `frontend\.private\book-ingestion`, shared with staging |
| Logs | `mathswiz-live\frontend\logs\live-YYYY-MM-DD.log` |

## Start the live site

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Mathswiz WebAppln\mathswiz-live\ops\windows\start-live.ps1"
```

It keeps running and restarts the site within about five seconds if it stops. It starts automatically: the Windows
scheduled task **Mathswiz Live Site** runs it, hidden, when you log in (Task Scheduler → Task Scheduler Library).
To start it now without logging out:

```powershell
Start-ScheduledTask -TaskName 'Mathswiz Live Site'
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
