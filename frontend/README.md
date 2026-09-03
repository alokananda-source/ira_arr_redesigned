# IRA ARR/MRR Dashboard

A live revenue dashboard for Rumik Ira, sourced directly from the "IRA ARR" Google Sheet on every
page load (no database, no caching layer). Built with Next.js (App Router), Tailwind, and Recharts,
deployed on Vercel.

## How it reads the sheet

The "IRA ARR" spreadsheet has two tabs with very different shapes, and the dashboard combines them:

- **`Sheet 1`** — one row per `(Date, Payment Gateway)`, updated daily. Columns: `Date`, `Payment
  Gateway`, `MRR (Rs)`, `New MRR Added`, `MRR Churned`, `Net MRR Change (+/-)`, `Active Subscribers
  (Trailing 30d / Mandate-based)`, `Net Subscriber Change (+/-)`, `Avg MRR per Subscriber (Rs)`,
  `MRR Calculated`, `ARR`, `MRR (USD)`, `ARR (USD)`. This is the source of truth for the chart and
  day-wise table: rows are summed across gateways per date.
- **`Intraday10min`** — 10-minute snapshot buckets, currently only reported by Razorpay (Cashfree
  and Paytm don't have an intraday feed). Columns: `Time (10-min bucket start)`, `Payment Gateway`,
  ..., `MRR (Rs)`, `ARR (Rs)`, `MRR (USD)`, `ARR (USD)`.

For the **live KPI row**, the app takes `Sheet 1`'s last date, then for each gateway swaps in its
latest same-day `Intraday10min` bucket where one exists (today, that's Razorpay only) and falls back
to the `Sheet 1` row for gateways without an intraday feed (Cashfree, Paytm). That blended total also
becomes the last point in the chart/table series, so the most recent day is live rather than
whatever `Sheet 1` last happened to say. "Last updated" reflects the freshest bucket actually used.

AOV isn't a literal column — the sheet has `Avg MRR per Subscriber (Rs)` per gateway, which can't be
summed across gateways (it's already an average). The dashboard derives AOV correctly post-rollup as
`total MRR / total active subscribers` for each day.

Currency: the sheet already computes MRR/ARR in both Rs and USD per row (its own embedded rate), so
the INR/USD toggle just switches which columns are read — there's no separate FX conversion in this
app.

See `lib/googleSheets.ts` for the implementation (`buildDashboardData` is a pure function, exercised
directly in `tests/googleSheets.test.ts`).

## Setup

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

Point a Vercel project at this repo (root directory — the app lives at the repo root here), set the
env vars above in the project settings, and deploy. `/api/data` is marked `force-dynamic` with
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
