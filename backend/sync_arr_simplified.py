#!/usr/bin/env python3
"""
IRA ARR (simplified) — syncs the "ARR Daywise" and "ARR Minute wise" tabs of the "IRA ARR"
Google Sheet, using the subscriptions-table reconstruction validated during the 2026-09-09
debugging session (see arr_recalculated/ARR_RECALCULATED_LOGIC.md in the Rumik_on root for the
full writeup of the methodology, caveats, and how it differs from sync_arr.py's mandate/payment-
based numbers).

This REPLACES the three-tab structure sync_arr.py writes (Sheet 1 / Intraday10min /
Minute3Gateway) with two simpler tabs, both sharing the same column shape:

    ARR Daywise:     Date            | Active Subscribers | AOV | MRR | ARR | ARR usd
    ARR Minute wise: Minute (IST)    | Active Subscribers | AOV | MRR | ARR | ARR usd

No per-gateway breakdown, no New/Churned MRR, no recursive formulas — every row is computed
directly from Metabase each run and written as a plain value. Source: `subscriptions` table
only (not `mandates` / `razorpay_subscriptions` / payment tables — see the logic doc for why
this is a different, less-validated lens than sync_arr.py's numbers).

Intended to run every 1 minute via the same launchd job pattern as sync_arr.py (see
com.rumik.arrsync.plist.example in this folder) — point its ProgramArguments at this file
instead once you're ready to switch over. Currently NOT scheduled anywhere; run manually or
via --dry-run until reviewed.

Setup: same .env as sync_arr.py (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
GOOGLE_SHEET_ID, MB_KEY). Manual test without touching the sheet:
    python3 sync_arr_simplified.py --dry-run
"""

import fcntl
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    sys.exit("Python 3.9+ required (zoneinfo).")

import gspread
from google.oauth2.service_account import Credentials

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()


def load_dotenv(path):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


load_dotenv(Path(__file__).parent / ".env")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

MB_URL = os.environ.get("MB_URL", "https://metabase.prod.rumik.ai")
MB_KEY = os.environ.get("MB_KEY")
MB_DATABASE_ID = 2

SA_EMAIL = os.environ.get("GOOGLE_SERVICE_ACCOUNT_EMAIL", "")
SA_PRIVATE_KEY = os.environ.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "")
SHEET_ID = os.environ.get("GOOGLE_SHEET_ID", "")
SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

IST = ZoneInfo("Asia/Kolkata")
FX_RATE = 94.54  # fixed INR->USD constant, same as sync_arr.py — see ARR_MRR_logic.md

# NOTE: the live tab is actually named "ARR Daywise " (trailing space) — matched exactly, since
# Sheets API tab lookups are exact-string, not trimmed. Update this if the tab gets renamed.
DAYWISE_TAB = "ARR Daywise "
MINUTEWISE_TAB = "ARR Minute wise"
HEADERS_DAYWISE = ["Date", "Active Subscribers", "AOV", "MRR", "ARR", "ARR usd"]
HEADERS_MINUTEWISE = ["Minute (IST)", "Active Subscribers", "AOV", "MRR", "ARR", "ARR usd"]

# Self-healing lookback: every run rewrites the trailing window rather than just "now", so a
# missed tick (VPN drop, a slow Metabase response) gets clawed back on the next successful run
# instead of leaving a permanent gap. Mirrors sync_arr.py's LOOKBACK_MINUTES pattern.
MINUTE_LOOKBACK = 60
DAY_LOOKBACK = 3

# ARR Minute wise retention: only the trailing MINUTE_RETENTION_DAYS is kept — older rows are
# trimmed every run. This also caps how far a reconnect backfill will ever reach back: there's no
# point querying/writing minutes we're about to delete anyway, so MAX_BACKFILL_DAYS == retention.
MINUTE_RETENTION_DAYS = 3
MAX_BACKFILL_DAYS = MINUTE_RETENTION_DAYS

LOCK_FILE = Path(__file__).parent / ".sync_arr_simplified.lock"

DRY_RUN = "--dry-run" in sys.argv


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def acquire_lock():
    lock_fp = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print(f"[{datetime.now(IST).isoformat()}] another run is still in progress, skipping this tick")
        sys.exit(0)
    return lock_fp


