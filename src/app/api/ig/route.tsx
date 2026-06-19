import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { getSetById } from "@/lib/data/catalog";
import { getSnapshot } from "@/lib/data/snapshot";
import { pickChaseCard } from "@/lib/data/snapshot-types";
import { formatMoney } from "@/lib/i18n/config";
import { clientIp, rateLimit } from "@/lib/api/rate-limit";

/**
 * Premium 1080×1350 Instagram slides for @pokeev.tcg — same dark-holo brand as
 * the site (Clash Display + Satoshi, holo gradient). Three slide types:
 *   /api/ig?slide=cover&theme=grails
 *   /api/ig?slide=card&set=<id>&rank=<n>&theme=grails
 *   /api/ig?slide=cta
 * The card slide pulls the set's EN chase card (art + USD price + booster EV)
 * straight from the snapshot, so the visuals always match the live data.
 */

export const runtime = "nodejs";
export const revalidate = 3600;

const SIZE = { width: 1080, height: 1350 };
const BG = "#0B0E14";
const HOLO = "linear-gradient(116deg, #22D3EE 0%, #8B5CF6 50%, #E94BD0 100%)";
const GLOW = "radial-gradient(circle at 50% 38%, rgba(139,92,246,0.34), rgba(34,211,238,0.10) 36%, rgba(11,14,20,0) 64%)";

const THEMES: Record<string, { tag: string; title: string; sub: string }> = {
  grails: { tag: "GRAIL WATCH", title: "TOP 5 GRAILS", sub: "The priciest Pokémon chase cards on the market right now." },
  ev: { tag: "BEST EV", title: "HIGHEST EV", sub: "The sets with the most expected value per booster right now." },
};

/** pokemontcg.io ships a light `<num>.png` (≈245px, used site-wide for CWV) and
 *  a crisp `<num>_hires.png` (≈1024px). The IG slide is 1080px wide and rendered
 *  once per post (no CWV cost), so always use the hi-res print. */
function hiResCardImage(url: string): string {
  if (url.includes("images.pokemontcg.io") && url.endsWith(".png") && !url.endsWith("_hires.png")) {
    return url.replace(/\.png$/, "_hires.png");
  }
  return url;
}

/** Only money glyphs survive, capped — a price override is reflected into the
 *  image, so it must not let a crafted query inject arbitrary text. */
function moneyParam(v: string | null): string | null {
  if (!v) return null;
  const cleaned = v.replace(/[^0-9.,$€\s+−-]/g, "").trim().slice(0, 14);
  return cleaned || null;
}

/** Claude art-directs the cover copy per post. Reflected text is stripped of
 *  markup/control chars and capped so a crafted query cannot inject content. */
function textParam(v: string | null, maxLen: number): string | null {
  if (!v) return null;
  const cleaned = v
    .replace(/[<>&{}\\]/g, "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
  return cleaned || null;
}

/** Card-art image override (e.g. an AI-upscaled scan). Only trusted hosts are
 *  allowed so the endpoint can't be turned into an arbitrary-image proxy. */
function imgParam(v: string | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    const ok =
      u.protocol === "https:" &&
      (u.hostname === "images.pokemontcg.io" ||
        u.hostname === "replicate.delivery" ||
        u.hostname.endsWith(".replicate.delivery") ||
        u.hostname.endsWith(".blob.vercel-storage.com") ||
        u.hostname === "assets.tcgdex.net");
    return ok ? u.toString() : null;
  } catch {
    return null;
  }
}

async function loadFonts() {
  const dir = join(process.cwd(), "src", "assets", "og");
  const [clash, satoshi] = await Promise.all([
    readFile(join(dir, "clash-display-700.ttf")),
    readFile(join(dir, "satoshi-500.ttf")),
  ]);
  return [
    { name: "Clash", data: clash, weight: 700 as const, style: "normal" as const },
    { name: "Satoshi", data: satoshi, weight: 500 as const, style: "normal" as const },
  ];
}

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      background: BG,
      color: "#E8ECF4",
      fontFamily: "Satoshi, sans-serif",
      padding: 72,
    }}
  >
    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: GLOW }} />
    {children}
  </div>
);

