#!/usr/bin/env python3
"""
PokeEV Instagram bot — Claude art-directed, price-verified premium carousels.

Two phases around a manual GitHub approval gate:

  python main.py plan      Rotate a theme, select sets (deduped vs recent posts),
                           VERIFY every displayed price against live pokemontcg.io
                           sources, ask Claude to art-direct the cover copy +
                           caption, build the /api/ig slide URLs, and write
                           plan.json + a rich GitHub step-summary preview.

  python main.py publish    Read plan.json and publish the carousel (no story) via
                           the Instagram API, then append the
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

# The 3-theme rotation: connected art (T1) → rip-or-keep (T2) → grail spotlight (T3).
# do_run picks the NEXT theme after whatever ran last (see pick_rotation_theme).
ROTATION = ["connected", "ripkeep", "grails"]
PORTRAIT_RATIO = 1.394  # card height / width — used to size grail-zoom crops


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
    # The image URL may be the _hires variant (e.g. ecard3-146_hires.png); the card-id
    # endpoint wants the bare id, so strip the suffix or the lookup 404s (was silently
    # killing the live price cross-check for grail cards).
    card_id = f"{m.group(1)}-{m.group(2)}".replace("_hires", "")
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


def _blob_exists_url(pathname):
    """Return the public URL if `pathname` is ALREADY hosted on Blob, else None — lets
    upscale_card reuse a cached upscale instead of re-spending a Real-ESRGAN (Replicate)
    credit on every rebuild/revise. Graceful: any error → None (proceed to upscale)."""
    import subprocess

    here = Path(__file__).parent
    try:
        out = subprocess.check_output(
            ["node", str(here / "blob_upload.mjs"), "--exists", pathname],
            text=True, timeout=60, cwd=str(here),
        ).strip()
        return out or None
    except Exception:  # noqa: BLE001 — never block a build on the cache check
        return None


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


def _replicate_upscale(src_url, scale=4):
    """SOTA super-resolution via Replicate Real-ESRGAN — sharp, DENOISED edges (fixes the soft/
    pixelated card borders LapSRN/EDSR cannot, proven far better on the δ-Charizard borders).
    Returns the upscaled image URL (replicate.delivery — already allowlisted in /api/ig), or None
    without REPLICATE_API_TOKEN / on ANY failure, so the caller falls back to LapSRN. Uses the
    model-predictions endpoint + `Prefer: wait` (no version pin to maintain; short poll backup)."""
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not (token and src_url):
        return None
    try:
        import time

        import requests

        hdr = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        r = requests.post(
            "https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions",
            headers={**hdr, "Prefer": "wait"},
            json={"input": {"image": src_url, "scale": scale, "face_enhance": False}},
            timeout=180,
        )
        r.raise_for_status()
        d = r.json()
        out = d.get("output")
        get_url = (d.get("urls") or {}).get("get")
        tries = 0
        while not out and d.get("status") not in ("failed", "canceled") and get_url and tries < 45:
            time.sleep(2)
            tries += 1
            d = requests.get(get_url, headers=hdr, timeout=30).json()
            out = d.get("output")
        if isinstance(out, list):
            out = out[0] if out else None
        if out:
            log("  Real-ESRGAN (Replicate) ✓")
        return out or None
    except Exception as exc:  # noqa: BLE001
        log(f"  Replicate upscale failed ({exc}); falling back to LapSRN")
        return None


def upscale_card(image_url, max_w=4096):
    """AI super-resolution → hosted on Vercel Blob, ALPHA-PRESERVING. Vintage/solid-border cards
    (no alpha) use Replicate Real-ESRGAN (SOTA for illustration, crisp DENOISED borders) when the
    token is set; modern texture full-arts (transparent rounded corners = alpha) use the gentle
    OpenCV LapSRN x8 instead — ESRGAN hallucinates their holofoil. The card's transparent corners
    are re-attached after upscaling (no more black corners). Result capped to `max_w` wide (4096 for
    the full-bleed grail zoom; ~1500 for carousel cards — light enough that multi-image slides don't
    500 Satori). Returns the HD url, or None (graceful) without BLOB_READ_WRITE_TOKEN / on failure."""
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
        # CREDIT-SAVER: the upscaled asset's Blob path is deterministic (src + max_w + method). If
        # it's ALREADY hosted (from any earlier build/revise — even a previous day or post), reuse
        # it and SKIP Replicate entirely. So Real-ESRGAN runs at most ONCE per unique card, not on
        # every rebuild. (Daily cost ≈ only the genuinely new cards that day.)
        # Decode the SOURCE first, KEEPING its alpha channel. Modern TCGdex full-arts are die-cut
        # PNGs with transparent rounded corners; the old IMREAD_COLOR dropped that alpha and filled
        # the corners BLACK. We re-attach it after upscaling so the corners stay transparent.
        # A browser UA + Referer — tcgplayer-cdn (booster product images) 403s a bare requests UA and
        # hotlink-protects without a tcgplayer.com Referer.
        _UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
               "Referer": "https://www.tcgplayer.com/"}
        src_arr = cv2.imdecode(np.frombuffer(requests.get(src, timeout=60, headers=_UA).content, np.uint8), cv2.IMREAD_UNCHANGED)
        if src_arr is None:
            return None
        alpha = src_arr[:, :, 3] if (src_arr.ndim == 3 and src_arr.shape[2] == 4) else None
        # METHOD picked by card TYPE, keyed off alpha: Real-ESRGAN is sharpest on ordinary/vintage
        # illustration, but HALLUCINATES the holofoil pattern of modern texture full-arts / special-
        # illustration cards — the "texture ultra bizarre" the owner flagged. Those are exactly the
        # alpha (transparent-corner) cards, so route them to the gentle, FAITHFUL LapSRN x8; vintage
        # cards (no alpha, solid borders) keep ESRGAN, which genuinely sharpens them and never mangled.
        use_esrgan = bool(os.environ.get("REPLICATE_API_TOKEN")) and alpha is None
        method = "esrgan" if use_esrgan else "lapsrn"
        # `@a2` = alpha-safe revision: bumps the key so every pre-fix BLACK-corner upscale is ignored.
        cache_path = f"ig-cards/{hashlib.md5(f'{src}@{max_w}@{method}@a2'.encode()).hexdigest()}.png"
        cached = _blob_exists_url(cache_path)
        if cached:
            log("  upscale: Blob cache hit — reused (no Replicate spend)")
            return cached
        rep = _replicate_upscale(src) if use_esrgan else None  # SOTA path; gentle cards skip it
        if use_esrgan and not rep:  # Replicate failed → fell back to LapSRN; keep the cache key honest
            method = "lapsrn"
            cache_path = f"ig-cards/{hashlib.md5(f'{src}@{max_w}@{method}@a2'.encode()).hexdigest()}.png"
        if rep:
            arr = cv2.imdecode(np.frombuffer(requests.get(rep, timeout=60, headers=_UA).content, np.uint8), cv2.IMREAD_COLOR)
            if arr is None:
                return None
        else:
            # Free OpenCV LapSRN x8 supersample — gentle, faithful, no holo hallucination.
            bgr = src_arr[:, :, :3] if src_arr.ndim == 3 else cv2.cvtColor(src_arr, cv2.COLOR_GRAY2BGR)
            sr = cv2.dnn_superres.DnnSuperResImpl_create()
            sr.readModel(str(here / "models" / "LapSRN_x8.pb"))
            sr.setModel("lapsrn", 8)
            arr = sr.upsample(bgr)
        h, w = arr.shape[:2]
        if w > max_w:
            arr = cv2.resize(arr, (max_w, int(round(h * max_w / w))), interpolation=cv2.INTER_AREA)
            h, w = arr.shape[:2]
        if alpha is not None:  # restore the rounded-corner transparency at the upscaled size
            arr = cv2.cvtColor(arr, cv2.COLOR_BGR2BGRA)
            arr[:, :, 3] = cv2.resize(alpha, (w, h), interpolation=cv2.INTER_LINEAR)
        fd, tmp = tempfile.mkstemp(suffix=".png")
        os.close(fd)
        cv2.imwrite(tmp, arr)
        return _blob_put(tmp, cache_path)
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


def _png(url):
    """Satori (the /api/ig OG renderer) CANNOT draw WebP, and TCGdex serves card art +
    set logos as .webp by default — so a modern set's chase cards and logo rendered
    BLANK on T2/T3 slides. TCGdex serves the identical asset as .png, so swap the
    extension. pokemontcg.io scans and Blob-hosted upscales are already PNG (untouched)."""
    if url and "assets.tcgdex.net" in url and url.endswith(".webp"):
        return url[:-len(".webp")] + ".png"
    return url


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
    # Instagram API with Instagram Login (graph.instagram.com) — our @pokeev.tcg
    # access token is an IG-login token (starts with IGAA), not a FB Page token.
    return f"https://graph.instagram.com/{env('META_GRAPH_VERSION', 'v21.0')}"


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


def token_ok(token):
    """Cheap probe: is the IG access token currently valid? Used to WARN the editor at
    preview time (morning) that tonight's 20:00 publish would fail unless it's refreshed,
    instead of surfacing a dead token only at publish time."""
    if not token:
        return False
    try:
        graph_get("me", {"fields": "user_id", "access_token": token})
        return True
    except Exception:  # noqa: BLE001
        return False


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


def plan_slides(plan):
    """Ordered carousel URLs. Prefers the new flat `slides` list (slides[0] = cover/
    story image); falls back to the legacy cover/cards/recap/cta keys so the old
    Vault-Countdown plans still publish unchanged."""
    if plan.get("slides"):
        return list(plan["slides"])
    return ([plan["cover"], *plan.get("cards", [])]
            + ([plan["recap"]] if plan.get("recap") else [])
            + [plan["cta"]])


def ig_user_id(token):
    """The IG-scoped user id for the publishing endpoints, read from the token
    (graph.instagram.com/me) so it always matches the access token in use."""
    return str(graph_get("me", {"fields": "user_id", "access_token": token})["user_id"])


def publish_to_instagram(plan):
    # A Reel post (the editor tapped 🎬) publishes as a single video, not a carousel.
    if plan.get("format") == "reel":
        return publish_reel(plan)
    token = env("META_ACCESS_TOKEN", required=True)
    ig = env("INSTAGRAM_BUSINESS_ID") or ig_user_id(token)
    children = []
    slides = plan_slides(plan)[:10]
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
    # Hashtags are folded into the caption (compose_caption) so they publish atomically
    # with the carousel — no fragile second /comments call that the Instagram-Login
    # token may not be scoped for.
    #
    # NO auto-Story. The API can only push a *static* image as a story — Instagram blocks
    # links, post-share stickers and every interactive element for all third-party/API
    # publishing — so the only auto-story possible is a flat reframe of a slide, which
    # looks bad. The proper "Share -> Add to story" with a tappable post sticker is
    # app-only; the editor does it in one tap from the permalink in the confirmation.
    notify_published(plan, media_id, token)
    return media_id


def notify_published(plan, media_id, token):
    """Confirm on Telegram that the post is LIVE, with a tap-through permalink + a nudge
    to add it to the story in-app. Best-effort: a failed notification never affects the
    post."""
    tg_token = env("TELEGRAM_BOT_TOKEN")
    tg_chat = env("TELEGRAM_CHAT_ID")
    if not (tg_token and tg_chat):
        return
    link = ""
    try:  # permalink is a valid field on your own IG media (graph.instagram.com)
        permalink = graph_get(str(media_id), {"fields": "permalink", "access_token": token}).get("permalink")
        if permalink:
            link = "\n" + permalink
    except Exception as exc:  # noqa: BLE001
        log(f"  permalink lookup failed ({exc}); confirming without a link")
    ntags = len(plan.get("hashtags") or [])
    kind = "🎬 Reel" if plan.get("format") == "reel" else f"{len(plan_slides(plan))} slides"
    text = (f"✅ Published to @pokeev.tcg — {plan['theme'].upper()} ({plan['date']})\n"
            f"{kind}, {ntags} hashtags.{link}\n\n"
            "🔁 To add it to your story with a tappable post sticker, open the post and "
            "tap Share -> Add to story (app-only; the API can't do this).")
    try:
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": text})
    except Exception as exc:  # noqa: BLE001
        log(f"  publish-confirm message failed ({exc})")


# -------------------------------- reels ----------------------------------- #
# A Reel is the SAME verified facts + AI copy as the carousel, rendered as a bespoke vertical
# (9:16) motion piece with Remotion (instagram-bot/reel/). The editor opts in per post by
# tapping 🎬 Reels on the carousel preview; the bot renders the matching theme composition,
# hosts the MP4 on Blob, and publishes it as media_type=REELS INSTEAD of the carousel.
REEL_DIR = Path(__file__).parent / "reel"
_REEL_COMP = {"connected": "Connected", "ripkeep": "RipKeep", "grails": "Grails"}
_REEL_COVER_FRAME = {"connected": 58, "ripkeep": 50, "grails": 60}


def reel_props(theme, facts, brief):
    """Build the render-ready props the Remotion comps consume (props.ts). Prices are
    PRE-FORMATTED here so a Reel shows the exact same verified numbers as its carousel."""
    brief = brief or {}
    if theme == "connected":
        names = [it["name"] for it in facts["items"]]
        return {
            "theme": "connected",
            "setLabel": facts["setLabel"],
            "setLogo": _png(facts.get("setLogo")),
            "artist": facts.get("artist") or "",
            "eyebrow": _fix_namelist_commas(brief.get("eyebrow", ""), names),
            "headline": _no_dash(brief.get("headline", "They drew one scene.")),
            "revealTitle": _fix_namelist_commas(brief.get("revealTitle", facts["setLabel"]), names),
            "total": fmt_usd(facts["total"]),
            "cards": [
                {"name": it["name"], "price": fmt_usd(it["usd"]),
                 "image": _png(it.get("reel_image") or it.get("hd_image") or it["image"])}
                for it in facts["items"]
            ],
        }
    if theme == "ripkeep":
        rip = bool(facts["verdict_rip"])
        return {
            "theme": "ripkeep",
            "setName": facts["set_name"],
            "setLogo": _png(facts.get("logo")),
            "sealed": fmt_usd(facts["sealed"]),
            "openEv": fmt_usd(facts["open_ev"]),
            "gap": fmt_usd(facts["gap"]),
            "verdictRip": rip,
            "verdictWord": brief.get("verdictWord", "RIP IT" if rip else "KEEP IT|SEALED"),
            "reason": brief.get("reason", ""),
            "booster": _png(facts["reel_booster"]) if facts.get("reel_booster") else None,
            "chase": [
                {"name": c["name"], "price": fmt_usd(c["usd"]),
                 "image": _png(c.get("reel_image") or c.get("hd_image") or c["image"]), "rarity": c.get("rarity")}
                for c in facts["chase"]
            ],
        }
    if theme == "grails":
        return {
            "theme": "grails",
            "setName": facts["set_name"],
            "setLogo": _png(facts.get("logo")),
            "name": facts["name"],
            "price": fmt_usd(facts["usd"]),
            "artist": facts.get("artist"),
            "rarity": facts.get("rarity"),
            "oddsLine": (brief.get("oddsBody")
                         or (f"Pulled roughly|1 in {facts['odds_n']} packs." if facts.get("odds_n")
                             else "It sits in the rarest tier of the set.")),
            "shockHeadline": brief.get("shockHeadline", "Worth more than|most people guess"),
            "cardKicker": brief.get("cardKicker", "The card"),
            "cardHeadline": brief.get("cardHeadline", facts["name"]),
            "cardBody": brief.get("cardBody", ""),
            "craftKicker": brief.get("craftKicker", "The artist"),
            "craftHeadline": brief.get("craftHeadline", ""),
            "craftBody": brief.get("craftBody", ""),
            "sceneKicker": brief.get("sceneKicker", "The scene"),
            "sceneHeadline": brief.get("sceneHeadline", ""),
            "sceneBody": brief.get("sceneBody", ""),
            "image": _png(facts.get("reel_image") or facts.get("hd_image") or facts["image"]),
            "booster": _png(facts.get("reel_booster") or facts.get("booster_hd") or facts.get("booster")),
        }
    raise RuntimeError(f"reel_props: unknown theme {theme}")


def _run_remotion(args, timeout):
    import subprocess

    return subprocess.run(["npx", "remotion", *args], cwd=str(REEL_DIR),
                          capture_output=True, text=True, timeout=timeout)


def _ensure_reel_deps():
    """Make the Remotion toolchain ready ON DEMAND (only when a Reel is actually rendered), so
    normal cron ticks stay fast and a cold dispatched runner can still render: install node deps
    if missing, install Chrome's shared libs on Linux CI (best-effort), and fetch the headless
    browser. Locally (deps already present) this is a near no-op."""
    import subprocess

    nm = REEL_DIR / "node_modules"
    if not (nm / "remotion").exists():
        log("reel: installing node deps…")
        cmd = ["npm", "ci"] if (REEL_DIR / "package-lock.json").exists() else ["npm", "install"]
        r = subprocess.run(cmd, cwd=str(REEL_DIR), capture_output=True, text=True, timeout=900)
        if r.returncode != 0:  # ci can fail on a drifted lockfile — fall back to install
            r = subprocess.run(["npm", "install"], cwd=str(REEL_DIR), capture_output=True, text=True, timeout=900)
            if r.returncode != 0:
                raise RuntimeError(f"reel npm install failed: {(r.stderr or '')[:300]}")
    if sys.platform.startswith("linux"):  # CI: ensure Chrome's shared libs (tolerant — usually present)
        try:
            subprocess.run(
                ["bash", "-lc",
                 "sudo apt-get update -y >/dev/null 2>&1 && sudo apt-get install -y "
                 "libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 "
                 "libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 >/dev/null 2>&1"],
                capture_output=True, text=True, timeout=300)
        except Exception:  # noqa: BLE001 — libs are usually preinstalled on ubuntu-latest
            pass
    try:  # download Remotion's headless browser if not already cached (no-op if present)
        _run_remotion(["browser", "ensure"], timeout=900)
    except Exception as exc:  # noqa: BLE001 — render will surface a clearer error if it's truly missing
        log(f"  reel: browser ensure warning ({exc})")


def render_reel(theme, props):
    """Render the theme's 9:16 composition to an MP4 (and a cover still) via Remotion.
    Returns (mp4_path, cover_path|None). Raises if the MP4 didn't render."""
    _ensure_reel_deps()
    comp = _REEL_COMP[theme]
    out = REEL_DIR / "out"
    out.mkdir(parents=True, exist_ok=True)
    pf = out / f"{theme}-props.json"
    pf.write_text(json.dumps({"data": props}, ensure_ascii=False), encoding="utf-8")
    mp4 = out / f"{theme}.mp4"
    if mp4.exists():
        mp4.unlink()
    # MAX quality encode: --crf 16 is near-visually-lossless H.264 (default is 18) so the holo/3D
    # detail survives IG's re-compression; --jpeg-quality 100 keeps the intermediate frames pristine.
    r = _run_remotion(["render", "src/index.ts", comp, str(mp4),
                       f"--props={pf}", "--log=error", "--concurrency=2",
                       "--crf=16", "--jpeg-quality=100"], timeout=1800)
    if r.returncode != 0 or not mp4.exists():
        raise RuntimeError(f"remotion render failed: {((r.stderr or '') + (r.stdout or ''))[:500]}")
    cover = out / f"{theme}-cover.png"
    frame = _REEL_COVER_FRAME.get(theme, 40)
    rc = _run_remotion(["still", "src/index.ts", comp, str(cover),
                        f"--frame={frame}", f"--props={pf}", "--log=error"], timeout=300)
    return mp4, (cover if rc.returncode == 0 and cover.exists() else None)