def mb_query(sql):
    if not MB_KEY:
        die("MB_KEY environment variable is not set.")
    payload = json.dumps({"database": MB_DATABASE_ID, "type": "native", "native": {"query": sql}}).encode()
    req = urllib.request.Request(
        f"{MB_URL}/api/dataset", data=payload, method="POST",
        headers={"X-API-Key": MB_KEY, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=280, context=SSL_CONTEXT) as resp:
            body = json.loads(resp.read())
    except urllib.error.URLError as e:
        die(f"Metabase request failed (is the VPN connected?): {e}")
    if "data" not in body:
        die(f"Metabase query error: {body.get('error', body)}\nSQL:\n{sql}")
    cols = [c["name"] for c in body["data"]["cols"]]
    return [dict(zip(cols, row)) for row in body["data"]["rows"]]


# ---------------------------------------------------------------------------
# Metric query — see arr_recalculated/query_template.sql (Rumik_on root) for the annotated
# standalone version of this same SQL shape.
# ---------------------------------------------------------------------------

def _metric_sql(series_expr, group_expr, output_expr):
    """series_expr: the generate_series(...) call producing each bucket's timestamp.
    group_expr / output_expr: how that bucket's timestamp is grouped/emitted (day text vs
    minute text) — the join/dedup/aggregation logic is identical either way."""
    return f"""
    with buckets as (
      select {series_expr} as b
    ),
    matched as (
      select
        buckets.b as bucket_ts,
        s.user_id,
        s.price,
        s.billing_cycle,
        row_number() over (
          partition by buckets.b, s.user_id order by s.created_at desc
        ) as rn
      from buckets
      join subscriptions s
        on s.start_date <= buckets.b
       and (s.expiry_date is null or s.expiry_date >= buckets.b)
       and s.currency = 'INR'
       and s.price > 0
    ),
    current_active as (
      select * from matched where rn = 1
    )
    select
      {output_expr} as bucket,
      count(*) as active_subs,
      round(avg(price) filter (where price <= 999), 2) as aov,
      round(sum(case when billing_cycle = 'yearly' then price / 12.0 else price end)) as mrr
    from current_active
    group by {group_expr}
    order by {group_expr}
    """


def fetch_daywise(start_date, end_date):
    """[start_date, end_date] inclusive, both 'YYYY-MM-DD' (IST calendar dates)."""
    series = f"generate_series('{start_date}'::date, '{end_date}'::date, '1 day'::interval)"
    sql = _metric_sql(series, "bucket_ts", "bucket_ts::text")
    return mb_query(sql)


def fetch_minutewise(start_ts_ist, end_ts_ist_or_now):
    """start_ts_ist: 'YYYY-MM-DD HH:MM:SS' (IST wall clock). end: same, or 'now()' literal."""
    end_expr = "now()" if end_ts_ist_or_now == "now()" else f"'{end_ts_ist_or_now}'::timestamp at time zone 'Asia/Kolkata'"
    series = f"generate_series('{start_ts_ist}'::timestamp at time zone 'Asia/Kolkata', {end_expr}, '1 minute'::interval)"
    sql = _metric_sql(series, "bucket_ts", "(bucket_ts at time zone 'Asia/Kolkata')::text")
    return mb_query(sql)


def to_row(r, is_minute):
    mrr = r["mrr"] or 0
    arr = round(mrr * 12)
    arr_usd = round(arr / FX_RATE)
    ts = r["bucket"]
    if is_minute:
        dt = datetime.fromisoformat(ts.replace("Z", "")).replace(tzinfo=None)
        label = dt.strftime("%d/%m/%Y %H:%M")
    else:
        dt = datetime.fromisoformat(ts.replace("Z", "")).replace(tzinfo=None)
        label = dt.strftime("%d/%m/%Y")
    return [label, int(r["active_subs"]), r["aov"] or 0, int(mrr), arr, arr_usd]


# ---------------------------------------------------------------------------
# Google Sheets
# ---------------------------------------------------------------------------

_gc = None
_ss = None


def sheets_client():
    global _gc, _ss
    if _ss is not None:
        return _ss
    if not SA_EMAIL or not SA_PRIVATE_KEY:
        die("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are not set (check .env).")
    if not SHEET_ID or SHEET_ID.startswith("REPLACE_ME"):
        die("GOOGLE_SHEET_ID is not set.")
    private_key = SA_PRIVATE_KEY.replace("\\n", "\n")
    info = {
        "type": "service_account", "client_email": SA_EMAIL,
        "private_key": private_key, "token_uri": "https://oauth2.googleapis.com/token",
    }
    creds = Credentials.from_service_account_info(info, scopes=SHEETS_SCOPES)
    _gc = gspread.authorize(creds)
    _gc.set_timeout((10, 30))
    try:
        _ss = _gc.open_by_key(SHEET_ID)
    except Exception as e:
        die(f"Could not open spreadsheet (is it shared with {SA_EMAIL} as Editor?): {e}")
    return _ss


def get_or_create_worksheet(title, headers):
    ss = sheets_client()
    try:
        ws = ss.worksheet(title)
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title=title, rows=1000, cols=len(headers))
        ws.append_row(headers, value_input_option="RAW")
        return ws
    if not ws.row_values(1):
        ws.append_row(headers, value_input_option="RAW")
    return ws


