# IRA ARR/MRR Dashboard — PRD

## Original problem statement
"Take the ARR_dashboard repo and build me a dashboard web app with a login page: password: arr_rumik_2026."

Repo: https://github.com/alokananda-source/ARR_dashboard (private). User instruction: "everything is there in the repo, don't change anything, just deploy."

## Architecture (as deployed in this environment)
- The repo is a self-contained **Next.js 15 (App Router) + TypeScript + Tailwind + Recharts** app. Deployed UNCHANGED.
- Runs on **port 3000** via supervisor `frontend` (`yarn start` = `next start`, production build).
- The repo's API routes (`/api/auth`, `/api/data`) are served by Next.js on 3000. Because this environment's ingress routes `/api/*` to port 8001, the FastAPI `backend` (port 8001) was replaced with a **thin transparent reverse-proxy** (`/app/backend/server.py`, httpx) that forwards `/api/*` to `http://localhost:3000`, preserving cookies/Set-Cookie. No repo code was modified.
- Data source: live **Google Sheet "IRA ARR"** (id `1sTsDnlhGcgLEyCkXzgZCREZJbGiT_gSJ0VVUBz39ztM`) read fresh on every load via a Google service account (`ira-dashboard@iraarr.iam.gserviceaccount.com`). No DB, no cache.
- Env vars in `/app/frontend/.env.local`: GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY, GOOGLE_SHEET_ID, DASHBOARD_PASSWORD=arr_rumik_2026, DASHBOARD_SESSION_SECRET.
- Build note: `next build` needs raised heap (`NODE_OPTIONS=--max-old-space-size=3072`) due to type-check memory; rebuild required if code changes.

## Core features (from repo)
- Shared-password login gate (`/login`) with signed httpOnly cookie session (7d), route protection via Next middleware.
- KPI row: current ARR, MRR, AOV, last-updated, with day-over-day & week-over-week change badges.
- Intraday "today's ARR by time of day" chart (today vs last-3-days avg), Razorpay intraday blended with Sheet 1 per gateway.
- 7D/30D/90D + custom date-range revenue chart (ARR/MRR dual axis) and day-wise data table.
- INR/USD currency toggle. Freshness/staleness indicator.

## Status — implemented & verified (2026-06)
- [x] Repo migrated to /app/frontend, deps installed, production build succeeds.
- [x] Backend reverse-proxy for /api/* → Next.js.
- [x] Auth verified e2e: wrong pw → 401, correct pw → 200 + cookie, protected /api/data → 401 unauth / 200 with cookie.
- [x] Live Google Sheet data flowing (ARR ₹21.32 Cr, MRR ₹1.78 Cr etc.).
- [x] Login page + dashboard render correctly (screenshots).

## Backlog / follow-ups
- P2: Deploy to Vercel (repo's intended target) if user wants the exact README deployment path.
- P2: Rebuild step is manual on code changes (no hot reload with `next start`).