def _upscale_reel_cards(theme, facts):
    """MAX-quality (4096px) upscale of the cards a Reel features BIG, so they stay razor-crisp
    filling the frame. Cached on Blob (deterministic pathname) so repeat builds don't re-spend a
    Replicate credit. The carousel keeps its lighter 1500px render (a Satori OOM guard); only the
    reel — which Remotion renders, not Satori — goes full-res."""
    try:
        if theme == "connected":
            for it in facts.get("items", []):
                it["reel_image"] = upscale_card(it["image"], max_w=4096) or it.get("hd_image")
        elif theme == "ripkeep":
            # The ripkeep chase are modern SPECIAL-ILLUSTRATION / texture full-arts (Victini & Reshiram
            # in White Flare, etc.). AI upscalers render their holo texture "not normal" — ESRGAN
            # hallucinates the foil, LapSRN smears it + can halo the re-composited rounded corners. The
            # original TCGdex scan is already crisp at the reel's display size (≤660px), so use it AS-IS
            # so these cards look TRUE. (Same call as the carousel.)
            for c in facts.get("chase", []):
                c["reel_image"] = None
            log("  ripkeep reel: original chase scans (no upscale — special-illustration cards render true)")
            if facts.get("booster"):  # the booster IS a product photo (no holo texture) → MAX upscale.
                # Blob URL or None — NEVER fall back to the raw product URL: Remotion's headless browser
                # can't load tcgplayer-cdn (it 403s / cancels), which CRASHES the whole reel render.
                facts["reel_booster"] = upscale_card(facts["booster"], max_w=4096)
                log(f"  ripkeep reel: booster {'upscaled to 4096px' if facts.get('reel_booster') else 'upscale failed — face-off bg omitted'}")
            return
        elif theme == "grails":
            facts["reel_image"] = upscale_card(facts["image"], max_w=4096) or facts.get("hd_image")
            if facts.get("booster"):
                facts["reel_booster"] = upscale_card(facts["booster"], max_w=4096) or facts.get("booster_hd")
        log(f"  reel cards upscaled to 4096px for {theme}")
    except Exception as exc:  # noqa: BLE001 — never fail a reel over an upscale hiccup
        log(f"  reel upscale warning ({exc})")


def build_reel(plan, ctx):
    """Render today's post as a Reel and return a reel-plan (carousel plan + format/video_url/
    cover_url). Keeps the carousel slides so a switch back to 🖼 carousel needs no rebuild."""
    theme = plan["theme"]
    _upscale_reel_cards(theme, ctx["facts"])  # full-res card art for the reel (cards dominate)
    props = reel_props(theme, ctx["facts"], plan.get("brief"))
    log(f"rendering {theme} reel…")
    mp4, cover = render_reel(theme, props)
    video_url = _blob_put(str(mp4), f"ig-reels/{plan['date']}-{theme}.mp4")
    if not video_url:
        raise RuntimeError("reel hosted upload returned no URL")
    cover_url = _blob_put(str(cover), f"ig-reels/{plan['date']}-{theme}-cover.png") if cover else None
    log(f"  reel hosted: {video_url}")
    reel_plan = {**plan, "format": "reel", "video_url": video_url,
                 "cover_url": cover_url, "mp4_local": str(mp4)}
    Path(env("PLAN_PATH", "plan.json")).write_text(
        json.dumps(reel_plan, indent=2, ensure_ascii=False), encoding="utf-8")
    return reel_plan


def carousel_plan_of(plan):
    """Strip the reel-only fields so a plan previews/publishes as its original carousel."""
    return {k: v for k, v in plan.items() if k not in ("format", "video_url", "cover_url", "mp4_local")}


def publish_reel(plan):
    """Publish the rendered MP4 as an Instagram Reel (media_type=REELS). Video containers take
    longer to FINISH than image ones, so the poll budget is larger."""
    token = env("META_ACCESS_TOKEN", required=True)
    ig = env("INSTAGRAM_BUSINESS_ID") or ig_user_id(token)
    if not plan.get("video_url"):
        raise RuntimeError("publish_reel: plan has no video_url")
    params = {"media_type": "REELS", "video_url": plan["video_url"],
              "caption": plan["caption"], "share_to_feed": "true"}
    if plan.get("cover_url"):
        params["cover_url"] = plan["cover_url"]
    cid = container(ig, token, **params)
    log(f"  reel container {cid} — waiting for video processing…")
    wait_finished(cid, token, tries=60, delay=5)  # ~5 min budget; video encode is slow
    media_id = publish_media(ig, token, cid)
    log(f"✓ reel published: {media_id}")
    notify_published(plan, media_id, token)
    return media_id


# -------------------------------- summary --------------------------------- #
def write_summary(plan, verify):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    out = [f"## 📸 PokeEV IG preview — {plan['theme'].upper()} ({plan['date']})", ""]
    out.append("### Slides")
    slides = plan_slides(plan)
    if plan.get("slides"):
        labelled = [(f"Slide {i+1}", u) for i, u in enumerate(slides)]
    else:
        labelled = [("Cover", plan["cover"]), *[(f"Card {i+1}", u) for i, u in enumerate(plan.get("cards", []))]]
        if plan.get("recap"):
            labelled.append(("Recap", plan["recap"]))
        labelled.append(("CTA", plan["cta"]))
    for label, url in labelled:
        out.append(f"**{label}**\n\n![{label}]({url})\n")
    if not verify:
        out.append("\n### Caption\n\n```\n" + plan["caption"] + "\n```")
        out.append("\n### Hashtags (folded into the caption above)\n\n```\n" + " ".join(plan["hashtags"]) + "\n```")
        Path(path).write_text("\n".join(out), encoding="utf-8")
        log("wrote GitHub step summary preview")
        return
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
def _history_entries(path: Path):
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return []
    return items if isinstance(items, list) else []


def load_history(path: Path):
    """Legacy set-level dedup (Vault Countdown): set ids posted within DEDUP_DAYS."""
    cutoff = date.today().toordinal() - DEDUP_DAYS
    recent = set()
    for e in _history_entries(path):
        try:
            if datetime.fromisoformat(e["date"]).date().toordinal() >= cutoff:
                recent.update(e.get("sets", []))
        except Exception:
            continue
    return recent


def recent_keys(path: Path, theme: str, days=DEDUP_DAYS):
    """Per-theme dedup keys (T1 group id · T2 set id · T3 card id) used within the
    last `days`. Reads the new `keys`+`theme` fields and gracefully ignores legacy
    rows that only have `sets`."""
    cutoff = date.today().toordinal() - days
    used = set()
    for e in _history_entries(path):
        try:
            if datetime.fromisoformat(e["date"]).date().toordinal() < cutoff:
                continue
        except Exception:
            continue
        if e.get("theme") == theme:
            used.update(e.get("keys", []))
    return used


def last_theme(path: Path):
    """The most recently posted ROTATION theme, or None if history has none."""
    for e in reversed(_history_entries(path)):
        if e.get("theme") in ROTATION:
            return e["theme"]
    return None


def pick_rotation_theme(path: Path, override=None):
    """Advance the T1→T2→T3 wheel from whatever ran last. An explicit override
    (env POKEEV_THEME / CLI arg) wins when it names a valid rotation theme."""
    if override in ROTATION:
        return override
    prev = last_theme(path)
    if prev not in ROTATION:
        return ROTATION[0]
    return ROTATION[(ROTATION.index(prev) + 1) % len(ROTATION)]


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


# =========================================================================== #
#  3-THEME ROTATION PIPELINE  (connected → ripkeep → grails)
#  Each theme mirrors the prepare→brief→assemble split with three pure-ish
#  functions: select_<t> (pick data, no network), artdirect_<t> (Claude copy,
#  with a deterministic fallback_<t>), slides_<t> (build the /api/ig URLs).
# =========================================================================== #

# ------------------------------ shared data ------------------------------- #
def load_snapshot(data_dir: Path):
    snap = json.loads((data_dir / "snapshot" / "snapshot.json").read_text(encoding="utf-8"))
    if snap.get("demo"):
        sys.exit("[pokeev-bot] snapshot is demo data — refusing to plan")
    return snap


def set_display_name(names, sid, fallback):
    meta = names.get(sid) or {}
    return meta.get("en") or fallback or sid


def _strip_json_fence(raw):
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    return raw


