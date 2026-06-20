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
    text = (f"✅ Published to @pokeev.tcg — {plan['theme'].upper()} ({plan['date']})\n"
            f"{len(plan_slides(plan))} slides, {ntags} hashtags.{link}\n\n"
            "🔁 To add it to your story with a tappable post sticker, open the post and "
            "tap Share -> Add to story (app-only; the API can't do this).")
    try:
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": text})
    except Exception as exc:  # noqa: BLE001
        log(f"  publish-confirm message failed ({exc})")


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


def _clean_hashtags(tags, lo=24, hi=30):
    """Normalize, de-dup (case-insensitive), strip em-dashes, cap length. The caller's
    post-specific tags lead; a deep, INTERNATIONAL-reach core pads the tail so every
    post ships a full 24-30 layered block even when Claude/fallback under-delivers.
    Core layers: high-volume global, broad collector/TCG, active community, regional."""
    core = [
        # high-volume global
        "#pokemon", "#pokemontcg", "#pokemoncards", "#pokemoncollector", "#tcg",
        "#pokemoncommunity", "#pokemoncardcollection", "#pokemoncollection",
        # broad collector / TCG
        "#tcgcollector", "#pokemoncardgame", "#tradingcards", "#tradingcardgame",
        "#cardcollector", "#tcgcommunity", "#pokemoncardcollector", "#pokemontcgcollector",
        # active community / discovery
        "#pokemonfan", "#pokemontcgcards", "#pokemontcgcommunity", "#pokemoncollectors",
        "#pokemonpulls", "#pokemonsealed", "#pullrate", "#pokemoninvesting", "#pokemoninvestment",
        # international / regional reach
        "#pokemonuk", "#pokemoneurope", "#pokemonusa", "#pokemonjapan", "#pokemoncardsuk",
        "#pokemontcgeurope", "#tcgplayer", "#pokemonmaster", "#pokemontcgjapan", "#cardgames"]
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


def append_style_note(feedback):
    """Persist an owner revise note as a STANDING preference so every FUTURE post
    applies it too — this is how the bot learns from feedback. De-duped; best-effort."""
    note = " ".join((feedback or "").split())
    if len(note) < 4:
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
    "The caption is ENGLISH ONLY and flows: hook line, then substance, then an "
    "engagement nudge, then a 'link in bio -> pokeev.com' CTA. Name pokeev.com at "
    "least twice. No hashtags inside the caption. No em-dashes or en-dashes."
)

# Shared hashtag brief — every post must maximize INTERNATIONAL discoverability.
_HASHTAG_RULES = (
    "HASHTAGS — engineer for MAXIMUM INTERNATIONAL REACH. Audience: global "
    "English-speaking Pokemon TCG collectors and investors (mostly US, UK, EU, plus "
    "international). Return 24-30 UNIQUE English hashtags, NO fixed block, layered as:\n"
    "  1) high-VOLUME global core: #pokemon #pokemontcg #pokemoncards #pokemoncollector "
    "#tcg #pokemoncommunity;\n"
    "  2) broad collector/TCG tags: #tcgcollector #pokemoncardgame #tradingcards "
    "#cardcollector #pokemoninvesting;\n"
    "  3) currently-ACTIVE community/discovery tags collectors browse and search;\n"
    "  4) INTERNATIONAL/regional reach tags (e.g. #pokemonuk #pokemoneurope #pokemonusa "
    "#pokemonjapan) so the post surfaces beyond one country;\n"
    "  5) POST-SPECIFIC tags built from this post: the set, the Pokemon name(s), the card, "
    "the rarity, and the artist when known.\n"
    "No banned/spammy/irrelevant tags. No em-dashes. Each tag unique and lowercase."
)


def _no_dash(s):
    """Strip em/en-dashes from any data-derived copy (source data uses them; the
    brand voice forbids them). Collapses to a clean separator."""
    if not s:
        return s
    return re.sub(r"\s*[—–]\s*", " · ", str(s)).strip()


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
            f"Line them up and {artist}'s artwork becomes a single panorama, scattered across the set.\n\n"
            f"Which piece is your favorite? Tell us below.\n\n"
            "pokeev.com prices every card live, so you always know what a set is really worth.\n"
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


