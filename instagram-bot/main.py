#!/usr/bin/env python3
"""
PokeEV Instagram bot — Claude art-directed, price-verified premium carousels.

Two phases around a manual GitHub approval gate:

  python main.py plan      Rotate a theme, select sets (deduped vs recent posts),
                           VERIFY every displayed price against live pokemontcg.io
                           sources, ask Claude to art-direct the cover copy +
                           caption, build the /api/ig slide URLs, and write
                           plan.json + a rich GitHub step-summary preview.

  python main.py publish    Read plan.json and publish the carousel + story +
                           first comment via the Meta Graph API, then append the
                           posted sets to history.json. Runs only after approval.

Env: ANTHROPIC_API_KEY, META_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID, POKEMONTCG_API_KEY
     (optional), POKEEV_DATA_DIR, POKEEV_IMAGE_BASE_URL, META_GRAPH_VERSION,
     TOP_N_CARDS, PLAN_PATH, HISTORY_PATH, GITHUB_STEP_SUMMARY, DRY_RUN.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

LOCALE = "en"
CLAUDE_MODEL = "claude-sonnet-4-6"
HTTP_TIMEOUT = 30
PTCG_API = "https://api.pokemontcg.io/v2"
DEDUP_DAYS = 14
VERIFY_TOLERANCE = 0.15  # ≤15% live-vs-snapshot gap counts as agreement

THEMES = {
    "grails": {"tag": "GRAIL WATCH", "rank_by": "price"},
    "ev": {"tag": "BEST EV", "rank_by": "ev"},
}


def env(name, default=None, required=False):
    v = os.environ.get(name, default)
    if required and not v:
        sys.exit(f"[pokeev-bot] missing required env var: {name}")
    return v


def log(msg):
    print(f"[pokeev-bot] {msg}", flush=True)


# --------------------------------- data ----------------------------------- #
def load_set_names(data_dir: Path) -> dict:
    names = {}
    for path in sorted((data_dir / "sets").glob("*.json")):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        for s in doc.get("sets", []):
            if s.get("id"):
                names[s["id"]] = {"en": s.get("nameEn") or s["id"], "year": (s.get("releaseDate") or "")[:4]}
    return names


def card_value(c):
    return c.get("usd") or c.get("eur") or 0


def select_sets(snapshot, names, rank_by, n, exclude):
    rows = []
    for sid, s in snapshot.get("sets", {}).items():
        if sid in exclude:
            continue
        cards = [c for c in s.get("cards", []) if c.get("image") and card_value(c) > 0]
        if not cards:
            continue
        chase = max(cards, key=card_value)
        ev = (s.get("ev") or {}).get(LOCALE) or {}
        meta = names.get(sid, {})
        # Pull-odds for the "1 IN N PACKS" authority chip — only where it's real:
        # match the chase card's id against the set's per-pack probability table.
        chase_id = chase.get("id")
        prob = None
        for tc in ev.get("topCards") or []:
            if tc.get("cardId") == chase_id:
                prob = tc.get("probabilityPerPack")
                break
        rows.append({
            "id": sid,
            "name": meta.get("en", sid),
            "year": meta.get("year", ""),
            "chase_name": chase.get("name") or "?",
            "chase_usd": chase.get("usd"),
            "chase_eur": chase.get("eur"),
            "chase_image": chase.get("image"),
            "pack_ev": ev.get("packEv"),
            "prob_per_pack": prob,
        })
    if rank_by == "ev":
        rows = [r for r in rows if r["pack_ev"]]
        rows.sort(key=lambda r: r["pack_ev"], reverse=True)
    else:
        rows.sort(key=lambda r: (r["chase_usd"] or r["chase_eur"] or 0), reverse=True)
    return rows[:n]


# ---------------------------- price verification -------------------------- #
def _ptcg_get(url, params=None):
    import requests

    headers = {}
    key = os.environ.get("POKEMONTCG_API_KEY")
    if key:
        headers["X-Api-Key"] = key
    last = None
    for attempt in range(3):  # the keyless tier is flaky; retry transient errors
        try:
            r = requests.get(url, params=params, headers=headers, timeout=20)
            if r.ok:
                return r.json()
            if r.status_code == 404:
                raise RuntimeError(f"pokemontcg {url} -> 404")
            last = RuntimeError(f"pokemontcg {url} -> {r.status_code}")
        except Exception as exc:  # noqa: BLE001 — retry network hiccups
            last = exc
        time.sleep(1.5 * (attempt + 1))
    raise last or RuntimeError("pokemontcg unreachable")


def verify_price(item):
    """Cross-check the displayed USD price against live pokemontcg.io
    (TCGplayer market + Cardmarket trend). Returns a record incl. the verified
    USD figure to display and an agreement flag."""
    snap_usd = item.get("chase_usd")
    snap_eur = item.get("chase_eur")
    rec = {"snap_usd": snap_usd, "snap_eur": snap_eur, "live_usd": None, "live_eur": None,
           "agree": None, "note": "", "display_usd": snap_usd}
    m = re.search(r"images\.pokemontcg\.io/([^/]+)/([^/.]+)\.png", item.get("chase_image") or "")
    if not m:
        rec["note"] = "no pokemontcg id (modern scan) — snapshot price kept"
        return rec
    card_id = f"{m.group(1)}-{m.group(2)}"
    try:
        data = (_ptcg_get(f"{PTCG_API}/cards/{card_id}") or {}).get("data") or {}
    except Exception as exc:
        rec["note"] = f"live fetch failed ({exc}) — snapshot price kept"
        return rec
    tp = (data.get("tcgplayer") or {}).get("prices") or {}
    live_usd = max([v.get("market") or 0 for v in tp.values()] + [0]) or None
    cm = (data.get("cardmarket") or {}).get("prices") or {}
    live_eur = cm.get("trendPrice") or cm.get("averageSellPrice")
    rec["live_usd"] = round(live_usd, 2) if live_usd else None
    rec["live_eur"] = round(live_eur, 2) if live_eur else None
    if snap_usd and live_usd:
        gap = abs(live_usd - snap_usd) / snap_usd
        rec["agree"] = gap <= VERIFY_TOLERANCE
        # Trust the fresher live figure for what we publish.
        rec["display_usd"] = round(live_usd, 2)
        rec["note"] = "agree" if rec["agree"] else f"diverged {gap*100:.0f}% — using fresh live price"
    else:
        rec["note"] = "no live USD — snapshot price kept"
    return rec


def fmt_usd(v):
    return f"${v:,.0f}" if v else "—"


# ------------------------------- upscaling -------------------------------- #
def _hires(url):
    if "images.pokemontcg.io" in url and url.endswith(".png") and not url.endswith("_hires.png"):
        return url.replace(".png", "_hires.png")
    return url


def _blob_put(local_path, pathname):
    """Upload a local file to Vercel Blob (public) via the node SDK; return its URL."""
    import subprocess

    here = Path(__file__).parent
    return subprocess.check_output(
        ["node", str(here / "blob_upload.mjs"), local_path, pathname],
        text=True, timeout=90, cwd=str(here),
    ).strip() or None


def _download_bytes(url, timeout=90, tries=3):
    """GET a URL with retries (the /api/ig render can take ~6s); return bytes or raise.
    The bot is patient where Telegram/Instagram's short fetch timeouts are not."""
    import requests

    last = None
    for k in range(tries):
        try:
            r = requests.get(url, timeout=timeout)
            if r.status_code == 200 and r.content:
                return r.content
            last = f"HTTP {r.status_code}"
        except Exception as exc:  # noqa: BLE001
            last = str(exc)
        time.sleep(2 * (k + 1))
    raise RuntimeError(f"download failed {url}: {last}")


