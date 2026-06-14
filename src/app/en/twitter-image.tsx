import { renderOgImage, OG_SIZE } from "@/lib/og/og-image";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Poké EV — Expected Value calculator for sealed Pokémon TCG products";

export default function Image() {
  return renderOgImage("en");
}
