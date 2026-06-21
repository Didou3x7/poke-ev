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
const GLOW = "radial-gradient(circle at 50% 50%, rgba(139,92,246,0.34), rgba(34,211,238,0.10) 36%, rgba(11,14,20,0) 64%)";

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
    // Dev-only: allow a locally-served (upscaled) asset for IG slide previews.
    if (process.env.NODE_ENV !== "production" && u.hostname === "localhost") return u.toString();
    const ok =
      u.protocol === "https:" &&
      (u.hostname === "images.pokemontcg.io" ||
        u.hostname === "replicate.delivery" ||
        u.hostname.endsWith(".replicate.delivery") ||
        u.hostname.endsWith(".blob.vercel-storage.com") ||
        u.hostname === "tcgplayer-cdn.tcgplayer.com" ||
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

// ----------------------- CONNECTED theme ----------------------- //
// Cards whose artworks join into one picture. Each card gets its OWN slide, shown
// whole and centred (premium, no gadgets); the second-to-last slide assembles them
// side-by-side to reveal the full illustration; the last slide is the CTA.

const SetLogo = ({ logo, label }: { logo: string | null; label: string }) =>
  logo ? (
    <img src={logo} height={82} style={{ display: "flex", objectFit: "contain" }} />
  ) : (
    <span style={{ display: "flex", fontSize: 18, letterSpacing: 4, color: "#8A93A6" }}>{label.toUpperCase()}</span>
  );

// Satori has no blur filter, so we fake it: the figure is ghosted by stacking faint
// offset copies and pair it with a holo "?" — the worth is a secret the reveal unlocks.
const BlurNumber = ({ value, size }: { value: string; size: number }) => (
  <div style={{ display: "flex", alignItems: "center", alignSelf: "flex-start" }}>
    <div style={{ display: "flex", position: "relative" }}>
      <span style={{ display: "flex", fontFamily: "Clash", fontSize: size, letterSpacing: -2, color: "rgba(0,0,0,0)" }}>{value}</span>
      {[[-18, -6], [-12, 5], [-6, -4], [0, 3], [6, -5], [12, 4], [18, -3]].map(([x, y], i) => (
        <span key={i} style={{ position: "absolute", left: x, top: y, display: "flex", fontFamily: "Clash", fontSize: size, letterSpacing: -2, color: "rgba(150,160,190,0.16)" }}>{value}</span>
      ))}
    </div>
    <span style={{ display: "flex", fontFamily: "Clash", fontSize: Math.round(size * 1.04), marginLeft: 26, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>?</span>
  </div>
);

// The scroll-stopper: the cards spread as a fan, so at a glance the post reads as
// premium connected Pokémon cards (not just text). They overlap/rotate, so the
// assembled illustration is still a surprise saved for the reveal.
const CardFan = ({ images }: { images: string[] }) => {
  const n = images.length || 1;
  const cw = 340;
  const ch = Math.round(cw * 1.394);
  return (
    <div style={{ display: "flex", position: "relative", width: 820, height: ch + 96, alignItems: "center", justifyContent: "center" }}>
      {images.map((src, i) => {
        const t = i - (n - 1) / 2;
        const rot = Math.round(t * 110) / 10;
        const left = Math.round(410 - cw / 2 + t * 148);
        const top = Math.round(46 + Math.abs(t) * 24);
        return (
          <img key={i} src={src} width={cw} height={ch}
            style={{ position: "absolute", left, top, display: "flex", borderRadius: 16, objectFit: "contain", transform: `rotate(${rot}deg)`, boxShadow: "0 28px 70px -22px rgba(0,0,0,0.9)" }} />
        );
      })}
    </div>
  );
};

// HOOK cover: the card fan (visual hook) + an emotional line + the combined total kept
// secret (blurred + a question mark). Minimal text, two loops the reveal closes.
function connectCoverSlide(opts: { eyebrow: string; headline: string; total: string; cue: string; images: string[] }) {
  const { size, lines } = titleLayout(opts.headline);
  return (
    <Frame>
      <div style={{ display: "flex" }}>
        <Wordmark />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <CardFan images={opts.images} />
        <div style={{ display: "flex", fontSize: 21, letterSpacing: 5, color: "#7c8499", marginTop: 52 }}>{opts.eyebrow}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 22, alignItems: "center" }}>
          {lines.map((ln, i) => (
            <div key={i} style={{ display: "flex" }}><HoloText size={Math.min(size, 92)}>{ln}</HoloText></div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 40 }}>
          <span style={{ display: "flex", fontSize: 21, letterSpacing: 3, color: "#7c8499", marginRight: 18 }}>WORTH</span>
          <BlurNumber value={opts.total} size={72} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <span style={{ fontFamily: "Clash", fontSize: 26, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>{opts.cue}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", fontSize: 24, color: "#5C6477" }}>pokeev.com · @pokeev.tcg</div>
    </Frame>
  );
}

// One card, whole and centred on its own slide. Premium float on the dark-holo
// background; the series label hints these belong to one illustration (swipe to see it).
function connectedCard(opts: { image: string; name: string; value: string | null; setLabel: string; logo: string | null; series: string; tally: string | null }) {
  const nameSize = opts.name.length <= 16 ? 52 : opts.name.length <= 24 ? 42 : 34;
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={28} />
        <SetLogo logo={opts.logo} label={opts.setLabel} />
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
        <img src={opts.image} width={612} height={853} style={{ display: "flex", borderRadius: 20, objectFit: "contain", boxShadow: "0 36px 90px -24px rgba(0,0,0,0.85)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {opts.series ? <span style={{ display: "flex", fontSize: 19, letterSpacing: 4, color: "#7c8499", marginBottom: 10 }}>{opts.series.toUpperCase()}</span> : null}
            <span style={{ display: "flex", fontFamily: "Clash", fontSize: nameSize, letterSpacing: -1 }}>{opts.name}</span>
            <span style={{ display: "flex", fontSize: 20, letterSpacing: 3, color: "#7c8499", marginTop: 4 }}>{opts.setLabel.toUpperCase()}</span>
          </div>
          {opts.value ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ display: "flex", fontSize: 18, letterSpacing: 3, color: "#7c8499" }}>MARKET</span>
              <HoloText size={60} ls={-2}>{opts.value}</HoloText>
            </div>
          ) : null}
        </div>
        {opts.tally ? <div style={{ display: "flex", marginTop: 16, fontSize: 22, letterSpacing: 1, color: "#7c8499" }}>{opts.tally}</div> : null}
      </div>
    </Frame>
  );
}

// The payoff: every card aligned to fit, the complete illustration, each card's market
// value beneath it. The most screenshot-worthy frame ("save this").
function connectedReveal(opts: { images: string[]; values: (string | null)[]; title: string; setLabel: string; logo: string | null; total: string | null; bridge: string | null; footerLeft: string }) {
  const N = opts.images.length || 1;
  const w = Math.floor(1010 / N);
  const h = Math.round(w * 1.392);
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={30} />
        <SetLogo logo={opts.logo} label={opts.setLabel} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 23, letterSpacing: 5, color: "#7c8499" }}>THE FULL ILLUSTRATION</div>
        <div style={{ display: "flex", marginTop: 10 }}><HoloText size={64}>{opts.title}</HoloText></div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 40 }}>
          {opts.images.map((src, i) => (
            <img key={i} src={src} width={w} height={h} style={{ display: "flex", objectFit: "cover" }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", marginTop: 20 }}>
          {opts.values.map((v, i) => (
            <div key={i} style={{ display: "flex", width: w, justifyContent: "center" }}>
              <span style={{ display: "flex", fontFamily: "Clash", fontSize: 26, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>{v ?? "—"}</span>
            </div>
          ))}
        </div>
        {opts.total ? (
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 30 }}>
            <span style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: "#7c8499", marginRight: 14 }}>FULL SET TOGETHER</span>
            <HoloText size={56} ls={-2}>{opts.total}</HoloText>
          </div>
        ) : null}
        {opts.bridge ? (
          <div style={{ display: "flex", fontSize: 27, lineHeight: 1.34, color: "#aab2c5", marginTop: 26, maxWidth: 900 }}>{opts.bridge}</div>
        ) : null}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, color: "#5C6477" }}>
        <span style={{ display: "flex" }}>{opts.footerLeft}</span>
        <span style={{ display: "flex", fontFamily: "Clash", fontSize: 26, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>save this →</span>
      </div>
    </Frame>
  );
}