def upscale_card(image_url):
    """Free AI super-resolution (OpenCV LapSRN x4): the 600px scan → ~2400px,
    hosted on Vercel Blob so /api/ig can render it razor-sharp. Returns the HD
    url, or None (graceful) without BLOB_READ_WRITE_TOKEN or on failure."""
    if not os.environ.get("BLOB_READ_WRITE_TOKEN") or not image_url:
        return None
    here = Path(__file__).parent
    tmp = None
    try:
        import hashlib
        import tempfile

        import cv2  # opencv-contrib-python (dnn_superres)
        import numpy as np
        import requests

        src = _hires(image_url)
        data = requests.get(src, timeout=30).content
        arr = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if arr is None:
            return None
        sr = cv2.dnn_superres.DnnSuperResImpl_create()
        sr.readModel(str(here / "models" / "LapSRN_x4.pb"))
        sr.setModel("lapsrn", 4)
        out = sr.upsample(arr)
        fd, tmp = tempfile.mkstemp(suffix=".png")
        os.close(fd)
        cv2.imwrite(tmp, out)
        pathname = f"ig-cards/{hashlib.md5(src.encode()).hexdigest()}.png"
        return _blob_put(tmp, pathname)
    except Exception as exc:  # noqa: BLE001 — never fail a post over upscaling
        log(f"  upscale failed ({exc})")
        return None
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)


