#!/usr/bin/env python3
"""Resolve each card in connecting-art.json to a pokemontcg.io id + HD image +
USD/EUR price, writing connecting-art.resolved.json. Run locally and commit the
result so the GitHub Action never depends on live (keyless, flaky) lookups.

  python resolve_connecting_art.py          # resolve all
Env: POKEMONTCG_API_KEY (optional, faster/steadier).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

PTCG = "https://api.pokemontcg.io/v2"
HERE = Path(__file__).parent


def get(params):
    headers = {}
    import os
    key = os.environ.get("POKEMONTCG_API_KEY")
    if key:
        headers["X-Api-Key"] = key
    last = None
    for attempt in range(4):
        try:
            r = requests.get(f"{PTCG}/cards", params=params, headers=headers, timeout=25)
            if r.ok:
                return r.json().get("data") or []
            last = f"HTTP {r.status_code}"
        except Exception as exc:  # noqa: BLE001
            last = str(exc)
        time.sleep(1.5 * (attempt + 1))
    print(f"    ! query failed ({last})")
    return []


def price_usd(card):
    tp = (card.get("tcgplayer") or {}).get("prices") or {}
    vals = [v.get("market") or 0 for v in tp.values()]
    m = max(vals) if vals else 0
    return round(m, 2) if m else None


def price_eur(card):
    cm = (card.get("cardmarket") or {}).get("prices") or {}
    v = cm.get("trendPrice") or cm.get("averageSellPrice")
    return round(v, 2) if v else None


def resolve_card(c):
    name, setn, num = c["name"], c["setName"], str(c["number"])
    first = name.split(" ")[0]
    # set.name + number is the most reliable unique key; verify by name token.
    queries = [
        {"q": f'set.name:"{setn}" number:"{num}"', "pageSize": 10},
        {"q": f'name:"{name}" number:"{num}"', "pageSize": 10},
        {"q": f'name:"{first}" set.name:"{setn}"', "pageSize": 30},
    ]
    for q in queries:
        data = get(q)
        if not data:
            continue
        # prefer exact number match, then a name-token match
        cand = [d for d in data if str(d.get("number")) == num] or data
        cand = [d for d in cand if first.lower() in (d.get("name") or "").lower()] or cand
        card = cand[0]
        imgs = card.get("images") or {}
        return {
            "ptcgId": card.get("id"),
            "image": imgs.get("large") or imgs.get("small"),
            "usd": price_usd(card),
            "eur": price_eur(card),
            "resolvedName": card.get("name"),
        }
        time.sleep(0.2)
    return None


def main():
    src = json.loads((HERE / "connecting-art.json").read_text(encoding="utf-8"))
    groups = src["groups"]
    total = miss = 0
    for g in groups:
        print(f"\n# {g['id']} ({len(g['cards'])} cards)")
        for c in g["cards"]:
            total += 1
            res = resolve_card(c)
            time.sleep(0.25)
            if res and res.get("image"):
                c.update(res)
                usd = f"${res['usd']}" if res.get("usd") else "—"
                print(f"  ✓ {c['name']:<26} {res['ptcgId']:<14} {usd}")
            else:
                miss += 1
                c["ptcgId"] = None
                c["image"] = None
                print(f"  ✗ {c['name']:<26} ({c['setName']} {c['number']})")
        g["resolved"] = all(c.get("image") for c in g["cards"])
    out = HERE / "connecting-art.resolved.json"
    out.write_text(json.dumps(src, indent=2, ensure_ascii=False), encoding="utf-8")
    ok_groups = sum(1 for g in groups if g["resolved"])
    print(f"\n=== resolved {total - miss}/{total} cards · {ok_groups}/{len(groups)} groups fully resolved ===")
    print(f"wrote {out.name}")
    sys.exit(0)


if __name__ == "__main__":
    main()