def upsert_rows(sheet_title, headers, keys_to_replace, rows):
    """Same append-then-delete-stale-then-sort pattern as sync_arr.py's upsert_rows — see that
    function's docstring for why the ordering matters (avoids a reader ever seeing a gap)."""
    if DRY_RUN:
        print(f"[dry-run] would upsert sheet={sheet_title} rows={len(rows)} keys={len(keys_to_replace)}")
        for row in rows[:3]:
            print("  ", row)
        if len(rows) > 3:
            print(f"   ... and {len(rows) - 3} more")
        return

    ws = get_or_create_worksheet(sheet_title, headers)
    col_values = ws.col_values(1)  # key column is always column A here
    keys_set = set(keys_to_replace)
    rows_to_delete = [i + 1 for i, v in enumerate(col_values) if i > 0 and v in keys_set]

    if rows:
        ws.append_rows(rows, value_input_option="RAW")

    if rows_to_delete:
        ss = sheets_client()
        requests = [
            {"deleteDimension": {
                "range": {"sheetId": ws.id, "dimension": "ROWS", "startIndex": r - 1, "endIndex": r}
            }}
            for r in sorted(rows_to_delete, reverse=True)
        ]
        ss.batch_update({"requests": requests})

    last_row = len(ws.col_values(1))
    if last_row > 2:
        ws.sort((1, "asc"), range=f"A2:{gspread.utils.rowcol_to_a1(last_row, len(headers))}")


def parse_row_key(value, has_time):
    """Parses this script's own written key format back into a naive (IST wall-clock) datetime:
    'DD/MM/YYYY HH:MM' for minute rows, 'DD/MM/YYYY' for day rows. Returns None if unparseable
    (a blank cell, a header leaking through, hand-edited junk) rather than raising -- callers
    treat that the same as "no data yet"."""
    try:
        return datetime.strptime(value, "%d/%m/%Y %H:%M" if has_time else "%d/%m/%Y")
    except (ValueError, TypeError):
        return None


def get_last_minute_timestamp():
    """The true last-written minute, read straight from the sheet (not a local state file) --
    the sheet itself is the durable record of what actually got persisted, so this is what
    correctly reflects an outage: if this process (or the whole machine) was down, restarting
    fresh reads exactly where the sheet's own history actually stops, no separate state to lose
    or fall out of sync. Returns None for an empty/header-only sheet (first run)."""
    ws = get_or_create_worksheet(MINUTEWISE_TAB, HEADERS_MINUTEWISE)
    col = ws.col_values(1)
    if len(col) <= 1:
        return None
    # scan from the end for the last parseable row, in case a stray trailing blank/junk row exists
    for value in reversed(col[1:]):
        ts = parse_row_key(value, has_time=True)
        if ts is not None:
            return ts
    return None