const Wordmark = ({ size = 34 }: { size?: number }) => (
  <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Clash", fontSize: size, letterSpacing: -1 }}>
    <span style={{ color: "#E8ECF4" }}>Poké</span>
    <span style={{ backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>EV</span>
  </div>
);

const HoloText = ({ children, size, ls = -2 }: { children: React.ReactNode; size: number; ls?: number }) => (
  <span style={{ fontFamily: "Clash", fontSize: size, letterSpacing: ls, backgroundImage: HOLO, backgroundClip: "text", color: "transparent", lineHeight: 1.0 }}>
    {children}
  </span>
);

/** A holo "swipe →" cue — same on the cover and every card slide so people know
 *  there's more to see (the carousel converts far better when they keep swiping). */
const Swipe = () => (
  <div style={{ display: "flex", alignItems: "center", fontSize: 22, letterSpacing: 3, color: "#8A93A6" }}>
    <span>swipe</span>
    <span style={{ fontFamily: "Clash", fontSize: 30, marginLeft: 12, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>→</span>
  </div>
);

/** A holo completion meter pinned to the bottom of every slide. People finish a
 *  bar they can watch filling — it turns "stop swiping" into "quit near the end". */
const ProgressRail = ({ step, total }: { step: number; total: number }) => (
  <div style={{ display: "flex", position: "absolute", bottom: 30, left: 0, width: "100%", justifyContent: "center" }}>
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        style={{ display: "flex", width: 16, height: 8, borderRadius: 6, margin: "0 5px", ...(i < step ? { backgroundImage: HOLO } : { background: "#232a36" }) }}
      />
    ))}
  </div>
);

/** Lay out the cover hook so it always reads as a clean block: split into ≤2
 *  length-balanced lines (break only on spaces, never mid-word) and pick a font
 *  size that fits — no orphan words, no line that starts mid-sentence. */
function titleLayout(title: string): { size: number; lines: string[] } {
  const t = title.trim().replace(/\s+/g, " ");
  const words = t.split(" ");
  let lines = [t];
  if (words.length > 1 && t.length > 9) {
    let best = 1;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  }
  const longest = Math.max(...lines.map((l) => l.length));
  const size = longest <= 8 ? 148 : longest <= 12 ? 124 : longest <= 17 ? 100 : 82;
  return { size, lines };
}

function coverSlide(theme: { tag: string; title: string; sub: string }, mask = 0, step = 0, total = 0) {
  const { size, lines } = titleLayout(theme.title);
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark />
        <span style={{ fontSize: 20, letterSpacing: 5, color: "#8A93A6", border: "1px solid #232a36", borderRadius: 999, padding: "8px 20px" }}>
          {theme.tag}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 6, color: "#7c8499" }}>POKÉMON TCG · EXPECTED VALUE</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
          {lines.map((ln, i) => {
            // The climax number is teased on the cover with its trailing digits
            // locked behind a holo bar ($3,9██) — an open loop that only resolves
            // on the #1 slide. Approximate glyph width; exactness isn't needed.
            if (mask > 0 && i === lines.length - 1) {
              return (
                // alignSelf:flex-start shrinks this row to the number's width so the
                // lock-bar's right:0 anchors to the number, not the slide edge.
                <div key={i} style={{ display: "flex", position: "relative", alignSelf: "flex-start" }}>
                  <HoloText size={size}>{ln}</HoloText>
                  <div style={{ position: "absolute", display: "flex", right: 0, top: Math.round(size * 0.18), width: Math.round(size * 0.52 * mask), height: Math.round(size * 0.66), borderRadius: 10, backgroundImage: HOLO }} />
                </div>
              );
            }
            return <div key={i} style={{ display: "flex" }}><HoloText size={size}>{ln}</HoloText></div>;
          })}
        </div>
        <div style={{ display: "flex", width: 180, height: 10, borderRadius: 10, marginTop: 34, backgroundImage: HOLO }} />
        <div style={{ display: "flex", fontSize: 38, lineHeight: 1.34, color: "#aab2c5", marginTop: 34, maxWidth: 900 }}>{theme.sub}</div>
      </div>
      <div style={{ display: "flex", marginBottom: 16 }}>
        <span style={{ fontFamily: "Clash", fontSize: 26, letterSpacing: 0, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>SAVE SHEET INSIDE →</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: "#5C6477" }}>
        <span>pokeev.com · @pokeev.tcg</span>
        <Swipe />
      </div>
      {total ? <ProgressRail step={step} total={total} /> : null}
    </Frame>
  );
}

