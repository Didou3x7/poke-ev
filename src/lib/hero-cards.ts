import type { Locale } from "./i18n/config";

/**
 * Iconic card pool for the landing hero — modern chase cards: Special
 * Illustration Rares from the latest sets (Pikachu ex, Sylveon ex, Lillie's
 * Clefairy ex, N's Zoroark ex, Bloodmoon Ursaluna ex…), alt-art VMAX, and a few
 * Base Set classics. Every card has a clean transparent-corner scan so it frames
 * perfectly (no black corners), and a real French print.
 *
 * Images come from TCGdex's localized CDN, so the FR site shows the
 * French-printed card and the EN site the English print of the same card. Every
 * `path` was verified to return 200 in both /fr/ and /en/.
 */

export interface HeroCard {
  path: string;
  name: string;
  tag: string;
}

interface BiCard {
  path: string;
  fr: { name: string; tag: string };
  en: { name: string; tag: string };
}

const img = (locale: Locale, path: string) => `https://assets.tcgdex.net/${locale}/${path}/high.webp`;

export function heroCardImage(locale: Locale, card: HeroCard): string {
  return img(locale, card.path);
}

// Even indices feed the left track, odd indices the right — so the two sides
// each get a varied mix of Gold Stars and modern hits.
const POOL: BiCard[] = [
  { path: "base/base1/4", fr: { name: "Dracaufeu", tag: "Set de Base · 1999" }, en: { name: "Charizard", tag: "Base Set · 1999" } },
  { path: "sv/sv08/238", fr: { name: "Pikachu-ex", tag: "Étincelles Déferlantes" }, en: { name: "Pikachu ex", tag: "Surging Sparks" } },
  { path: "sv/sv08.5/161", fr: { name: "Noctali-ex", tag: "Évolutions Prismatiques" }, en: { name: "Umbreon ex", tag: "Prismatic Evolutions" } },
  { path: "swsh/swsh7/215", fr: { name: "Noctali VMAX", tag: "Évolutions Célestes" }, en: { name: "Umbreon VMAX", tag: "Evolving Skies" } },
  { path: "sv/sv08.5/156", fr: { name: "Nymphali-ex", tag: "Évolutions Prismatiques" }, en: { name: "Sylveon ex", tag: "Prismatic Evolutions" } },
  { path: "sv/sv03.5/199", fr: { name: "Dracaufeu-ex", tag: "151" }, en: { name: "Charizard ex", tag: "151" } },
  { path: "base/base1/58", fr: { name: "Pikachu", tag: "Set de Base · 1999" }, en: { name: "Pikachu", tag: "Base Set · 1999" } },
  { path: "sv/sv09/184", fr: { name: "Mélofée-ex de Lilie", tag: "Aventures Ensemble" }, en: { name: "Lillie's Clefairy ex", tag: "Journey Together" } },
  { path: "swsh/swsh7/212", fr: { name: "Nymphali VMAX", tag: "Évolutions Célestes" }, en: { name: "Sylveon VMAX", tag: "Evolving Skies" } },
  { path: "swsh/swsh8/269", fr: { name: "Mew VMAX", tag: "Poing de Fusion" }, en: { name: "Mew VMAX", tag: "Fusion Strike" } },
  { path: "sv/sv08.5/155", fr: { name: "Mentali-ex", tag: "Évolutions Prismatiques" }, en: { name: "Espeon ex", tag: "Prismatic Evolutions" } },
  { path: "swsh/swsh7/205", fr: { name: "Phyllali VMAX", tag: "Évolutions Célestes" }, en: { name: "Leafeon VMAX", tag: "Evolving Skies" } },
  { path: "base/base1/2", fr: { name: "Tortank", tag: "Set de Base · 1999" }, en: { name: "Blastoise", tag: "Base Set · 1999" } },
  { path: "sv/sv09/185", fr: { name: "Zoroark-ex de N", tag: "Aventures Ensemble" }, en: { name: "N's Zoroark ex", tag: "Journey Together" } },
  { path: "swsh/swsh7/218", fr: { name: "Rayquaza VMAX", tag: "Évolutions Célestes" }, en: { name: "Rayquaza VMAX", tag: "Evolving Skies" } },
  { path: "swsh/swsh12.5/GG44", fr: { name: "Mewtwo VSTAR", tag: "Zénith Suprême" }, en: { name: "Mewtwo VSTAR", tag: "Crown Zenith" } },
  { path: "sv/sv06/216", fr: { name: "Ursaking-ex", tag: "Mascarade Crépusculaire" }, en: { name: "Bloodmoon Ursaluna ex", tag: "Twilight Masquerade" } },
  { path: "swsh/swsh11/186", fr: { name: "Giratina V", tag: "Origine Perdue" }, en: { name: "Giratina V", tag: "Lost Origin" } },
  { path: "xy/xy12/13", fr: { name: "M-Dracaufeu EX", tag: "Évolutions" }, en: { name: "M Charizard EX", tag: "Evolutions" } },
  { path: "swsh/swsh9/154", fr: { name: "Dracaufeu V", tag: "Stars Brillantes" }, en: { name: "Charizard V", tag: "Brilliant Stars" } },
  { path: "base/base1/15", fr: { name: "Florizarre", tag: "Set de Base · 1999" }, en: { name: "Venusaur", tag: "Base Set · 1999" } },
  { path: "swsh/swsh7/209", fr: { name: "Givrali VMAX", tag: "Évolutions Célestes" }, en: { name: "Glaceon VMAX", tag: "Evolving Skies" } },
  { path: "base/base1/10", fr: { name: "Mewtwo", tag: "Set de Base · 1999" }, en: { name: "Mewtwo", tag: "Base Set · 1999" } },
  { path: "sv/sv03.5/205", fr: { name: "Mew-ex", tag: "151" }, en: { name: "Mew ex", tag: "151" } },
];

function pool(locale: Locale): HeroCard[] {
  return POOL.map((c) => ({ path: c.path, ...c[locale] }));
}

export function heroCardPool(locale: Locale): HeroCard[] {
  return pool(locale);
}

/** Two interleaved rotation tracks (left / right) so the sides never match. */
export function heroTracks(locale: Locale): { left: HeroCard[]; right: HeroCard[] } {
  const p = pool(locale);
  return {
    left: p.filter((_, i) => i % 2 === 0),
    right: p.filter((_, i) => i % 2 === 1),
  };
}

/** All image URLs for a locale — used to preload so swaps are instant. */
export function heroPoolImages(locale: Locale): string[] {
  return POOL.map((c) => img(locale, c.path));
}