function connectedCta(opts: { setLabel: string; logo: string | null; eyebrow: string; h1: string; h2: string; body: string; verdict: string | null }) {
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={34} />
        <SetLogo logo={opts.logo} label={opts.setLabel} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 5, color: "#7c8499", marginBottom: 22 }}>{opts.eyebrow}</div>
        <div style={{ display: "flex" }}><HoloText size={opts.h2 ? 104 : opts.h1.length <= 10 ? 100 : opts.h1.length <= 16 ? 84 : opts.h1.length <= 22 ? 72 : 60}>{opts.h1}</HoloText></div>
        {opts.h2 ? <div style={{ display: "flex" }}><HoloText size={104}>{opts.h2}</HoloText></div> : null}
        {opts.body.includes("|") ? (
          <div style={{ display: "flex", marginTop: 36 }}><MultiLine text={opts.body} size={33} color="#aab2c5" lh={1.38} /></div>
        ) : (
          <div style={{ display: "flex", fontSize: 33, lineHeight: 1.38, color: "#aab2c5", marginTop: 36, maxWidth: 860 }}>{opts.body}</div>
        )}
        {opts.verdict ? (
          <div style={{ display: "flex", marginTop: 24 }}>
            <HoloText size={40} ls={-1}>{opts.verdict}</HoloText>
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", height: 10, width: 200, borderRadius: 10, backgroundImage: HOLO }} />
        <div style={{ display: "flex", fontFamily: "Clash", fontSize: 46, marginTop: 26 }}>→ link in bio</div>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 4, color: "#5C6477", marginTop: 10 }}>@pokeev.tcg</div>
      </div>
    </Frame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME 2 — "RIP OR KEEP". The product/conversion pillar: take ONE sealed set,