function cardSlide(opts: { rank: number; tag: string; name: string; setName: string; image: string; price: string; ev: string | null; teaser?: string | null; odds?: string | null; climax?: boolean; step?: number; total?: number }) {
  const nameSize = opts.name.length <= 14 ? 56 : opts.name.length <= 20 ? 48 : 40;
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={28} />
        <span style={{ fontSize: 18, letterSpacing: 4, color: "#8A93A6" }}>{opts.climax ? "THE GRAIL" : opts.tag}</span>
      </div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "absolute", top: 70, width: 720, height: 720, borderRadius: 9999, background: GLOW }} />
        <div style={{ display: "flex", position: "relative", alignItems: "flex-start" }}>
          {/* climax: a 4px holo edge framing #1 — two layered absolute rects, no blur */}
          {opts.climax ? <div style={{ position: "absolute", display: "flex", top: -8, left: -8, width: 596, height: 828, backgroundImage: HOLO, borderRadius: 30 }} /> : null}
          {opts.climax ? <div style={{ position: "absolute", display: "flex", top: -4, left: -4, width: 588, height: 820, background: BG, borderRadius: 27 }} /> : null}
          <img
            src={opts.image}
            width={580}
            height={812}
            style={{ borderRadius: 24, objectFit: "contain", boxShadow: "0 36px 90px -24px rgba(0,0,0,0.85)" }}
          />
          {opts.climax ? (
            <div style={{ position: "absolute", top: -26, left: -26, display: "flex", alignItems: "center", justifyContent: "center", height: 72, paddingLeft: 26, paddingRight: 26, borderRadius: 999, backgroundImage: HOLO, color: "#0B0E14", fontFamily: "Clash", fontSize: 34, letterSpacing: -1 }}>
              THE GRAIL
            </div>
          ) : (
            <div style={{ position: "absolute", top: -26, left: -26, display: "flex", alignItems: "center", justifyContent: "center", width: 92, height: 92, borderRadius: 9999, backgroundImage: HOLO, color: "#0B0E14", fontFamily: "Clash", fontSize: 46 }}>
              {opts.rank}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontFamily: "Clash", fontSize: nameSize, letterSpacing: -1 }}>{opts.name}</div>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 2, color: "#7c8499", marginTop: 6 }}>{opts.setName.toUpperCase()}</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 24 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 20, letterSpacing: 3, color: "#7c8499" }}>MARKET PRICE</span>
            <HoloText size={opts.climax ? 120 : 96} ls={-3}>{opts.price}</HoloText>
          </div>
          {opts.odds ? (
            <div style={{ display: "flex", alignItems: "center", marginBottom: 16, border: "2px solid #2C3444", borderRadius: 999, paddingLeft: 22, paddingRight: 22, paddingTop: 10, paddingBottom: 10 }}>
              <span style={{ fontFamily: "Clash", fontSize: 30, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>{opts.odds}</span>
            </div>
          ) : opts.ev ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginBottom: 14 }}>
              <span style={{ fontSize: 20, letterSpacing: 3, color: "#7c8499" }}>BOOSTER EV</span>
              <span style={{ fontFamily: "Clash", fontSize: 52, color: "#E8ECF4" }}>{opts.ev}</span>
            </div>
          ) : null}
        </div>
        {opts.teaser ? (
          <div style={{ display: "flex", marginTop: 22 }}>
            <span style={{ fontFamily: "Satoshi", fontSize: 24, letterSpacing: 1, color: "#aab2c5" }}>{opts.teaser}</span>
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: opts.teaser ? 16 : 30 }}>
          <span style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: "#5C6477" }}>@pokeev.tcg · pokeev.com</span>
          <Swipe />
        </div>
      </div>
      {opts.total ? <ProgressRail step={opts.step ?? 0} total={opts.total} /> : null}
    </Frame>
  );
}