def claude_json(api_key, prompt, max_tokens=1100, system=None, vision_image=None):
    """One-shot Claude call returning a parsed JSON object. `vision_image` is a
    (media_type, base64) tuple to attach an image block. Raises on bad JSON."""
    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    content = []
    if vision_image is not None:
        media_type, b64 = vision_image
        content.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}})
    content.append({"type": "text", "text": prompt})
    kwargs = {"model": CLAUDE_MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": content}]}
    if system:
        kwargs["system"] = system
    msg = client.messages.create(**kwargs)
    raw = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    return json.loads(_strip_json_fence(raw))


def claude_vision_review(api_key, prompt, image_bytes_list, system=None, max_tokens=900):
    """Send several rendered slide PNGs + a prompt to Claude and return parsed JSON.
    Used by the pre-preview VISUAL self-review. Raises on bad JSON (callers guard)."""
    import base64

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    content = []
    for i, raw in enumerate(image_bytes_list, 1):
        content.append({"type": "text", "text": f"Slide {i}:"})
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/png",
                                                    "data": base64.b64encode(raw).decode("ascii")}})
    content.append({"type": "text", "text": prompt})
    kwargs = {"model": CLAUDE_MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": content}]}
    if system:
        kwargs["system"] = system
    msg = client.messages.create(**kwargs)
    raw = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    return json.loads(_strip_json_fence(raw))


def _clean_hashtags(tags, lo=8, hi=10):
    """Normalize, de-dup (case-insensitive), strip em-dashes, cap at `hi` — MAX 10 (owner wants
    only the most impactful tags, kept at the END of the caption by compose_caption). The caller's
    POST-SPECIFIC tags lead (most relevant + rankable); a tight, high-impact core pads ONLY if the
    caller under-delivers, so a post never ships with a near-empty tag block."""
    core = [
        # niche / rankable where this account actually competes …
        "#pokemoninvesting", "#sealedpokemon", "#pokemoncollector", "#pokemonpulls",
        "#pokemoncommunity", "#tcgcollector", "#pokemoncardgame",
        # … then a little high-volume reach
        "#pokemontcg", "#pokemoncards", "#tcg", "#pokemon",
    ]
    seen, out = set(), []
    for t in list(tags or []) + core:
        t = str(t).strip().replace("—", "").replace("–", "")
        if not t:
            continue
        t = "#" + re.sub(r"[^0-9a-zA-Z]", "", t.lstrip("#"))
        if len(t) <= 1:
            continue
        k = t.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(t)
        if len(out) >= hi:
            break
    return out


_VOICE = (
    "You are the art director + copywriter for @pokeev.tcg, a PREMIUM Pokémon TCG "
    "Expected-Value tool (pokeev.com). Audience: serious US collectors & investors. "
    "VOICE GUARDRAIL — collectors read hype as amateur. NEVER use: insane, brutal, "
    "unhinged, wild, crazy, mind-blowing, 'brace'. Confident insider, never cringe. "
    "Few emojis. NEVER use em-dashes or en-dashes anywhere (use periods or commas). "
    "The verified numbers carry the weight; restraint is the brand. English only."
)


def _style_notes_path():
    return Path(env("STYLE_NOTES_PATH", "style-notes.md"))


def load_style_notes():
    """The owner's accumulated, locked creative corrections (one per line). Injected
    into every art-direction prompt so the bot keeps applying past feedback — it
    improves post-by-post toward 'approve on the first try'."""
    try:
        return _style_notes_path().read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def voice():
    """_VOICE + the owner's standing preferences (the learned-feedback memory)."""
    notes = load_style_notes()
    if not notes:
        return _VOICE
    return (
        _VOICE
        + "\n\nSTANDING OWNER PREFERENCES — these are corrections from past posts; "
        + "apply EVERY one without exception:\n"
        + notes
    )


# Replies that are NOT creative instructions — questions, status checks, acks. The bot
# must never "learn" these as standing copy rules (it once saved "Did you publish?").
_NOT_A_NOTE = {
    "did you publish", "did it post", "did it work", "is it posted", "is it live",
    "any news", "whats up", "what's up", "hello", "hi", "hey", "yo",
    "published", "posted", "done", "thanks", "thank you", "merci", "nice", "good", "great",
    "cool", "perfect", "parfait", "ok thanks", "and", "well", "so", "test", "ping",
}


def _is_creative_note(text):
    """True ONLY for replies that read like an editing instruction — not a question, a
    status-check or chatter. This is the guard that keeps the learning loop clean and
    stops casual messages from being misread as a 'revise'."""
    low = " ".join((text or "").split()).lower()
    if len(low) < 6:
        return False
    if low.rstrip().endswith("?"):       # a question, not a directive ("did you publish?")
        return False
    if low.rstrip("?!. ") in _NOT_A_NOTE:
        return False
    return True


def append_style_note(feedback):
    """Persist an owner revise note as a STANDING preference so every FUTURE post
    applies it too — this is how the bot learns from feedback. De-duped; best-effort.
    Ignores non-instructions (questions/chatter) so the memory never gets polluted."""
    note = " ".join((feedback or "").split())
    if not _is_creative_note(note):
        log("  reply is not a creative instruction — not learning it")
        return
    existing = load_style_notes()
    if note.lower() in existing.lower():
        return
    try:
        with _style_notes_path().open("a", encoding="utf-8") as f:
            f.write(f"- {note}\n")
        log("learned: appended owner feedback to style-notes.md")
    except OSError as exc:  # noqa: BLE001
        log(f"  could not persist style note ({exc})")


_CAPTION_RULES = (
    "CAPTION — ENGLISH ONLY, engineered to earn SAVES first, then likes, then follows, while "
    "keeping the restrained brand voice (no hype, the verified numbers carry the weight). Write it "
    "as short stand-alone lines (one idea per line, nothing wraps), in THIS order:\n"
    "  1) HOOK — the first line is the ONLY thing shown in the feed before 'more', so it must stop "
    "the scroll by itself. Under ~120 characters. Open with a curiosity gap or ONE specific verified "
    "number. Never a generic opener ('Let's talk about...', 'Did you know').\n"
    "  2) SUBSTANCE — the save-worthy takeaway: the actual numbers/verdict stated as a reference a "
    "collector wants to keep (the EV, the sealed price, the gap, the pull odds, the panorama value). "
    "Concrete and verified. This is WHY someone saves the post.\n"
    "  3) SAVE TRIGGER — REQUIRED, never omit. ONE line giving a concrete reason to save it for "
    "later, tied to a real moment. It MUST literally start with 'Save this' (e.g. 'Save this before "
    "you open a <set>.' / 'Save this for the next rip-or-hold call.'). Saves are the #1 goal.\n"
    "  4) ENGAGEMENT — one short, opinion-based question anyone can answer in a few words "
    "(rip or keep? which card? over or under on the EV?) to pull comments.\n"
    "  5) FOLLOW CTA — REQUIRED, never omit. A line that MUST contain the handle '@pokeev.tcg', "
    "e.g. 'Follow @pokeev.tcg for the live Expected Value on every sealed set.' Then a separate "
    "'link in bio -> pokeev.com' line.\n"
    "Every caption MUST include BOTH the 'Save this' line (3) and the '@pokeev.tcg' follow line (5) "
    "as their own lines — omitting either is a failure. Name pokeev.com at least twice. No "
    "hashtags inside the caption. No em-dashes or en-dashes."
)

# Shared hashtag brief — every post must maximize INTERNATIONAL discoverability.
_HASHTAG_RULES = (
    "HASHTAGS — return AT MOST 10, the most IMPACTFUL ones, as a JSON list. Quality over "
    "quantity: 10 sharp, relevant tags beat 30 generic ones. Build them in this priority, most "
    "relevant first:\n"
    "  1) POST-SPECIFIC (lead with these — they are the most rankable): the set, the featured "
    "Pokemon name(s), the chase card, the rarity, and the artist when known.\n"
    "  2) NICHE / RANKABLE tags this account can realistically surface in (e.g. #pokemoninvesting "
    "#sealedpokemon #riporkeep #pokemonpulls #pokemoncollector).\n"
    "  3) one or two HIGH-VOLUME reach tags (#pokemontcg #pokemoncards).\n"
    "All lowercase, unique, English. No banned/spammy/irrelevant tags, no em-dashes."
)


def _no_dash(s):
    """Strip em/en-dashes from any data-derived copy (source data uses them; the
    brand voice forbids them). Collapses to a clean separator."""
    if not s:
        return s
    return re.sub(r"\s*[—–]\s*", " · ", str(s)).strip()


def _wrap_clauses(text, width=56):
    """Re-flow body copy so each SENTENCE reads cleanly on the slide. The renderer draws
    every '|'-separated piece on its own line with no auto-wrap, so this function decides
    the line breaks. Owner's rule: a phrase must start AND end on the same line — no word
    left orphaned on a line by itself.

    Strategy:
      1. Split on the art-director's explicit '|' breaks, THEN on sentence boundaries, so a
         line never straddles two sentences and a period never leads a line ("starfield."
         dangling at the front of a line was the ugly case).
      2. A sentence that fits in `width` stays whole on one line.
      3. A longer sentence is BALANCED (not greedy): we keep the minimum line count but
         even out the lines, which also guarantees no lone trailing word ("cosmos" alone)."""
    if not text:
        return text

    def _greedy(words, maxw):
        lines, line = [], ""
        for w in words:
            if line and len(line) + 1 + len(w) > maxw:
                lines.append(line)
                line = w
            else:
                line = f"{line} {w}".strip()
        if line:
            lines.append(line)
        return lines

    def _balanced(words):
        if not words:
            return []
        full = _greedy(words, width)
        if len(full) <= 1:
            return full
        # shrink the working width as far as possible while keeping the same line count:
        # this pulls words leftward so the lines even out and the last line is never a widow.
        longest = max(len(w) for w in words)
        lo, hi, best = longest, width, full
        while lo <= hi:
            mid = (lo + hi) // 2
            cand = _greedy(words, mid)
            if len(cand) <= len(full):
                best = cand
                hi = mid - 1
            else:
                lo = mid + 1
        return best

    out = []
    for part in str(text).split("|"):
        for sentence in re.split(r"(?<=[.!?])\s+", part.strip()):
            sentence = sentence.strip()
            if sentence:
                out.extend(_balanced(sentence.split()))
    return "|".join(out)


def _slug_words(*xs):
    """Lowercase alnum tokens for dynamic hashtags, e.g. 'Latias ex' -> 'latiasex'."""
    out = []
    for x in xs:
        if not x:
            continue
        w = re.sub(r"[^0-9a-z]", "", str(x).lower())
        if w:
            out.append(w)
    return out


# =============================== T1 · CONNECTED ============================ #
def select_connected(snapshot, names, groups_path: Path, exclude=None, min_cards=2, max_cards=7):
    """Pick a resolved combined-illustration group with 2..7 cards (cover + N +
    reveal + cta <= 10 slides), not recently used, ranked by total USD desc."""
    exclude = exclude or set()
    doc = json.loads(groups_path.read_text(encoding="utf-8"))
    candidates = []
    for g in doc.get("groups", []):
        if not g.get("resolved"):
            continue
        gid = g.get("id")
        if not gid or gid in exclude:
            continue
        cards = [c for c in g.get("cards", []) if c.get("image")]
        if not (min_cards <= len(cards) <= max_cards):
            continue
        total = sum(int(round(c.get("usd") or 0)) for c in cards)
        candidates.append((total, g, cards))
    if not candidates:
        return None
    candidates.sort(key=lambda t: t[0], reverse=True)
    total, g, cards = candidates[0]
    items = []
    for c in cards:
        items.append({
            "name": c.get("resolvedName") or c.get("name") or "?",
            "image": c.get("image"),
            "usd": int(round(c.get("usd") or 0)),
            "setLabel": c.get("setLabel") or c.get("setName") or "",
            "setLogo": c.get("setLogo"),
            "ptcgId": c.get("ptcgId"),
            "number": c.get("number"),
        })
    return {
        "key": g["id"],
        "group_id": g["id"],
        "theme_line": g.get("theme", ""),
        "artist": g.get("artist", ""),
        "era": g.get("era", ""),
        "setLabel": items[0]["setLabel"],
        "setLogo": items[0]["setLogo"],
        "items": items,
        "total": total,  # integer; equals the sum of displayed per-card values
    }


def fallback_connected(facts):
    n = len(facts["items"])
    set_lbl = facts["setLabel"]
    artist = facts["artist"] or "one illustrator"
    reveal_title = re.split(r"[—–]", facts["theme_line"])[-1].strip() or set_lbl
    return {
        "eyebrow": _no_dash(facts["theme_line"] or set_lbl).upper()[:48],
        "headline": "They drew one scene.",
        "revealTitle": _no_dash(reveal_title)[:36],
        "caption": (
            f"{n} separate cards. One continuous illustration.\n\n"
            f"Line them up and {artist}'s artwork becomes a single panorama, scattered across {set_lbl}.\n"
            "The live value of every piece, and the whole set, is on pokeev.com.\n\n"
            f"Save this before you hunt the full {set_lbl} panorama.\n\n"
            "Which piece is your favorite? Tell us below.\n\n"
            "Follow @pokeev.tcg for the live Expected Value on every sealed set.\n"
            "link in bio -> pokeev.com"
        ),
        "hashtags": _clean_hashtags(
            ["#pokemonart", "#connectingart", "#pokemonillustration", "#cardart"]
            + ["#" + w for w in _slug_words(artist, set_lbl)]
        ),
    }


def artdirect_connected(api_key, facts):
    if not api_key:
        return fallback_connected(facts)
    lines = "\n".join(f"  {i+1}. {it['name']} ({it['setLabel']}) ${it['usd']}" for i, it in enumerate(facts["items"]))
    prompt = (
        f"Today's carousel is THEME 1 (CONNECTING ART): {len(facts['items'])} different cards whose "
        f"artworks join into ONE continuous illustration. Group: \"{facts['theme_line']}\". "
        f"Illustrator: {facts['artist']}. Era: {facts['era']}. Set: {facts['setLabel']}.\n"
        f"Cards left-to-right, with verified USD:\n{lines}\n"
        f"Combined panorama value: ${facts['total']}.\n\n"
        + _CAPTION_RULES + "\n\n" + _HASHTAG_RULES + "\n"
        "For THIS theme also fold in format tags like #connectingart #pokemonart "
        "#pokemonillustration alongside the post-specific artist, set, and Pokemon tags.\n\n"
        "Return ONLY a JSON object with keys:\n"
        '  "eyebrow": ALL-CAPS series label, <= 46 chars (e.g. the set + theme).\n'
        '  "headline": a short cover hook, <= 24 chars (e.g. "They drew one sky.").\n'
        '  "revealTitle": <= 34 chars title for the panorama reveal slide.\n'
        '  "caption": the Instagram caption per the rules above. Lead by teaching that these cards '
        'form one illustration, mention the artist, ask an engagement question.\n'
        '  "hashtags": 24-30 hashtags per the HASHTAGS rules above.\n'
    )
    try:
        brief = claude_json(api_key, prompt, system=voice())
    except Exception as exc:  # noqa: BLE001
        log(f"  T1 art-direction failed ({exc}); using fallback")
        return fallback_connected(facts)
    brief["hashtags"] = _clean_hashtags(brief.get("hashtags"))
    brief.setdefault("eyebrow", _no_dash(facts["theme_line"] or facts["setLabel"]).upper()[:48])
    brief.setdefault("headline", "They drew one scene.")
    brief.setdefault("revealTitle", _no_dash(facts["setLabel"])[:36])
    # Belt-and-braces: never let a data-derived em-dash leak into the cover/reveal copy.
    for k in ("eyebrow", "headline", "revealTitle"):
        if brief.get(k):
            brief[k] = _no_dash(brief[k])
    return brief


def _fix_namelist_commas(text, names):
    """Normalize the separator between two consecutive FEATURED card names so the Pokemon list
    reads 'A, B, C'. Two cases, both scoped to actual card-name pairs (so a set name like
    'Sword & Shield' is never touched): a missing separator ('A B') and an ampersand ('A & B') —
    the latter matters because the OG renderer's textParam STRIPS '&', which would otherwise leave
    'A  B'. Preserves the matched casing (the eyebrow is ALL-CAPS)."""
    out = text or ""
    for a, b in zip(names, names[1:]):
        ea, eb = re.escape(a), re.escape(b)
        out = re.sub(rf"\b({ea})\s*&\s*({eb})\b", r"\1, \2", out, flags=re.IGNORECASE)  # "A & B" -> "A, B"
        out = re.sub(rf"\b({ea})\s+({eb})\b", r"\1, \2", out, flags=re.IGNORECASE)       # "A B"  -> "A, B"
    return out


def slides_connected(base, facts, brief):
    """Port of /tmp/render_connect.py: connect-cover, one connect per card,
    connect-reveal, connect-cta. img/v params are 0-indexed (img0..)."""
    base = base.rstrip("/")
    H = f"{base}/api/ig"
    items = facts["items"]
    # Deterministic punctuation: never let the Pokemon list drop a separator — in the cover
    # eyebrow OR the reveal title (both can list the featured Pokemon, e.g. "Marill & Lapras").
    _names = [it["name"] for it in items]
    brief = {
        **brief,
        "eyebrow": _fix_namelist_commas(brief.get("eyebrow", ""), _names),
        "revealTitle": _fix_namelist_commas(brief.get("revealTitle", ""), _names),
    }
    total_str = fmt_usd(facts["total"])
    set_lbl = facts["setLabel"]
    logo = _png(facts["setLogo"])
    # MEDIUM-upscaled HD (1500px) for crisp card edges — native scans are tiny (Southern
    # Islands = 600px → pixelated). 1500px is safe for the multi-image cover/reveal (4096px×N
    # OOMs Satori); falls back to the raw scan if upscaling was unavailable.
    imgparams = "".join(f"&img{i}={q(_png(it.get('hd_image') or it['image']))}" for i, it in enumerate(items))
    valparams = "".join(f"&v{i}={q(fmt_usd(it['usd']))}" for i, it in enumerate(items))

    cover = (f"{H}?slide=connect-cover&set={q(set_lbl)}"
             + (f"&logo={q(logo)}" if logo else "")
             + f"&eyebrow={q(brief['eyebrow'])}&headline={q(brief['headline'])}"
             f"&title={q(total_str)}&cue={q('swipe →')}{imgparams}")

    cards = []
    n = len(items)
    running = 0
    for i, it in enumerate(items, 1):
        running += it["usd"]
        series = f"CONNECTED · PIECE {i} OF {n}"
        if i == n - 1:
            series += " · ONE PIECE LEFT"
        if i == n:
            tally = f"the last piece · {total_str} complete"
        else:
            tally = f"{fmt_usd(running)} of {total_str} shown"
        u = (f"{H}?slide=connect&img0={q(_png(it.get('hd_image') or it['image']))}&name={q(it['name'])}&val={q(fmt_usd(it['usd']))}"
             f"&series={q(series)}&tally={q(tally)}&set={q(set_lbl)}")
        if logo:
            u += f"&logo={q(logo)}"
        cards.append(u)

    reveal = (f"{H}?slide=connect-reveal&title={q(brief['revealTitle'])}&set={q(set_lbl)}"
              + (f"&logo={q(logo)}" if logo else "")
              + f"{imgparams}{valparams}&total={q(total_str)}"
              f"&footerLeft={q('every value priced live on pokeev.com')}")

    body = "pokeev.com runs the live Expected Value on any sealed product, so you know if a set is worth ripping."
    cta = (f"{H}?slide=connect-cta&set={q(set_lbl)}"
           + (f"&logo={q(logo)}" if logo else "")
           + f"&eyebrow={q('BEFORE YOU RIP IT')}&h1={q('Open it,')}&h2={q('or keep it sealed?')}"
           f"&body={q(body)}")
    return [cover, *cards, reveal, cta]


# =============================== T2 · RIPKEEP ============================== #
def _real_etb(sealed):
    """Real (non-estimated) ETB sealed entries. Prefers the plain set ETB over store
    exclusives (Pokemon Center etc., which are price outliers); among those, cheapest."""
    etbs = [s for s in (sealed or []) if s.get("kind") == "etb" and s.get("usd") and not s.get("estimated")]
    if not etbs:
        return None
    plain = [s for s in etbs if "pokemon center" not in (s.get("name") or "").lower()
             and "exclusive" not in (s.get("name") or "").lower()]
    pool = plain or etbs
    return min(pool, key=lambda s: s["usd"])


def _etb_packs(data_dir: Path, sid: str, default=10):
    pr_path = data_dir / "pull-rates" / f"{sid}.json"
    try:
        pr = json.loads(pr_path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return default
    packs = ((pr.get("products") or {}).get("etb") or {}).get("packs")
    return int(packs) if packs else default


RK_SEALED_MAX = 600  # ETBs priced above this are vintage outliers — the rip/keep call
RK_SEALED_MIN = 25   # is then trivially "KEEP" and makes a dull, repetitive post.


# Gold / secret rares (hyper-rare, rainbow, gold, secret) are the priciest cards but scan as a
# flat metallic slab — the Pokémon is barely visible and they look cheap on IG. The gorgeous
# full-art versions (special-illustration / illustration rare) are right behind on price. So the
# CHASE DISPLAY skips gold and dedupes by Pokémon (no Mega Lucario twice), keeping the best-LOOKING
# high-value cards. EV/verdict still use every card — this only changes which cards we SHOW.
_GOLD_RARITIES = ("hyper", "gold", "rainbow", "secret")


def _is_gold(card) -> bool:
    r = (card.get("rarity") or "").lower()
    return any(g in r for g in _GOLD_RARITIES)


def _pick_chase_display(cards, k=3):
    pool = sorted(cards, key=lambda c: c.get("usd") or 0, reverse=True)
    chosen, seen = [], set()
    # First pass: best-looking (non-gold), one per Pokémon name.
    for c in pool:
        if _is_gold(c):
            continue
        name = (c.get("name") or "").lower()
        if name in seen:
            continue
        seen.add(name)
        chosen.append(c)
        if len(chosen) >= k:
            return chosen
    # Fallback: a set whose only chases are gold — top up (still deduped) so we never show < k.
    for c in pool:
        name = (c.get("name") or "").lower()
        if name in seen:
            continue
        seen.add(name)
        chosen.append(c)
        if len(chosen) >= k:
            break
    return chosen[:k]


def select_ripkeep(snapshot, names, data_dir: Path, exclude=None):
    """Pick an EV-enabled set (ev.en.packEv>0) with a REAL etb sealed price in a
    believable band, not recently used. Ranked by the CLOSEST call (smallest relative
    gap) so the post is a genuine rip-or-keep cliffhanger, not an obvious blowout."""
    exclude = exclude or set()
    rows = []
    for sid, s in snapshot.get("sets", {}).items():
        if sid in exclude:
            continue
        ev = (s.get("ev") or {}).get(LOCALE) or {}
        pack_ev = ev.get("packEv") or 0
        if pack_ev <= 0:
            continue
        etb = _real_etb(s.get("sealed"))
        if not etb:
            continue
        sealed = etb["usd"]
        if not (RK_SEALED_MIN <= sealed <= RK_SEALED_MAX):
            continue
        packs = _etb_packs(data_dir, sid)
        open_ev = packs * pack_ev
        cards = [c for c in s.get("cards", []) if c.get("image") and (c.get("usd") or 0) > 0]
        if not cards:
            continue
        top3 = _pick_chase_display(cards, 3)
        gap = abs(sealed - open_ev)
        rel_gap = gap / sealed if sealed else 1.0
        rows.append({
            "key": sid,
            "set_id": sid,
            "set_name": set_display_name(names, sid, s.get("episodeId")),
            "logo": s.get("logo"),
            "booster": _booster_image(s),  # sealed-pack art for the FACE-OFF background (UHD upscaled)
            "pack_ev": pack_ev,
            "packs": packs,
            "open_ev": round(open_ev),
            "sealed": round(sealed),
            "etb_name": etb.get("name", ""),
            "gap": round(gap),
            "rel_gap": rel_gap,
            "verdict_rip": open_ev > sealed,  # LOCKED rule: RIP iff openEv > sealed
            "chase": [{"name": c["name"], "image": _hires(c["image"]), "usd": round(c["usd"]),
                       "rarity": c.get("rarity")} for c in top3],
        })
    if not rows:
        return None
    # Owner override (POKEEV_RK_SET / workflow_dispatch `set`): pin a specific set when
    # curating, instead of the automatic closest-call pick.
    force = os.environ.get("POKEEV_RK_SET")
    if force:
        forced = [r for r in rows if r["set_id"] == force]
        if forced:
            log(f"ripkeep: pinned to {force} via POKEEV_RK_SET")
            return forced[0]
        log(f"ripkeep: POKEEV_RK_SET={force} is not a usable candidate — auto-picking")
    rows.sort(key=lambda r: r["rel_gap"])  # closest decision first
    return rows[0]


def fallback_ripkeep(facts):
    rip = facts["verdict_rip"]
    set_name = facts["set_name"]
    sealed, ev, gap = fmt_usd(facts["sealed"]), fmt_usd(facts["open_ev"]), fmt_usd(facts["gap"])
    if rip:
        hook = f"A sealed {set_name} ETB costs {sealed}. On average it pulls back {ev}."
        sub = "The math says open it."
    else:
        hook = f"A sealed {set_name} ETB costs {sealed}. Rip it and you average just {ev}."
        sub = "The math says keep it sealed."
    return {
        "eyebrow": "THE COLLECTOR'S DILEMMA",
        "verdictWord": "RIP IT" if rip else "KEEP IT|SEALED",
        "reason": (f"Ripping averages {ev}.|Sealed it sits at {sealed}. {'Open it.' if rip else 'Keep it.'}"),
        "caption": (
            f"{hook}\n\n"
            f"{sub} The gap is {gap}. Rip or keep is never a vibe, it is a number.\n"
            "pokeev.com runs the live Expected Value on every sealed set, so you never rip blind.\n\n"
            f"Save this before you open a {set_name} ETB.\n\n"
            "Would you crack it or keep it sealed? Tell us below.\n\n"
            "Follow @pokeev.tcg for the live Expected Value on every sealed set.\n"
            "link in bio -> pokeev.com"
        ),
        "hashtags": _clean_hashtags(
            ["#pokemonsealed", "#riporkeep", "#elitetrainerbox", "#pokemoninvesting", "#sealedpokemon"]
            + ["#" + w for w in _slug_words(set_name)]
        ),
    }


def artdirect_ripkeep(api_key, facts):
    if not api_key:
        return fallback_ripkeep(facts)
    chase = ", ".join(f"{c['name']} {fmt_usd(c['usd'])}" for c in facts["chase"])
    verdict = "RIP (open EV beats the sealed price)" if facts["verdict_rip"] else "KEEP (sealed price beats open EV)"
    prompt = (
        f"Today's carousel is THEME 2 (RIP OR KEEP) for the set \"{facts['set_name']}\".\n"
        f"A sealed Elite Trainer Box (ETB) costs {fmt_usd(facts['sealed'])}. It holds {facts['packs']} packs; "
        f"booster EV is ${facts['pack_ev']:.2f}, so opening it averages {fmt_usd(facts['open_ev'])}. "
        f"The gap is {fmt_usd(facts['gap'])}. LOCKED VERDICT: {verdict}. "
        f"Top chase cards: {chase}.\n"
        "ALWAYS call the product an Elite Trainer Box or ETB. NEVER say a generic 'box'.\n\n"
        + _CAPTION_RULES + "\n\n" + _HASHTAG_RULES + "\n"
        "For THIS theme also fold in format tags like #riporkeep #sealedpokemon "
        "#elitetrainerbox #pokemoninvesting alongside the post-specific set and chase-Pokemon tags.\n\n"
        "Return ONLY a JSON object with keys:\n"
        '  "eyebrow": ALL-CAPS cover label, <= 46 chars = the SET + product, e.g. '
        '"BRILLIANT STARS · ELITE TRAINER BOX". Do NOT include "rip or keep" / "rip it" / '
        '"keep it" — the cover\'s big title ALREADY says that, so repeating it is a duplicate.\n'
        f'  "verdictWord": the verdict for the verdict slide. Use exactly "RIP IT" if the verdict is RIP, '
        'else "KEEP IT|SEALED" (the | is a line break).\n'
        '  "reason": <= 140 chars, two short clauses split by |, citing the EV and sealed numbers.\n'
        '  "caption": the caption per the rules. State the ETB price and the average open value, name the '
        'verdict, ask rip-or-keep.\n'
        '  "hashtags": 24-30 hashtags per the HASHTAGS rules above.\n'
    )
    try:
        brief = claude_json(api_key, prompt, system=voice())
    except Exception as exc:  # noqa: BLE001
        log(f"  T2 art-direction failed ({exc}); using fallback")
        return fallback_ripkeep(facts)
    brief["hashtags"] = _clean_hashtags(brief.get("hashtags"))
    brief.setdefault("eyebrow", "THE COLLECTOR'S DILEMMA")
    # Safety: the cover's big headline already reads "Rip it, or keep it?", so never let
    # the eyebrow duplicate it (owner feedback) — fall back to the set + product label.
    if re.search(r"rip\s*(it\s*)?or\s*keep|keep\s*it\s*sealed", brief.get("eyebrow", ""), re.I):
        brief["eyebrow"] = f"{facts['set_name'].upper()} · ELITE TRAINER BOX"[:46]
    brief.setdefault("verdictWord", "RIP IT" if facts["verdict_rip"] else "KEEP IT|SEALED")
    brief.setdefault("reason", f"Ripping averages {fmt_usd(facts['open_ev'])}.|Sealed it sits at {fmt_usd(facts['sealed'])}.")
    return brief


def slides_ripkeep(base, facts, brief):
    """Port of /tmp/render_rk.py: rk-cover, rk-tempt, two rk-stat, rk-versus,
    rk-verdict, rk-cta. Product label always 'Elite Trainer Box'."""
    base = base.rstrip("/")
    H = f"{base}/api/ig"
    set_name = facts["set_name"]
    logo = _png(facts["logo"])
    rip = facts["verdict_rip"]
    sealed, ev, gap = fmt_usd(facts["sealed"]), fmt_usd(facts["open_ev"]), fmt_usd(facts["gap"])
    delta = fmt_usd(facts["gap"])
    product = f"{set_name} · Elite Trainer Box"
    logop = f"&logo={q(logo)}" if logo else ""

    cover = (f"{H}?slide=rk-cover&set={q(set_name)}{logop}"
             f"&eyebrow={q(brief['eyebrow'])}&delta={q(delta)}&cue={q('swipe →')}")

    tline = "The chase pulls are worth a small fortune.|The catch: you have to actually hit one."
    tempt = f"{H}?slide=rk-tempt&set={q(set_name)}{logop}"
    for i, c in enumerate(facts["chase"]):
        # Medium-upscaled HD (1500px) for crisp edges, Satori-safe for the 3-up row.
        tempt += f"&img{i}={q(_png(c.get('hd_image') or c['image']))}&v{i}={q(fmt_usd(c['usd']))}"
    tempt += f"&line={q(tline)}"

    stat_sealed = (f"{H}?slide=rk-stat&set={q(set_name)}{logop}"
                   f"&kicker={q('THE SEALED PRICE')}"
                   f"&label={q(f'A sealed {set_name}|Elite Trainer Box costs')}&value={q(sealed)}"
                   f"&sub={q('Live market price,|refreshed daily on pokeev.com.')}&foot={q('now rip it open… →')}")

    ev_sub = f"{facts['packs']} packs, every card inside|priced live on pokeev.com."
    stat_ev = (f"{H}?slide=rk-stat&set={q(set_name)}{logop}"
               f"&kicker={q('THE EXPECTED VALUE')}"
               f"&label={q('Rip that same Elite Trainer Box,|on average it pulls back')}&value={q(ev)}"
               f"&sub={q(ev_sub)}"
               f"&foot={q('so… rip or keep? →')}")

    gap_label = "RIPPING WINS BY" if rip else "KEEPING WINS BY"
    versus = (f"{H}?slide=rk-versus&set={q(set_name)}{logop}&rip={'1' if rip else '0'}&product={q(product)}"
              f"&sealed={q(sealed)}&ev={q(ev)}&gap={q(gap)}&gapLabel={q(gap_label)}")

    verdict = (f"{H}?slide=rk-verdict&set={q(set_name)}{logop}&rip={'1' if rip else '0'}"
               f"&verdict={q(brief['verdictWord'])}&reason={q(brief['reason'])}"
               f"&sealed={q(sealed)}&ev={q(ev)}")

    body = "pokeev.com runs the live Expected Value|on every sealed set, so you never rip blind."
    cta = (f"{H}?slide=rk-cta&eyebrow={q('NOW DO IT FOR ANY SET')}"
           f"&h1={q('Rip or keep?')}&h2={q('Know in seconds.')}&body={q(body)}")
    return [cover, tempt, stat_sealed, stat_ev, versus, verdict, cta]


# ================================ T3 · GRAILS ============================= #
def _odds_for_card(snapshot_set, rarity):
    """1-in-N from rarityBreakdown: N = round(cardsInSet / expectedPerPack)."""
    ev = (snapshot_set.get("ev") or {}).get(LOCALE) or {}
    for rb in ev.get("rarityBreakdown") or []:
        if rb.get("rarity") == rarity:
            per = rb.get("expectedPerPack") or 0
            cis = rb.get("cardsInSet") or 0
            if per > 0 and cis > 0:
                return max(1, round(cis / per))
    return None


def _tcg_hires(url):
    """TCGplayer CDN serves a tiny `_200w` thumbnail by default. Request a LARGE fixed size that the
    CDN actually serves (`_in_1000x1000`) — a far better source for the booster upscale. NOTE: the
    BARE/stripped URL 403s on newer products (e.g. White Flare), so never strip to it; normalise any
    existing size suffix to the 1000×1000 variant instead."""
    if url and "tcgplayer-cdn.tcgplayer.com" in url:
        bare = re.sub(r"_(?:\d+w|in_\d+x\d+)\.(jpg|png|webp)$", r".\1", url)
        return re.sub(r"\.(jpg|png|webp)$", r"_in_1000x1000.\1", bare)
    return url


def _booster_image(snapshot_set):
    for s in snapshot_set.get("sealed") or []:
        if s.get("kind") == "booster" and s.get("image"):
            return _tcg_hires(s["image"])
    return None


def select_grails(snapshot, names, exclude=None):
    """Pick the single highest-USD chase card of an EV-enabled set, not recently
    used (dedup on card id). Returns facts incl. odds + booster image for slides."""
    exclude = exclude or set()
    # Owner override (POKEEV_GRAIL_SET / workflow_dispatch `grail`): feature a specific set's top
    # chase instead of the automatic highest-value pick — e.g. to avoid two Charizards in a row.
    force = (os.environ.get("POKEEV_GRAIL_SET") or "").strip() or None
    best = None
    for sid, s in snapshot.get("sets", {}).items():
        if force and sid != force:
            continue
        ev = (s.get("ev") or {}).get(LOCALE) or {}
        if (ev.get("packEv") or 0) <= 0:
            continue
        cards = [c for c in s.get("cards", []) if c.get("image") and (c.get("usd") or 0) > 0]
        if not cards:
            continue
        chase = max(cards, key=lambda c: c.get("usd") or 0)
        if not force and chase.get("id") in exclude:  # a forced set wins even if recently used
            continue
        if best is None or (chase.get("usd") or 0) > best["_usd"]:
            odds = _odds_for_card(s, chase.get("rarity"))
            best = {
                "_usd": chase.get("usd") or 0,
                "key": chase.get("id"),
                "card_id": chase.get("id"),
                "set_id": sid,
                "set_name": set_display_name(names, sid, s.get("episodeId")),
                "logo": s.get("logo"),
                "name": chase.get("name"),
                "rarity": chase.get("rarity"),
                "image": _hires(chase.get("image")),
                "usd": round(chase.get("usd") or 0),
                "odds_n": odds,
                "booster": _booster_image(s),
            }
    return best


def _safe_scene_zoom():
    """SCENE crop: the main subject, centred, moderate zoom. Stays in the pure-art
    band (center y ~0.30). Distinct from the craft crop below."""
    return grail_zoom_from_vision(0.50, 0.30, 2.0)


def _safe_craft_zoom():
    """CRAFT/ARTIST crop: a tighter, OFF-CENTRE crop on a different art region (upper
    band, pushed left) to surface brushwork/texture. Visibly different from the scene
    crop. Still inside the pure-art band (center y ~0.20, clear of title bar/attack box)."""
    return grail_zoom_from_vision(0.40, 0.24, 2.4)


# Back-compat alias (older callers): defaults to the centred scene crop.
def _safe_grail_zoom():
    return _safe_scene_zoom()


def _band_crop(cx, band_top, band_bottom, fmin=1.35, fmax=3.6):
    """Frame the VERTICAL card band [band_top, band_bottom] (card fractions) to fill the
    1080x1350 slide, centered horizontally on cx, full-bleed (no gaps). The band is clamped to
    the PURE-ART window [0.10, 0.46] — clear of the title/HP bar at the top AND well clear of the
    attack/rules text boxes lower down — so the zoom shows ONLY artwork, never the card's printed
    text (owner: showing the card's bottom text on the SCENE zoom is ugly)."""
    band_top = max(0.10, min(0.30, band_top))
    # min() is the OUTER clamp so 0.46 is a HARD cap — the band can never reach the text boxes,
    # even when the min-height floor (band_top + 0.14) would otherwise push it lower.
    band_bottom = min(0.46, max(band_top + 0.14, band_bottom))
    band_h = band_bottom - band_top
    factor = max(fmin, min(fmax, (1350.0 / band_h) / (1180 * PORTRAIT_RATIO)))
    zw = int(round(1180 * factor))
    zh = int(round(zw * PORTRAIT_RATIO))
    zx = int(round(540 - cx * zw))
    # Anchor the band BOTTOM at the screen bottom (not the top): this GUARANTEES the visible
    # bottom edge == band_bottom (<= 0.46) no matter how the zoom factor is clamped. If the
    # factor caps out, the view simply extends UPWARD into more artwork (never down into text).
    zy = int(round(1350 - band_bottom * zh))
    zx = max(-(zw - 1080), min(0, zx))            # keep card covering 0..1080 horizontally
    zy = max(-(zh - 1350), min(0, zy))            # keep card covering 0..1350 vertically
    return {"zw": zw, "zx": zx, "zy": zy}


def _center_crop(cx, cy, span):
    """Crop a vertical `span` of artwork centred on (cx, cy), kept inside the pure-art window
    [0.10, 0.46] (no title bar, no text boxes). Used for the CRAFT detail at a DIFFERENT, off-
    centre spot than the scene. Bigger span = less zoom."""
    try:
        cx = min(1.0, max(0.0, float(cx)))
        cy = min(0.42, max(0.16, float(cy)))
        span = min(0.40, max(0.18, float(span)))  # up to 0.40 = widest CLEAN dezoom (art band caps the rest)
    except (TypeError, ValueError):
        return _safe_craft_zoom()
    return _band_crop(cx, cy - span / 2, cy + span / 2)


def compute_grail_crops(image_url):
    """Slides 3 & 4 = a PIXEL-PERFECT 2-PANEL PANORAMA of the card art — the illustration unrolls
    SEAMLESSLY across the swipe for EVERY T3 (owner: "comme une seule image scindée en 2", aucun
    décalage). Both panels share the SAME zoom (zw) and SAME vertical anchor (zy); their zx differ
    by EXACTLY one slide width (1080) → zero-gap seam. The 0.80-wide window is CENTRED on the card's
    subject (OpenCV saliency; centred fallback) and clamped inside the card. The fixed vertical band
    is y[~0.101, 0.46] = pure art (no title bar, no attack/rules text). Returns {"craft": LEFT panel
    (slide 3), "scene": RIGHT panel (slide 4)}. A curated per-card panorama in _GRAIL_OVERRIDES wins."""
    cx = 0.50  # subject horizontal centre (card fraction); 0.5 = centred fallback
    try:
        import cv2
        import numpy as np
        import requests

        data = requests.get(_hires(image_url), timeout=30).content
        arr = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if arr is not None:
            H, W = arr.shape[:2]
            band = arr[int(H * 0.11):int(H * 0.49), :]  # pure-art window (exclude title + text boxes)
            try:
                sal = cv2.saliency.StaticSaliencyFineGrained_create()
                ok, smap = sal.computeSaliency(band)
            except Exception:  # noqa: BLE001 — saliency module missing
                ok, smap = False, None
            if ok and smap is not None:
                smap = cv2.GaussianBlur((smap * 255).astype(np.uint8), (0, 0), 7)
                _, thr = cv2.threshold(smap, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                cnts, _ = cv2.findContours(thr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                big = [c for c in cnts if cv2.contourArea(c) > 0.03 * band.shape[0] * band.shape[1]]
                if big:
                    x, _, w, _ = cv2.boundingRect(max(big, key=cv2.contourArea))
                    cx = (x + w / 2) / W
                    log(f"  grail panorama centred on subject cx={cx:.2f}")
    except Exception as exc:  # noqa: BLE001 — never fail a post over crop detection
        log(f"  grail crop detection failed ({exc}); using a centred panorama")
    ZW = 2700                                  # each panel shows 1080/2700 = 0.40 of card width → 0.80 span
    zh = int(round(ZW * PORTRAIT_RATIO))       # 3764
    zy = int(round(1350 - 0.46 * zh))          # bottom-anchor the art band at y=0.46 → visible top ~0.101
    panel = 1080.0 / ZW                        # 0.40 (one panel's width fraction)
    left = min(max(cx - panel, 0.0), 1.0 - 2 * panel)   # 0.80 window centred on the subject, clamped in-card
    zx_l = int(round(-left * ZW))
    zx_r = zx_l - 1080                         # EXACT seam: the right panel starts where the left ends
    return {"craft": {"zw": ZW, "zx": zx_l, "zy": zy},
            "scene": {"zw": ZW, "zx": zx_r, "zy": zy}}


def fallback_grail_brief(facts):
    name = facts["name"]
    price = fmt_usd(facts["usd"])
    set_name = facts["set_name"]
    artist = facts.get("artist")
    odds_n = facts.get("odds_n")
    odds_line = (f"Rip a sealed booster.|The odds are {odds_n} to 1." if odds_n
                 else "It sits in the rarest tier of the set.")
    return {
        "shockHeadline": "Worth more than|most people guess",
        "priceNote": "for a single card",
        "compare": None,  # no verified money comparison without vision
        "cardKicker": "THE CARD",
        "cardHeadline": name,
        "cardBody": f"{set_name}'s crown jewel.|The card the whole set chases.",
        # Zoom #1 — THE ARTIST / THE CRAFT (off-centre detail crop).
        "craftKicker": "THE ARTIST" if artist else "THE CRAFT",
        "craftHeadline": artist or "Hand-drawn",
        "craftBody": "Look at the linework up close.|Every detail painted by hand.",
        "craftZoom": _safe_craft_zoom(),
        # Zoom #2 — THE SCENE (centred subject crop).
        "sceneKicker": "THE SCENE",
        "sceneHeadline": "The subject, up close",
        "sceneBody": "The character the whole card|is built around.",
        "sceneZoom": _safe_scene_zoom(),
        "oddsBody": odds_line,
        "caption": (
            f"{name} is a {price} card. One card.\n\n"
            f"It sits in the rarest tier of {set_name}, and the art is why collectors chase it.\n"
            f"The pull odds, open value and live price for the whole set are on pokeev.com.\n\n"
            f"Save this before you chase {name}.\n\n"
            "Keep it sealed or rip for it? Tell us below.\n\n"
            "Follow @pokeev.tcg for the live Expected Value on every sealed set.\n"
            "link in bio -> pokeev.com"
        ),
        "hashtags": _clean_hashtags(
            ["#pokemongrails", "#grailcard", "#pokemonart", "#pokemoninvesting"]
            + ["#" + w for w in _slug_words(name, set_name, facts.get("rarity"), artist)]
        ),
    }


def grail_caption(api_key, facts, brief):
    """Save-first, AI-tailored caption for a grail post, built ONLY from verified facts (never
    invents a price/odds/claim). Returns None on any failure so the caller keeps the deterministic
    template caption from fallback_grail_brief."""
    if not api_key:
        return None
    odds_n = facts.get("odds_n")
    prompt = (
        "Write the Instagram caption for a single-card GRAIL deep-dive post for @pokeev.tcg. "
        "Use ONLY these verified facts. NEVER invent a price, odds, name, rarity or any claim:\n"
        f"- Card: {facts['name']} from {facts['set_name']}\n"
        f"- Market price: {fmt_usd(facts['usd'])} for ONE card\n"
        + (f"- Pull odds: about {odds_n} to 1 from a sealed booster\n" if odds_n else "")
        + (f"- Illustrator: {facts['artist']}\n" if facts.get("artist") else "")
        + (f"- Rarity: {facts['rarity']}\n" if facts.get("rarity") else "")
        + (f"- What the art shows: {brief.get('sceneHeadline', '')}\n" if brief.get("sceneHeadline") else "")
        + "\n" + _CAPTION_RULES
        + '\n\nReturn ONLY a JSON object: {"caption": "<the caption>"}.'
    )
    try:
        out = claude_json(api_key, prompt, system=voice())
        cap = (out or {}).get("caption")
        return cap if isinstance(cap, str) and len(cap.strip()) > 60 else None
    except Exception as exc:  # noqa: BLE001
        log(f"  grail caption gen failed ({exc}); keeping template caption")
        return None


def grail_zoom_from_vision(center_x, center_y, zoom):
    """Convert a normalized crop (center 0..1, zoom>=1) to grail-zoom zw/zx/zy.
    Stays in the pure-art band (avoid title bar top 13%, attack text below 53%)."""
    try:
        cx = min(1.0, max(0.0, float(center_x)))
        cy = min(0.53, max(0.13, float(center_y)))  # clamp into the art band
        z = min(6.0, max(1.4, float(zoom)))
    except (TypeError, ValueError):
        return _safe_grail_zoom()
    base_w = 1180  # renderer's default crop width
    zw = int(round(base_w * z))
    zh = int(round(zw * PORTRAIT_RATIO))
    # grail-zoom is FULL-BLEED (1080×1350): place the focal point upper-centre,
    # clear of the bottom text scrim (horizontal centre 540, focal y ~480).
    zx = int(round(540 - cx * zw))
    zy = int(round(480 - cy * zh))
    zw = min(6000, max(400, zw))
    zx = min(400, max(-7000, zx))
    zy = min(400, max(-7000, zy))
    return {"zw": zw, "zx": zx, "zy": zy}


def slides_grails(base, facts, brief, hd_image=None):
    """Locked 6-slide order (port of /tmp/render_grail.py, extended to two zooms):
    grail-shock, grail-story (THE CARD), grail-zoom #1 (THE ARTIST/CRAFT — an
    off-centre detail crop), grail-zoom #2 (THE SCENE — the centred subject),
    grail-odds, connect-cta. Both zooms use hd_image (Blob HD) when available."""
    base = base.rstrip("/")
    H = f"{base}/api/ig"
    set_name = facts["set_name"]
    logo = _png(facts["logo"])
    logop = f"&logo={q(logo)}" if logo else ""
    # Use the AI-upscaled (x8) card EVERYWHERE it's shown (shock + story + zooms), not just
    # the zooms — so the full card is razor-sharp on every grail slide, not only the crops.
    img = _png(hd_image or facts["image"])
    zoom_img = hd_image or img
    price = fmt_usd(facts["usd"])
    artist = facts.get("artist")

    shock = (f"{H}?slide=grail-shock&set={q(set_name)}{logop}&img0={q(img)}"
             f"&eyebrow={q('ONE POKÉMON CARD')}&headline={q(brief['shockHeadline'])}"
             f"&price={q(price)}&note={q(brief.get('priceNote') or 'for a single card')}"
             f"&cue={q('but why? swipe →')}")

    card = (f"{H}?slide=grail-story&set={q(set_name)}{logop}&img0={q(img)}&tilt=-3"
            f"&kicker={q(brief.get('cardKicker') or 'THE CARD')}&headline={q(brief.get('cardHeadline') or facts['name'])}"
            f"&body={q(_wrap_clauses(brief.get('cardBody') or ''))}")

    # Zoom #1 — THE ARTIST / THE CRAFT (off-centre art-detail crop).
    cz = brief.get("craftZoom") or _safe_craft_zoom()
    craft_kicker = brief.get("craftKicker") or ("THE ARTIST" if artist else "THE CRAFT")
    craft_headline = brief.get("craftHeadline") or (artist or "Hand-drawn")
    zoom_craft = (f"{H}?slide=grail-zoom&set={q(set_name)}{logop}&img0={q(zoom_img)}"
                  f"&kicker={q(craft_kicker)}&headline={q(craft_headline)}"
                  f"&body={q(_wrap_clauses(brief.get('craftBody') or ''))}"
                  f"&zw={cz['zw']}&zx={cz['zx']}&zy={cz['zy']}&foot={q('but what is it? →')}")

    # Zoom #2 — THE SCENE (centred subject crop, a DIFFERENT region than #1).
    sz = brief.get("sceneZoom") or _safe_scene_zoom()
    scene_kicker = brief.get("sceneKicker") or "THE SCENE"
    scene_headline = brief.get("sceneHeadline") or "The subject, up close"
    zoom_scene = (f"{H}?slide=grail-zoom&set={q(set_name)}{logop}&img0={q(zoom_img)}"
                  f"&kicker={q(scene_kicker)}&headline={q(scene_headline)}"
                  f"&body={q(_wrap_clauses(brief.get('sceneBody') or ''))}"
                  f"&zw={sz['zw']}&zx={sz['zx']}&zy={sz['zy']}&foot={q('and how rare? →')}")

    odds_n = facts.get("odds_n")
    booster = _png(facts.get("booster_hd") or facts.get("booster"))  # AI-upscaled if available; .webp→.png
    odds = f"{H}?slide=grail-odds&set={q(set_name)}{logop}"
    if booster:
        odds += "".join(f"&b{i}={q(booster)}" for i in range(5))
    if odds_n:
        odds += f"&statA={q('1')}&statB={q(f'{odds_n:,}')}&statSub={q('PACKS TO PULL THIS CARD')}"
    else:
        odds += f"&statA={q('1')}&statB={q('???')}&statSub={q('THE RAREST TIER IN THE SET')}"
    # No "THE ODDS" kicker (owner) — the statSub ("PACKS TO PULL THIS CARD") already labels it.
    odds += (f"&body={q(_wrap_clauses(brief.get('oddsBody') or ''))}"
             f"&foot={q('so… is it worth it? →')}")

    body = "pokeev.com runs the live Expected Value.|Know if any set is worth ripping."
    cta = (f"{H}?slide=connect-cta&eyebrow={q('SO, WORTH CHASING IT?')}"
           f"&h1={q('Rip it, or keep it?')}&body={q(body)}")
    return [shock, card, zoom_craft, zoom_scene, odds, cta]


# --------------------- T3 live enrichment (network) ----------------------- #
def grail_artist(card_id):
    """Illustrator from pokemontcg.io /cards/<id>; None if the id isn't resolvable
    (modern tcgdex-only scans have no pokemontcg id)."""
    m = re.match(r"^[a-z0-9]+-[A-Za-z0-9]+$", card_id or "")
    if not m or "." in (card_id or ""):
        return None
    try:
        data = (_ptcg_get(f"{PTCG_API}/cards/{card_id}") or {}).get("data") or {}
        return ((data.get("artist") or "").strip()) or None
    except Exception:  # noqa: BLE001
        return None


def grail_vision_research(api_key, facts):
    """Claude vision: identify the subject + hidden details and return TWO distinct
    crops with copy — a CRAFT crop (off-centre detail/brushwork/secondary element) and
    a SCENE crop (the main subject, centred) — plus a VERIFIED cheaper money comparison.
    Both crops are converted via the full-bleed centering. Falls back to the two safe
    crops on any failure."""
    if not api_key:
        return None
    try:
        import base64

        raw = _download_bytes(facts["image"], timeout=60, tries=3)
        media_type = "image/png"
        b64 = base64.b64encode(raw).decode("ascii")
    except Exception as exc:  # noqa: BLE001
        log(f"  T3 vision image fetch failed ({exc})")
        return None
    price = fmt_usd(facts["usd"])
    prompt = (
        f"This is the Pokemon TCG card \"{facts['name']}\" from {facts['set_name']}, worth {price}. "
        "Study the ARTWORK. The card is portrait (height/width ~1.394). The top ~13% is the title "
        "bar and below ~53% are attack-text boxes; the pure illustration sits in the middle band.\n"
        "I will render TWO full-bleed close-up zoom slides on this art, so give me TWO well-"
        "COMPOSED crops of DIFFERENT regions. Coordinates are fractions of the FULL card image "
        "(x: 0=left, 1=right; y: 0=top, 1=bottom). Keep BOTH centers in the art band y 0.13..0.53 "
        "(above the title bar, above the attack-text boxes). factor = zoom tightness: ~1.6 shows "
        "most of the art, ~4 is a very tight close-up.\n"
        "  SCENE crop = the MAIN subject. Center EXACTLY on its visual focal point (for a creature: "
        "its head / face / eyes). Frame so the subject sits centered with a little breathing room and "
        "nothing key is cut off. Wider crop (factor 1.6..2.4).\n"
        "  CRAFT crop = ONE specific, visually-rich DETAIL (an eye, an energy/flame effect, a "
        "background element, texture/brushwork) in a DIFFERENT spot than the scene center. Center "
        "TIGHTLY on that exact detail (factor 2.6..4.2). Your craftHeadline + craftBody MUST describe "
        "THIS exact detail, so the caption matches what is shown.\n"
        "Return ONLY a JSON object with keys:\n"
        '  "subject": one short line naming what is depicted (the Pokemon, the scene).\n'
        '  "hidden": one short line on a hidden detail or another Pokemon in the art, or "" if none.\n'
        '  "sceneCenterX": 0..1 horizontal center of the SUBJECT focal point.\n'
        '  "sceneCenterY": 0.13..0.53 vertical center of the SUBJECT focal point.\n'
        '  "sceneFactor": 1.6..2.4 zoom for the SCENE.\n'
        '  "sceneHeadline": <= 40 char title that plainly DESCRIBES what is depicted in the scene '
        '(the Pokemon + its setting), e.g. "Mewtwo adrift in deep space". It must be self-'
        'explanatory — NEVER a gameplay/deck rule or an obscure TCG fact that needs explaining '
        '(e.g. NOT "one allowed per deck").\n'
        '  "sceneBody": <= 120 chars, two clauses split by |, plainly describing the subject/scene '
        'shown (what it is, the mood/setting). No gameplay rules, no jargon that needs explaining.\n'
        '  "craftCenterX": 0..1 horizontal center of the CRAFT detail.\n'
        '  "craftCenterY": 0.13..0.53 vertical center of the CRAFT detail.\n'
        '  "craftFactor": 2.6..4.2 zoom for the CRAFT detail (tighter than the scene).\n'
        '  "craftHeadline": <= 40 char title naming the CRAFT detail shown.\n'
        '  "craftBody": <= 120 chars, two clauses split by |, about that exact detail.\n'
        f'  "compare": a single tasteful CONSUMER GOOD you are CERTAIN costs well under {price}, as a short '
        'phrase (e.g. "a high-end gaming PC", "a designer handbag"). NEVER a car/vehicle, a house/apartment, '
        f'rent, a mortgage or a salary, and NEVER anything that could cost MORE than {price}. Use null if unsure.\n'
        f'  "compareUsd": your best NUMBER estimate of that thing\'s USD price (must be clearly below '
        f'{facts["usd"]}). Use null if unsure.\n'
        "No em-dashes anywhere."
    )
    try:
        v = claude_json(api_key, prompt, system=voice(), vision_image=(media_type, b64))
    except Exception as exc:  # noqa: BLE001
        log(f"  T3 vision research failed ({exc})")
        return None
    v["craftZoom"] = grail_zoom_from_vision(v.get("craftCenterX", 0.40), v.get("craftCenterY", 0.24), v.get("craftFactor", 3.2))
    v["sceneZoom"] = grail_zoom_from_vision(v.get("sceneCenterX", 0.50), v.get("sceneCenterY", 0.30), v.get("sceneFactor", 2.0))
    return v


# ----------------------- theme orchestration ------------------------------ #
def _verify_record_for(name, snap_usd, snap_eur, image):
    """Run verify_price on an ad-hoc card-shaped dict and return a display record
    (same shape tg_send_preview/write_summary expect)."""
    rec = verify_price({"chase_usd": snap_usd, "chase_eur": snap_eur, "chase_image": image})
    rec["name"] = name
    return rec


def prepare_theme(theme, data_dir, base, names, snapshot, exclude, api_key):
    """The once-per-run heavy work for a rotation theme: select content (dedup-aware),
    cross-check displayed prices, AI-upscale where used, and run T3 vision/artist
    research. Returns a context dict consumed by build_theme_plan."""
    groups_path = data_dir / "connecting-art.resolved.json"
    if not groups_path.exists():
        groups_path = Path(__file__).parent / "connecting-art.resolved.json"

    if theme == "connected":
        facts = select_connected(snapshot, names, groups_path, exclude=exclude)
        if not facts:
            return None
        verify = []
        for it in facts["items"]:  # cross-check each displayed per-card value
            rec = _verify_record_for(it["name"], it["usd"], None, it["image"])
            if rec.get("display_usd"):
                it["usd"] = int(round(rec["display_usd"]))
            verify.append(rec)
        facts["total"] = sum(it["usd"] for it in facts["items"])  # keep total == sum of shown
        # AI-upscale each card to a MEDIUM 1500px (not 4096): the per-card slide shows it at
        # 612px and the native scans are tiny (Southern Islands = 600px → pixelated edges raw),
        # so 1500px makes the edges crisp; 1500px also stays light enough that the multi-image
        # cover/reveal slides don't 500 Satori (4096px×N OOMs it).
        for it in facts["items"]:
            it["hd_image"] = upscale_card(it["image"], max_w=1500)
        log(f"  connected upscaled {sum(1 for it in facts['items'] if it.get('hd_image'))}/{len(facts['items'])} cards (1500px)")
        return {"theme": theme, "base": base, "facts": facts, "verify": verify,
                "keys": [facts["key"]], "api_key": api_key}

    if theme == "ripkeep":
        facts = select_ripkeep(snapshot, names, data_dir, exclude=exclude)
        if not facts:
            return None
        verify = [_verify_record_for(c["name"], c["usd"], None, c["image"]) for c in facts["chase"]]
        for c, rec in zip(facts["chase"], verify):
            if rec.get("display_usd"):
                c["usd"] = int(round(rec["display_usd"]))
        # The ripkeep chase cards are modern TEXTURE full-arts (special-illustration / full-art). Real-
        # ESRGAN is built for ordinary illustration, so on these it MANGLES the holo/texture pattern AND
        # drops the alpha channel (cv2 IMREAD_COLOR) — the transparent rounded corners turn BLACK. The
        # original TCGdex "high" scan keeps the correct texture + rounded corners and is already crisp at
        # the ~300px slide display, so use it AS-IS, no upscale. (Low-res vintage cards still get the
        # ESRGAN treatment in the connected/grails themes where it genuinely helps.)
        for c in facts["chase"]:
            c["hd_image"] = None
        log("  ripkeep: using original chase scans (no ESRGAN — preserves holo texture + rounded corners)")
        return {"theme": theme, "base": base, "facts": facts, "verify": verify,
                "keys": [facts["key"]], "api_key": api_key}

    if theme == "grails":
        facts = select_grails(snapshot, names, exclude=exclude)
        if not facts:
            return None
        rec = _verify_record_for(facts["name"], facts["usd"], None, facts["image"])
        if rec.get("display_usd"):
            facts["usd"] = int(round(rec["display_usd"]))
        facts["artist"] = grail_artist(facts["card_id"])
        facts["hd_image"] = upscale_card(facts["image"])  # HD source for grail-zoom
        log(f"  grail upscale {facts['name']}: {'HD ✓' if facts['hd_image'] else 'native (no token/failed)'}")
        if facts.get("booster"):  # AI-upscale the booster pack too (THE ODDS slide art)
            facts["booster_hd"] = upscale_card(facts["booster"])
            log(f"  booster upscale: {'HD ✓' if facts.get('booster_hd') else 'native (no token/failed)'}")
        facts["vision"] = grail_vision_research(api_key, facts)
        facts["crops"] = compute_grail_crops(facts["image"])  # saliency-based framing
        return {"theme": theme, "base": base, "facts": facts, "verify": [rec],
                "keys": [facts["key"]], "api_key": api_key}

    return None


def compose_caption(caption, hashtags):
    """Fold the hashtags INTO the caption. Instagram only reliably renders tags that
    are part of the published media's caption — posting them as a first comment needs
    the instagram_business_manage_comments scope (which the Instagram-Login token may
    lack) and fails silently. Folding them in also makes them visible in the Telegram
    preview (which shows the caption) so the editor can actually see/approve them."""
    body = (caption or "").rstrip()
    tags = [t for t in (hashtags or []) if t]
    if not tags:
        return body
    return f"{body}\n\n{' '.join(tags)}"


# Hand-curated grail overrides — used when the AI vision step is unavailable (e.g. the
# Anthropic key is down) so a featured grail still gets TWO DISTINCT zoom regions + a UNIQUE
# shock headline, instead of the generic fallbacks (the "most people guess" headline repeats
# post-to-post, and compute_grail_crops collapses both zooms onto the SAME saliency blob —
# owner: "2 fois le même zoom au même endroit, à ne jamais faire"). Crop specs are
# (cx, cy, span) fed to _center_crop. Keyed by card_id. Applied LAST so it wins.
_GRAIL_OVERRIDES = {
    "ex15-100": {  # Charizard Gold Star δ — EX Dragon Frontiers (Delta Species; owner frames it as δ, NOT "shiny")
        # SHOCK headline = the PS5 MULTIPLE (owner: "à tant de dollars c'est plusieurs PS5").
        # Card market = $4,000 (cross-checked: TCGplayer market 2026/06/24); a PS5 ~$480-500 street,
        # so $4,000 buys MORE than 8 → "8 PlayStation 5s". Verified-cheaper, not a banned car/luxury.
        "shockHeadline": "Worth more than|8 PlayStation 5s",
        # Slides 3 & 4 are a PIXEL-PERFECT 2-panel PANORAMA: same zw, same zy, and zx differing by
        # EXACTLY 1080 (one slide width) → the illustration unrolls seamlessly across the swipe with
        # ZERO gap/offset (owner: "comme une seule image scindée en 2"). zy=-381 anchors the visible
        # band to card y[0.101, 0.46] = pure art (no title bar, no attack text). Panel L = x[0.08,0.48]
        # (flame + head), Panel R = x[0.48,0.88] (body + wings). Don't desync these two crops.
        "craftZoom": {"zw": 2700, "zx": -216, "zy": -381},   # SLIDE 3 — LEFT panel (flame side)
        "sceneZoom": {"zw": 2700, "zx": -1296, "zy": -381},  # SLIDE 4 — RIGHT panel (Charizard side), seam = L.zx - 1080
        "sceneHeadline": "A Delta Species Charizard",
        "sceneBody": "Black scales and Dragon typing,|a Delta Species recolour.",
        "craftKicker": "THE ARTIST",
        "craftHeadline": "Masakazu Fukuda",
        "craftBody": "His flame erupts past the border,|a hand-painted 3D depth effect.",
        # Caption frames it as a DELTA SPECIES (owner: don't call it "shiny", it's δ species).
        "caption": (
            "Most people wouldn't even recognise this as a Charizard.\n\n"
            "It's the Charizard Gold Star (Delta Species) from EX Dragon Frontiers, 2006: a Delta "
            "Species recolour with black scales and Dragon typing, and one of the most chased "
            "cards of the whole EX era.\n\n"
            "Around $4,000 for a single card, pulled roughly 1 in 143 packs.\n\n"
            "Rip for it, or keep it sealed? pokeev.com runs the live Expected Value on any set, so "
            "you know before you open it.\nlink in bio -> pokeev.com"
        ),
    },
}


def _fresh_brief(theme, api_key, facts):
    """First-preview brief, built from scratch (no editor feedback yet)."""
    if theme == "connected":
        return artdirect_connected(api_key, facts)
    if theme == "ripkeep":
        return artdirect_ripkeep(api_key, facts)
    if theme == "grails":
        brief = fallback_grail_brief(facts)
        if facts.get("vision"):  # fold vision research into the deterministic base
            v = facts["vision"]
            # Zoom #1 — THE ARTIST / THE CRAFT (illustrator name leads when known).
            if v.get("craftZoom"):
                brief["craftZoom"] = v["craftZoom"]
            if v.get("craftBody"):
                brief["craftBody"] = v["craftBody"]
            if facts.get("artist"):
                brief["craftKicker"] = "THE ARTIST"
                brief["craftHeadline"] = facts["artist"]
            elif v.get("craftHeadline"):
                brief["craftKicker"] = "THE CRAFT"
                brief["craftHeadline"] = v["craftHeadline"]
            # Zoom #2 — THE SCENE (the centred subject).
            if v.get("sceneZoom"):
                brief["sceneZoom"] = v["sceneZoom"]
            if v.get("sceneHeadline"):
                brief["sceneHeadline"] = v["sceneHeadline"]
            if v.get("sceneBody"):
                brief["sceneBody"] = v["sceneBody"]
            cmp_txt, cmp_usd = v.get("compare"), v.get("compareUsd")
            # Only use a money comparison that is VERIFIABLY cheaper (30% margin) — never let
            # the model flex the card against something pricier (it once said "a used Honda
            # Civic", which costs MORE than the card and is an off-brand car analogy).
            if cmp_txt and isinstance(cmp_usd, (int, float)) and 0 < cmp_usd < facts["usd"] * 0.7:
                brief["shockHeadline"] = f"Worth more than|{cmp_txt}"
        elif facts.get("artist"):
            brief["craftKicker"] = "THE ARTIST"
            brief["craftHeadline"] = facts["artist"]
        # SLIDES 3 & 4 = a SEAMLESS 2-PANEL PANORAMA of the card art (compute_grail_crops):
        # craft = LEFT panel, scene = RIGHT panel, pixel-perfect gap-free seam. This is set LAST
        # (after the vision copy above) and OVERRIDES any vision-suggested INDEPENDENT crops, so
        # the two panels can never desync — the illustration unrolls cleanly on EVERY T3. (The
        # vision step still drives the COPY: artist/scene headlines + bodies.) A curated per-card
        # panorama in _GRAIL_OVERRIDES wins below.
        crops = facts.get("crops")
        if crops:
            brief["craftZoom"] = crops["craft"]
            brief["sceneZoom"] = crops["scene"]
        # Hand-curated override (applied LAST so it beats fallback + saliency + vision): two
        # distinct zoom regions + a unique, non-repeating shock headline for known grails.
        ov = _GRAIL_OVERRIDES.get(facts.get("card_id"))
        if ov:
            for key, val in ov.items():
                if key in ("sceneZoom", "craftZoom"):
                    # tuple (cx,cy,span) → _center_crop; dict {zw,zx,zy} → exact crop (used for
                    # the pixel-perfect 2-panel PANORAMA, where the seam must be gap-free).
                    brief[key] = _center_crop(*val) if isinstance(val, tuple) else val
                else:
                    brief[key] = val
            log(f"  grail: applied hand-curated override for {facts.get('card_id')}")
        # Save-first AI caption (verified facts only); deterministic template stays as fallback.
        cap = grail_caption(api_key, facts, brief)
        if cap:
            brief["caption"] = cap
        return brief
    sys.exit(f"[pokeev-bot] unknown theme {theme}")


def _slides_for(theme, base, facts, brief):
    if theme == "connected":
        return slides_connected(base, facts, brief)
    if theme == "ripkeep":
        return slides_ripkeep(base, facts, brief)
    if theme == "grails":
        return slides_grails(base, facts, brief, hd_image=facts.get("hd_image"))
    sys.exit(f"[pokeev-bot] unknown theme {theme}")


def _slide_guide(theme, n_items=0):
    """Human map of slide number → which editable brief key(s) control it, so a revise note that
    refers to a slide BY NUMBER ('change the slide 5 title') resolves to the right field. Slides
    marked FIXED are hardcoded/data-driven and cannot be changed via copy edits."""
    if theme == "connected":
        n = n_items or 3
        return (
            "Slide 1 = COVER -> editable: eyebrow (small top line), headline (big title).\n"
            f"Slides 2 to {1 + n} = ONE PER CARD -> FIXED (card name + price; not editable here).\n"
            f"Slide {2 + n} = THE REVEAL (the full combined illustration of all the cards) -> editable: revealTitle (its title).\n"
            f"Slide {3 + n} = CTA (final 'open it or keep it sealed') -> FIXED."
        )
    if theme == "ripkeep":
        return (
            "Slide 1 = COVER -> editable: eyebrow.\n"
            "Slide 2 = 'you're chasing these' (the 3 chase cards) -> editable: the caption line shown under the cards.\n"
            "Slide 3 = THE SEALED PRICE (one big number) -> FIXED.\n"
            "Slide 4 = THE EXPECTED VALUE (one big number) -> FIXED.\n"
            "Slide 5 = THE FACE-OFF (sealed vs EV) -> FIXED.\n"
            "Slide 6 = THE VERDICT -> editable: verdictWord (RIP IT / KEEP IT), reason (the one-line why).\n"
            "Slide 7 = CTA -> FIXED."
        )
    if theme == "grails":
        return (
            "Slide 1 = THE SHOCK (price hook) -> editable: shockHeadline.\n"
            "Slide 2 = THE CARD -> editable: cardKicker, cardHeadline, cardBody.\n"
            "Slide 3 = THE ARTIST / CRAFT (art-detail zoom) -> editable: craftKicker, craftHeadline, craftBody.\n"
            "Slide 4 = THE SCENE (art-detail zoom) -> editable: sceneKicker, sceneHeadline, sceneBody.\n"
            "Slide 5 = THE ODDS -> editable: oddsBody.\n"
            "Slide 6 = CTA -> FIXED."
        )
    return ""


def patch_brief(api_key, prior_brief, feedback, theme=None, n_items=0):
    """SURGICAL revise. The editor rejected the post for ONE reason — apply only that
    change and leave every other field byte-identical, so untouched slides cannot drift.
    We send Claude the current copy and ask for ONLY the keys it must rewrite, then merge
    `{**prior_brief, **patch}`. Any key not returned is, by construction, unchanged. No
    key (or no api_key) -> the prior brief is returned verbatim."""
    if not api_key:
        log("  revise requested but no ANTHROPIC_API_KEY; keeping the post unchanged")
        return prior_brief
    # Expose only editable text/list copy — hide zoom-crop dicts, numbers, image URLs so
    # Claude can neither see nor accidentally rewrite the layout.
    editable = {k: v for k, v in prior_brief.items() if isinstance(v, (str, list))}
    guide = _slide_guide(theme, n_items)
    guide_block = (
        "The editor often refers to a slide BY NUMBER or position. Here is what each slide is and "
        "which of the keys above control it (keys not listed for a slide are FIXED and CANNOT be "
        "changed by a copy edit — if the editor asks to change a FIXED slide, return {} and do not "
        "guess a different key):\n" + guide + "\n\n"
        if guide else ""
    )
    prompt = (
        "You are making ONE small edit to an Instagram post the editor just rejected. "
        "Here is its current copy as JSON:\n"
        + json.dumps(editable, ensure_ascii=False, indent=2) + "\n\n"
        + guide_block
        + f"The editor wants exactly this, and nothing else:\n\"{feedback}\"\n\n"
        "Return a JSON object containing ONLY the keys you must change to satisfy that note, "
        "with their new values. Do NOT include any key you are leaving unchanged. Change as "
        "few keys as possible (ideally one). Keep every price, number, set/card name and the "
        "hashtag count exactly as they are.\n" + _CAPTION_RULES
    )
    try:
        patch = claude_json(api_key, prompt, system=voice())
    except Exception as exc:  # noqa: BLE001
        log(f"  revise patch failed ({exc}); keeping the post unchanged")
        return prior_brief
    if not isinstance(patch, dict):
        log("  revise returned no usable changes; keeping the post unchanged")
        return prior_brief
    # Only accept keys the brief already had — never invent fields, never touch crops.
    patch = {k: v for k, v in patch.items() if k in prior_brief and not isinstance(prior_brief[k], dict)}
    if "hashtags" in patch:
        patch["hashtags"] = _clean_hashtags(patch["hashtags"])
    if not patch:
        log("  revise produced no recognised changes; keeping the post unchanged")
        return prior_brief
    log("  revise changed ONLY: " + ", ".join(sorted(patch.keys())))
    return {**prior_brief, **patch}


_QA_CHECKLIST = (
    "QUALITY CHECKLIST — the post FAILS (fix it) if ANY is true:\n"
    "- Uses a banned hype word: insane, brutal, unhinged, wild, crazy, mind-blowing, 'brace'.\n"
    "- Contains an em-dash or en-dash anywhere (use periods / commas / ·).\n"
    "- A money comparison to a car/vehicle, house/apartment, rent, mortgage or salary, OR to "
    "anything not CLEARLY cheaper than the card's price.\n"
    "- shockHeadline contains a money/object comparison you have NOT verified is clearly cheaper "
    "than the card (watches, jewelry, 'a luxury <anything>' are AMBIGUOUS — treat as failing). If "
    "you cannot be certain it is cheaper, set shockHeadline to exactly: Worth more than|most people guess\n"
    "- Any FABRICATED or unverifiable claim about the art/card (e.g. eyes that 'follow you at any "
    "angle', a made-up PSA-10 population, invented lore). Describe ONLY what is visibly true.\n"
    "- Any headline/line that is CONFUSING or needs TCG-rules knowledge to understand, or reads as "
    "an obscure fact out of context (e.g. 'one allowed per deck'). Every line must be self-"
    "explanatory to a casual viewer; the SCENE title must plainly describe what the art shows.\n"
    "- The cover eyebrow repeats the slide's big title (e.g. duplicates 'rip or keep').\n"
    "- Any price, set name, card name or count that does NOT match the VERIFIED FACTS.\n"
    "- A single '|' clause in body copy so long it would not fit one line (keep each clause "
    "short, under ~36 characters).\n"
    "- Any body (cardBody, craftBody, sceneBody, oddsBody) longer than ~115 characters total — "
    "keep them punchy; a slide is a visual, not an essay (overlong bodies get cut off).\n"
    "- Copy that contradicts ANY standing owner preference.\n"
    "- Caption is not English, drops the 'link in bio -> pokeev.com' CTA, or never names pokeev.com.\n"
)


def self_review_brief(api_key, theme, facts, brief):
    """PRE-PREVIEW copy QA. Before the owner ever sees the post, the bot re-reads its OWN
    copy against the standing owner preferences (voice/style-notes) + a quality checklist
    and fixes any violation — so each post needs fewer manual revises (toward 'approve on
    the first try'). Copy-only (layout is enforced in code). Never raises; returns the brief
    unchanged on any error or when it already passes."""
    if not api_key:
        return brief
    editable = {k: v for k, v in brief.items() if isinstance(v, (str, list))}
    facts_view = {k: v for k, v in facts.items()
                  if isinstance(v, (str, int, float)) and not str(k).startswith("_")}
    prompt = (
        "You are the EDITOR-IN-CHIEF doing the FINAL QA pass on a finished Instagram post "
        "BEFORE it is shown to the owner. Catch anything the owner would ask to change and fix "
        f"it now. Theme: {theme}.\n\n"
        "POST COPY (JSON):\n" + json.dumps(editable, ensure_ascii=False, indent=2) + "\n\n"
        "VERIFIED FACTS — every number/name in the copy must match these EXACTLY:\n"
        + json.dumps(facts_view, ensure_ascii=False) + "\n\n"
        + _QA_CHECKLIST + "\n"
        "Output MUST be raw JSON and NOTHING else — no prose, no code fence. Give an object with "
        "ONLY the keys you must CHANGE to fix EVERY issue, corrected values, same keys/shape as the "
        "input copy. If the post already passes, output exactly: {}\n"
        "Change as few keys as possible; never alter a correct price/number/name. No em-dashes."
    )
    try:
        patch = claude_json(api_key, prompt, system=voice())
    except ValueError:  # not JSON (the reviewer answered prose/empty) = nothing to change
        log("  self-review (copy): post already clean ✓")
        return brief
    except Exception as exc:  # noqa: BLE001 — real API error; QA must never break a post
        log(f"  self-review (copy) skipped ({exc})")
        return brief
    if not isinstance(patch, dict) or not patch:
        log("  self-review (copy): post already clean ✓")
        return brief
    patch = {k: v for k, v in patch.items() if k in brief and not isinstance(brief[k], dict)}
    if "hashtags" in patch:
        patch["hashtags"] = _clean_hashtags(patch["hashtags"])
    if not patch:
        return brief
    log("  self-review (copy) auto-fixed: " + ", ".join(sorted(patch.keys())))
    return {**brief, **patch}


def self_review_visual(api_key, plan):
    """PRE-PREVIEW visual QA. Look at the RENDERED slides and report visible defects the
    owner would reject (clipped/overflowing text, a big blank area, a card/logo that didn't
    load, bad overlap, an off-brand/wrong number). Returns short '[slide N] problem' strings
    — copy defects are auto-fixed upstream; visual ones need a code fix, so we surface them
    to the owner + the logs. Best-effort: returns [] on any failure, never breaks the post."""
    if not api_key:
        return []
    try:
        imgs = [_download_bytes(u, timeout=90, tries=2) for u in plan_slides(plan)[:10]]
    except Exception as exc:  # noqa: BLE001
        log(f"  self-review (visual): couldn't fetch slides ({exc})")
        return []
    prompt = (
        "You are doing strict VISUAL QA on a finished Instagram carousel (the slides above, in "
        "order). Report ONLY real, visible defects a careful art director would REJECT:\n"
        "- text cut off or overflowing the frame edges\n"
        "- a large empty/blank area, or a missing image (blank box where art should be)\n"
        "- a card/logo that clearly did not load\n"
        "- text overlapping badly or unreadable\n"
        "- a price/word that looks wrong or off-brand\n"
        "Do NOT flag intentional minimalism, dark backgrounds or normal spacing. "
        'Return ONLY JSON: {"issues":[{"slide":N,"problem":"short description"}]} '
        "(empty list if every slide is clean)."
    )
    try:
        out = claude_vision_review(api_key, prompt, imgs, system=voice())
        issues = out.get("issues", []) if isinstance(out, dict) else []
    except Exception as exc:  # noqa: BLE001
        log(f"  self-review (visual) skipped ({exc})")
        return []
    warns = [f"slide {i.get('slide', '?')}: {i.get('problem', '?')}"
             for i in issues if isinstance(i, dict) and i.get("problem")]
    log("  self-review (visual): " + (" | ".join(warns) if warns else "all slides clean ✓"))
    return warns


def build_theme_plan(ctx, feedback=None, prior_brief=None):
    """Art-direct (Claude or fallback) + build the /api/ig slide URLs for the selected
    theme, re-host them on Blob, write plan.json, and return the flat plan. On a revise
    (feedback + the prior brief) it PATCHES only what the editor asked, never rebuilds."""
    theme = ctx["theme"]
    base = ctx["base"]
    facts = ctx["facts"]
    api_key = ctx["api_key"]

    fresh = not (feedback and prior_brief)
    if fresh:
        brief = _fresh_brief(theme, api_key, facts)
        brief = self_review_brief(api_key, theme, facts, brief)  # PRE-PREVIEW copy QA (auto-fix)
    else:
        brief = patch_brief(api_key, prior_brief, feedback, theme=theme, n_items=len(facts.get("items", []) or []))
    slides = _slides_for(theme, base, facts, brief)

    hosted = materialize_slides(slides)
    plan = {
        "date": datetime.now(timezone.utc).date().isoformat(),
        "theme": theme,
        "slides": hosted,
        "caption": compose_caption(brief["caption"], brief.get("hashtags")),
        "hashtags": brief.get("hashtags", []),
        "brief": brief,  # kept so the next revise can surgically patch THIS exact copy
        "keys": ctx["keys"],
        "verify": ctx["verify"],
    }
    # PRE-PREVIEW visual QA (fresh build only): flag any visible defect so the owner gets a
    # heads-up and I can code-fix it (copy defects were already auto-fixed above).
    if fresh:
        plan["qa_warnings"] = self_review_visual(api_key, plan)
    Path(env("PLAN_PATH", "plan.json")).write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
    log("CAPTION:\n" + plan["caption"])
    for u in hosted:
        log("  slide: " + u)
    write_summary(plan, plan["verify"])
    return plan


def prepare_rotation():
    """Pick today's rotated theme, load shared data, and run the heavy selection +
    verification once. Returns the theme context (or exits if nothing to post)."""
    data_dir = Path(env("POKEEV_DATA_DIR", "data"))
    base = env("POKEEV_IMAGE_BASE_URL", "https://pokeev.com")
    history_path = Path(env("HISTORY_PATH", "history.json"))
    api_key = env("ANTHROPIC_API_KEY")

    theme = pick_rotation_theme(history_path, override=env("POKEEV_THEME"))
    log(f"rotation theme: {theme}")
    snapshot = load_snapshot(data_dir)
    names = load_set_names(data_dir)
    exclude = recent_keys(history_path, theme)

    ctx = prepare_theme(theme, data_dir, base, names, snapshot, exclude, api_key)
    if ctx is None:  # fall through the wheel if this theme has nothing fresh
        for alt in ROTATION:
            if alt == theme:
                continue
            log(f"  no fresh content for {theme}; trying {alt}")
            ctx = prepare_theme(alt, data_dir, base, names, snapshot,
                                recent_keys(history_path, alt), api_key)
            if ctx is not None:
                break
    if ctx is None:
        sys.exit("[pokeev-bot] nothing to post after dedup across all themes")
    return ctx


def record_history(plan):
    history_path = Path(env("HISTORY_PATH", "history.json"))
    hist = _history_entries(history_path)
    entry = {"date": plan["date"], "theme": plan["theme"]}
    if plan.get("keys"):
        entry["keys"] = plan["keys"]
    # Keep the legacy `sets` field (still consumed by load_history) when present.
    if plan.get("sets"):
        entry["sets"] = plan["sets"]
    elif plan.get("keys"):
        entry["sets"] = plan["keys"]
    hist.append(entry)
    history_path.write_text(json.dumps(hist[-200:], indent=2), encoding="utf-8")
    log("updated history.json")


def already_posted_today(theme):
    """True if history already logged an entry for (today UTC, theme) — the durable
    idempotency key that stops a re-triggered evening tick (or a manual run after a
    successful auto-publish) from posting the same carousel twice."""
    history_path = Path(env("HISTORY_PATH", "history.json"))
    today = datetime.now(timezone.utc).date().isoformat()
    return any(e.get("date") == today and e.get("theme") == theme
               for e in _history_entries(history_path))


# ------------------------------- telegram gate ---------------------------- #
def tg_api(token, method, payload):
    import requests

    r = requests.post(f"https://api.telegram.org/bot{token}/{method}", json=payload, timeout=HTTP_TIMEOUT)
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(f"telegram {method}: {data}")
    return data["result"]


_ERR_NOTIFIED = False


def notify_error(text):
    """Best-effort Telegram alert for an unexpected failure, so the bot NEVER fails
    silently. Sets a flag so the top-level scheduled handler doesn't double-alert."""
    global _ERR_NOTIFIED
    _ERR_NOTIFIED = True
    tg_token, tg_chat = env("TELEGRAM_BOT_TOKEN"), env("TELEGRAM_CHAT_ID")
    if not (tg_token and tg_chat):
        return
    try:
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": text[:3500]})
    except Exception:  # noqa: BLE001
        pass


def _publish_error_hint(err):
    """Turn a raw Graph error into a plain next-step for the editor (token vs app block)."""
    e = (err or "").lower()
    if '"code":200' in e or "access blocked" in e:
        return ("This is code 200 (API ACCESS BLOCKED) = the Meta app is blocking publishing. "
                "Set the Meta app back to Development mode (or grant Advanced Access), then I retry.")
    if '"code":190' in e or "expired" in e or "invalid oauth" in e:
        return ("This is code 190 (TOKEN INVALID/EXPIRED) = regenerate a long-lived Instagram token "
                "and update the META_ACCESS_TOKEN GitHub secret.")
    return "Check the run logs. Your approval is KEPT, so a retry will publish once it's resolved."


def tg_send_video(token, chat_id, mp4_bytes, caption="", width=1080, height=1920):
    """Push the rendered Reel MP4 to Telegram as a playable video (bytes, not a URL — same
    reasoning as the slide preview: the bot fetches patiently, Telegram's short fetch can't).
    CRUCIAL: pass width/height (the 9:16 dimensions). Without them Telegram squeezes the tall
    video into its default wider preview box, so the editor sees a 'crushed' (écrasé) aspect even
    though the MP4 itself is a correct 1080×1920 — the published Instagram Reel is unaffected."""
    import requests

    r = requests.post(
        f"https://api.telegram.org/bot{token}/sendVideo",
        data={"chat_id": chat_id, "caption": caption[:1000], "supports_streaming": "true",
              "width": str(width), "height": str(height)},
        files={"video": ("reel.mp4", mp4_bytes, "video/mp4")},
        timeout=180,
    )
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(f"telegram sendVideo: {data}")


def _preview_keyboard(is_reel):
    """Decision buttons + a format toggle: a carousel preview offers 🎬 Reels; a reel preview
    offers 🖼 Carousel to switch back. The decision row is identical either way."""
    decisions = [{"text": "✅ Approve", "callback_data": "approve"},
                 {"text": "✏️ Revise", "callback_data": "revise"},
                 {"text": "🚫 Skip", "callback_data": "skip"}]
    toggle = ([{"text": "🖼 Carousel", "callback_data": "carousel"}] if is_reel
              else [{"text": "🎬 Reels", "callback_data": "reel"}])
    return {"inline_keyboard": [decisions, toggle]}


def tg_send_preview(token, chat_id, plan, buttons=True):
    import json as _json

    import requests

    table = "\n".join(
        f"• {v['name']}: snap {fmt_usd(v['snap_usd'])} / live {fmt_usd(v['live_usd'])} — {v['note']}"
        for v in plan.get("verify", [])
    )
    ntags = len(plan.get("hashtags") or [])

    # ---- REEL preview: send the rendered MP4 + a caption/decision message ----
    if plan.get("format") == "reel":
        data_bytes = None
        loc = plan.get("mp4_local")
        if loc and os.path.exists(loc):
            data_bytes = Path(loc).read_bytes()
        elif plan.get("video_url"):
            data_bytes = _download_bytes(plan["video_url"], timeout=120, tries=3)
        if not data_bytes:
            raise RuntimeError("reel preview: no MP4 bytes (no local file or video_url)")
        tg_send_video(token, chat_id, data_bytes, caption=f"🎬 REEL — {plan['theme'].upper()}")
        text = (f"🎬 PokeEV REEL — {plan['theme'].upper()} ({plan['date']})\n\n"
                f"PRICE CROSS-CHECK:\n{table}\n\nCAPTION ({ntags} hashtags folded in):\n"
                f"{plan['caption']}\n\nPublish this REEL?")
        payload = {"chat_id": chat_id, "text": text[:4000]}
        if buttons:
            payload["reply_markup"] = _preview_keyboard(True)
        tg_api(token, "sendMessage", payload)
        return

    # ---- CAROUSEL preview: upload the actual image bytes (multipart attach://) instead of
    # handing Telegram the slide URLs — Telegram's ~5s media-fetch timeout can't render an HD
    # slide in time, but the bot can download it patiently and push the bytes.
    urls = plan_slides(plan)[:10]
    media, files, skipped = [], {}, []
    for i, u in enumerate(urls):
        # Resilient: a single slide that won't render (e.g. a Satori 500) must NOT abort the
        # whole preview (it did on 2026-06-22 — one bad slide = no preview at all). Skip it,
        # warn, and send the rest, so the editor always gets a preview + a heads-up to fix.
        try:
            payload_bytes = _download_bytes(u, timeout=90, tries=3)
        except Exception as exc:  # noqa: BLE001
            skipped.append(i + 1)
            log(f"  preview: slide {i + 1} unavailable, skipping ({str(exc)[:140]})")
            continue
        name = f"p{i}"
        media.append({"type": "photo", "media": f"attach://{name}"})
        files[name] = (f"{name}.png", payload_bytes, "image/png")
    if len(media) < 2:
        raise RuntimeError(f"only {len(media)} slide(s) rendered — cannot send a preview")
    r = requests.post(
        f"https://api.telegram.org/bot{token}/sendMediaGroup",
        data={"chat_id": chat_id, "media": _json.dumps(media)},
        files=files, timeout=120,
    )
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(f"telegram sendMediaGroup: {data}")
    skip_note = f"\n\n⚠️ Slide(s) {skipped} failed to render and were skipped — needs a fix." if skipped else ""
    text = (f"🎴 PokeEV post — {plan['theme'].upper()} ({plan['date']})\n\n"
            f"PRICE CROSS-CHECK:\n{table}\n\nCAPTION ({ntags} hashtags folded in):\n"
            f"{plan['caption']}{skip_note}\n\nPublish this carousel?")
    payload = {"chat_id": chat_id, "text": text[:4000]}
    # Inline buttons: ✅ Approve / ✏️ Revise / 🚫 Skip + 🎬 Reels (render this theme as a Reel).
    # They work in BOTH the live `run` flow AND the async 2-phase flow — frequent poll ticks
    # (do_poll) answer the tap (stop the spinner) + confirm. Approve = post at 20:00; Revise =
    # the bot asks what to change; Skip = don't post today; Reels = re-render as a vertical Reel.
    if buttons:
        payload["reply_markup"] = _preview_keyboard(False)
    tg_api(token, "sendMessage", payload)


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
                data = cq.get("data")
                if data == "approve":
                    tg_api(token, "sendMessage", {"chat_id": chat_id, "text": "📤 Publishing…"})
                    return "approve", None
                if data in ("skip", "reject"):
                    tg_api(token, "sendMessage", {"chat_id": chat_id, "text": "🚫 Skipped — nothing posted today."})
                    return "cancel", None
                tg_api(token, "sendMessage", {"chat_id": chat_id,
                       "text": "✏️ What should change? Reply with your notes and I'll rework it — "
                               "or tap 🚫 Skip to skip today."})
                continue  # keep listening for the notes (✏️ Revise)
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
def do_diagnose():
    """Probe the Instagram access token so we can tell a TOKEN problem (regenerate it)
    from an APP-side block. publish already returns code 200 'API access blocked', which
    is an app permission/mode issue, NOT token validity — this confirms which."""
    token = env("META_ACCESS_TOKEN", required=True)
    out = []
    try:
        me = graph_get("me", {"fields": "user_id,username", "access_token": token})
        out.append(f"✓ token VALID — @{me.get('username', '?')} (user_id {me.get('user_id')}). The token is NOT the problem.")
    except Exception as e:  # noqa: BLE001
        out.append(f"✗ token INVALID/expired — regenerate a long-lived token. ({str(e)[:160]})")
    msg = ("🔧 IG diagnostic:\n" + "\n".join(out) +
           "\nPublishing returns code 200 'API access blocked' = the Meta APP is blocking "
           "the publish action (set it to Development mode, or grant Advanced Access).")
    log(msg)
    tg_token, tg_chat = env("TELEGRAM_BOT_TOKEN"), env("TELEGRAM_CHAT_ID")
    if tg_token and tg_chat:
        try:
            tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": msg})
        except Exception:  # noqa: BLE001
            pass


def do_run():
    """Rotation (T1→T2→T3) → Telegram gate with a revise loop → publish. The heavy
    work (select, price cross-check, upscale, T3 vision) runs once; only the creative
    brief + slides are regenerated when the editor asks for changes."""
    ctx = prepare_rotation()
    tg_token = env("TELEGRAM_BOT_TOKEN")
    tg_chat = env("TELEGRAM_CHAT_ID")
    plan = build_theme_plan(ctx)

    if not (tg_token and tg_chat):
        log("Telegram gate not configured (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID) — preview only, NOT posting.")
        return
    if os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes"):
        log("DRY_RUN — sending Telegram preview but skipping publish.")
        tg_send_preview(tg_token, tg_chat, plan)
        return

    qwarn = plan.get("qa_warnings") or []
    if qwarn:
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat,
               "text": "🔎 Auto-reviewed before sending — flagged to fix:\n" + "\n".join(f"• {w}" for w in qwarn)})
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
        append_style_note(feedback)  # learn: apply this correction to all future posts
        plan = build_theme_plan(ctx, feedback=feedback, prior_brief=plan.get("brief"))
    tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": "🚫 Too many revisions — stopping for today."})
    log("Max revisions reached — not posting.")


# -------------- scheduled 2-phase: noon preview / 20:00 publish ------------ #
# GitHub Actions can't wait 8h, so the day is split: at 12:00 Paris the bot builds
# the post + sends the Telegram preview + queues it (pending-post.json); the editor
# has until 20:00 to ✅ approve / reply with revise notes / 🚫 reject; at 20:00 Paris
# a second tick publishes ONLY if approved (opt-in — nothing posts without ✅).
PARIS_TZ = "Europe/Paris"


def paris_hour():
    """Hour in Europe/Paris, DST-correct (so 'noon'/'20:00' track French local time
    year-round even though GitHub cron is UTC). Falls back to UTC+2 if zoneinfo is
    somehow unavailable (it ships with the 3.11 runner)."""
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo(PARIS_TZ)).hour
    except Exception:  # noqa: BLE001
        return (datetime.now(timezone.utc).hour + 2) % 24


def _pending_path():
    return Path(env("PENDING_PATH", "pending-post.json"))


def write_pending(plan, ctx, tg_offset):
    """Persist today's built+previewed post so the 20:00 tick can publish it. The
    api_key is never written; the ctx is kept so a 20:00 revise can rebuild."""
    ctx2 = {k: v for k, v in ctx.items() if k != "api_key"}
    _pending_path().write_text(
        json.dumps({"date": plan["date"], "theme": plan["theme"], "tg_offset": tg_offset,
                    "plan": plan, "ctx": ctx2, "handled_seq": 0, "handled_format_seq": 0},
                   indent=2, ensure_ascii=False),
        encoding="utf-8")
    log("stored pending-post.json")


def read_pending():
    try:
        return json.loads(_pending_path().read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None


def clear_pending():
    p = _pending_path()
    if p.exists():
        p.unlink()
        log("cleared pending-post.json")


def mark_pending_acked(pending, decision):
    """Durably persist a decision into pending-post.json so an approval SURVIVES a
    Telegram-queue change or a failed publish + retry — the root cause of the lost post:
    a transient/altered read returned non-approve and the approved post was dropped."""
    pending["acked"] = decision
    try:
        _pending_path().write_text(json.dumps(pending, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError as exc:  # noqa: BLE001
        log(f"  could not persist acked decision ({exc})")


def tg_offset_now(token):
    """update_id+1 of the latest queued update, so the publish tick reads only the
    decisions the editor sends AFTER today's preview. UNUSED under the webhook flow
    (getUpdates is disabled once a webhook is set) — kept for the legacy `run` path."""
    try:
        seen = tg_api(token, "getUpdates", {"timeout": 0})
        return (seen[-1]["update_id"] + 1) if seen else 0
    except Exception:  # noqa: BLE001
        return 0


# ---- shared approval state on Vercel Blob (mirror of src/lib/ig/state.ts) ------------- #
# The Telegram WEBHOOK records the editor's decision the INSTANT they tap a button and the
# bot reads it here. This replaces getUpdates polling (a webhook disables getUpdates), and
# fixes the old bug where re-rendering a preview reset the update offset and dropped a tap.
_BLOB_STATE_PATH = "ig-state/state.json"
_BLOB_PLAN_PATH = "ig-state/plan.json"


def _blob_state_node(args):
    import subprocess

    here = Path(__file__).parent
    return subprocess.run(["node", str(here / "blob_state.mjs"), *args],
                          capture_output=True, text=True, timeout=60, cwd=str(here))


def set_webhook():
    """Register the Telegram webhook so taps are pushed to /api/tg instantly (this disables
    getUpdates — the bot now reads decisions from Blob, not polling). Idempotent."""
    token = env("TELEGRAM_BOT_TOKEN", required=True)
    secret = env("TELEGRAM_WEBHOOK_SECRET", required=True)
    base = env("POKEEV_IMAGE_BASE_URL", "https://pokeev.com").rstrip("/")
    url = f"{base}/api/tg"
    res = tg_api(token, "setWebhook", {
        "url": url,
        "secret_token": secret,
        "allowed_updates": ["callback_query", "message"],
        "drop_pending_updates": True,
    })
    info = tg_api(token, "getWebhookInfo", {})
    log(f"setWebhook -> {res}; now url={info.get('url')} pending={info.get('pending_update_count')}")
    return info


def blob_state_read():
    """Today's shared approval state dict (written by the webhook), or None."""
    try:
        r = _blob_state_node(["get", _BLOB_STATE_PATH])
        txt = (r.stdout or "").strip()
        return json.loads(txt) if txt else None
    except Exception as exc:  # noqa: BLE001
        log(f"  blob state read failed ({exc})")
        return None


def _blob_put_json(pathname, obj):
    import tempfile

    tmp = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)
            tmp = f.name
        r = _blob_state_node(["put", pathname, tmp])
        if r.returncode != 0:
            log(f"  blob put {pathname} failed: {(r.stderr or '')[:200]}")
            return None
        return (r.stdout or "").strip() or None
    except Exception as exc:  # noqa: BLE001
        log(f"  blob put {pathname} error ({exc})")
        return None
    finally:
        if tmp:
            Path(tmp).unlink(missing_ok=True)


def blob_state_write(state):
    return _blob_put_json(_BLOB_STATE_PATH, state)


def blob_plan_write(plan):
    """Publish-minimal plan so the webhook can publish directly in the evening. A reel plan
    also carries the video_url + cover_url so the webhook can publish the Reel without Remotion."""
    payload = {"date": plan["date"], "theme": plan["theme"],
               "slides": plan_slides(plan), "caption": plan["caption"]}
    if plan.get("format") == "reel":
        payload["format"] = "reel"
        payload["video_url"] = plan.get("video_url")
        payload["cover_url"] = plan.get("cover_url")
    return _blob_put_json(_BLOB_PLAN_PATH, payload)


def blob_state_fresh(prev):
    today = datetime.now(timezone.utc).date().isoformat()
    if prev and prev.get("date") == today:
        return dict(prev)
    return {"date": today, "decision": "none", "note": None, "seq": 0,
            "published": False, "awaiting_revise": False,
            "format": "carousel", "format_seq": 0,
            "ts": datetime.now(timezone.utc).isoformat()}


def reconcile_published(pending):
    """If the WEBHOOK already published today's carousel (Blob state.published == True),
    do the repo-side bookkeeping the webhook can't: record history (so theme rotation stays
    correct) and clear the pending post. Idempotent. Returns True if it reconciled."""
    if not pending:
        return False
    st = blob_state_read()
    if not (st and st.get("published") and st.get("date") == pending.get("date")):
        return False
    if not already_posted_today(pending.get("theme", "")):
        record_history(pending["plan"])
        log("reconciled: webhook published — recorded history")
    clear_pending()
    return True


def latest_decision(token, chat_id, offset):
    """Scan updates since `offset`; return the LAST clear intent as
    ('approve'|'skip'|'revise'|'none', notes). Acks any button taps."""
    try:
        updates = tg_api(token, "getUpdates", {"offset": offset, "timeout": 0})
    except Exception:  # noqa: BLE001
        return "none", None
    decision, notes = "none", None
    for u in updates:
        cq = u.get("callback_query")
        if cq and str(cq["message"]["chat"]["id"]) == str(chat_id):
            try:
                tg_api(token, "answerCallbackQuery", {"callback_query_id": cq["id"], "text": "Got it ✓"})
            except Exception:  # noqa: BLE001
                pass
            data = cq.get("data")
            if data == "approve":
                decision, notes = "approve", None
            elif data in ("skip", "reject"):  # "reject" kept for any old button still queued
                decision, notes = "skip", None
            elif data == "revise":
                decision, notes = "revise", None  # button tap, no notes yet -> bot will ask
            continue
        msg = u.get("message")
        if msg and str(msg.get("chat", {}).get("id")) == str(chat_id):
            txt = (msg.get("text") or "").strip()
            if not txt or txt.startswith("/"):
                continue
            low = txt.lower()
            if low in ("skip", "cancel", "stop", "no", "non"):
                decision, notes = "skip", None
            elif low in ("ok", "okay", "approve", "yes", "go", "post", "oui", "ok thanks", "✅"):
                decision, notes = "approve", None
            elif not _is_creative_note(txt):
                # A question / status-check / chatter ("did you publish?") is NOT a decision.
                # Keep whatever was decided before it (e.g. an earlier "ok" stays an approve)
                # so a casual message can never silently drop an approved post.
                continue
            else:
                decision, notes = "revise", txt
    return decision, notes


def do_prepare():
    """12:00 Paris — build the rotated post, send the Telegram preview, queue it.
    Nothing posts now; the 20:00 tick publishes it only on an explicit approval."""
    ctx = prepare_rotation()
    plan = build_theme_plan(ctx)
    tg_token = env("TELEGRAM_BOT_TOKEN")
    tg_chat = env("TELEGRAM_CHAT_ID")
    if not (tg_token and tg_chat):
        log("Telegram gate not configured — built the post but cannot preview/queue it.")
        return
    tg_send_preview(tg_token, tg_chat, plan, buttons=True)
    write_pending(plan, ctx, 0)
    # Webhook flow: publish the plan + a fresh "none" decision to Blob. The webhook reads
    # the plan to publish in the evening and writes the editor's decision back here.
    blob_plan_write(plan)
    # Preserve a SAME-DAY decision/format the webhook may have already recorded (e.g. an early 🎬
    # tap on a lingering preview) — only a NEW day resets to a fresh carousel state. blob_state_fresh
    # returns the prior dict unchanged when its date is today, else a fresh one.
    blob_state_write(blob_state_fresh(blob_state_read()))
    # Early warning: probe the IG token NOW (morning) so a dead/expired token is flagged
    # with hours to fix it, instead of only surfacing as a failed publish at 20:00.
    warn = ""
    if not token_ok(env("META_ACCESS_TOKEN")):
        warn = ("\n\n⚠️ Heads-up: the Instagram token looks INVALID right now, so tonight's "
                "20:00 publish would fail. Regenerate the token / set the Meta app to "
                "Development mode before 20:00.")
    # Surface the pre-preview auto-review: the copy was already self-corrected; any visual
    # defect the vision pass flagged is shown so you know I'll code-fix it.
    qwarn = plan.get("qa_warnings") or []
    qa = ("\n\n🔎 Auto-reviewed before sending — flagged to fix:\n"
          + "\n".join(f"• {w}" for w in qwarn)) if qwarn else "\n\n🔎 Auto-reviewed before sending — looks clean."
    tg_api(tg_token, "sendMessage", {"chat_id": tg_chat,
           "text": "🕛 Today's preview is ready. Tap a button — it responds INSTANTLY now, "
                   "everything is handled here in Telegram:\n"
                   "• ✅ Approve — posts the carousel at 20:00 Paris (or right away if it's already evening)\n"
                   "• ✏️ Revise — I ask what to change, then rework it (and learn it for next time)\n"
                   "• 🚫 Skip — nothing today\n"
                   "• 🎬 Reels — render THIS theme as a vertical Reel instead, then approve to publish it as a Reel\n"
                   "(You can also just reply ok / skip / your changes.) Nothing posts without your ok." + qa + warn})


def _maybe_rework(pending, st, tg_token, tg_chat):
    """If Blob state carries a NEW revise note (seq beyond the last one we handled), rework
    the post, re-preview WITH buttons, refresh the Blob plan, and reset the decision to none
    so the editor re-approves the new version. Returns True if it reworked (caller stops)."""
    if not (st and st.get("decision") == "revise" and st.get("note")):
        return False
    if st.get("seq", 0) <= pending.get("handled_seq", 0):
        return False
    note = st["note"]
    append_style_note(note)  # learn: apply this correction to all future posts
    tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": "🔄 Reworking with your notes…"})
    ctx = pending.get("ctx") or {}
    ctx["api_key"] = env("ANTHROPIC_API_KEY")
    plan = pending["plan"]
    try:
        plan = build_theme_plan(ctx, feedback=note, prior_brief=plan.get("brief"))
    except Exception as exc:  # noqa: BLE001
        log(f"revise rebuild failed ({exc}); keeping the previous plan")
    try:
        tg_send_preview(tg_token, tg_chat, plan, buttons=True)
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat,
               "text": "🔄 Reworked — review the new version above and tap ✅ Approve "
                       "(or ✏️ Revise again / 🚫 Skip)."})
    except Exception as exc:  # noqa: BLE001
        log(f"re-preview send failed ({exc})")
    pending["plan"] = plan
    pending["handled_seq"] = st.get("seq", 0)
    pending.pop("acked", None)
    _save_pending(pending)
    blob_plan_write(plan)
    blob_state_write({**st, "decision": "none", "note": None, "awaiting_revise": False,
                      "published": False, "ts": datetime.now(timezone.utc).isoformat()})
    log("reworked + re-previewed from blob revise note")
    return True


def _maybe_switch_format(pending, st, tg_token, tg_chat):
    """If Blob state carries a NEW format toggle (format_seq beyond the last handled), rebuild
    today's post in the requested format — 🎬 render it as a Reel, or 🖼 switch back to the
    carousel — re-preview WITH buttons, refresh the Blob plan, and reset the decision to none
    so the editor re-approves the new version. Returns True if it switched (caller stops)."""
    if not st:
        return False
    seq = st.get("format_seq", 0)
    if seq <= pending.get("handled_format_seq", 0):
        return False
    desired = st.get("format", "carousel")
    plan = pending["plan"]
    current = "reel" if plan.get("format") == "reel" else "carousel"
    if desired == current:  # already in the requested format — just ack the seq
        pending["handled_format_seq"] = seq
        _save_pending(pending)
        return False
    if desired == "reel":
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat,
               "text": "🎬 Rendering your Reel… this takes ~2-3 min, a fresh preview lands here."})
        ctx = pending.get("ctx") or {}
        ctx["api_key"] = env("ANTHROPIC_API_KEY")
        try:
            plan = build_reel(plan, ctx)
        except Exception as exc:  # noqa: BLE001 — a render failure must not drop the post
            notify_error("⚠️ Couldn't render the Reel:\n" + str(exc)[:300] +
                         "\n\nStaying on the carousel — tap ✅ Approve to post it, or 🎬 to retry the Reel.")
            # Revert to a CONSISTENT carousel state so the editor is never stuck: the plan stays the
            # carousel AND Blob state/plan are reset to carousel, so ✅ Approve posts the carousel and a
            # fresh 🎬 tap retries the render. (Without resetting state.format the publish guard would
            # see format=reel with no rendered video and refuse to post anything.)
            plan = carousel_plan_of(plan)
            pending["plan"] = plan
            pending["handled_format_seq"] = seq
            pending.pop("acked", None)
            _save_pending(pending)
            blob_plan_write(plan)
            blob_state_write({**st, "format": "carousel", "decision": "none", "note": None,
                              "awaiting_revise": False, "published": False,
                              "ts": datetime.now(timezone.utc).isoformat()})
            return True
    else:  # back to the carousel — no rebuild, just drop the reel-only fields
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": "🖼 Back to the carousel."})
        plan = carousel_plan_of(plan)
    try:
        tg_send_preview(tg_token, tg_chat, plan, buttons=True)
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat,
               "text": ("🎬 Reviewed above — tap ✅ Approve to publish this Reel "
                        "(or ✏️ Revise / 🚫 Skip / 🖼 Carousel)." if plan.get("format") == "reel"
                        else "🖼 Back to the carousel — tap ✅ Approve, ✏️ Revise, 🚫 Skip or 🎬 Reels.")})
    except Exception as exc:  # noqa: BLE001
        log(f"format-switch re-preview failed ({exc})")
    pending["plan"] = plan
    pending["handled_format_seq"] = seq
    pending.pop("acked", None)
    _save_pending(pending)
    blob_plan_write(plan)
    blob_state_write({**st, "decision": "none", "note": None, "awaiting_revise": False,
                      "published": False, "ts": datetime.now(timezone.utc).isoformat()})
    log(f"switched format to {desired} + re-previewed")
    return True


