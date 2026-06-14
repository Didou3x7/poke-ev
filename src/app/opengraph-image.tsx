import { renderOgImage, OG_SIZE } from "@/lib/og/og-image";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Poké EV — calculateur d'Expected Value pour les produits scellés Pokémon TCG";

export default function Image() {
  return renderOgImage("fr");
}