# ------------------------------ art direction ----------------------------- #
def art_direct(api_key, theme_key, tag, items, feedback=None):
    from anthropic import Anthropic

    lines = [
        f"{i}. {it['name']} ({it['year']}) — {it['chase_name']} {fmt_usd(it['verified_usd'])}"
        + (f" | booster EV ${it['pack_ev']:.2f}" if it.get("pack_ev") else "")
        for i, it in enumerate(items, 1)
    ]
    angle = "the 5 sets sitting on the most valuable chase cards" if theme_key == "grails" \
        else "the 5 sets with the highest booster Expected Value"
    top = max((it.get("verified_usd") or 0) for it in items) if items else 0
    prompt = (
        "You are the art director + copywriter for @pokeev.tcg, a PREMIUM Pokémon TCG "
        "Expected-Value tool (pokeev.com). Audience: serious collectors & investors, mostly US. "
        "Today's carousel covers " + angle + ".\n\n"
        "VOICE GUARDRAIL — serious collectors read hype as amateur. NEVER use these words: insane, "
        "brutal, unhinged, wild, crazy, mind-blowing, 'brace', or money analogies (rent, car, PS5, "
        "salary). The verified numbers carry the shock; restraint is the brand. Confident insider, "
        "never cringe.\n\n"
        "FORMAT — this carousel is a COUNTDOWN that reveals 5 cards from #5 (lowest price) up to #1 "
        "(the grail, the biggest number). The cover already shows the #1 price " + fmt_usd(top) + " with "
        "its last digits hidden behind a holo bar, so the whole carousel is ONE open loop that only "
        "pays off on the final card. Your copy must honour that structure.\n\n"
        "DATA (verified prices — keep every number EXACT):\n" + "\n".join(lines) + "\n\n"
        "Return ONLY a JSON object, no markdown, with keys:\n"
        f'  "coverTag": a short series label, ALL CAPS, ≤ 16 chars (e.g. "GRAIL RUN", "{tag}")\n'
        '  "coverSub": ONE restrained line, ≤ 115 chars, that names the climb and promises the saveable '
        'ranking — must say #1 ends at the number shown and that the full ranking is the last slide. e.g. '
        '"5 sealed-era grails, ranked #5 → #1. #1 ends at the number above. Full ranking on the last slide — save it."\n'
        '  "caption": the Instagram caption. Each item on its OWN short line (nothing wraps):\n'
        "       - a hook line that mirrors the loop (e.g. \"Swipe to #1 — it isn't the one you think.\")\n"
        "       - one tight line per set, COUNTING DOWN #5 → #1: rank emoji, card name, price\n"
        "       - a line: pokeev.com instantly tells you if a sealed box is worth opening (EV vs box price)\n"
        "       - 'Save the last slide.'\n"
        "       - close with 'link in bio → pokeev.com'\n"
        "     Name pokeev.com at least twice. No hashtags inside the caption.\n"
        '  "hashtags": array of 15-20 strong hashtags (mix high-volume + niche collector tags), each unique\n'
    )
    if feedback:
        prompt += (
            "\n\nThe editor reviewed the previous version and requested changes. APPLY THIS FEEDBACK "
            f"precisely, keeping all prices exact:\n\"{feedback}\"\n"
        )
    client = Anthropic(api_key=api_key)
    msg = client.messages.create(model=CLAUDE_MODEL, max_tokens=1100,
                                 messages=[{"role": "user", "content": prompt}])
    raw = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    brief = json.loads(raw)
    brief["hashtags"] = [h if h.startswith("#") else "#" + h for h in brief.get("hashtags", [])][:20]
    return brief


