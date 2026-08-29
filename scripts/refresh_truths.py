#!/usr/bin/env python3
"""Refresh trump-truths.json with market/crypto-impact Truth posts only.

Weak political noise (endorsements, pure campaign attacks) is dropped unless
the same post also hits a high-impact market keyword.
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

STRONG = {
    "tariff": "Tariffs",
    "tariffs": "Tariffs",
    "reciprocal": "Tariffs",
    "trade war": "Tariffs",
    "trade deal": "Trade",
    "trade deficit": "Trade",
    "china trade": "Trade",
    "import tax": "Tariffs",
    "bitcoin": "Crypto",
    "btc": "Crypto",
    "crypto": "Crypto",
    "cryptocurrency": "Crypto",
    "ethereum": "Crypto",
    "digital asset": "Crypto",
    "cbdc": "Crypto",
    "sec ": "Crypto/reg",
    "securities and exchange": "Crypto/reg",
    "federal reserve": "Fed",
    "the fed": "Fed",
    "powell": "Fed",
    "interest rate": "Fed",
    "rate cut": "Fed",
    "rate hike": "Fed",
    "fomc": "Fed",
    "inflation": "Macro",
    "consumer price": "Macro",
    " cpi": "Macro",
    "jobs report": "Macro",
    "nonfarm": "Macro",
    "gdp": "Macro",
    "recession": "Macro",
    "stock market": "Equities",
    "stock market crash": "Equities",
    "s&p": "Equities",
    "nasdaq": "Equities",
    "dow jones": "Equities",
    "nvidia": "Equities",
    "chip": "Equities",
    "semiconductor": "Equities",
    "oil deal": "Energy",
    "crude": "Energy",
    "opec": "Energy",
    "oil reserves": "Energy",
    "oil price": "Energy",
    "gas prices": "Energy",
    "energy independence": "Energy",
    "sanctions": "Geopolitics",
    "us dollar": "FX",
    "strong dollar": "FX",
    "weak dollar": "FX",
    "dollar is": "FX",
    "venezuela": "Energy/Geo",
    "iran oil": "Energy/Geo",
    "china tariff": "Tariffs",
    "mexico tariff": "Tariffs",
    "canada tariff": "Tariffs",
}

WEAK_ONLY_BLOCK = re.compile(
    r"\b("
    r"complete and total endorsement|my complete and total endorsement|"
    r"vote for|vote republican|vote democrat|"
    r"governor|hochul|blakeman|"
    r"dumocrats|democrat(s)? are|"
    r"maga\b|rally in|"
    r"happy birthday|congratulations to|"
    r"fake news|witch hunt|"
    r"impeachment|congressman|senator \w+ is|"
    r"lake america"
    r")\b",
    re.I,
)


def strip_html(text):
    text = re.sub(r"<br\s*/?>", " ", text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def strong_hits(text):
    low = " " + text.lower() + " "
    labels = []
    for keyword, label in STRONG.items():
        if keyword in low:
            labels.append(label)
    seen = set()
    out = []
    for x in labels:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def is_market_impact(text):
    hits = strong_hits(text)
    if not hits:
        return False, ""
    if WEAK_ONLY_BLOCK.search(text):
        hard = [h for h in hits if h not in ("Energy/Geo", "Geopolitics")]
        if not hard:
            if any(
                k in text.lower()
                for k in (
                    "oil",
                    "tariff",
                    "trade",
                    "bitcoin",
                    "crypto",
                    "fed",
                    "rate",
                    "market",
                    "nasdaq",
                    "s&p",
                )
            ):
                return True, " · ".join(hits)
            return False, ""
    return True, " · ".join(hits)


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
        ok, why = is_market_impact(text)
        if not ok:
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
    items = items[:25]
    payload = {
        "updated": now.isoformat(timespec="seconds"),
        "source": "Truth Social @realDonaldTrump via trumpstruth.org",
        "window_days": WINDOW_DAYS,
        "filter": "market-crypto-impact-v2",
        "count": len(items),
        "items": items,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {len(items)} high-impact Truth posts (last {WINDOW_DAYS}d)")
    for it in items[:8]:
        print("-", it["why"], "|", it["text"][:90].replace("\n", " "))


if __name__ == "__main__":
    sys.exit(main())