function ctaSlide(step = 0, total = 0) {
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Wordmark size={40} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 5, color: "#7c8499", marginBottom: 22 }}>WANT THIS FOR ANY SET?</div>
        <div style={{ display: "flex" }}>
          <HoloText size={128}>Rip it or</HoloText>
        </div>
        <div style={{ display: "flex" }}>
          <HoloText size={128}>keep it?</HoloText>
        </div>
        <div style={{ display: "flex", fontSize: 40, lineHeight: 1.35, color: "#aab2c5", marginTop: 40, maxWidth: 820 }}>
          pokeev.com runs the math — Expected Value vs the price you actually pay.
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", height: 10, width: 200, borderRadius: 10, backgroundImage: HOLO }} />
        <div style={{ display: "flex", fontFamily: "Clash", fontSize: 46, marginTop: 28 }}>→ link in bio</div>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 4, color: "#5C6477", marginTop: 10 }}>@pokeev.tcg</div>
      </div>
      {total ? <ProgressRail step={step} total={total} /> : null}
    </Frame>
  );
}

/** The payoff slide promised on the cover ("SAVE SHEET INSIDE"): the full ranking
 *  as one screenshot-worthy leaderboard. Saves are IG's strongest ranking signal. */
function recapSlide(rows: { rank: number; name: string; setName: string; price: string; image: string }[], step = 0, total = 0) {
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={28} />
        <span style={{ fontSize: 18, letterSpacing: 4, color: "#8A93A6" }}>SAVE THIS →</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
        <div style={{ display: "flex" }}><HoloText size={76}>THE FINAL RANKING</HoloText></div>
        <div style={{ display: "flex", width: 180, height: 8, borderRadius: 10, marginTop: 18, marginBottom: 26, backgroundImage: HOLO }} />
        {rows.map((r, i) => {
          const top = r.rank === 1;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", paddingTop: 14, paddingBottom: 14, borderBottom: i < rows.length - 1 ? "1px solid #1b212c" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 58, height: 58, borderRadius: 9999, fontFamily: "Clash", fontSize: 30, ...(top ? { backgroundImage: HOLO, color: "#0B0E14" } : { background: "#161b24", color: "#aab2c5" }) }}>
                {r.rank}
              </div>
              <img src={r.image} width={70} height={98} style={{ display: "flex", marginLeft: 22, borderRadius: 8, objectFit: "contain" }} />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 22 }}>
                <span style={{ display: "flex", fontFamily: "Clash", fontSize: 34, letterSpacing: -1 }}>{r.name}</span>
                <span style={{ display: "flex", fontSize: 19, letterSpacing: 2, color: "#7c8499", marginTop: 4 }}>{r.setName.toUpperCase()}{top ? "  ·  THE GRAIL" : ""}</span>
              </div>
              <HoloText size={46} ls={-2}>{r.price}</HoloText>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, color: "#5C6477" }}>
        <span style={{ display: "flex" }}>prices cross-checked live · today</span>
        <span style={{ display: "flex", fontFamily: "Clash", fontSize: 26, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>save this →</span>
      </div>
      {total ? <ProgressRail step={step} total={total} /> : null}
    </Frame>
  );
}

