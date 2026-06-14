import type { RarityId } from "@/lib/ev/rarity";
import type { Locale } from "./config";

/** Display names for normalized rarities. */
const labels: Record<RarityId, { fr: string; en: string }> = {
  "common": { fr: "Commune", en: "Common" },
  "uncommon": { fr: "Peu commune", en: "Uncommon" },
  "rare": { fr: "Rare", en: "Rare" },
  "rare-holo": { fr: "Rare Holo", en: "Rare Holo" },
  "double-rare": { fr: "Double rare (ex)", en: "Double Rare (ex)" },
  "ultra-rare": { fr: "Ultra rare (full art)", en: "Ultra Rare (full art)" },
  "illustration-rare": { fr: "Illustration rare", en: "Illustration Rare" },
  "special-illustration-rare": { fr: "Illustration spéciale rare", en: "Special Illustration Rare" },
  "hyper-rare": { fr: "Hyper rare (gold)", en: "Hyper Rare (gold)" },
  "ace-spec": { fr: "ACE SPEC", en: "ACE SPEC" },
  "shiny-rare": { fr: "Chromatique rare", en: "Shiny Rare" },
  "shiny-ultra-rare": { fr: "Chromatique ultra rare", en: "Shiny Ultra Rare" },
  "rare-holo-v": { fr: "Rare Holo V", en: "Rare Holo V" },
  "rare-holo-vmax": { fr: "Rare Holo VMAX", en: "Rare Holo VMAX" },
  "rare-holo-vstar": { fr: "Rare Holo VSTAR", en: "Rare Holo VSTAR" },
  "radiant": { fr: "Radieux", en: "Radiant" },
  "amazing": { fr: "Magnifique", en: "Amazing Rare" },
  "trainer-gallery": { fr: "Galerie Dresseurs", en: "Trainer Gallery" },
  "galarian-gallery": { fr: "Galerie de Galar", en: "Galarian Gallery" },
  "secret-rare": { fr: "Secrète rare", en: "Secret Rare" },
  "rainbow-rare": { fr: "Arc-en-ciel rare", en: "Rainbow Rare" },
  "gold-rare": { fr: "Or rare", en: "Gold Rare" },
  "shiny-vault": { fr: "Shiny Vault", en: "Shiny Vault" },
  "mega-ex": { fr: "Méga-ex", en: "Mega ex" },
  "black-white-rare": { fr: "Rare Noir & Blanc", en: "Black & White Rare" },
};

export function rarityLabel(id: RarityId, locale: Locale): string {
  return labels[id]?.[locale] ?? id;
}
