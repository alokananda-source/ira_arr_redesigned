# IRA ARR/MRR Dashboard

A live revenue dashboard for Rumik Ira, sourced directly from the "IRA ARR" Google Sheet on every
page load (no database, no caching layer). Built with Next.js (App Router), Tailwind, and Recharts,
deployed on Vercel.

## How it reads the sheet

**As of 2026-09-09** the "IRA ARR" spreadsheet was simplified to two tabs, both kept live by
[`backend/sync_arr_simplified.py`](./backend/sync_arr_simplified.py) — see that script and
`arr_recalculated/ARR_RECALCULATED_LOGIC.md` (Rumik_on root) for exactly how the numbers are
computed (a `subscriptions`-table reconstruction, deliberately simpler than — and not identical
to — the original mandate/payment-based `sync_arr.py`, which this replaces going forward). Both
tabs share one flat column shape:

- **`ARR Daywise`** — one row per date. Columns: `Date`, `Active Subscribers`, `AOV`, `MRR`, `ARR`,
  `ARR usd`. Source of truth for the chart and day-wise table.
- **`ARR Minute wise`** — one row per real minute. Same columns, keyed by `Minute (IST)` instead
  of `Date`. This is what makes the live figure move minute to minute rather than only once a day.

For the **live KPI row**, the app takes `ARR Daywise`'s last date, then prefers `ARR Minute wise`'s
latest same-day row whenever one exists — that tab self-heals a trailing 60-minute window every
sync run, so it's present for "today" as soon as the sync has run at all that day. That row also
becomes the last point in the chart/table series, so the most recent day is live rather than
whatever `ARR Daywise` last happened to say. "Last updated" reflects the freshest row actually used.

AOV, MRR, and ARR are all literal sheet columns now (no per-gateway rollup to derive them from).
`MRR (USD)` and `AOV (USD)` aren't sheet columns though — the app derives them from `ARR usd`
(`mrrUsd = arrUsd / 12`, `aovUsd = mrrUsd / activeSubscribers`) using the same fixed FX rate
(94.54) the sheet itself was computed with.

Dates are written `DD/MM/YYYY` (and `DD/MM/YYYY HH:mm` for the minute tab) — `sheetsTransform.ts`
converts to ISO (`YYYY-MM-DD`) on read; everything else in the app works in ISO internally.

See `lib/googleSheets.ts` and `lib/sheetsTransform.ts` for the implementation (`buildDashboardData`
is a pure function, exercised directly in `tests/sheetsTransform.test.ts`).

### Migrating from the old three-tab sheet

The previous version of this dashboard read `Sheet 1` / `Intraday10min` / `Minute3Gateway`,
written by `backend/sync_arr.py` (per-gateway, mandate/payment-based numbers — still present in
`backend/` and still fully working standalone, just no longer what this app reads by default).
That automation is currently **paused** (see the launchd job `com.rumik.arrsync`); flip
`GOOGLE_SHEET_DAILY_TAB` / `GOOGLE_SHEET_MINUTE_TAB` back to `Sheet 1` / `Minute3Gateway` and
restore the git history of `lib/sheetsTransform.ts` before this commit if you need to revert to
it.

## Setup

This covers the dashboard app itself. It assumes the "IRA ARR" sheet is already being kept live —
that's a separate piece, the Python sync script in [`backend/`](./backend), which has its own setup
in [`backend/README.md`](./backend/README.md).

### 1. Create a Google service account and share the sheet with it

1. In Google Cloud Console, create (or reuse) a project, enable the **Google Sheets API**, and
   create a **service account**.
2. Create a JSON key for the service account and note its `client_email` and `private_key`.
3. Open the "IRA ARR" sheet and share it (Viewer is enough) with the service account's email.

### 2. Environment variables

Copy `.env.example` to `.env.local` for local dev, and set the same variables in the Vercel project
settings for deploys:

| Variable | Notes |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | From the service account JSON key. |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | From the JSON key. Keep the `\n` escapes as one line. |
| `GOOGLE_SHEET_ID` | The ID segment of the sheet's URL. |
| `GOOGLE_SHEET_DAILY_TAB` | Optional, defaults to `Sheet 1`. |
| `GOOGLE_SHEET_INTRADAY_TAB` | Optional, defaults to `Intraday10min`. |
| `STALE_THRESHOLD_DAYS` | Optional, defaults to `2`. |
| `DASHBOARD_PASSWORD` | The shared password for `/login`. |
| `DASHBOARD_SESSION_SECRET` | Random secret for signing session cookies (`openssl rand -base64 32`). |

### 3. Local dev

```bash
npm install
npm run dev
```

### 4. Deploy to Vercel

Point a Vercel project at this repo with **Root Directory** set to `ira-dashboard/`, set the env vars
above in the project settings, and deploy. `/api/data` is marked `force-dynamic` with
`Cache-Control: no-store`, so every page load fetches the sheet fresh — no ISR, no edge caching.

## Testing

```bash
npm test        # vitest run — pure rollup/format/date/auth logic
npm run lint
npm run build
```

`tests/googleSheets.test.ts` covers the parsing, per-gateway rollup, AOV derivation, the
intraday-blend logic, day-over-day/week-over-week change math, and staleness detection, all against
fixture rows shaped like the real sheet.

## Known follow-ups

- `npm audit` currently flags two **dev-tooling-only** advisories that aren't part of the deployed
  bundle: an `esbuild`/Vitest dev-server issue, and a `postcss` copy bundled inside Next.js's own
  build tooling. Both require major version bumps (Vitest 5, Next 16) that weren't taken here to
  avoid destabilizing a fresh scaffold — worth revisiting.
- The access gate is intentionally simple (shared password + signed cookie), per the brief — not
  enterprise auth.
- If Cashfree/Paytm ever start reporting to `Intraday10min`, the blend logic already handles it
  per-gateway with no changes needed.
