#!/usr/bin/env python3
"""Refresh U.S. spot Bitcoin ETF daily net flows into etf-flows.json.

Primary source is the Farside "all data" table. Farside sits behind Cloudflare and
returns 403 to datacenter IPs, so a text-extraction mirror is used as a fallback.
Existing rows are merged, never dropped, so a partial fetch cannot erase history.
"""
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone

import requests

FARSIDE_URL = "https://farside.co.uk/bitcoin-etf-flow-all-data/"
MIRROR_URL = "https://r.jina.ai/" + FARSIDE_URL
OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "etf-flows.json")
WINDOW_DAYS = 180
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; TradingPulse/1.0)"}
DATE_RE = re.compile(r"^(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})$")


def to_number(raw):
    raw = str(raw).strip().replace(",", "")
    if raw in {"", "-", "—", "nan", "None"}:
        return None
    neg = raw.startswith("(") and raw.endswith(")")
    raw = raw.strip("()")
    try:
        val = float(raw)
    except ValueError:
        return None
    return -val if neg else val


def parse_html_table(html):
    from io import StringIO

    import pandas as pd

    rows = []
    for table in pd.read_html(StringIO(html)):
        cols = [str(c).strip().lower() for c in table.columns]
        if not (any("date" in c for c in cols) and any("total" in c for c in cols)):
            continue
        dc = next(c for c in table.columns if "date" in str(c).lower())
        tc = next(c for c in table.columns if "total" in str(c).lower())
        for _, r in table.iterrows():
            d = pd.to_datetime(r[dc], errors="coerce")
            v = to_number(r[tc])
            if pd.isna(d) or v is None:
                continue
            rows.append([d.strftime("%Y-%m-%d"), v])
        break
    return rows


def parse_markdown_table(text):
    """Parse the mirror's markdown rendering: a date line followed by one column per line."""
    lines = [ln.strip().strip("\t").strip() for ln in text.splitlines()]
    rows = []
    i = 0
    while i < len(lines):
        m = DATE_RE.match(lines[i])
        if not m:
            i += 1
            continue
        try:
            day = datetime.strptime(m.group(1), "%d %b %Y").date()
        except ValueError:
            i += 1
            continue
        numbers = []
        j = i + 1
        while j < len(lines) and not DATE_RE.match(lines[j]):
            cell = lines[j]
            if cell:
                if cell in {"-", "—"}:
                    j += 1
                    continue
                value = to_number(cell)
                if value is None:
                    break
                numbers.append(value)
            j += 1
        if numbers:
            rows.append([day.strftime("%Y-%m-%d"), numbers[-1]])
        i = max(j, i + 1)
    return rows


def fetch_rows():
    errors = []
    try:
        html = requests.get(FARSIDE_URL, headers=HEADERS, timeout=45).text
        rows = parse_html_table(html)
        if rows:
            return rows, "Farside Investors"
        errors.append("direct fetch returned no usable table")
    except Exception as exc:  # noqa: BLE001 - fall through to the mirror
        errors.append(f"direct fetch failed: {exc}")

    resp = requests.get(MIRROR_URL, headers=HEADERS, timeout=90)
    resp.raise_for_status()
    rows = parse_markdown_table(resp.text)
    if not rows:
        raise SystemExit("Could not parse ETF flows from any source: " + "; ".join(errors))
    return rows, "Farside Investors"


def load_existing():
    try:
        with open(OUT_PATH, encoding="utf-8") as f:
            return {str(d): float(v) for d, v in json.load(f).get("data", [])}
    except (OSError, ValueError, TypeError):
        return {}


def main():
    rows, source = fetch_rows()
    merged = load_existing()
    for day, value in rows:
        merged[day] = value

    cutoff = (date.today() - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%d")
    data = sorted(([d, v] for d, v in merged.items() if d >= cutoff), key=lambda x: x[0])
    if len(data) < 30:
        raise SystemExit(f"Only {len(data)} rows in window; refusing to overwrite dataset")

    payload = {
        "updated": data[-1][0],
        "fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "unit": "USD millions net flow",
        "data": data,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    print(f"Saved {len(data)} rows, {data[0][0]} through {data[-1][0]} (latest {data[-1][1]}M)")


if __name__ == "__main__":
    sys.exit(main())
