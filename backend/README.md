# IRA ARR backend sync

Pulls live production numbers from Metabase and writes them into the same "IRA ARR" Google Sheet
the Next.js dashboard (one directory up) reads from — specifically `Sheet 1` (daily), `Intraday10min`
(10-minute buckets, Razorpay only), and `Minute3Gateway` (1-minute, all gateways combined — this is
what makes the dashboard's live figure actually move minute to minute).

See [`ARR_MRR_logic.md`](./ARR_MRR_logic.md) for the full definition of every metric this computes —
active-subscriber definitions per gateway, AOV methodology, the FX rate, and known data-source
quirks (e.g. why Razorpay uses `razorpay_subscriptions`/`razorpay_payments` rather than the UPI
mandate tables Cashfree/Paytm use).

## Setup

### 1. Metabase access

Requires the Rumik VPN and a read-only Metabase API key (`metabase.prod.rumik.ai`, database id 2).
Ask an admin to create one in the `api-readonly-replica` group if you don't have one.

### 2. Google service account

Reuses the same service account as the dashboard app (one directory up) — if that's already set
up, just reuse its `client_email`/`private_key`. Otherwise: Google Cloud Console → enable the
**Google Sheets API** → create a **service account** → create a JSON key. Share the "IRA ARR"
spreadsheet with that service account's email as **Editor** (the dashboard only needs Viewer; this
backend needs Editor since it writes rows).

### 3. Install and configure

```bash
cd backend
python3 -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
cp .env.example .env
# fill in MB_KEY, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_SHEET_ID
chmod 600 .env
```

### 4. Test without touching the sheet

```bash
python3 sync_arr.py --dry-run
```

### 5. Run for real, once

```bash
python3 sync_arr.py
```

### 6. Schedule it to run every minute

Pick whichever fits your machine — both do the same thing (run `sync_arr.py` every 60s).

**macOS — `launchd`** (works without `cron`'s Full Disk Access requirement):

```bash
cp com.rumik.arrsync.plist.example ~/Library/LaunchAgents/com.rumik.arrsync.plist
# edit the copy: replace /path/to/backend with this folder's actual absolute path (WorkingDirectory
# and both StandardOutPath/StandardErrorPath entries)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.rumik.arrsync.plist
```

Check on it: `launchctl print gui/$(id -u)/com.rumik.arrsync` (look for `last exit code = 0`).
Stop it: `launchctl bootout gui/$(id -u)/com.rumik.arrsync`.

**Linux / any machine — `cron`:**

```
* * * * * cd /path/to/backend && /usr/bin/python3 sync_arr.py >> sync_arr.log 2>&1
```

## One-off historical corrections

`reconcile_august.py` is a worked example of a point-in-time historical backfill (it rebuilt
Razorpay's daily numbers for Aug 1–Sep 4 using `razorpay_subscriptions.state_history` for real
status-over-time reconstruction, since `current_status` alone only reflects *today's* state). It's
not meant to run on a schedule — kept here as a reference for how to do a similar correction again
if the underlying logic ever needs revisiting. Reads two JSON files it expects in `/tmp` from prior
Metabase queries; treat it as a template to adapt, not a turnkey script.

## Operational notes

- Every query is read-only against production (role `metabase_ro`, 120s statement timeout) — this
  script never writes to the database, only reads from it and writes to the Google Sheet.
- `arr_sync_state.json` (created on first run, gitignored) holds yesterday's finalized MRR/subscriber
  totals per gateway, used to compute `Net MRR Change`/`Net Subscriber Change` on `Sheet 1` — the
  Google Sheets API has no bulk "read the whole sheet back" primitive cheap enough to call every
  minute, so this small local cache stands in for that.
- Retention trims (`Intraday10min` 15 days, `Minute3Gateway` 3 days) run once per hour (checked via
  `datetime.now(IST).minute == 0`), not every tick, to keep Sheets API traffic light.
- `--since HH:MM` reprocesses every bucket from that time (today, IST) to now instead of just the
  current tick — useful after a logic fix, to correct today's already-written rows without a full
  historical backfill.
