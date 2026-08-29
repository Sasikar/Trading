#!/usr/bin/env python3
"""Refresh trump-truths.json with recent market-relevant Truth Social posts.

Truth Social itself blocks datacenter traffic, so the public trumpstruth.org mirror
feed is used. Posts are filtered to the ones that can move markets.
"""
import html
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import requests

FEED_URL = "https://trumpstruth.org/feed"
OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "trump-truths.json")
WINDOW_DAYS = 3
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; TradingPulse/1.0)"}

TOPICS = {
    "tariff": "Tariffs / trade",
    "trade deal": "Tariffs / trade",
    "trade war": "Tariffs / trade",
    "china": "Tariffs / trade",
    "canada": "Tariffs / trade",
    "mexico": "Tariffs / trade",
    "europe": "Tariffs / trade",
    "fed": "Fed / rates",
    "powell": "Fed / rates",
    "interest rate": "Fed / rates",
    "inflation": "Fed / rates",
    "crypto": "Crypto",
    "bitcoin": "Crypto",
    "stock market": "Equities",
    "stocks": "Equities",
    "s&p": "Equities",
    "nasdaq": "Equities",
    "dow": "Equities",
    "economy": "Macro",
    "gdp": "Macro",
    "jobs": "Macro",
    "oil": "Energy",
    "opec": "Energy",
    "energy": "Energy",
    "gas prices": "Energy",
    "iran": "Geopolitics",
    "russia": "Geopolitics",
    "ukraine": "Geopolitics",
    "venezuela": "Geopolitics",
    "taiwan": "Geopolitics",
}


def strip_html(text):
    text = re.sub(r"<br\s*/?>", " ", text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def relevance(text):
    low = text.lower()
    hits = sorted({label for keyword, label in TOPICS.items() if keyword in low})
    return " · ".join(hits)


def main():
    resp = requests.get(FEED_URL, headers=HEADERS, timeout=45)
    resp.raise_for_status()
    root = ET.fromstring(resp.text)

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=WINDOW_DAYS)
    items = []
    for node in root.findall("./channel/item"):
        try:
            published = parsedate_to_datetime(node.findtext("pubDate") or "").astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue
        if published < cutoff:
            continue
        text = strip_html(node.findtext("description") or "") or strip_html(node.findtext("title") or "")
        if not text:
            continue
        why = relevance(text)
        if not why:
            continue
        items.append(
            {
                "text": text[:600],
                "url": node.findtext("link") or FEED_URL,
                "time": published.isoformat(),
                "source": "Truth Social",
                "why": why,
            }
        )

    items.sort(key=lambda x: x["time"], reverse=True)
    items = items[:30]
    payload = {
        "updated": now.isoformat(timespec="seconds"),
        "source": "Truth Social @realDonaldTrump via trumpstruth.org",
        "window_days": WINDOW_DAYS,
        "count": len(items),
        "items": items,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {len(items)} market-relevant Truth posts from the last {WINDOW_DAYS} days")


if __name__ == "__main__":
    sys.exit(main())