def do_publish_pending(final=True):
    """Evening — publish today's pending post ONLY if approved. The decision is read from
    shared Blob state (written instantly by the Telegram webhook), not getUpdates. A late
    revise reworks + re-previews. `final=False` keeps the pending post for a later tick;
    only the last tick of the window gives up and clears."""
    pending = read_pending()
    today = datetime.now(timezone.utc).date().isoformat()
    if not pending or pending.get("date") != today:
        log("no pending post for today — nothing to publish")
        return
    tg_token = env("TELEGRAM_BOT_TOKEN")
    tg_chat = env("TELEGRAM_CHAT_ID")
    if not (tg_token and tg_chat):
        log("Telegram not configured — cannot read approval; not posting.")
        return
    # The webhook may have already published directly (evening approve) — just do the
    # repo bookkeeping (history for rotation) and stop.
    if reconcile_published(pending):
        return
    st = blob_state_read() or blob_state_fresh(None)
    if _maybe_switch_format(pending, st, tg_token, tg_chat):
        return
    if _maybe_rework(pending, st, tg_token, tg_chat):
        return
    decision = st.get("decision", "none")
    plan = pending["plan"]

    if decision == "approve":
        # Idempotency: never post twice (webhook may have published; or a re-triggered tick).
        if st.get("published") or already_posted_today(plan["theme"]):
            log("already posted today — not publishing again")
            blob_state_write({**st, "published": True, "ts": datetime.now(timezone.utc).isoformat()})
            clear_pending()
            return
        # Close the publish-vs-toggle race: the WEBHOOK (a separate Vercel process) may have flipped
        # the format or withdrawn the approval AFTER we read `st` above. Re-read right before posting
        # and defer to the next tick if anything material changed, so we never publish the wrong
        # format or a withdrawn post. (_maybe_switch_format on the next tick rebuilds + re-previews.)
        st2 = blob_state_read() or st
        if (st2.get("format_seq", 0) != st.get("format_seq", 0)
                or st2.get("seq", 0) != st.get("seq", 0)
                or st2.get("decision") != "approve"):
            log("state changed during the publish decision — deferring to the next tick")
            return
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": "📤 Approved — publishing now…"})
        try:
            publish_to_instagram(plan)
        except Exception as exc:  # noqa: BLE001
            # Never fail SILENTLY: tell the editor + KEEP the pending post (no clear) so a
            # later tick or manual retry can publish it once the issue is fixed.
            short = str(exc)[:280]
            notify_error("⚠️ Couldn't publish — Instagram refused the post:\n" + short +
                         "\n\n" + _publish_error_hint(short) +
                         "\n\nYour approval is KEPT — I retry automatically on the next tick.")
            raise
        blob_state_write({**st, "published": True, "ts": datetime.now(timezone.utc).isoformat()})
        record_history(plan)
        clear_pending()
        return
    if decision == "skip":
        # The webhook already confirmed the skip to the editor — just clear quietly.
        clear_pending()
        log("skip recorded by webhook — cleared pending")
        return
    # No decision yet. Only give up + clear on the LAST evening tick; otherwise keep the
    # pending post so a later tick (or a late approval) can still publish it.
    if final:
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": "⌛️ No ✅ approval today — nothing posted."})
        clear_pending()
    else:
        log("no ✅ approval yet — keeping the pending post for a later evening tick")