// weigh the Expected Value of ripping it against the sealed price, and deliver the
// verdict (RIP iff EV > sealed price — the locked site rule). One open loop (a
// blurred gap on the cover) closes at the verdict; the CTA sends people to run the
// same math on any set. Premium, never the word "box" — broad "sealed set".
// ─────────────────────────────────────────────────────────────────────────────

const RkHeader = ({ logo, label, size = 28 }: { logo: string | null; label: string; size?: number }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <Wordmark size={size} />
    <SetLogo logo={logo} label={label} />
  </div>
);

// A quiet holo cue centred at the foot of the build-up slides — keeps the swipe alive.
const RkFootCue = ({ text }: { text: string }) => (
  <div style={{ display: "flex", justifyContent: "center" }}>
    <span style={{ fontFamily: "Clash", fontSize: 24, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>{text}</span>
  </div>
);

// Body copy as deliberate, pre-split lines (split on "|") so nothing wraps into an
// orphan — every line is centred and hand-balanced. Satori's auto-wrap can't do this.
// Inline emphasis: wrap a phrase in *asterisks* to render it in the holo gradient.
const MultiLine = ({ text, size, color, lh = 1.34 }: { text: string; size: number; color: string; lh?: number }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", maxWidth: 900 }}>
    {text.split("|").map((ln, i) => (
      <div key={i} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline", maxWidth: 900 }}>
        {ln.trim().split("*").map((seg, j) =>
          seg === "" ? null : (
            <span
              key={j}
              style={{ display: "flex", whiteSpace: "pre-wrap", maxWidth: 900, fontSize: size, lineHeight: lh, ...(j % 2 === 1 ? { backgroundImage: HOLO, backgroundClip: "text", color: "transparent" } : { color }) }}
            >
              {seg}
            </span>
          ),
        )}
      </div>
    ))}
  </div>
);

// Slide 1 — the hook. The SET LOGO is the hero, big and centred (collectors recognise
// it instantly); a clean top (just the wordmark, like the CONNECTED cover); the dilemma
// headline plus a blurred "one side wins by $X" loop make people swipe for the math.
function rkCover(opts: { logo: string | null; setLabel: string; eyebrow: string; delta: string; cue: string }) {
  return (
    <Frame>
      <div style={{ display: "flex" }}>
        <Wordmark size={34} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        {opts.logo ? (
          <img src={opts.logo} width={860} height={328} style={{ display: "flex", objectFit: "contain" }} />
        ) : (
          <span style={{ display: "flex", fontFamily: "Clash", fontSize: 80, letterSpacing: -2 }}>{opts.setLabel}</span>
        )}
        <div style={{ display: "flex", fontSize: 21, letterSpacing: 5, color: "#7c8499", marginTop: 48 }}>{opts.eyebrow}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 20, alignItems: "center" }}>
          <div style={{ display: "flex" }}><HoloText size={92}>Rip it,</HoloText></div>
          <div style={{ display: "flex" }}><HoloText size={92}>or keep it?</HoloText></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 34 }}>
          <span style={{ display: "flex", fontSize: 21, letterSpacing: 3, color: "#7c8499", marginRight: 18 }}>ONE SIDE WINS BY</span>
          <BlurNumber value={opts.delta} size={64} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <span style={{ fontFamily: "Clash", fontSize: 26, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>{opts.cue}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", fontSize: 24, color: "#5C6477" }}>pokeev.com · @pokeev.tcg</div>
    </Frame>
  );
}