export async function GET(request: NextRequest) {
  if (!rateLimit(`ig:${clientIp(request)}`, 60, 60_000)) {
    return new Response("Too many requests", { status: 429 });
  }
  const p = request.nextUrl.searchParams;
  const slide = p.get("slide") ?? "cover";
  const base = THEMES[p.get("theme") ?? "grails"] ?? THEMES.grails;
  // Claude (the bot's art director) may override the cover copy per post; fall
  // back to the theme preset. tag flows to the card slides' corner label too.
  const theme = {
    tag: textParam(p.get("tag"), 22) ?? base.tag,
    title: textParam(p.get("title"), 26) ?? base.title,
    sub: textParam(p.get("sub"), 130) ?? base.sub,
  };
  const fonts = await loadFonts();
  // Retention scaffolding shared across slides: a progress rail (step/total) plus
  // the cover lock-bar mask and per-card open-loop teaser / pull-odds chip.
  const step = Number(p.get("step")) || 0;
  const total = Number(p.get("total")) || 0;

  let element: React.ReactElement;
  if (slide === "cta") {
    element = ctaSlide(step, total);
  } else if (slide === "recap") {
    // "THE FINAL RANKING" save-sheet. Ids arrive cheapest→priciest (rank n→1);
    // names + thumbnails are snapshot-sourced (trusted), prices are sanitized params.
    const ids = (p.get("sets") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
    const snapshot = ids.length ? await getSnapshot() : null;
    const rows: { rank: number; name: string; setName: string; price: string; image: string }[] = [];
    ids.forEach((id, i) => {
      const set = getSetById(id);
      const snap = set && snapshot ? snapshot.sets[set.id] : null;
      const chase = snap ? pickChaseCard(snap, "en") : null;
      if (!set || !chase) return;
      rows.push({
        rank: ids.length - i,
        name: chase.name,
        setName: set.nameEn,
        price: moneyParam(p.get(`p${i + 1}`)) ?? formatMoney(chase.value, "en"),
        image: imgParam(p.get(`img${i + 1}`)) ?? hiResCardImage(chase.imageEn),
      });
    });
    if (!rows.length) return new Response("not found", { status: 404 });
    element = recapSlide(rows, step, total);
  } else if (slide === "card") {
    const setId = (p.get("set") ?? "").slice(0, 64);
    const rank = Math.max(1, Math.min(99, Number(p.get("rank")) || 1));
    const set = setId ? getSetById(setId) : null;
    const snapshot = set ? await getSnapshot() : null;
    const snap = set && snapshot ? snapshot.sets[set.id] : null;
    const chase = snap ? pickChaseCard(snap, "en") : null;
    if (!set || !chase) return new Response("not found", { status: 404 });
    const ev = snap?.ev?.en?.packEv;
    // The bot may pass already-verified, cross-checked numbers; otherwise fall
    // back to the snapshot value. Card art + name stay snapshot-sourced (trusted).
    const priceOverride = moneyParam(p.get("price"));
    const evOverride = moneyParam(p.get("ev"));
    // The bot may pass an AI-upscaled (≈1800px) card image; a high-res source
    // downscaled into the slide is far crisper than the native 600px scan.
    const hd = imgParam(p.get("img"));
    element = cardSlide({
      rank,
      tag: theme.tag,
      name: chase.name,
      setName: set.nameEn,
      image: hd ?? hiResCardImage(chase.imageEn),
      price: priceOverride ?? formatMoney(chase.value, "en"),
      ev: evOverride ?? (ev ? formatMoney(ev, "en") : null),
      teaser: textParam(p.get("teaser"), 70),
      odds: textParam(p.get("odds"), 18),
      climax: p.get("climax") === "1",
      step,
      total,
    });
  } else {
    const mask = Math.max(0, Math.min(3, Number(p.get("mask")) || 0));
    element = coverSlide(theme, mask, step, total);
  }

  return new ImageResponse(element, { ...SIZE, fonts });
}