def do_evening_publish():
    """RELIABLE, DST-PROOF evening publish. The evening Vercel cron fires at a FIXED 17:00 UTC;
    this WAITS until the Paris publish window opens (>=20:00) then publishes. The 17:00 fire is
    deliberate: Vercel Hobby crons only fire "within the hour" of the slot, so a 17:00 slot lands
    in [17:00,18:00) UTC = 19:00-20:00 Paris (summer) / 18:00-19:00 Paris (winter) — ALWAYS before
    20:00 — and the wait-loop below then publishes PRECISELY at 20:00 in both seasons. (The old
    18:00 fire landed at 20:00-21:00 Paris in summer, AFTER the window, so the wait couldn't help
    and it posted late/never — the recurring "20h et pas posté" bug.) Cap = 9000s/150min so the
    winter worst case (fire at 18:00 Paris → 2h wait) still reaches 20:00; the GitHub job timeout
    (175 min) covers it. The safety guard NEVER posts before 20:00 even on a wild mis-fire."""
    waited = 0
    while paris_hour() < 20 and waited < 9000:  # up to 150 min — covers the winter 2h offset from a 17:00 UTC fire
        log(f"evening-publish: Paris {paris_hour()}h — waiting for the 20:00 window…")
        time.sleep(300)
        waited += 300
    if paris_hour() >= 20:
        do_publish_pending(final=False)
    else:  # safety: a mis-fire far from 20:00 must NEVER post before the owner's window
        log("evening-publish: still before 20:00 after the wait cap — NOT publishing (safety)")