// Slide 2 — the temptation. The set's best pulls lined up with their market values:
// this is what ripping is chasing. Builds the desire the cold math then tests.
function rkTemptation(opts: { images: string[]; values: (string | null)[]; setLabel: string; logo: string | null; line: string }) {
  const n = Math.min(opts.images.length, 3) || 1;
  const w = n >= 3 ? 330 : 380;
  const h = Math.round(w * 1.392);
  return (
    <Frame>
      <RkHeader logo={opts.logo} label={opts.setLabel} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 23, letterSpacing: 5, color: "#7c8499" }}>IF YOU RIP IT</div>
        <div style={{ display: "flex", marginTop: 12 }}><HoloText size={62}>you&apos;re chasing these</HoloText></div>
        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 50 }}>
          {opts.images.slice(0, 3).map((src, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "0 8px" }}>
              <img src={src} width={w} height={h} style={{ display: "flex", borderRadius: 12, objectFit: "contain", boxShadow: "0 24px 60px -22px rgba(0,0,0,0.85)" }} />
              <span style={{ display: "flex", fontFamily: "Clash", fontSize: 30, marginTop: 18, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>{opts.values[i] ?? "—"}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 42 }}><MultiLine text={opts.line} size={27} color="#aab2c5" /></div>
      </div>
      <RkFootCue text="but what does it cost? →" />
    </Frame>
  );
}

// Slides 3 & 4 — the two cold numbers, one per slide: what a sealed set costs, then
// what ripping averages back (the Expected Value). Same frame, mounting tension.
function rkStat(opts: { setLabel: string; logo: string | null; kicker: string; label: string; value: string; sub: string; foot: string }) {
  return (
    <Frame>
      <RkHeader logo={opts.logo} label={opts.setLabel} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, color: "#7c8499" }}>{opts.kicker}</div>
        <div style={{ display: "flex", marginTop: 18 }}><MultiLine text={opts.label} size={30} color="#aab2c5" lh={1.3} /></div>
        <div style={{ display: "flex", marginTop: 26 }}><HoloText size={184} ls={-4}>{opts.value}</HoloText></div>
        <div style={{ display: "flex", marginTop: 36 }}><MultiLine text={opts.sub} size={27} color="#8A93A6" /></div>
      </div>
      <RkFootCue text={opts.foot} />
    </Frame>
  );
}

// Slide 5 — the face-off. Sealed price vs Expected Value side by side, with the gap
// called out in the winning colour. Maximum-tension frame; verdict is one swipe away.
function rkVersus(opts: { setLabel: string; logo: string | null; product: string; sealed: string; ev: string; gap: string; gapLabel: string; ripFavored: boolean }) {
  const accent = opts.ripFavored ? "#22D3EE" : "#E94BD0";
  return (
    <Frame>
      <RkHeader logo={opts.logo} label={opts.setLabel} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 23, letterSpacing: 5, color: "#7c8499" }}>THE FACE-OFF</div>
        {opts.product ? <div style={{ display: "flex", fontSize: 25, color: "#aab2c5", marginTop: 12 }}>{opts.product}</div> : null}
        <div style={{ display: "flex", alignItems: "center", marginTop: 50 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 376 }}>
            <span style={{ display: "flex", fontSize: 21, letterSpacing: 3, color: "#7c8499" }}>SEALED, IT COSTS</span>
            <span style={{ display: "flex", fontFamily: "Clash", fontSize: 94, letterSpacing: -3, color: "#E8ECF4", marginTop: 16 }}>{opts.sealed}</span>
          </div>
          <span style={{ display: "flex", fontFamily: "Clash", fontSize: 40, color: "#5C6477" }}>vs</span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 376 }}>
            <span style={{ display: "flex", fontSize: 21, letterSpacing: 3, color: "#7c8499" }}>RIPPED, IT AVERAGES</span>
            <div style={{ display: "flex", marginTop: 16 }}><HoloText size={94} ls={-3}>{opts.ev}</HoloText></div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 58 }}>
          <span style={{ display: "flex", fontSize: 23, letterSpacing: 3, color: "#7c8499", marginRight: 16 }}>{opts.gapLabel}</span>
          <span style={{ display: "flex", fontFamily: "Clash", fontSize: 66, letterSpacing: -2, color: accent }}>{opts.gap}</span>
        </div>
      </div>
      <RkFootCue text="the verdict →" />
    </Frame>
  );
}