def fallback_brief(theme_key, tag, items):
    ordered = sorted(items, key=lambda it: (it.get("verified_usd") or 0))  # cheapest → grail
    n = len(ordered)
    medals = {1: "🥇", 2: "🥈", 3: "🥉", 4: "4️⃣", 5: "5️⃣"}
    lines = []
    for i, it in enumerate(ordered):
        rank = n - i
        lines.append(f"{medals.get(rank, f'#{rank}')} {it['chase_name']} — {fmt_usd(it['verified_usd'])}")
    body = "\n".join(lines)
    top = fmt_usd(max((it.get("verified_usd") or 0) for it in items) if items else 0)
    return {
        "coverTag": "GRAIL RUN" if theme_key == "grails" else tag,
        "coverSub": f"Five ranked #5 → #1. #1 ends at {top}. Full ranking on the last slide — save it.",
        "caption": ("Swipe to #1 — it isn't the one you think.\n\n" + body
                    + "\n\npokeev.com instantly tells you if a sealed box is worth opening — EV vs the box price."
                    + "\nSave the last slide.\nlink in bio → pokeev.com"),
        "hashtags": ["#pokemon", "#pokemontcg", "#pokemoncards", "#pokemoncardcollection", "#tcg",
                     "#pokemoninvesting", "#charizard", "#pokemoncommunity", "#vintagepokemon", "#pokeev",
                     "#pokemongrails", "#sealedpokemon", "#pokemoninvestment", "#tcgcollector", "#vintagetcg"],
    }


# -------------------------------- urls ------------------------------------ #
def q(s):
    from urllib.parse import quote

    return quote(str(s), safe="")


def _auto_teaser(ordered, pos, top_usd):
    """Data-true forward hook from the card at `pos` (cheapest-first) to the next,
    pricier card — re-arms the open loop on every swipe. #2 cliffhangs, #1 pays off."""
    n = len(ordered)
    rank = n - pos
    if rank == 1:
        return "YOU MADE IT — THIS IS #1"
    if rank == 2:
        return "ONLY THE GRAIL IS LEFT →"
    this_usd = ordered[pos].get("verified_usd") or 0
    nxt_usd = ordered[pos + 1].get("verified_usd") or 0
    if this_usd and nxt_usd and nxt_usd / this_usd >= 1.4:
        return f"NEXT IS {nxt_usd / this_usd:.1f}× THIS · KEEP GOING →"
    gap = (top_usd or 0) - this_usd
    if gap > 0:
        return f"#1 IS STILL {fmt_usd(gap)} AWAY · SWIPE →"
    return "KEEP SWIPING →"


def build_slides(base, theme_key, tag, brief, items):
    """The Vault Countdown: cover teases the biggest number (trailing digits locked),
    cards climb #5 -> #1 with open-loop teasers + a climax frame on the grail, then a
    saveable recap. cover(1) + n cards + recap + cta, a progress rail on every slide."""
    base = base.rstrip("/")
    n = len(items)
    total = n + 3
    # Climb by chase-card price for BOTH themes so the headline number rises every
    # swipe; the theme still decides which sets are featured + the EV/odds chip.
    ordered = sorted(items, key=lambda it: (it.get("verified_usd") or 0))
    top_usd = max((it.get("verified_usd") or 0) for it in items) if items else 0

    cover = (f"{base}/api/ig?slide=cover&theme={theme_key}"
             f"&title={q(fmt_usd(top_usd))}&tag={q(brief['coverTag'])}&sub={q(brief['coverSub'])}"
             f"&mask=2&step=1&total={total}")

    cards = []
    for pos, it in enumerate(ordered):
        rank = n - pos                      # cheapest emitted first shows '5', grail shows '1'
        u = (f"{base}/api/ig?slide=card&set={q(it['id'])}&rank={rank}&theme={theme_key}"
             f"&tag={q(brief['coverTag'])}&price={q(fmt_usd(it['verified_usd']))}"
             f"&teaser={q(_auto_teaser(ordered, pos, top_usd))}&step={pos + 2}&total={total}")
        if it.get("hd_image"):
            u += f"&img={q(it['hd_image'])}"
        if it.get("odds_str"):
            u += f"&odds={q(it['odds_str'])}"
        if rank == 1:
            u += "&climax=1"
        cards.append(u)

    recap = (f"{base}/api/ig?slide=recap&theme={theme_key}"
             f"&sets={q(','.join(it['id'] for it in ordered))}"
             + "".join(f"&p{i}={q(fmt_usd(it['verified_usd']))}" for i, it in enumerate(ordered, 1))
             + "".join(f"&img{i}={q(it['hd_image'])}" for i, it in enumerate(ordered, 1) if it.get("hd_image"))
             + f"&step={n + 2}&total={total}")
    cta = f"{base}/api/ig?slide=cta&step={total}&total={total}"
    return cover, cards, recap, cta


