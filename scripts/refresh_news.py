#!/usr/bin/env python3
"""Dynamically refresh trump-news.json with latest market/crypto-impact news.

No event hardcoding. Themes stay fixed; headlines change every run via Google News RSS.
Only major wires; filtered by impact keywords (liquidity, rates, risk, crypto, etc.).
"""
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
MAX_AGE_HOURS = 48
MAX_ITEMS = 30

# Theme queries only — never specific one-day event titles.
# Google News returns whatever is currently top for each theme.
QUERIES = [
    # Broad markets
    "US stock market when:1d",
    "Wall Street stocks when:1d",
    "S&P 500 Nasdaq when:1d",
    # Policy / liquidity / rates (catches Fed, Treasury ops, buybacks, QT/QE when they matter)
    "Federal Reserve interest rates when:1d",
    "US Treasury bond yield liquidity when:1d",
    "US dollar liquidity markets when:1d",
    "bond market yields when:1d",
    # Macro
    "US inflation jobs economy when:1d",
    "recession risk markets when:1d",
    # Geopolitics / trade that moves risk assets
    "tariffs trade war markets when:1d",
    "oil prices OPEC markets when:1d",
    # Crypto / digital assets
    "bitcoin crypto market when:1d",
    "bitcoin ETF flows when:1d",
    "cryptocurrency regulation market when:1d",
    # Risk sentiment
    "market selloff rally when:1d",
    "financial markets breaking when:1d",
]

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
    "cointelegraph",
}

NOISE_PATTERNS = (
    re.compile(r"\bstock (?:falls|rises|climbs|slides|outperforms|underperforms)\b", re.I),
    re.compile(r"here is why\b", re.I),
    re.compile(r"^stock market quotes", re.I),
    re.compile(r"\bprice of oil as of\b", re.I),
    re.compile(r"\btop \d+ things to watch\b", re.I),
)

# Impact filter — story must touch at least one of these (not a single-ticker gossip piece)
IMPACT_KEYWORDS = (
    "market", "markets", "stock", "stocks", "s&p", "nasdaq", "dow", "equit",
    "fed", "federal reserve", "fomc", "rate", "rates", "inflation", "cpi", "ppi",
    "tariff", "trade war", "sanctions",
    "bond", "bonds", "yield", "yields", "treasury", "treasuries", "buyback", "buy back",
    "liquidity", "debt", "deficit", "qt", "qe", "balance sheet",
    "dollar", "dxy", "currency", "fx",
    "oil", "brent", "crude", "opec", "gold",
    "bitcoin", "btc", "crypto", "ethereum", "etf",
    "economy", "gdp", "jobs", "payroll", "unemployment", "recession",
    "risk-off", "risk-on", "selloff", "sell-off", "rally", "crash",
    "bank", "credit", "default",
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
        except Exception as exc:  # noqa: BLE001
            print(f"Query failed ({query}): {exc}")
            continue
        for node in root.findall("./channel/item"):
            title = html.unescape(node.findtext("title") or "").strip()
            source_el = node.find("source")
            source = html.unescape((source_el.text if source_el is not None else "") or "").strip()
            if source.lower() not in ALLOWED_SOURCES:
                continue
            low = title.lower()
            if not any(keyword in low for keyword in IMPACT_KEYWORDS):
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
        "source": "Google News RSS · dynamic themes · major wires",
        "items": items,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {len(items)} items. Newest: {items[0]['time']} ({items[0]['source']})")
    for it in items[:5]:
        print(" -", it["title"][:90])


if __name__ == "__main__":
    sys.exit(main())