// Slide 6 — the payoff. The single-word verdict (RIP IT / KEEP IT SEALED) with the
// one-line reason and the rule that drove it. The loop opened on slide 1 closes here.
function rkVerdict(opts: { setLabel: string; logo: string | null; verdict: string; reason: string; sealed: string; ev: string; ripFavored: boolean }) {
  const cmp = opts.ripFavored ? ">" : "<";
  // "RIP IT" fits one big line; "KEEP IT SEALED" is passed as "KEEP IT|SEALED" and
  // stacks — size by the longest segment so neither verdict overflows the frame.
  const vlines = opts.verdict.split("|").map((s) => s.trim()).filter(Boolean);
  const vlongest = Math.max(...vlines.map((l) => l.length), 1);
  const vsize = vlongest <= 8 ? 130 : vlongest <= 12 ? 108 : 92;
  return (
    <Frame>
      <RkHeader logo={opts.logo} label={opts.setLabel} size={30} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 6, color: "#7c8499", marginBottom: 24 }}>THE VERDICT</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {vlines.map((ln, i) => (
            <div key={i} style={{ display: "flex" }}><HoloText size={vsize} ls={-3}>{ln}</HoloText></div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 40 }}><MultiLine text={opts.reason} size={31} color="#aab2c5" lh={1.4} /></div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 42, padding: "18px 34px", borderRadius: 18, border: "1px solid #232a36" }}>
          <span style={{ display: "flex", fontFamily: "Clash", fontSize: 34, color: "#E8ECF4" }}>EV {opts.ev}</span>
          <span style={{ display: "flex", fontFamily: "Clash", fontSize: 42, margin: "0 20px", backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>{cmp}</span>
          <span style={{ display: "flex", fontFamily: "Clash", fontSize: 34, color: "#9aa3b5" }}>Sealed {opts.sealed}</span>
        </div>
      </div>
      <RkFootCue text="one more →" />
    </Frame>
  );
}