def materialize_slides(urls):
    """Render each /api/ig slide ONCE (the bot fetches it patiently) and re-host the
    PNG on Vercel Blob as a static CDN file. Telegram and Instagram then download a
    fast static object instead of a ~6s live render that blows their fetch timeouts.
    Falls back to the original render URL for any slide that can't be hosted."""
    if not os.environ.get("BLOB_READ_WRITE_TOKEN"):
        return urls
    import hashlib
    import tempfile

    out = []
    for i, u in enumerate(urls, 1):
        tmp = None
        try:
            data = _download_bytes(u, timeout=90, tries=3)
            fd, tmp = tempfile.mkstemp(suffix=".png")
            os.close(fd)
            Path(tmp).write_bytes(data)
            hosted = _blob_put(tmp, f"ig-slides/{hashlib.md5(u.encode()).hexdigest()}.png")
            out.append(hosted or u)
            log(f"  slide {i}/{len(urls)} hosted: {hosted}")
        except Exception as exc:  # noqa: BLE001 — never fail a post over hosting
            log(f"  slide {i} materialize failed ({exc}); using render URL")
            out.append(u)
        finally:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)
    return out


# ------------------------------- graph api -------------------------------- #
def graph_base():
    return f"https://graph.facebook.com/{env('META_GRAPH_VERSION', 'v21.0')}"


def graph_post(path, params):
    import requests

    r = requests.post(f"{graph_base()}/{path}", data=params, timeout=HTTP_TIMEOUT)
    if not r.ok:
        raise RuntimeError(f"Graph POST {path} -> {r.status_code}: {r.text}")
    return r.json()


def graph_get(path, params):
    import requests

    r = requests.get(f"{graph_base()}/{path}", params=params, timeout=HTTP_TIMEOUT)
    if not r.ok:
        raise RuntimeError(f"Graph GET {path} -> {r.status_code}: {r.text}")
    return r.json()


def wait_finished(cid, token, tries=20, delay=3):
    for _ in range(tries):
        st = graph_get(cid, {"fields": "status_code", "access_token": token}).get("status_code")
        if st == "FINISHED":
            return
        if st == "ERROR":
            raise RuntimeError(f"container {cid} ERROR")
        time.sleep(delay)
    raise RuntimeError(f"container {cid} not FINISHED")


def container(ig, token, **params):
    params["access_token"] = token
    return graph_post(f"{ig}/media", params)["id"]


def publish_media(ig, token, cid):
    return graph_post(f"{ig}/media_publish", {"creation_id": cid, "access_token": token})["id"]


def publish_to_instagram(plan):
    ig = env("INSTAGRAM_BUSINESS_ID", required=True)
    token = env("META_ACCESS_TOKEN", required=True)
    children = []
    slides = ([plan["cover"], *plan["cards"]]
              + ([plan["recap"]] if plan.get("recap") else [])
              + [plan["cta"]])
    for url in slides:
        cid = container(ig, token, image_url=url, is_carousel_item="true")
        log(f"  item {cid}")
        children.append(cid)
    for cid in children:
        wait_finished(cid, token)
    parent = container(ig, token, media_type="CAROUSEL", caption=plan["caption"], children=",".join(children))
    wait_finished(parent, token)
    media_id = publish_media(ig, token, parent)
    log(f"✓ carousel published: {media_id}")
    if plan.get("hashtags"):
        graph_post(f"{media_id}/comments", {"message": " ".join(plan["hashtags"]), "access_token": token})
        log("✓ hashtags posted as first comment")
    scid = container(ig, token, image_url=plan["cover"], media_type="STORIES")
    wait_finished(scid, token)
    log(f"✓ story published: {publish_media(ig, token, scid)}")
    return media_id


