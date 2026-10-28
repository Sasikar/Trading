#!/usr/bin/env python3
"""Daily snapshot of DefiLlama DEX volume for the DEX tab."""
import json
import time
import urllib.request

URL = "https://api.llama.fi/overview/dexs?excludeTotalDataChartBreakdown=true"
OUT = "dex-volume.json"


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "TradingDashboard/1.0"})
    with urllib.request.urlopen(req, timeout=60) as res:
        data = json.load(res)
    chart = []
    for row in data.get("totalDataChart") or []:
        if not row or len(row) < 2:
            continue
        ts, vol = int(row[0]), float(row[1] or 0)
        if vol < 0:
            continue
        chart.append([ts, round(vol, 2)])
    protocols = []
    week = prev = month = day = 0.0
    for row in data.get("protocols") or []:
        if row.get("category") != "Dexs":
            continue
        vol = float(row.get("total24h") or 0)
        day += vol
        week += float(row.get("total7d") or 0)
        prev += float(row.get("total14dto7d") or 0)
        month += float(row.get("total30d") or 0)
        if vol <= 0:
            continue
        chains = row.get("chains") or []
        protocols.append({
            "name": row.get("displayName") or row.get("name") or "",
            "volume24h": round(vol, 2),
            "change1d": row.get("change_1d"),
            "chain": chains[0] if len(chains) == 1 else ("Multi" if chains else ""),
        })
    protocols.sort(key=lambda r: r["volume24h"], reverse=True)
    change7 = ((week - prev) / prev * 100) if prev else data.get("change_7d")
    out = {
        "source": "defillama",
        "updated": int(time.time() * 1000),
        "total24h": round(day, 2),
        "total7d": round(week, 2),
        "total30d": round(month, 2),
        "change7d": round(change7, 2) if change7 is not None else None,
        "chart": chart,
        "protocols": protocols[:20],
    }
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("days", len(chart), "protocols", len(out["protocols"]), "24h", out["total24h"])


if __name__ == "__main__":
    main()
