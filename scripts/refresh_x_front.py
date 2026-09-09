#!/usr/bin/env python3
"""Pull market-front-running posts from high-signal X accounts into x-front.json.

Requires env X_BEARER_TOKEN (Twitter/X API v2). If missing, keeps existing file
and exits 0 so the rest of the news pipeline still runs.
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import requests

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "x-front.json")
TOKEN = (os.environ.get("X_BEARER_TOKEN") or "").strip()
MAX_AGE_H = 36
MAX_ITEMS = 25

# Squawk / wire-speed accounts — not random KOLs
ACCOUNTS = (
    "DeItaone",
    "FirstSquawk",
    "unusual_whales",
    "WatcherGuru",
    "LiveSquawk",
    "Tier10k",
    "Fxhedgers",
    "zerohedge",
)

IMPACT = re.compile(
    r"\b(breaking|just in|alert|treasury|buyback|buy back|fed\b|fomc|rate|yield|"
    r"bitcoin|btc|crypto|etf|oil|brent|opec|hormuz|iran|liquidity|dollar|dxy|"
    r"cpi|inflation|payroll|recession|tariff|sanctions|bank|crash|rally|selloff|"
    r"s&p|nasdaq|equity|bond|debt)\b",
    re.I,
)


def load_existing():
    try:
        with open(OUT, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"updated": None, "items": []}


def main():
    if not TOKEN:
        print("X_BEARER_TOKEN not set — skipping X front-run refresh (keeping existing x-front.json)")
        return 0

    query = "(" + " OR ".join(f"from:{a}" for a in ACCOUNTS) + ") -is:retweet -is:reply lang:en"
    url = "https://api.twitter.com/2/tweets/search/recent"
    params = {
        "query": query,
        "max_results": 100,
        "tweet.fields": "created_at,public_metrics,lang,text",
        "expansions": "author_id",
        "user.fields": "username",
    }
    headers = {"Authorization": f"Bearer {TOKEN}"}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=45)
        r.raise_for_status()
        data = r.json()
    except Exception as exc:
        print(f"X API error: {exc}")
        # do not wipe existing
        return 0

    users = {u["id"]: u.get("username", "?") for u in data.get("includes", {}).get("users", [])}
    cutoff = datetime.now(timezone.utc) - timedelta(hours=MAX_AGE_H)
    items = []
    for t in data.get("data") or []:
        text = (t.get("text") or "").strip()
        if not IMPACT.search(text):
            continue
        try:
            ts = datetime.fromisoformat(t["created_at"].replace("Z", "+00:00"))
        except Exception:
            continue
        if ts < cutoff:
            continue
        uid = t.get("author_id")
        user = users.get(uid, "unknown")
        metrics = t.get("public_metrics") or {}
        items.append(
            {
                "id": t["id"],
                "user": user,
                "text": text,
                "url": f"https://x.com/{user}/status/{t['id']}",
                "time": ts.isoformat(),
                "likes": metrics.get("like_count", 0),
                "views": metrics.get("impression_count", 0),
            }
        )

    items.sort(key=lambda x: x["time"], reverse=True)
    # dedupe by id
    seen, out_items = set(), []
    for it in items:
        if it["id"] in seen:
            continue
        seen.add(it["id"])
        out_items.append(it)
    out_items = out_items[:MAX_ITEMS]

    if not out_items:
        print("X API returned 0 impact posts — keeping existing file")
        return 0

    payload = {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "X API · high-signal accounts",
        "items": out_items,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {len(out_items)} X front-run posts. Newest @{out_items[0]['user']}: {out_items[0]['text'][:80]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