def slides_connected(base, facts, brief):
    """Port of /tmp/render_connect.py: connect-cover, one connect per card,
    connect-reveal, connect-cta. img/v params are 0-indexed (img0..)."""
    base = base.rstrip("/")
    H = f"{base}/api/ig"
    items = facts["items"]
    total_str = fmt_usd(facts["total"])
    set_lbl = facts["setLabel"]
    logo = _png(facts["setLogo"])
    imgparams = "".join(f"&img{i}={q(_png(it['image']))}" for i, it in enumerate(items))
    valparams = "".join(f"&v{i}={q(fmt_usd(it['usd']))}" for i, it in enumerate(items))

    cover = (f"{H}?slide=connect-cover"
             f"&eyebrow={q(brief['eyebrow'])}&headline={q(brief['headline'])}"
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
        u = (f"{H}?slide=connect&img0={q(_png(it['image']))}&name={q(it['name'])}&val={q(fmt_usd(it['usd']))}"
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
        top3 = sorted(cards, key=lambda c: c.get("usd") or 0, reverse=True)[:3]
        gap = abs(sealed - open_ev)
        rel_gap = gap / sealed if sealed else 1.0
        rows.append({
            "key": sid,
            "set_id": sid,
            "set_name": set_display_name(names, sid, s.get("episodeId")),
            "logo": s.get("logo"),
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
            f"{hook}\n\n{sub}\n\n"
            f"That gap is {gap}. Rip or keep is never a vibe, it is a number.\n\n"
            "Would you crack it or keep it sealed? Tell us below.\n\n"
            "pokeev.com runs the live Expected Value on every sealed set, so you never rip blind.\n"
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
        tempt += f"&img{i}={q(_png(c['image']))}&v{i}={q(fmt_usd(c['usd']))}"
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


def _booster_image(snapshot_set):
    for s in snapshot_set.get("sealed") or []:
        if s.get("kind") == "booster" and s.get("image"):
            return s["image"]
    return None


def select_grails(snapshot, names, exclude=None):
    """Pick the single highest-USD chase card of an EV-enabled set, not recently
    used (dedup on card id). Returns facts incl. odds + booster image for slides."""
    exclude = exclude or set()
    best = None
    for sid, s in snapshot.get("sets", {}).items():
        ev = (s.get("ev") or {}).get(LOCALE) or {}
        if (ev.get("packEv") or 0) <= 0:
            continue
        cards = [c for c in s.get("cards", []) if c.get("image") and (c.get("usd") or 0) > 0]
        if not cards:
            continue
        chase = max(cards, key=lambda c: c.get("usd") or 0)
        if chase.get("id") in exclude:
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


def fallback_grail_brief(facts):
    name = facts["name"]
    price = fmt_usd(facts["usd"])
    set_name = facts["set_name"]
    artist = facts.get("artist")
    odds_n = facts.get("odds_n")
    odds_line = (f"Rip a sealed booster and|the odds are {odds_n} to 1." if odds_n
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
            f"{name} from {set_name} is worth {price}. For one card.\n\n"
            f"It is one of the rarest pulls in the set, and the artwork is why collectors chase it.\n\n"
            "Would you keep it or sell it? Tell us below.\n\n"
            "pokeev.com runs the live Expected Value on every set, so you know exactly what your pulls are worth.\n"
            "link in bio -> pokeev.com"
        ),
        "hashtags": _clean_hashtags(
            ["#pokemongrails", "#grailcard", "#pokemonart", "#pokemoninvesting"]
            + ["#" + w for w in _slug_words(name, set_name, facts.get("rarity"), artist)]
        ),
    }


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
    img = _png(facts["image"])
    zoom_img = hd_image or img  # hd_image is a Blob PNG upscale; img is now PNG too
    price = fmt_usd(facts["usd"])
    artist = facts.get("artist")

    shock = (f"{H}?slide=grail-shock&set={q(set_name)}{logop}&img0={q(img)}"
             f"&eyebrow={q('ONE POKÉMON CARD')}&headline={q(brief['shockHeadline'])}"
             f"&price={q(price)}&note={q(brief.get('priceNote') or 'for a single card')}"
             f"&cue={q('but why? swipe →')}")

    card = (f"{H}?slide=grail-story&set={q(set_name)}{logop}&img0={q(img)}&tilt=-3"
            f"&kicker={q(brief.get('cardKicker') or 'THE CARD')}&headline={q(brief.get('cardHeadline') or facts['name'])}"
            f"&body={q(brief.get('cardBody') or '')}")

    # Zoom #1 — THE ARTIST / THE CRAFT (off-centre art-detail crop).
    cz = brief.get("craftZoom") or _safe_craft_zoom()
    craft_kicker = brief.get("craftKicker") or ("THE ARTIST" if artist else "THE CRAFT")
    craft_headline = brief.get("craftHeadline") or (artist or "Hand-drawn")
    zoom_craft = (f"{H}?slide=grail-zoom&set={q(set_name)}{logop}&img0={q(zoom_img)}"
                  f"&kicker={q(craft_kicker)}&headline={q(craft_headline)}"
                  f"&body={q(brief.get('craftBody') or '')}"
                  f"&zw={cz['zw']}&zx={cz['zx']}&zy={cz['zy']}&foot={q('but what is it? →')}")

    # Zoom #2 — THE SCENE (centred subject crop, a DIFFERENT region than #1).
    sz = brief.get("sceneZoom") or _safe_scene_zoom()
    scene_kicker = brief.get("sceneKicker") or "THE SCENE"
    scene_headline = brief.get("sceneHeadline") or "The subject, up close"
    zoom_scene = (f"{H}?slide=grail-zoom&set={q(set_name)}{logop}&img0={q(zoom_img)}"
                  f"&kicker={q(scene_kicker)}&headline={q(scene_headline)}"
                  f"&body={q(brief.get('sceneBody') or '')}"
                  f"&zw={sz['zw']}&zx={sz['zx']}&zy={sz['zy']}&foot={q('and how rare? →')}")

    odds_n = facts.get("odds_n")
    booster = facts.get("booster")
    odds = f"{H}?slide=grail-odds&set={q(set_name)}{logop}"
    if booster:
        odds += "".join(f"&b{i}={q(booster)}" for i in range(5))
    if odds_n:
        odds += f"&statA={q('1')}&statB={q(f'{odds_n:,}')}&statSub={q('PACKS TO PULL THIS CARD')}"
    else:
        odds += f"&statA={q('1')}&statB={q('???')}&statSub={q('THE RAREST TIER IN THE SET')}"
    odds += (f"&kicker={q('THE ODDS')}&body={q(brief.get('oddsBody') or '')}"
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
        "I will render TWO close-up zoom slides on the art, so I need TWO DISTINCT crops of "
        "DIFFERENT regions (they must not overlap much):\n"
        "  CRAFT crop = an interesting fine detail, brushwork/texture, or a secondary element "
        "(off-centre is good, more zoomed-in).\n"
        "  SCENE crop = the main subject/character, framed and centred (less zoomed-in).\n"
        "Both crop centers MUST stay inside the pure-art band (vertical 0.13..0.53) to avoid the "
        "title bar and attack-text boxes.\n"
        "Return ONLY a JSON object with keys:\n"
        '  "subject": one short line naming what is depicted (the Pokemon, the scene).\n'
        '  "hidden": one short line on a hidden detail or another Pokemon in the art, or "" if none.\n'
        '  "craftCenterX": 0..1 horizontal center of the CRAFT detail.\n'
        '  "craftCenterY": 0.13..0.53 vertical center of the CRAFT detail.\n'
        '  "craftFactor": 2.2..4 how tight to crop the CRAFT detail (tighter than the scene).\n'
        '  "craftHeadline": <= 40 char title for the CRAFT/ARTIST zoom slide.\n'
        '  "craftBody": <= 140 chars, two clauses split by |, about the craft/detail.\n'
        '  "sceneCenterX": 0..1 horizontal center of the main SUBJECT.\n'
        '  "sceneCenterY": 0.13..0.53 vertical center of the main SUBJECT.\n'
        '  "sceneFactor": 1.6..2.6 how tight to crop the SCENE (wider than the craft).\n'
        '  "sceneHeadline": <= 40 char title for the SCENE zoom slide.\n'
        '  "sceneBody": <= 140 chars, two clauses split by |, about the subject/scene.\n'
        f'  "compare": a single real-world thing that costs CLEARLY LESS than {price} (so the card is '
        'the more expensive side), as a short phrase, e.g. "a Nintendo Switch". Must be verifiably cheaper. '
        'Use null if unsure.\n'
        "No em-dashes anywhere."
    )
    try:
        v = claude_json(api_key, prompt, system=voice(), vision_image=(media_type, b64))
    except Exception as exc:  # noqa: BLE001
        log(f"  T3 vision research failed ({exc})")
        return None
    v["craftZoom"] = grail_zoom_from_vision(v.get("craftCenterX", 0.34), v.get("craftCenterY", 0.20), v.get("craftFactor", 3.0))
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
        facts["vision"] = grail_vision_research(api_key, facts)
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
            if v.get("compare"):
                brief["shockHeadline"] = f"Worth more than|{v['compare']}"
        elif facts.get("artist"):
            brief["craftKicker"] = "THE ARTIST"
            brief["craftHeadline"] = facts["artist"]
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


def patch_brief(api_key, prior_brief, feedback):
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
    prompt = (
        "You are making ONE small edit to an Instagram post the editor just rejected. "
        "Here is its current copy as JSON:\n"
        + json.dumps(editable, ensure_ascii=False, indent=2) + "\n\n"
        f"The editor wants exactly this, and nothing else:\n\"{feedback}\"\n\n"
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


def build_theme_plan(ctx, feedback=None, prior_brief=None):
    """Art-direct (Claude or fallback) + build the /api/ig slide URLs for the selected
    theme, re-host them on Blob, write plan.json, and return the flat plan. On a revise
    (feedback + the prior brief) it PATCHES only what the editor asked, never rebuilds."""
    theme = ctx["theme"]
    base = ctx["base"]
    facts = ctx["facts"]
    api_key = ctx["api_key"]

    if feedback and prior_brief:
        brief = patch_brief(api_key, prior_brief, feedback)
    else:
        brief = _fresh_brief(theme, api_key, facts)
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


# ------------------------------- telegram gate ---------------------------- #
def tg_api(token, method, payload):
    import requests

    r = requests.post(f"https://api.telegram.org/bot{token}/{method}", json=payload, timeout=HTTP_TIMEOUT)
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(f"telegram {method}: {data}")
    return data["result"]


def tg_send_preview(token, chat_id, plan, buttons=True):
    import json as _json

    import requests

    # Upload the actual image bytes (multipart attach://) instead of handing Telegram
    # the slide URLs — Telegram's ~5s media-fetch timeout can't render an HD slide in
    # time, but the bot can download it patiently and push the bytes.
    urls = plan_slides(plan)[:10]
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
    ntags = len(plan.get("hashtags") or [])
    text = (f"🎴 PokeEV post — {plan['theme'].upper()} ({plan['date']})\n\n"
            f"PRICE CROSS-CHECK:\n{table}\n\nCAPTION ({ntags} hashtags folded in):\n"
            f"{plan['caption']}\n\nPublish this carousel?")
    payload = {"chat_id": chat_id, "text": text[:4000]}
    # Inline buttons ONLY when a live process is waiting to ack the tap (do_run). In the
    # async 2-phase flow the prepare run has already exited, so a button would spin
    # forever with no response — there we drive everything by TEXT reply instead.
    if buttons:
        payload["reply_markup"] = {"inline_keyboard": [[{"text": "✅ Approve", "callback_data": "approve"},
                                                        {"text": "❌ Reject", "callback_data": "reject"}]]}
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
                    "plan": plan, "ctx": ctx2}, indent=2, ensure_ascii=False),
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


def tg_offset_now(token):
    """update_id+1 of the latest queued update, so the publish tick reads only the
    decisions the editor sends AFTER today's preview."""
    try:
        seen = tg_api(token, "getUpdates", {"timeout": 0})
        return (seen[-1]["update_id"] + 1) if seen else 0
    except Exception:  # noqa: BLE001
        return 0


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
            if cq.get("data") == "approve":
                decision, notes = "approve", None
            elif cq.get("data") == "reject":
                decision, notes = "skip", None
            continue
        msg = u.get("message")
        if msg and str(msg.get("chat", {}).get("id")) == str(chat_id):
            txt = (msg.get("text") or "").strip()
            if not txt or txt.startswith("/"):
                continue
            low = txt.lower()
            if low in ("skip", "cancel", "stop", "no", "non"):
                decision, notes = "skip", None
            elif low in ("ok", "okay", "approve", "yes", "go", "post", "oui", "✅"):
                decision, notes = "approve", None
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
    offset = tg_offset_now(tg_token)
    tg_send_preview(tg_token, tg_chat, plan, buttons=False)
    write_pending(plan, ctx, offset)
    tg_api(tg_token, "sendMessage", {"chat_id": tg_chat,
           "text": "🕛 Today's preview is ready. Just REPLY to this chat (no buttons):\n"
                   "• reply \"ok\" to approve — I post the carousel at 20:00 Paris\n"
                   "• reply with any changes to revise it (I learn them for next time)\n"
                   "• reply \"skip\" to cancel today\n"
                   "Nothing posts without your ok."})


def do_publish_pending(final=True):
    """Evening — publish today's pending post ONLY if approved (opt-in). A last-mile
    revise rebuilds + re-previews + waits briefly for the final ✅. `final=False` (an
    early evening tick) leaves the pending post in place when there's no decision yet,
    so a later tick can still catch your approval; only the last tick of the window
    gives up and clears."""
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
    plan = pending["plan"]
    decision, notes = latest_decision(tg_token, tg_chat, pending.get("tg_offset", 0))

    if decision == "revise" and notes:
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": "🔄 Reworking with your notes…"})
        append_style_note(notes)  # learn: apply this correction to all future posts
        ctx = pending.get("ctx") or {}
        ctx["api_key"] = env("ANTHROPIC_API_KEY")
        try:
            plan = build_theme_plan(ctx, feedback=notes, prior_brief=plan.get("brief"))
        except Exception as exc:  # noqa: BLE001
            log(f"revise rebuild failed ({exc}); keeping the original plan")
        tg_send_preview(tg_token, tg_chat, plan)
        action, _ = tg_wait_decision(tg_token, tg_chat, timeout=int(env("REVISE_TIMEOUT", "1500") or "1500"))
        if action != "approve":
            tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": "🚫 Not approved — nothing posted today."})
            clear_pending()
            return
        decision = "approve"

    if decision == "approve":
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": "📤 Approved — publishing now…"})
        try:
            publish_to_instagram(plan)
        except Exception as exc:  # noqa: BLE001
            # Never fail SILENTLY: tell the editor + KEEP the pending post (no clear) so a
            # later tick or manual retry can publish it once the issue is fixed.
            short = str(exc)[:280]
            tg_api(tg_token, "sendMessage", {"chat_id": tg_chat,
                   "text": "⚠️ Couldn't publish — Instagram refused the post:\n" + short +
                           "\n\nYour approval is KEPT. If this says 'API access blocked' (code 200), "
                           "set the Meta app back to Development mode, then I'll retry."})
            raise
        record_history(plan)
        clear_pending()
        return
    if decision == "skip":
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": "🚫 Skipped — nothing posted today."})
        clear_pending()
        return
    # No decision yet. Only give up + clear on the LAST evening tick; otherwise keep the
    # pending post so a later tick (or a late approval) can still publish it.
    if final:
        tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": "⌛️ No ✅ approval today — nothing posted."})
        clear_pending()
    else:
        log("no ✅ approval yet — keeping the pending post for a later evening tick")


def do_ack():
    """Afternoon — CONFIRM receipt of the editor's decision on today's pending preview.
    The morning preview has no live process, so a 'ok' reply otherwise got no feedback
    until 20:00 (owner: 'le bot me renvoit rien, ca a marché?'). This closes the loop and
    states the publish time. Idempotent — each NEW decision is confirmed exactly once,
    tracked by pending['acked']; it never publishes (that's the 20:00 tick's job)."""
    pending = read_pending()
    today = datetime.now(timezone.utc).date().isoformat()
    if not pending or pending.get("date") != today:
        return
    tg_token = env("TELEGRAM_BOT_TOKEN")
    tg_chat = env("TELEGRAM_CHAT_ID")
    if not (tg_token and tg_chat):
        return
    decision, _ = latest_decision(tg_token, tg_chat, pending.get("tg_offset", 0))
    if decision == "none" or pending.get("acked") == decision:
        return
    msg = {
        "approve": "✅ Got your OK — the carousel will be published at 20:00 Paris tonight.",
        "revise": "🔄 Got your changes — I'll rework + re-preview, then publish at 20:00 Paris.",
        "skip": "🚫 Skipped — nothing will be posted today.",
    }.get(decision)
    if not msg:
        return
    tg_api(tg_token, "sendMessage", {"chat_id": tg_chat, "text": msg})
    pending["acked"] = decision
    _pending_path().write_text(json.dumps(pending, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"acked decision: {decision}")


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
    prepared_today = bool(pending and pending.get("date") == today)
    log(f"scheduled tick — Paris hour {h}, prepared_today={prepared_today}")
    if 8 <= h < 13:
        if prepared_today:
            log("already prepared today — nothing to do this tick")
        else:
            do_prepare()
    elif 13 <= h < 20:
        do_ack()  # confirm the editor's reply (no-op until there's a new decision)
    elif 20 <= h < 24:
        do_publish_pending(final=h >= 23)
    else:
        log(f"Paris hour {h} outside the prepare (08-12) / ack (13-19) / publish (20-23) windows — exiting.")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "scheduled"
    if cmd == "plan":
        build_theme_plan(prepare_rotation())
    elif cmd == "publish":  # manual fallback: post the last plan.json
        publish_to_instagram(json.loads(Path(env("PLAN_PATH", "plan.json")).read_text(encoding="utf-8")))
    elif cmd == "prepare":
        do_prepare()
    elif cmd == "ack":  # confirm a received decision on today's pending preview
        do_ack()
    elif cmd == "diagnose":  # probe the IG token vs app-side block
        do_diagnose()
    elif cmd == "publish-pending":
        do_publish_pending()
    elif cmd == "run":  # legacy single-shot: build + gate + publish in one go
        do_run()
    else:  # default (cron) = the Paris-time-routed 2-phase flow
        do_scheduled()


if __name__ == "__main__":
    main()
