// Shared @pokeev.tcg brand tokens for the vertical Reels — kept pixel-identical to the
// carousel renderer (src/app/api/ig/route.tsx) so the Reel and the carousel feel like the
// same product: dark-holo background, the holo gradient, Clash Display + Satoshi.
import { continueRender, delayRender, staticFile } from "remotion";

export const BG = "#0B0E14";
export const INK = "#E8ECF4";
export const MUTE = "#aab2c5";
export const PANEL = "#161b24";
export const HOLO = "linear-gradient(116deg, #22D3EE 0%, #8B5CF6 50%, #E94BD0 100%)";
export const HOLO_ANGLE = (deg: number) =>
  `linear-gradient(${deg}deg, #22D3EE 0%, #8B5CF6 50%, #E94BD0 100%)`;
export const GLOW =
  "radial-gradient(circle at 50% 42%, rgba(139,92,246,0.40), rgba(34,211,238,0.12) 38%, rgba(11,14,20,0) 66%)";

export const CLASH = "Clash, sans-serif";
export const SATOSHI = "Satoshi, sans-serif";

// Holo gradient text (the brand's signature accent). Returns inline styles that clip the
// gradient to the glyphs — used for hero numbers and accent words.
export const holoText = (angle = 116) =>
  ({
    color: "transparent",
    backgroundImage: HOLO_ANGLE(angle),
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
  }) as const;

// Soft holo edge-glow behind a card so the art pops off the dark background.
export const cardGlow = "0 40px 110px -30px rgba(34,211,238,0.45), 0 24px 70px -28px rgba(139,92,246,0.5)";

// One delayRender gate that holds the render until BOTH brand fonts are ready, so no frame
// is ever captured with a fallback font. Imported for its side effect by the Root.
let started = false;
export function ensureFonts(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  const handle = delayRender("load-brand-fonts");
  const faces: Array<[string, string, string]> = [
    ["Clash", "fonts/clash-display-700.ttf", "700"],
    ["Satoshi", "fonts/satoshi-500.ttf", "500"],
  ];
  Promise.all(
    faces.map(([family, file, weight]) => {
      const ff = new FontFace(family, `url(${staticFile(file)})`, { weight });
      return ff.load().then((loaded) => {
        (document.fonts as FontFaceSet).add(loaded);
      });
    }),
  )
    .then(() => continueRender(handle))
    .catch(() => continueRender(handle));
}
