#!/usr/bin/env python3
"""Refresh trump-news.json with recent market news from reputable wires."""
import html
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote

import requests

OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "trump-news.json")
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; TradingPulse/1.0)"}
MAX_AGE_HOURS = 36
MAX_ITEMS = 30

QUERIES = [
    "stock market when:1d",
    "Federal Reserve interest rates when:1d",
    "Trump tariffs markets when:1d",
    "bitcoin crypto market when:1d",
    "oil prices OPEC when:1d",
    "US economy inflation jobs when:1d",
]

# Exact publisher names; regional rebroadcasters such as "BNN Bloomberg" or
# "CNBC TV18" are intentionally excluded because their coverage is local.
ALLOWED_SOURCES = {
    "reuters",
    "associated press",
    "ap news",
    "bloomberg",
    "cnbc",
    "financial times",
    "the wall street journal",
    "wall street journal",
    "barron's",
    "barrons",
    "the economist",
    "politico",
    "bbc",
    "bbc news",
    "axios",
    "forbes",
    "fortune",
    "the new york times",
    "the washington post",
    "coindesk",
    "the block",
}

# Auto-generated single-ticker filler and publisher landing pages.
NOISE_PATTERNS = (
    re.compile(r"\bstock (?:falls|rises|climbs|slides|outperforms|underperforms)\b", re.I),
    re.compile(r"here is why\b", re.I),
    re.compile(r"^stock market quotes", re.I),
)

MARKET_KEYWORDS = (
    "market",
    "stock",
    "s&p",
    "nasdaq",
    "dow",
    "fed",
    "rate",
    "inflation",
    "tariff",
    "trade",
    "bond",
    "yield",
    "dollar",
    "oil",
    "gold",
    "bitcoin",
    "crypto",
    "etf",
    "earnings",
    "economy",
    "jobs",
    "recession",
    "treasury",
)


def fetch_feed(query):
    url = "https://news.google.com/rss/search?q=" + quote(query) + "&hl=en-US&gl=US&ceid=US:en"
    resp = requests.get(url, headers=HEADERS, timeout=45)
    resp.raise_for_status()
    return ET.fromstring(resp.text)


def main():
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=MAX_AGE_HOURS)
    collected = []
    for query in QUERIES:
        try:
            root = fetch_feed(query)
        except Exception as exc:  # noqa: BLE001 - one bad feed must not kill the run
            print(f"Query failed ({query}): {exc}")
            continue
        for node in root.findall("./channel/item"):
            title = html.unescape(node.findtext("title") or "").strip()
            source_el = node.find("source")
            source = html.unescape((source_el.text if source_el is not None else "") or "").strip()
            if source.lower() not in ALLOWED_SOURCES:
                continue
            low = title.lower()
            if not any(keyword in low for keyword in MARKET_KEYWORDS):
                continue
            if any(pattern.search(title) for pattern in NOISE_PATTERNS):
                continue
            pub = node.findtext("pubDate") or ""
            try:
                published = parsedate_to_datetime(pub).astimezone(timezone.utc)
            except (TypeError, ValueError):
                continue
            if published < cutoff:
                continue
            collected.append(
                {
                    "title": title,
                    "source": source,
                    "url": node.findtext("link") or "",
                    "time": published.isoformat(),
                    "_sort": published,
                }
            )

    seen = set()
    items = []
    for item in sorted(collected, key=lambda x: x["_sort"], reverse=True):
        key = re.sub(r"[^a-z0-9]", "", item["title"].lower())[:80]
        if key in seen:
            continue
        seen.add(key)
        item.pop("_sort")
        items.append(item)
    items = items[:MAX_ITEMS]

    if len(items) < 5:
        raise SystemExit(f"Only {len(items)} reputable fresh items found; refusing to replace existing news")

    payload = {
        "updated": now.isoformat(timespec="seconds"),
        "source": "Google News RSS · major wires only",
        "items": items,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {len(items)} items. Newest: {items[0]['time']} ({items[0]['source']})")


if __name__ == "__main__":
    sys.exit(main())
