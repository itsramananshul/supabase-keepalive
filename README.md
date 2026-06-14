# supabase-keepalive

Pings every Supabase project on a schedule so **free-tier projects don't auto-pause**
after ~7 days of inactivity. The ping is harmless — a tiny read that reaches the
project's API gateway (which is what Supabase counts as "activity").

> ⚠️ Keep-alive **prevents** pausing. It does **not revive** an already-paused
> project. Restore a paused one once from the Supabase dashboard (Project →
> "Restore"), then keep-alive maintains it. (e.g. **Auriva** is paused right now.)

## 1. Configure

Edit `projects.json` — one entry per project:

```json
{ "name": "myapp", "url": "https://<ref>.supabase.co", "key": "sb_publishable_...", "table": "optional_table" }
```

- `url` + `key`: Supabase dashboard → **Project Settings → API** → *Project URL* and
  *anon / publishable* key. The anon/publishable key is **public by design** (it's
  already in your client apps), so committing it here is fine.
- `table` is optional — omit it to ping the REST root.

Already filled: **master-brain, reachout, habitfuel** (+ auriva's URL).
Still `TODO`: **auriva key, voxvitals, credix, loop-in** — paste each one's URL + anon key.
Entries left with `TODO`/`REPLACE` in the URL are skipped.

## 2. Run manually

```bash
node keepalive.mjs
```

Output: `OK` = the request reached the project (200 ideal; 401 still counts).
`FAIL` = DNS/timeout (status 0) — check the URL. Exit code is non-zero if any failed.

## 3. Schedule it (pick one)

**A. GitHub Actions (cloud, zero setup on your machines)**
Push this folder to a GitHub repo. `.github/workflows/keepalive.yml` already runs it
every ~3 days. No secrets needed (keys are public anon keys). A run is a few seconds.

**B. Hostinger VPS cron (always-on, zero GitHub minutes)**
Copy this folder to the VPS (needs Node 18+), then:
```bash
crontab -e
# every 3 days at 09:00
0 9 */3 * * cd /opt/supabase-keepalive && /usr/bin/node keepalive.mjs >> keepalive.log 2>&1
```

**C. Windows Task Scheduler (runs when your PC is on)**
```powershell
schtasks /create /tn "supabase-keepalive" /tr "node \"C:\Users\akans\Downloads\supabase-keepalive\keepalive.mjs\"" /sc DAILY /mo 3 /st 09:00
```

Every 3 days is well inside the 7-day pause window, with margin for a missed run.
