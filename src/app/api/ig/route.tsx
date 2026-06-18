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

function coverSlide(theme: { tag: string; title: string; sub: string }) {
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark />
        <span style={{ fontSize: 20, letterSpacing: 5, color: "#8A93A6", border: "1px solid #232a36", borderRadius: 999, padding: "8px 20px" }}>
          {theme.tag}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: "#7c8499" }}>POKÉMON TCG · EXPECTED VALUE</div>
        <div style={{ display: "flex", marginTop: 14 }}>
          <HoloText size={150}>{theme.title}</HoloText>
        </div>
        <div style={{ display: "flex", width: 180, height: 10, borderRadius: 10, marginTop: 36, backgroundImage: HOLO }} />
        <div style={{ display: "flex", fontSize: 42, lineHeight: 1.3, color: "#aab2c5", marginTop: 40, maxWidth: 820 }}>{theme.sub}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: "#5C6477" }}>
        <span>pokeev.com</span>
        <span style={{ color: "#8A93A6" }}>swipe →</span>
      </div>
    </Frame>
  );
}

function cardSlide(opts: { rank: number; tag: string; name: string; setName: string; image: string; price: string; ev: string | null }) {
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={28} />
        <span style={{ fontSize: 18, letterSpacing: 4, color: "#8A93A6" }}>{opts.tag}</span>
      </div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "absolute", top: 70, width: 720, height: 720, borderRadius: 9999, background: GLOW }} />
        <div style={{ display: "flex", position: "relative", alignItems: "flex-start" }}>
          <img
            src={opts.image}
            width={580}
            height={812}
            style={{ borderRadius: 24, objectFit: "contain", boxShadow: "0 36px 90px -24px rgba(0,0,0,0.85)" }}
          />
          <div
            style={{
              position: "absolute",
              top: -26,
              left: -26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 92,
              height: 92,
              borderRadius: 9999,
              backgroundImage: HOLO,
              color: "#0B0E14",
              fontFamily: "Clash",
              fontSize: 46,
            }}
          >
            {opts.rank}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontFamily: "Clash", fontSize: 56, letterSpacing: -1 }}>{opts.name}</div>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 2, color: "#7c8499", marginTop: 6 }}>{opts.setName.toUpperCase()}</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 26 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 20, letterSpacing: 3, color: "#7c8499" }}>MARKET PRICE</span>
            <HoloText size={96} ls={-3}>{opts.price}</HoloText>
          </div>
          {opts.ev ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginBottom: 14 }}>
              <span style={{ fontSize: 20, letterSpacing: 3, color: "#7c8499" }}>BOOSTER EV</span>
              <span style={{ fontFamily: "Clash", fontSize: 52, color: "#E8ECF4" }}>{opts.ev}</span>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", marginTop: 30, fontSize: 22, letterSpacing: 4, color: "#5C6477" }}>@pokeev.tcg · pokeev.com</div>
      </div>
    </Frame>
  );
}

function ctaSlide() {
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Wordmark size={40} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex" }}>
          <HoloText size={128}>Rip it or</HoloText>
        </div>
        <div style={{ display: "flex" }}>
          <HoloText size={128}>keep it?</HoloText>
        </div>
        <div style={{ display: "flex", fontSize: 40, lineHeight: 1.35, color: "#aab2c5", marginTop: 44, maxWidth: 820 }}>
          pokeev.com runs the math — Expected Value vs the price you actually pay.
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", height: 10, width: 200, borderRadius: 10, backgroundImage: HOLO }} />
        <div style={{ display: "flex", fontFamily: "Clash", fontSize: 46, marginTop: 30 }}>→ link in bio</div>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 4, color: "#5C6477", marginTop: 10 }}>@pokeev.tcg</div>
      </div>
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

  let element: React.ReactElement;
  if (slide === "cta") {
    element = ctaSlide();
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
    });
  } else {
    element = coverSlide(theme);
  }

  return new ImageResponse(element, { ...SIZE, fonts });
}