def _save_pending(pending):
    _pending_path().write_text(json.dumps(pending, indent=2, ensure_ascii=False), encoding="utf-8")


def do_poll():
    """Through the day — the WEBHOOK already handled the editor's tap instantly (feedback +
    Blob state). This tick does the heavy Python work the webhook can't: if a revise note
    was recorded, rework + re-preview. Approve is published by the 20:00 evening tick; skip
    just clears the pending. Never publishes here."""
    pending = read_pending()
    today = datetime.now(timezone.utc).date().isoformat()
    if not pending or pending.get("date") != today:
        return
    tg_token = env("TELEGRAM_BOT_TOKEN")
    tg_chat = env("TELEGRAM_CHAT_ID")
    if not (tg_token and tg_chat):
        return
    if reconcile_published(pending):  # webhook published already (rare in daytime) — bookkeep
        return
    st = blob_state_read()
    if not st or st.get("date") != today:
        return
    if _maybe_switch_format(pending, st, tg_token, tg_chat):
        return
    if _maybe_rework(pending, st, tg_token, tg_chat):
        return
    if st.get("decision") == "skip":
        # The webhook already confirmed the skip — clear quietly so the evening does nothing.
        clear_pending()
        log("poll: skip recorded by webhook — cleared pending")


def do_scheduled():
    """Routed by Paris local time, but DELAY-TOLERANT. GitHub Actions fires scheduled
    crons late and sometimes skips them, so an exact-hour gate (h==12) would miss the
    noon preview whenever a run drifts past the hour. Instead we use WINDOWS + idempotency:
      - PREPARE once in the MORNING window (08:00-12:59 Paris) if today isn't prepared
        yet (guarded by pending-post.json's date), so the editor gets the preview in the
        morning (by ~13:00) with the whole day to review — sent exactly once.
      - PUBLISH only in the EVENING from 20:00 (20:00-23:59 Paris). The window starts at
        20:00 so an approval given earlier in the day is NEVER posted before 20:00; the
        first evening tick (≈20:00) with an approval posts. do_publish_pending no-ops
        without an approval and keeps the pending post until the last tick (>=23:00).
    The cron lists several UTC candidates per window (both DST seasons) so a skipped or
    delayed GitHub firing is covered by the next one."""
    h = paris_hour()
    today = datetime.now(timezone.utc).date().isoformat()
    pending = read_pending()
    # If the webhook published directly (any hour), reconcile the repo bookkeeping first so
    # theme rotation stays correct and we don't act on a stale pending.
    if pending and reconcile_published(pending):
        pending = None
    prepared_today = bool(pending and pending.get("date") == today)
    log(f"scheduled tick — Paris hour {h}, prepared_today={prepared_today}")
    try:
        if 8 <= h < 13:
            if prepared_today:
                do_poll()  # morning preview already sent — handle button taps / replies
            else:
                do_prepare()
        elif 13 <= h < 20:
            do_poll()  # handle button taps / replies (approve, revise, skip) + confirm
        elif 20 <= h < 24:
            do_publish_pending(final=h >= 23)
        else:
            log(f"Paris hour {h} outside the prepare (08-12) / poll (13-19) / publish (20-23) windows — exiting.")
    except Exception as exc:  # noqa: BLE001 — the bot must NEVER fail silently
        # do_publish_pending already sends a tailored publish-failure alert (and sets the
        # flag); for any OTHER crash, tell the editor here so a broken tick is never silent.
        if not _ERR_NOTIFIED:
            notify_error(f"⚠️ Bot tick crashed (Paris {h}h): {str(exc)[:300]}\n"
                         "Check the GitHub Action logs. I'll try again on the next scheduled tick.")
        raise


