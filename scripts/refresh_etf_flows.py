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
import urllib.request
from datetime import date, datetime, timedelta, timezone

import requests

FARSIDE_URL = "https://farside.co.uk/btc/"
MIRROR_URL = "https://r.jina.ai/" + FARSIDE_URL
OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "etf-flows.json")
WINDOW_DAYS = 180
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html",
}
DATE_RE = re.compile(r"^(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})$")
ROW_RE = re.compile(
    r'<td><span class="tabletext">(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})</span></td>(.*?)</tr>',
    re.S,
)
TD_RE = re.compile(r'<td\b[^>]*>(.*?)</td>', re.S)
NUM_RE = re.compile(r'>\(?([\d,.]+)\)?<')


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
    rows = []
    for day_raw, rest in ROW_RE.findall(html or ""):
        try:
            day = datetime.strptime(day_raw, "%d %b %Y").date()
        except ValueError:
            continue
        cells = []
        for td in TD_RE.findall(rest):
            found = NUM_RE.findall(td)
            if not found:
                continue
            raw = found[-1]
            if "(" in td and ")" in td:
                raw = "(" + raw + ")"
            value = to_number(raw)
            if value is not None:
                cells.append(value)
        if not cells:
            continue
        rows.append([day.strftime("%Y-%m-%d"), cells[-1]])
    if rows:
        return rows
    from io import StringIO

    import pandas as pd

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


def http_text(url, timeout):
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        if resp.ok and "tabletext" in resp.text:
            return resp.text
    except Exception:
        pass
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def fetch_rows():
    errors = []
    try:
        html = http_text(FARSIDE_URL, 45)
        rows = parse_html_table(html)
        if rows:
            return rows, "Farside Investors"
        errors.append("direct fetch returned no usable table")
    except Exception as exc:  # noqa: BLE001 - fall through to the mirror
        errors.append(f"direct fetch failed: {exc}")

    try:
        resp = requests.get(MIRROR_URL, headers=HEADERS, timeout=90)
        resp.raise_for_status()
        rows = parse_markdown_table(resp.text)
        if rows:
            return rows, "Farside Investors"
        errors.append("mirror returned no usable rows")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"mirror failed: {exc}")
    raise SystemExit("Could not parse ETF flows from any source: " + "; ".join(errors))


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
