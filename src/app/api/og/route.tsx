import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { getSetById } from "@/lib/data/catalog";
import { getSnapshot } from "@/lib/data/snapshot";
import { formatMoney, type Locale } from "@/lib/i18n/config";

/**
 * Dynamic share cards: /api/og?locale=fr&page=home
 *                      /api/og?locale=fr&set=151&verdict=open&margin=+18%
 * Dark holo-terminal design matching the site.
 */

export const runtime = "nodejs";
export const revalidate = 3600;

const HOLO = "linear-gradient(108deg, #22D3EE 0%, #8B5CF6 48%, #E94BD0 100%)";

async function loadFonts() {
  const dir = join(process.cwd(), "src", "assets", "og");
  const [clash, satoshi] = await Promise.all([
    readFile(join(dir, "clash-display-700.ttf")),
    readFile(join(dir, "satoshi-500.ttf")),
  ]);
  return [
    { name: "Clash", data: clash, weight: 700 as const },
    { name: "Satoshi", data: satoshi, weight: 500 as const },
  ];
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const locale: Locale = params.get("locale") === "en" ? "en" : "fr";
  const setId = params.get("set");
  const verdict = params.get("verdict");
  // Reflected into the share-card text — strip anything but the expected
  // money/percent glyphs and cap the length so a crafted query can't distort the
  // image or inject odd content.
  const margin = ((params.get("margin") ?? "").replace(/[^0-9+\-.,%€$ ]/g, "").slice(0, 12)) || null;

  const set = setId ? getSetById(setId) : null;
  const snapshot = set ? await getSnapshot() : null;
  const ev = set && snapshot ? (snapshot.sets[set.id]?.ev?.[locale] ?? null) : null;
  const setName = set ? (locale === "fr" ? set.nameFr : set.nameEn) : null;

  const title = setName ?? "Poké EV";
  const subtitle = setName
    ? ev
      ? `EV ${locale === "fr" ? "booster" : "pack"} · ${formatMoney(ev.packEv, locale)}`
      : locale === "fr"
        ? "EV indisponible"
        : "EV unavailable"
    : locale === "fr"
      ? "Tu l'ouvres, ou tu le gardes ?"
      : "Rip it, or keep it sealed?";
  const verdictLabel =
    verdict === "open"
      ? locale === "fr"
        ? "OUVRE"
        : "OPEN"
      : verdict === "keep"
        ? locale === "fr"
          ? "GARDE"
          : "KEEP"
        : null;
  const verdictColor = verdict === "open" ? "#34D399" : "#F5B547";
  const disclaimer =
    locale === "fr" ? "Estimation statistique, pas un conseil financier · pokeev.com" : "Statistical estimate, not financial advice · pokeev.com";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(180deg, #0B0E14 0%, #131A26 100%)",
          color: "#E8ECF4",
          fontFamily: "Satoshi",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "Clash", fontSize: 40 }}>Poké</span>
            <span
              style={{
                fontFamily: "Clash",
                fontSize: 40,
                backgroundImage: HOLO,
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              EV
            </span>
          </div>
          <span style={{ fontSize: 22, color: "#8A93A6", letterSpacing: 4 }}>
            EXPECTED VALUE · POKÉMON TCG
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontFamily: "Clash", fontSize: 88, lineHeight: 1.02, letterSpacing: -2 }}>
            {title}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <span
              style={{
                fontSize: 40,
                backgroundImage: HOLO,
                backgroundClip: "text",
                color: "transparent",
                fontFamily: "Clash",
              }}
            >
              {subtitle}
            </span>
            {verdictLabel ? (
              <span
                style={{
                  fontFamily: "Clash",
                  fontSize: 36,
                  color: verdictColor,
                  border: `3px solid ${verdictColor}`,
                  borderRadius: 18,
                  padding: "6px 28px",
                  letterSpacing: 6,
                }}
              >
                {verdictLabel}
                {margin ? `  ${margin}` : ""}
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", height: 6, borderRadius: 3, backgroundImage: HOLO }} />
        <span style={{ fontSize: 22, color: "#5C6477" }}>{disclaimer}</span>
      </div>
    ),
    { width: 1200, height: 630, fonts: await loadFonts() },
  );
}
