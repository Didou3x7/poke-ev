import { ImageResponse } from "next/og";

// 512×512 maskable PWA icon (referenced by manifest.ts). Full-bleed dark with
// the holo "EV" monogram inset to ~66% for the maskable safe zone.
const EV_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="h" gradientUnits="userSpaceOnUse" x1="14" y1="20" x2="50" y2="44"><stop offset="0" stop-color="#22D3EE"/><stop offset="0.5" stop-color="#8B5CF6"/><stop offset="1" stop-color="#E94BD0"/></linearGradient></defs><g fill="none" stroke="url(#h)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"><path d="M28 19H16v26h12"/><path d="M16 32h10"/><path d="M33 19l7.5 26L48 19"/></g></svg>`;

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B0E14",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width="338" height="338" src={`data:image/svg+xml,${encodeURIComponent(EV_SVG)}`} alt="" />
      </div>
    ),
    { width: 512, height: 512 },
  );
}