# -------------------------------- summary --------------------------------- #
def write_summary(plan, verify):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    out = [f"## 📸 PokeEV IG preview — {plan['theme'].upper()} ({plan['date']})", ""]
    out.append("### Slides")
    labelled = [("Cover", plan["cover"]), *[(f"Card {i+1}", u) for i, u in enumerate(plan["cards"])]]
    if plan.get("recap"):
        labelled.append(("Recap", plan["recap"]))
    labelled.append(("CTA", plan["cta"]))
    for label, url in labelled:
        out.append(f"**{label}**\n\n![{label}]({url})\n")
    out.append("### Price cross-check")
    out.append("| Card | Snapshot $ | TCGplayer live $ | Cardmarket live € | Agreement |")
    out.append("|---|---|---|---|---|")
    for v in verify:
        agree = "✅" if v["agree"] else ("⚠️ " + v["note"] if v["agree"] is False else "ℹ️ " + v["note"])
        out.append(f"| {v['name']} | {fmt_usd(v['snap_usd'])} | {fmt_usd(v['live_usd'])} | "
                   f"{('€%.0f' % v['live_eur']) if v['live_eur'] else '—'} | {agree} |")
    out.append("\n### Caption\n\n```\n" + plan["caption"] + "\n```")
    out.append("\n### First comment (hashtags)\n\n```\n" + " ".join(plan["hashtags"]) + "\n```")
    Path(path).write_text("\n".join(out), encoding="utf-8")
    log("wrote GitHub step summary preview")


# --------------------------------- main ----------------------------------- #
def load_history(path: Path):
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return set()
    cutoff = date.today().toordinal() - DEDUP_DAYS
    recent = set()
    for e in items:
        try:
            if datetime.fromisoformat(e["date"]).date().toordinal() >= cutoff:
                recent.update(e.get("sets", []))
        except Exception:
            continue
    return recent


def prepare_items():
    """The expensive, once-per-run work: pick the sets, cross-check every price live,
    and AI-upscale each chase scan. Returns the context the slides are built from."""
    data_dir = Path(env("POKEEV_DATA_DIR", "data"))
    base = env("POKEEV_IMAGE_BASE_URL", "https://pokeev.com")
    n = max(1, min(10, int(env("TOP_N_CARDS", "5") or "5")))
    history_path = Path(env("HISTORY_PATH", "history.json"))

    snapshot = json.loads((data_dir / "snapshot" / "snapshot.json").read_text(encoding="utf-8"))
    if snapshot.get("demo"):
        sys.exit("[pokeev-bot] snapshot is demo data — refusing to plan")
    names = load_set_names(data_dir)

    theme_key = "grails" if date.today().toordinal() % 2 == 0 else "ev"
    tag = THEMES[theme_key]["tag"]
    exclude = load_history(history_path)
    items = select_sets(snapshot, names, THEMES[theme_key]["rank_by"], n, exclude)
    if not items:
        sys.exit("[pokeev-bot] nothing to post after dedup")

    verify = []
    for it in items:
        rec = verify_price(it)
        rec["name"] = it["chase_name"]
        it["verified_usd"] = rec["display_usd"] or it["chase_usd"]
        verify.append(rec)
        log(f"  verify {it['chase_name']}: snap {fmt_usd(rec['snap_usd'])} | live {fmt_usd(rec['live_usd'])} → {rec['note']}")

    for it in items:
        it["hd_image"] = upscale_card(it["chase_image"])
        log(f"  upscale {it['chase_name']}: {'HD ✓' if it['hd_image'] else 'native (no token/failed)'}")

    # Pull-odds chip — grails theme only (EV theme keeps the BOOSTER EV number).
    # Never fabricated: only when the real per-pack probability resolved.
    for it in items:
        p = it.get("prob_per_pack") if theme_key == "grails" else None
        odds = round(1 / p) if (p and 0 < p and 1 / p <= 9999) else None
        it["odds_str"] = f"1 IN {odds:,} PACKS" if (odds and odds >= 2) else None

    return {"base": base, "theme_key": theme_key, "tag": tag, "items": items, "verify": verify}