// Slide 7 — the conversion. The verdict you just saw was one set; the site runs the
// exact same math, live, on any sealed set. Straight to the link in bio.
function rkCta(opts: { eyebrow: string; h1: string; h2: string; body: string }) {
  return (
    <Frame>
      <div style={{ display: "flex" }}><Wordmark size={34} /></div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 5, color: "#7c8499", marginBottom: 22 }}>{opts.eyebrow}</div>
        <div style={{ display: "flex" }}><HoloText size={100}>{opts.h1}</HoloText></div>
        <div style={{ display: "flex" }}><HoloText size={100}>{opts.h2}</HoloText></div>
        <div style={{ display: "flex", marginTop: 36 }}><MultiLine text={opts.body} size={33} color="#aab2c5" lh={1.38} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", height: 10, width: 200, borderRadius: 10, backgroundImage: HOLO }} />
        <div style={{ display: "flex", fontFamily: "Clash", fontSize: 46, marginTop: 26 }}>→ link in bio</div>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 4, color: "#5C6477", marginTop: 10 }}>@pokeev.tcg</div>
      </div>
    </Frame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME 3 — "GRAILS". The money/reach pillar, as a single-card story (distinct from
// T1's multi-card art assembly): one grail per post. Slide 1 is a money SHOCK (this
// one card outprices a real-world object); the rest answer "but why is it worth that?"
// — the card, the artist, the art, the odds, the synthesis. No combined total, no
// assembly. CTA reuses connectedCta (value your own cards).
// ─────────────────────────────────────────────────────────────────────────────

// Slide 1 — THE SHOCK. The grail big, with a relatable money comparison. The hook
// that stops the scroll; "but why?" is the loop the story slides pay off.
function grailShock(opts: { image: string; setLabel: string; logo: string | null; eyebrow: string; headline: string; price: string; priceNote: string; cue: string }) {
  const lines = opts.headline.split("|").map((s) => s.trim()).filter(Boolean);
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const hsize = longest <= 14 ? 84 : longest <= 19 ? 70 : 58;
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={34} />
        <SetLogo logo={opts.logo} label={opts.setLabel} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <img src={opts.image} width={432} height={602} style={{ display: "flex", borderRadius: 16, objectFit: "contain", boxShadow: "0 34px 84px -22px rgba(0,0,0,0.92)" }} />
        <div style={{ display: "flex", fontSize: 21, letterSpacing: 6, color: "#7c8499", marginTop: 34 }}>{opts.eyebrow}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 16, alignItems: "center" }}>
          {lines.map((ln, i) => (
            <div key={i} style={{ display: "flex" }}><HoloText size={hsize}>{ln}</HoloText></div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 28 }}>
          <span style={{ display: "flex", fontFamily: "Clash", fontSize: 66, letterSpacing: -2, color: "#E8ECF4" }}>{opts.price}</span>
          <span style={{ display: "flex", fontSize: 22, letterSpacing: 1, color: "#7c8499", marginTop: 8 }}>{opts.priceNote}</span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <span style={{ fontFamily: "Clash", fontSize: 26, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>{opts.cue}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", fontSize: 24, color: "#5C6477" }}>pokeev.com · @pokeev.tcg</div>
    </Frame>
  );
}

// Slides 2–3 — THE STORY. The card is the hero (big, floated), with an aerated text
// block beneath: kicker, holo headline (the card / the artist), and a short body.
// Generous spacing — nothing stacked or cramped.
function grailStory(opts: { image: string; setLabel: string; logo: string | null; kicker: string; headline: string; body: string; tilt: number }) {
  const lines = opts.headline.split("|").map((s) => s.trim()).filter(Boolean);
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const hsize = longest <= 16 ? 56 : longest <= 24 ? 46 : 38;
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={28} />
        <SetLogo logo={opts.logo} label={opts.setLabel} />
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
        <img src={opts.image} width={644} height={898} style={{ display: "flex", borderRadius: 18, objectFit: "contain", transform: `rotate(${opts.tilt}deg)`, boxShadow: "0 40px 100px -24px rgba(0,0,0,0.9)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 20, letterSpacing: 6, color: "#7c8499" }}>{opts.kicker}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 14, alignItems: "center" }}>
          {lines.map((ln, i) => (
            <div key={i} style={{ display: "flex" }}><HoloText size={hsize}>{ln}</HoloText></div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 24 }}><MultiLine text={opts.body} size={27} color="#aab2c5" lh={1.45} /></div>
      </div>
    </Frame>
  );
}

// Slide 4 — THE DETAIL. FULL-BLEED: the zoomed art fills the whole slide (the crop
// is param-driven zw/zx/zy on an upscaled source), with the wordmark up top and the
// caption over a bottom scrim. Immersive — the whole frame IS the artwork.
function grailZoom(opts: { image: string; setLabel: string; logo: string | null; kicker: string; headline: string; body: string; win: number; winH: number; zw: number; zx: number; zy: number; foot: string }) {
  const lines = opts.headline.split("|").map((s) => s.trim()).filter(Boolean);
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const hsize = longest <= 16 ? 62 : longest <= 24 ? 50 : 40;
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", background: BG, color: "#E8ECF4", fontFamily: "Satoshi, sans-serif" }}>
      <img src={opts.image} width={opts.zw} height={Math.round(opts.zw * 1.394)} style={{ display: "flex", position: "absolute", left: opts.zx, top: opts.zy }} />
      <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "100%", height: 300, background: "linear-gradient(to bottom, rgba(11,14,20,0.82), rgba(11,14,20,0))" }} />
      <div style={{ display: "flex", position: "absolute", bottom: 0, left: 0, width: "100%", height: 660, background: "linear-gradient(to top, rgba(11,14,20,0.98) 32%, rgba(11,14,20,0))" }} />
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", top: 0, left: 0, width: "100%", height: "100%", padding: 72, justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Wordmark size={28} />
          <SetLogo logo={opts.logo} label={opts.setLabel} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", background: "rgba(8,11,17,0.62)", borderRadius: 32, padding: "28px 46px" }}>
          <div style={{ display: "flex", fontSize: 20, letterSpacing: 6, color: "#9aa3b5" }}>{opts.kicker}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 14, alignItems: "center" }}>
            {lines.map((ln, i) => (
              <div key={i} style={{ display: "flex" }}><HoloText size={hsize}>{ln}</HoloText></div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 22 }}><MultiLine text={opts.body} size={27} color="#c6cdda" lh={1.45} /></div>
          <div style={{ display: "flex", marginTop: 30 }}>
            <span style={{ fontFamily: "Clash", fontSize: 24, backgroundImage: HOLO, backgroundClip: "text", color: "transparent" }}>{opts.foot}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Slide 5 — THE ODDS. The scarcity, made striking: real set booster packs in a row,
// the number ALONE on one line (huge holo), an aerated caption. No stacked text.
function grailOdds(opts: { boosters: string[]; setLabel: string; logo: string | null; kicker: string; statA: string; statB: string; statSub: string; body: string; foot: string }) {
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={28} />
        <SetLogo logo={opts.logo} label={opts.setLabel} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        {opts.kicker ? <div style={{ display: "flex", fontSize: 21, letterSpacing: 6, color: "#7c8499" }}>{opts.kicker}</div> : null}
        {opts.boosters.length > 0 ? (
        <div style={{ display: "flex", position: "relative", width: 860, height: 568, alignItems: "center", justifyContent: "center", marginTop: 6 }}>
          {opts.boosters.map((src, i) => {
            const n = opts.boosters.length || 1;
            const t = i - (n - 1) / 2;
            const bw = 286;
            const bh = Math.round(bw * 1.81);
            const rot = Math.round(t * 125) / 10;
            const left = Math.round(430 - bw / 2 + t * 126);
            const top = Math.round(8 + Math.abs(t) * 30);
            return (
              <img key={i} src={src} width={bw} height={bh} style={{ position: "absolute", left, top, display: "flex", objectFit: "contain", transform: `rotate(${rot}deg)`, boxShadow: "0 26px 60px -22px rgba(0,0,0,0.9)" }} />
            );
          })}
        </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "baseline", marginTop: 50 }}>
          <HoloText size={140} ls={-3}>{opts.statA}</HoloText>
          <span style={{ display: "flex", fontSize: 50, color: "#5C6477", margin: "0 40px" }}>in</span>
          <HoloText size={140} ls={-3}>{opts.statB}</HoloText>
        </div>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, color: "#8A93A6", marginTop: 26 }}>{opts.statSub}</div>
        <div style={{ display: "flex", marginTop: 34 }}><MultiLine text={opts.body} size={27} color="#aab2c5" lh={1.45} /></div>
      </div>
      <RkFootCue text={opts.foot} />
    </Frame>
  );
}

