#!/usr/bin/env python3
"""
PokeEV Instagram bot.

Reads the committed /data JSONs, picks the top-N sets by their single most
valuable card, renders each as a public /api/og share image on pokeev.com, asks
Claude for an English caption, then publishes a carousel (feed) + a story to
Instagram via the Meta Graph API.

Env (provided by .github/workflows/instagram-bot.yml):
  ANTHROPIC_API_KEY      - Claude key (caption generation)
  META_ACCESS_TOKEN      - long-lived IG/Page token with instagram_content_publish
  INSTAGRAM_BUSINESS_ID  - IG Business account id
  POKEEV_DATA_DIR        - path to the repo /data dir (default: data)
  POKEEV_IMAGE_BASE_URL  - public base for /api/og (default: https://pokeev.com)
  TOP_N_CARDS            - number of slides (default: 5)
  POST_TYPE              - "carousel" (default) — reserved for future modes
  META_GRAPH_VERSION     - Graph API version (default: v21.0)
  DRY_RUN                - "1" to print the plan without calling any API
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

CLAUDE_MODEL = "claude-sonnet-4-6"
LOCALE = "en"  # the @pokeev.tcg account is English / international
HTTP_TIMEOUT = 30


def env(name: str, default: str | None = None, required: bool = False) -> str | None:
    value = os.environ.get(name, default)
    if required and not value:
        sys.exit(f"[pokeev-bot] missing required env var: {name}")
    return value


def log(msg: str) -> None:
    print(f"[pokeev-bot] {msg}", flush=True)


def graph_base() -> str:
    return f"https://graph.facebook.com/{env('META_GRAPH_VERSION', 'v21.0')}"


# --------------------------------- data ----------------------------------- #
def load_set_names(data_dir: Path) -> dict[str, dict]:
    """set id -> {en, fr, year} from the per-era catalog files in data/sets/."""
    names: dict[str, dict] = {}
    for path in sorted((data_dir / "sets").glob("*.json")):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        for s in doc.get("sets", []):
            sid = s.get("id")
            if sid:
                names[sid] = {
                    "en": s.get("nameEn") or sid,
                    "fr": s.get("nameFr") or sid,
                    "year": (s.get("releaseDate") or "")[:4],
                }
    return names


def card_value(card: dict) -> float:
    """Ranking/display value: USD (the @pokeev.tcg account's currency) when
    quoted, else EUR. Keeps the caption's prices in clean descending order and
    matches the USD figure we print."""
    return card.get("usd") or card.get("eur") or 0


def top_sets(snapshot: dict, names: dict[str, dict], n: int) -> list[dict]:
    """Top-n DISTINCT sets ranked by their single most valuable card.

    /api/og renders a set (its chase card + EV), so ranking by set — rather than
    by raw card — guarantees n distinct, meaningful carousel slides even when the
    priciest cards cluster in one set.
    """
    rows: list[dict] = []
    for sid, s in snapshot.get("sets", {}).items():
        cards = [c for c in s.get("cards", []) if c.get("image") and card_value(c) > 0]
        if not cards:
            continue
        chase = max(cards, key=card_value)
        ev = (s.get("ev") or {}).get(LOCALE) or {}
        meta = names.get(sid, {})
        rows.append(
            {
                "id": sid,
                "name": meta.get("en", sid),
                "year": meta.get("year", ""),
                "chase_name": chase.get("name") or "?",
                "chase_usd": chase.get("usd"),
                "chase_eur": chase.get("eur"),
                "pack_ev": ev.get("packEv"),
            }
        )
    rows.sort(key=lambda r: (r["chase_usd"] or r["chase_eur"] or 0), reverse=True)
    return rows[:n]


def fmt_price(usd, eur) -> str:
    if usd:
        return f"${usd:,.0f}"
    if eur:
        return f"€{eur:,.0f}"
    return "—"


def og_url(base: str, set_id: str) -> str:
    return f"{base.rstrip('/')}/api/og?set={set_id}&locale={LOCALE}"


# -------------------------------- caption --------------------------------- #
def build_caption(api_key: str, sets: list[dict]) -> str:
    from anthropic import Anthropic  # lazy: only when actually generating

    lines = []
    for i, s in enumerate(sets, 1):
        ev = f" | pack EV ${s['pack_ev']:.2f}" if s.get("pack_ev") else ""
        lines.append(
            f"{i}. {s['name']} ({s['year']}) - chase: {s['chase_name']} {fmt_price(s['chase_usd'], s['chase_eur'])}{ev}"
        )
    prompt = (
        "You write the Instagram caption for @pokeev.tcg, a Pokemon TCG Expected-Value tool (pokeev.com). "
        "Audience: international Pokemon card collectors and investors. Voice: sharp, confident, a little hype, never cringe.\n\n"
        "Write ONE Instagram caption in ENGLISH for today's carousel: the 5 Pokemon sets with the most valuable chase cards right now.\n\n"
        f"DATA (today's prices, keep them accurate):\n" + "\n".join(lines) + "\n\n"
        "Rules:\n"
        "- Strong one-line hook first.\n"
        "- Then a short punchy line per set/card.\n"
        "- Work in that pokeev.com tells you whether a sealed box is worth opening (Expected Value vs the price you pay).\n"
        "- CTA: link in bio -> pokeev.com.\n"
        "- Finish with 8-15 relevant hashtags on the final line.\n"
        "- Output ONLY the caption text: no preamble, no markdown, no surrounding quotes."
    )
    client = Anthropic(api_key=api_key)
    msg = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=700,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
    if not text:
        raise RuntimeError("Claude returned an empty caption")
    return text


def fallback_caption(sets: list[dict]) -> str:
    head = "The 5 Pokemon sets sitting on the priciest chase cards right now\n\n"
    body = "\n".join(
        f"{i}. {s['name']} - {s['chase_name']} {fmt_price(s['chase_usd'], s['chase_eur'])}"
        for i, s in enumerate(sets, 1)
    )
    tail = (
        "\n\nRip the box or keep it sealed? pokeev.com runs the math - Expected Value vs the price you pay. "
        "Link in bio.\n\n"
        "#pokemon #pokemontcg #pokemoncards #pokemoncardcollection #tcg #pokemoninvesting "
        "#charizard #pokemoncommunity #vintagepokemon #pokeev"
    )
    return head + body + tail


# ------------------------------- graph api -------------------------------- #
def graph_post(path: str, params: dict) -> dict:
    import requests  # lazy

    r = requests.post(f"{graph_base()}/{path}", data=params, timeout=HTTP_TIMEOUT)
    if not r.ok:
        raise RuntimeError(f"Graph POST {path} -> {r.status_code}: {r.text}")
    return r.json()


def graph_get(path: str, params: dict) -> dict:
    import requests  # lazy

    r = requests.get(f"{graph_base()}/{path}", params=params, timeout=HTTP_TIMEOUT)
    if not r.ok:
        raise RuntimeError(f"Graph GET {path} -> {r.status_code}: {r.text}")
    return r.json()


def wait_finished(creation_id: str, token: str, tries: int = 20, delay: int = 3) -> None:
    for _ in range(tries):
        status = graph_get(creation_id, {"fields": "status_code", "access_token": token}).get("status_code")
        if status == "FINISHED":
            return
        if status == "ERROR":
            raise RuntimeError(f"container {creation_id} failed processing (ERROR)")
        time.sleep(delay)
    raise RuntimeError(f"container {creation_id} not FINISHED after {tries * delay}s")


def create_container(ig_id, token, image_url=None, *, carousel_item=False, media_type=None, caption=None, children=None):
    params = {"access_token": token}
    if image_url:
        params["image_url"] = image_url
    if carousel_item:
        params["is_carousel_item"] = "true"
    if media_type:
        params["media_type"] = media_type
    if caption:
        params["caption"] = caption
    if children:
        params["children"] = ",".join(children)
    return graph_post(f"{ig_id}/media", params)["id"]


def publish(ig_id, token, creation_id):
    return graph_post(f"{ig_id}/media_publish", {"creation_id": creation_id, "access_token": token})["id"]


def post_carousel(ig_id, token, image_urls, caption):
    children = []
    for url in image_urls:
        cid = create_container(ig_id, token, url, carousel_item=True)
        log(f"  carousel item {cid} <- {url}")
        children.append(cid)
    for cid in children:
        wait_finished(cid, token)
    parent = create_container(ig_id, token, media_type="CAROUSEL", caption=caption, children=children)
    wait_finished(parent, token)
    media_id = publish(ig_id, token, parent)
    log(f"✓ carousel published: {media_id}")
    return media_id


def post_story(ig_id, token, image_url):
    cid = create_container(ig_id, token, image_url, media_type="STORIES")
    wait_finished(cid, token)
    media_id = publish(ig_id, token, cid)
    log(f"✓ story published: {media_id}")
    return media_id


# --------------------------------- main ----------------------------------- #
def main() -> None:
    dry = (os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes"))
    data_dir = Path(env("POKEEV_DATA_DIR", "data"))
    base_url = env("POKEEV_IMAGE_BASE_URL", "https://pokeev.com")
    n = max(1, min(10, int(env("TOP_N_CARDS", "5") or "5")))

    snap_path = data_dir / "snapshot" / "snapshot.json"
    snapshot = json.loads(snap_path.read_text(encoding="utf-8"))
    if snapshot.get("demo"):
        sys.exit("[pokeev-bot] snapshot is demo data — refusing to post")

    names = load_set_names(data_dir)
    sets = top_sets(snapshot, names, n)
    if not sets:
        sys.exit("[pokeev-bot] no sets with priced cards found")
    image_urls = [og_url(base_url, s["id"]) for s in sets]

    log(f"top {len(sets)} sets (snapshot {snapshot.get('generatedAt', '?')}):")
    for s, u in zip(sets, image_urls):
        log(f"  - {s['name']}: chase {s['chase_name']} {fmt_price(s['chase_usd'], s['chase_eur'])}  |  {u}")

    api_key = env("ANTHROPIC_API_KEY")
    if dry or not api_key:
        caption = fallback_caption(sets)
        log("using fallback caption" + (" (DRY_RUN)" if dry else " (no ANTHROPIC_API_KEY)"))
    else:
        try:
            caption = build_caption(api_key, sets)
        except Exception as exc:  # never fail the post over caption wording
            log(f"Claude caption failed ({exc}); using fallback")
            caption = fallback_caption(sets)
    log("caption:\n" + caption)

    if dry:
        log("DRY_RUN — not contacting Instagram.")
        return

    ig_id = env("INSTAGRAM_BUSINESS_ID", required=True)
    token = env("META_ACCESS_TOKEN", required=True)
    post_carousel(ig_id, token, image_urls, caption)
    post_story(ig_id, token, image_urls[0])
    log("done.")


if __name__ == "__main__":
    main()