def do_reel_test():
    """One-off QA: render ALL THREE themes as Reels and send them to Telegram for review.
    No approval gate, no publish, no history — purely a visual check of the three reel comps."""
    data_dir = Path(env("POKEEV_DATA_DIR", "data"))
    base = env("POKEEV_IMAGE_BASE_URL", "https://pokeev.com")
    api_key = env("ANTHROPIC_API_KEY")
    tg_token, tg_chat = env("TELEGRAM_BOT_TOKEN"), env("TELEGRAM_CHAT_ID")
    snapshot = load_snapshot(data_dir)
    names = load_set_names(data_dir)
    today = datetime.now(timezone.utc).date().isoformat()
    # Optional single-theme filter (POKEEV_REEL_ONLY=connected|ripkeep|grails) so a theme-by-theme
    # review round re-renders ONLY the theme being iterated — blank = all three.
    only = env("POKEEV_REEL_ONLY", "").strip().lower()
    themes = [only] if only in ROTATION else ROTATION
    if tg_token and tg_chat:
        label = themes[0].upper() if len(themes) == 1 else "T1/T2/T3"
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat,
               "text": f"🧪 REEL TEST — rendering {label} as Reel(s) for review. NOTHING will be "
                       "published; just reply with your feedback on each."})
    for theme in themes:
        try:
            ctx = prepare_theme(theme, data_dir, base, names, snapshot, set(), api_key)
            if not ctx:
                log(f"reel-test: no content for {theme}")
                if tg_token and tg_chat:
                    tg_api(tg_token, "sendMessage", {"chat_id": tg_chat,
                           "text": f"⚠️ {theme.upper()}: no fresh content to render."})
                continue
            facts = ctx["facts"]
            brief = _fresh_brief(theme, api_key, facts)
            caption = compose_caption(brief["caption"], brief.get("hashtags"))
            plan = {"date": today, "theme": theme, "brief": brief, "caption": caption,
                    "slides": [], "hashtags": brief.get("hashtags", []), "verify": ctx["verify"]}
            reel_plan = build_reel(plan, ctx)
            if tg_token and tg_chat:
                loc = reel_plan.get("mp4_local")
                data_bytes = (Path(loc).read_bytes() if loc and os.path.exists(loc)
                              else _download_bytes(reel_plan["video_url"], timeout=120, tries=3))
                tg_send_video(tg_token, tg_chat, data_bytes, caption=f"🧪 TEST REEL — {theme.upper()}")
                table = "\n".join(
                    f"• {v['name']}: snap {fmt_usd(v['snap_usd'])} / live {fmt_usd(v['live_usd'])} — {v['note']}"
                    for v in ctx.get("verify", []))
                tg_api(tg_token, "sendMessage", {"chat_id": tg_chat,
                       "text": f"⬆️ {theme.upper()} — price check:\n{table}\n\nCaption:\n{caption[:1200]}"})
        except Exception as exc:  # noqa: BLE001 — one theme failing must not abort the others
            log(f"reel-test {theme} failed: {exc}")
            if tg_token and tg_chat:
                notify_error(f"⚠️ reel-test {theme} failed: {str(exc)[:300]}")
    if tg_token and tg_chat:
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat,
               "text": "🧪 Reel test done — the 3 Reels are above. Reply with your feedback per "
                       "theme (nothing was published)."})


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "scheduled"
    if cmd == "plan":
        build_theme_plan(prepare_rotation())
    elif cmd == "publish":  # manual fallback: post the last plan.json
        publish_to_instagram(json.loads(Path(env("PLAN_PATH", "plan.json")).read_text(encoding="utf-8")))
    elif cmd == "prepare":
        do_prepare()
    elif cmd in ("ack", "poll"):  # handle button taps / replies on today's pending preview
        do_poll()
    elif cmd == "diagnose":  # probe the IG token vs app-side block
        do_diagnose()
    elif cmd == "publish-pending":
        do_publish_pending()
    elif cmd == "evening":  # reliable DST-proof evening publish (waits for 20:00 Paris, then posts)
        do_evening_publish()
    elif cmd == "set-webhook":  # register the Telegram webhook (instant button handling)
        set_webhook()
    elif cmd == "run":  # legacy single-shot: build + gate + publish in one go
        do_run()
    elif cmd == "reel-test":  # one-off QA: render all 3 themes as Reels, send to Telegram, no publish
        do_reel_test()
    else:  # default (cron) = the Paris-time-routed 2-phase flow
        do_scheduled()


if __name__ == "__main__":
    main()
