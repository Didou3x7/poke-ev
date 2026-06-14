import { ImageResponse } from "next/og";

// iOS home-screen icon. Full-bleed dark square (iOS applies its own rounded
// mask), with the holo "EV" monogram centred — same mark as icon.svg.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const EV_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="h" gradientUnits="userSpaceOnUse" x1="14" y1="20" x2="50" y2="44"><stop offset="0" stop-color="#22D3EE"/><stop offset="0.5" stop-color="#8B5CF6"/><stop offset="1" stop-color="#E94BD0"/></linearGradient></defs><g fill="none" stroke="url(#h)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"><path d="M28 19H16v26h12"/><path d="M16 32h10"/><path d="M33 19l7.5 26L48 19"/></g></svg>`;

export default function AppleIcon() {
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
        <img width="120" height="120" src={`data:image/svg+xml,${encodeURIComponent(EV_SVG)}`} alt="" />
      </div>
    ),
    { ...size },
  );
}