def make_brief(theme_key, tag, items, feedback=None):
    """Claude art-direction (with optional editor feedback for the revise loop);
    falls back to a safe preset if Claude is unavailable or errors."""
    api_key = env("ANTHROPIC_API_KEY")
    if api_key:
        try:
            return art_direct(api_key, theme_key, tag, items, feedback=feedback)
        except Exception as exc:  # noqa: BLE001
            log(f"Claude art-direction failed ({exc}); using fallback")
    return fallback_brief(theme_key, tag, items)


def assemble_plan(ctx, brief):
    """Build + re-host the slides for a creative brief, write plan.json, return the plan."""
    cover, cards, recap, cta = build_slides(ctx["base"], ctx["theme_key"], ctx["tag"], brief, ctx["items"])
    # Re-host each rendered slide as a static Blob PNG (fast CDN object) so Telegram
    # and Instagram never have to fetch the slow on-the-fly /api/ig render directly.
    hosted = materialize_slides([cover, *cards, recap, cta])
    cover, cards, recap, cta = hosted[0], hosted[1:-2], hosted[-2], hosted[-1]
    plan = {
        "date": datetime.now(timezone.utc).date().isoformat(),
        "theme": ctx["theme_key"],
        "cover": cover, "cards": cards, "recap": recap, "cta": cta,
        "caption": brief["caption"],
        "hashtags": brief["hashtags"],
        "sets": [it["id"] for it in ctx["items"]],
        "verify": ctx["verify"],
    }
    Path(env("PLAN_PATH", "plan.json")).write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
    log("CAPTION:\n" + plan["caption"])
    for u in [cover, *cards, recap, cta]:
        log("  slide: " + u)
    write_summary(plan, plan["verify"])
    return plan


def do_plan():
    ctx = prepare_items()
    brief = make_brief(ctx["theme_key"], ctx["tag"], ctx["items"])
    return assemble_plan(ctx, brief)