export async function GET(request: NextRequest) {
  if (!rateLimit(`ig:${clientIp(request)}`, 60, 60_000)) {
    return new Response("Too many requests", { status: 429 });
  }
  const p = request.nextUrl.searchParams;
  const slide = p.get("slide") ?? "cover";
  // Numeric query param with a default (e.g. the grail-zoom crop offsets).
  const pnum = (k: string, def: number) => {
    const r = p.get(k);
    const n = Number(r);
    return r && Number.isFinite(n) ? n : def;
  };
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
  } else if (slide === "connect" || slide === "connect-cta" || slide === "connect-reveal" || slide === "connect-cover") {
    const imgs: string[] = [];
    const values: (string | null)[] = [];
    for (let i = 0; i < 10; i++) {
      const u = imgParam(p.get(`img${i}`));
      if (!u) break;
      imgs.push(u);
      values.push(moneyParam(p.get(`v${i}`)));
    }
    const logo = imgParam(p.get("logo"));
    const setLabel = textParam(p.get("set"), 40) ?? "";
    if (slide === "connect-cover") {
      if (!imgs.length) return new Response("not found", { status: 404 });
      element = connectCoverSlide({
        eyebrow: textParam(p.get("eyebrow"), 48) ?? "",
        headline: textParam(p.get("headline"), 26) ?? "One illustration.",
        total: moneyParam(p.get("title")) ?? "$0",
        cue: textParam(p.get("cue"), 30) ?? "swipe →",
        images: imgs,
      });
    } else if (slide === "connect-cta") {
      element = connectedCta({
        setLabel,
        logo,
        eyebrow: textParam(p.get("eyebrow"), 30) ?? "BEFORE YOU RIP IT",
        h1: textParam(p.get("h1"), 30) ?? "Open it,",
        h2: textParam(p.get("h2"), 18) ?? "",
        body: textParam(p.get("body"), 200) ?? "pokeev.com runs the live Expected Value on any sealed product, so you know if a set is worth ripping.",
        verdict: textParam(p.get("verdict"), 40),
      });
    } else if (slide === "connect-reveal") {
      if (!imgs.length) return new Response("not found", { status: 404 });
      element = connectedReveal({
        images: imgs,
        values,
        title: textParam(p.get("title"), 40) ?? "",
        setLabel,
        logo,
        total: moneyParam(p.get("total")),
        bridge: textParam(p.get("bridge"), 130),
        footerLeft: textParam(p.get("footerLeft"), 60) ?? "pokeev.com · @pokeev.tcg",
      });
    } else {
      // a single card, whole and centred on its own slide
      if (!imgs.length) return new Response("not found", { status: 404 });
      element = connectedCard({ image: imgs[0], name: textParam(p.get("name"), 40) ?? "", value: moneyParam(p.get("val")), setLabel, logo, series: textParam(p.get("series"), 48) ?? "", tally: textParam(p.get("tally"), 40) });
    }
  } else if (slide.startsWith("rk-")) {
    const logo = imgParam(p.get("logo"));
    const setLabel = textParam(p.get("set"), 40) ?? "";
    const ripFavored = p.get("rip") === "1";
    if (slide === "rk-cover") {
      element = rkCover({
        logo,
        setLabel,
        eyebrow: textParam(p.get("eyebrow"), 48) ?? "",
        delta: moneyParam(p.get("delta")) ?? "$0",
        cue: textParam(p.get("cue"), 30) ?? "swipe →",
      });
    } else if (slide === "rk-tempt") {
      const imgs: string[] = [];
      const values: (string | null)[] = [];
      for (let i = 0; i < 3; i++) {
        const u = imgParam(p.get(`img${i}`));
        if (!u) break;
        imgs.push(u);
        values.push(moneyParam(p.get(`v${i}`)));
      }
      if (!imgs.length) return new Response("not found", { status: 404 });
      element = rkTemptation({ images: imgs, values, setLabel, logo, line: textParam(p.get("line"), 130) ?? "" });
    } else if (slide === "rk-stat") {
      element = rkStat({
        setLabel,
        logo,
        kicker: textParam(p.get("kicker"), 30) ?? "",
        label: textParam(p.get("label"), 72) ?? "",
        value: moneyParam(p.get("value")) ?? "$0",
        sub: textParam(p.get("sub"), 130) ?? "",
        foot: textParam(p.get("foot"), 30) ?? "keep going →",
      });
    } else if (slide === "rk-versus") {
      element = rkVersus({
        setLabel,
        logo,
        product: textParam(p.get("product"), 48) ?? "",
        sealed: moneyParam(p.get("sealed")) ?? "$0",
        ev: moneyParam(p.get("ev")) ?? "$0",
        gap: moneyParam(p.get("gap")) ?? "$0",
        gapLabel: textParam(p.get("gapLabel"), 40) ?? "THE GAP",
        ripFavored,
      });
    } else if (slide === "rk-verdict") {
      element = rkVerdict({
        setLabel,
        logo,
        verdict: textParam(p.get("verdict"), 20) ?? "RIP IT",
        reason: textParam(p.get("reason"), 150) ?? "",
        sealed: moneyParam(p.get("sealed")) ?? "$0",
        ev: moneyParam(p.get("ev")) ?? "$0",
        ripFavored,
      });
    } else {
      element = rkCta({
        eyebrow: textParam(p.get("eyebrow"), 30) ?? "NOW DO IT FOR ANY SET",
        h1: textParam(p.get("h1"), 18) ?? "Rip or keep?",
        h2: textParam(p.get("h2"), 18) ?? "Know in seconds.",
        body: textParam(p.get("body"), 200) ?? "pokeev.com runs the live Expected Value on every sealed set, so you never rip blind again.",
      });
    }
  } else if (slide.startsWith("grail")) {
    const logo = imgParam(p.get("logo"));
    const setLabel = textParam(p.get("set"), 40) ?? "";
    if (slide === "grail-shock") {
      const img = imgParam(p.get("img0"));
      if (!img) return new Response("not found", { status: 404 });
      element = grailShock({
        image: img,
        setLabel,
        logo,
        eyebrow: textParam(p.get("eyebrow"), 40) ?? "ONE POKÉMON CARD",
        headline: textParam(p.get("headline"), 48) ?? "",
        price: moneyParam(p.get("price")) ?? "$0",
        priceNote: textParam(p.get("note"), 30) ?? "for one card",
        cue: textParam(p.get("cue"), 30) ?? "but why? swipe →",
      });
    } else if (slide === "grail-zoom") {
      const img = imgParam(p.get("img0"));
      if (!img) return new Response("not found", { status: 404 });
      element = grailZoom({
        image: img,
        setLabel,
        logo,
        kicker: textParam(p.get("kicker"), 30) ?? "",
        headline: textParam(p.get("headline"), 48) ?? "",
        body: textParam(p.get("body"), 260) ?? "",
        win: Math.min(920, Math.max(200, pnum("win", 640))),
        winH: Math.min(900, Math.max(160, pnum("winH", 470))),
        zw: Math.min(6000, Math.max(400, pnum("zw", 1180))),
        zx: Math.min(400, Math.max(-7000, pnum("zx", -300))),
        zy: Math.min(400, Math.max(-7000, pnum("zy", -150))),
        foot: textParam(p.get("foot"), 30) ?? "swipe →",
      });
    } else if (slide === "grail-odds") {
      const boosters: string[] = [];
      for (let i = 0; i < 6; i++) {
        const u = imgParam(p.get(`b${i}`));
        if (!u) break;
        boosters.push(u);
      }
      element = grailOdds({
        boosters,
        setLabel,
        logo,
        kicker: textParam(p.get("kicker"), 30) ?? "",
        statA: textParam(p.get("statA"), 8) ?? "1",
        statB: textParam(p.get("statB"), 8) ?? "",
        statSub: textParam(p.get("statSub"), 40) ?? "",
        body: textParam(p.get("body"), 260) ?? "",
        foot: textParam(p.get("foot"), 30) ?? "swipe →",
      });
    } else {
      const img = imgParam(p.get("img0"));
      if (!img) return new Response("not found", { status: 404 });
      element = grailStory({
        image: img,
        setLabel,
        logo,
        kicker: textParam(p.get("kicker"), 30) ?? "",
        headline: textParam(p.get("headline"), 48) ?? "",
        body: textParam(p.get("body"), 260) ?? "",
        tilt: Math.min(12, Math.max(-12, pnum("tilt", 0))),
      });
    }
  } else {
    const mask = Math.max(0, Math.min(3, Number(p.get("mask")) || 0));
    element = coverSlide(theme, mask, step, total);
  }

  return new ImageResponse(element, { ...SIZE, fonts });
}