def trim_old_rows(sheet_title, retention_days, has_time, now):
    """Deletes rows whose key is older than retention_days. Cheap no-op when nothing qualifies."""
    if DRY_RUN:
        return 0
    ws = get_or_create_worksheet(sheet_title, HEADERS_MINUTEWISE if has_time else HEADERS_DAYWISE)
    col = ws.col_values(1)
    cutoff = now - timedelta(days=retention_days)
    rows_to_delete = []
    for i, value in enumerate(col):
        if i == 0:
            continue
        ts = parse_row_key(value, has_time=has_time)
        if ts is not None and ts < cutoff:
            rows_to_delete.append(i + 1)
    if not rows_to_delete:
        return 0
    ss = sheets_client()
    requests = [
        {"deleteDimension": {
            "range": {"sheetId": ws.id, "dimension": "ROWS", "startIndex": r - 1, "endIndex": r}
        }}
        for r in sorted(rows_to_delete, reverse=True)
    ]
    ss.batch_update({"requests": requests})
    print(f"trimmed {len(rows_to_delete)} row(s) older than {retention_days}d from {sheet_title}")
    return len(rows_to_delete)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    _lock = acquire_lock()
    run_start = datetime.now(IST).replace(tzinfo=None)
    print(f"[{run_start.isoformat()}] run start (simplified sync)")

    # ARR Daywise: rewrite the trailing DAY_LOOKBACK days every run (self-heals a missed tick;
    # today's row in particular changes continuously as the day progresses).
    day_end = run_start.date()
    day_start = day_end - timedelta(days=DAY_LOOKBACK - 1)
    day_results = fetch_daywise(day_start.isoformat(), day_end.isoformat())
    day_rows = [to_row(r, is_minute=False) for r in day_results]
    day_keys = [row[0] for row in day_rows]
    upsert_rows(DAYWISE_TAB, HEADERS_DAYWISE, day_keys, day_rows)

    # ARR Minute wise: normally just the trailing MINUTE_LOOKBACK minutes (self-heals a missed
    # tick or two). But if the sheet's own last row is OLDER than that -- this process (or its
    # network/VPN/Metabase access) was down for a while and just came back -- widen the window to
    # cover the whole gap, from the last thing actually recorded up through now, so reconnecting
    # backfills the outage instead of leaving a permanent hole. Capped at MAX_BACKFILL_DAYS back
    # (== retention: no point fetching/writing minutes that trim_old_rows() would delete anyway).
    last_recorded = get_last_minute_timestamp()
    floor = run_start - timedelta(days=MAX_BACKFILL_DAYS)
    if last_recorded is None:
        # first run ever / sheet was emptied: seed with just the normal lookback rather than an
        # implicit full MAX_BACKFILL_DAYS backfill, since an empty sheet isn't necessarily an
        # outage -- if a full historical seed is wanted, run once with --since explicitly.
        window_start = run_start - timedelta(minutes=MINUTE_LOOKBACK)
        print(f"[{run_start.isoformat()}] ARR Minute wise has no prior data — normal {MINUTE_LOOKBACK}m lookback")
    else:
        gap_minutes = (run_start - last_recorded).total_seconds() / 60
        normal_start = run_start - timedelta(minutes=MINUTE_LOOKBACK)
        if last_recorded < normal_start:
            window_start = max(last_recorded + timedelta(minutes=1), floor)
            print(f"[{run_start.isoformat()}] gap detected: last row was {gap_minutes:.0f}m ago "
                  f"({last_recorded.isoformat()}) — backfilling from {window_start.isoformat()}")
        else:
            window_start = normal_start

    minute_start = window_start.strftime("%Y-%m-%d %H:%M:00")
    minute_results = fetch_minutewise(minute_start, "now()")
    minute_rows = [to_row(r, is_minute=True) for r in minute_results]
    minute_keys = [row[0] for row in minute_rows]
    upsert_rows(MINUTEWISE_TAB, HEADERS_MINUTEWISE, minute_keys, minute_rows)

    # Retention: trim ARR Minute wise down to the trailing MINUTE_RETENTION_DAYS. Only near the
    # top of the hour, same as sync_arr.py's pattern, to limit Sheets API traffic -- a few minutes'
    # slack on the retention boundary costs nothing.
    if run_start.minute == 0:
        trim_old_rows(MINUTEWISE_TAB, MINUTE_RETENTION_DAYS, has_time=True, now=run_start)

    print(f"[{datetime.now(IST).isoformat()}] synced {DAYWISE_TAB}={len(day_rows)} day(s) "
          f"{MINUTEWISE_TAB}={len(minute_rows)} minute(s)")


if __name__ == "__main__":
    main()