def record_history(plan):
    history_path = Path(env("HISTORY_PATH", "history.json"))
    try:
        hist = json.loads(history_path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        hist = []
    hist.append({"date": plan["date"], "theme": plan["theme"], "sets": plan["sets"]})
    history_path.write_text(json.dumps(hist[-200:], indent=2), encoding="utf-8")
    log("updated history.json")


# ------------------------------- telegram gate ---------------------------- #
def tg_api(token, method, payload):
    import requests

    r = requests.post(f"https://api.telegram.org/bot{token}/{method}", json=payload, timeout=HTTP_TIMEOUT)
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(f"telegram {method}: {data}")
    return data["result"]


def tg_send_preview(token, chat_id, plan):
    import json as _json

    import requests

    # Upload the actual image bytes (multipart attach://) instead of handing Telegram
    # the slide URLs — Telegram's ~5s media-fetch timeout can't render an HD slide in
    # time, but the bot can download it patiently and push the bytes.
    urls = ([plan["cover"], *plan["cards"]]
            + ([plan["recap"]] if plan.get("recap") else [])
            + [plan["cta"]])[:10]
    media, files = [], {}
    for i, u in enumerate(urls):
        name = f"p{i}"
        media.append({"type": "photo", "media": f"attach://{name}"})
        files[name] = (f"{name}.png", _download_bytes(u, timeout=90, tries=3), "image/png")
    r = requests.post(
        f"https://api.telegram.org/bot{token}/sendMediaGroup",
        data={"chat_id": chat_id, "media": _json.dumps(media)},
        files=files, timeout=120,
    )
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(f"telegram sendMediaGroup: {data}")
    table = "\n".join(
        f"• {v['name']}: snap {fmt_usd(v['snap_usd'])} / live {fmt_usd(v['live_usd'])} — {v['note']}"
        for v in plan.get("verify", [])
    )
    text = (f"🎴 PokeEV post — {plan['theme'].upper()} ({plan['date']})\n\n"
            f"PRICE CROSS-CHECK:\n{table}\n\nCAPTION:\n{plan['caption']}\n\nPublish this carousel + story?")
    kb = {"inline_keyboard": [[{"text": "✅ Approve", "callback_data": "approve"},
                               {"text": "❌ Reject", "callback_data": "reject"}]]}
    tg_api(token, "sendMessage", {"chat_id": chat_id, "text": text[:4000], "reply_markup": kb})


def tg_wait_decision(token, chat_id, timeout=1200):
    """Wait for the editor's call. Returns (action, feedback):
      ('approve', None)  → tapped ✅ Approve
      ('revise', notes)  → replied with text changes (or tapped ❌ then sent notes)
      ('cancel', None)   → replied 'cancel'/'skip'
      ('timeout', None)  → no answer in time
    Tapping ❌ Reject just prompts for notes and keeps listening."""
    deadline = time.time() + timeout
    seen = tg_api(token, "getUpdates", {"timeout": 0})  # skip backlog
    offset = (seen[-1]["update_id"] + 1) if seen else 0
    while time.time() < deadline:
        updates = tg_api(token, "getUpdates", {"offset": offset, "timeout": 25})
        for u in updates:
            offset = u["update_id"] + 1
            cq = u.get("callback_query")
            if cq and str(cq["message"]["chat"]["id"]) == str(chat_id):
                tg_api(token, "answerCallbackQuery", {"callback_query_id": cq["id"], "text": "Got it ✓"})
                if cq.get("data") == "approve":
                    tg_api(token, "sendMessage", {"chat_id": chat_id, "text": "📤 Publishing…"})
                    return "approve", None
                tg_api(token, "sendMessage", {"chat_id": chat_id,
                       "text": "✏️ What should change? Reply with your notes and I'll rework it — "
                               "or send 'cancel' to skip today."})
                continue  # keep listening for the notes
            msg = u.get("message")
            if msg and str(msg.get("chat", {}).get("id")) == str(chat_id):
                txt = (msg.get("text") or "").strip()
                if not txt:
                    continue
                if txt.lower() in ("cancel", "/cancel", "stop", "skip", "no"):
                    tg_api(token, "sendMessage", {"chat_id": chat_id, "text": "🚫 Skipped — nothing posted today."})
                    return "cancel", None
                if txt.startswith("/"):
                    continue  # ignore other slash-commands (e.g. /start)
                tg_api(token, "sendMessage", {"chat_id": chat_id, "text": "🔄 Reworking with your notes…"})
                return "revise", txt
    tg_api(token, "sendMessage", {"chat_id": chat_id, "text": "⌛️ No answer — not posting today."})
    return "timeout", None


# --------------------------------- main ----------------------------------- #
def do_run():
    """Plan → Telegram gate with a revise loop → publish. The heavy work (sets,
    price cross-check, upscale) runs once; only the creative brief + slides are
    regenerated when the editor asks for changes."""
    ctx = prepare_items()
    tg_token = env("TELEGRAM_BOT_TOKEN")
    tg_chat = env("TELEGRAM_CHAT_ID")
    brief = make_brief(ctx["theme_key"], ctx["tag"], ctx["items"])
    plan = assemble_plan(ctx, brief)

    if not (tg_token and tg_chat):
        log("Telegram gate not configured (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID) — preview only, NOT posting.")
        return
    if os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes"):
        log("DRY_RUN — sending Telegram preview but skipping publish.")
        tg_send_preview(tg_token, tg_chat, plan)
        return

    timeout = int(env("APPROVAL_TIMEOUT", "1200") or "1200")
    max_revisions = int(env("MAX_REVISIONS", "6") or "6")
    for _ in range(max_revisions + 1):
        tg_send_preview(tg_token, tg_chat, plan)
        log("Telegram preview sent — waiting for approve / reject / feedback…")
        action, feedback = tg_wait_decision(tg_token, tg_chat, timeout=timeout)
        if action == "approve":
            publish_to_instagram(plan)
            record_history(plan)
            return
        if action in ("cancel", "timeout"):
            log(f"{action} — not posting.")
            return
        log(f"Revise requested: {feedback}")
        brief = make_brief(ctx["theme_key"], ctx["tag"], ctx["items"], feedback=feedback)
        plan = assemble_plan(ctx, brief)
    tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": "🚫 Too many revisions — stopping for today."})
    log("Max revisions reached — not posting.")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    if cmd == "plan":
        do_plan()
    elif cmd == "publish":  # manual fallback: post the last plan.json
        publish_to_instagram(json.loads(Path(env("PLAN_PATH", "plan.json")).read_text(encoding="utf-8")))
    else:
        do_run()


if __name__ == "__main__":
    main()
