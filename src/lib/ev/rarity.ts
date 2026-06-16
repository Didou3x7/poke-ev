/**
 * Normalized rarity identifiers used across pull-rate datasets and the EV engine.
 *
 * Every rarity string coming from the price API is normalized to one of these
 * ids via `normalizeRarity`. Pull-rate files reference these ids exclusively,
 * so the two sides always meet on the same vocabulary.
 */
export const RARITY_IDS = [
  // Core
  "common",
  "uncommon",
  "rare",
  "rare-holo",
  // Scarlet & Violet era
  "double-rare",
  "ultra-rare",
  "illustration-rare",
  "special-illustration-rare",
  "hyper-rare",
  "ace-spec",
  "shiny-rare",
  "shiny-ultra-rare",
  // Sword & Shield era
  "rare-holo-v",
  "rare-holo-vmax",
  "rare-holo-vstar",
  "radiant",
  "amazing",
  "trainer-gallery",
  "galarian-gallery",
  "secret-rare",
  "rainbow-rare",
  "gold-rare",
  "shiny-vault",
  // Mega Evolution era (2025+)
  "mega-ex",
  "black-white-rare",
  // Vintage hit rarities (EX 2003-07 / DP 2007-09 / HGSS 2010-11) — pokemontcg.io
  // distinguishes these where TCGdex lumps them all into "Rare".
  "ex", // EX-era Pokémon-ex ("Rare Holo EX")
  "gold-star", // EX-era Gold Star ("Rare Holo Star")
  "lv-x", // DP-era Level X ("Rare Holo LV.X")
  "prime", // HGSS-era Prime ("Rare PRIME")
  "legend", // HGSS-era LEGEND (two-card)
] as const;

export type RarityId = (typeof RARITY_IDS)[number];

const RARITY_SET = new Set<string>(RARITY_IDS);

/**
 * Maps raw rarity strings (TCGGO / Cardmarket / TCGPlayer vocabulary) to
 * normalized ids. Keys are matched after lowercasing, trimming and collapsing
 * whitespace. Unknown rarities resolve to null — the EV engine counts them in
 * the completeness metric instead of guessing.
 */
const RAW_TO_ID: Record<string, RarityId> = {
  "common": "common",
  "uncommon": "uncommon",
  "rare": "rare",
  "rare holo": "rare-holo",
  "holo rare": "rare-holo",
  "holofoil rare": "rare-holo",
  "reverse holo": "rare-holo",
  // Scarlet & Violet
  "double rare": "double-rare",
  "rare ex": "double-rare",
  "ultra rare": "ultra-rare",
  "rare ultra": "ultra-rare",
  "full art": "ultra-rare",
  "illustration rare": "illustration-rare",
  "special illustration rare": "special-illustration-rare",
  "special art rare": "special-illustration-rare",
  "hyper rare": "hyper-rare",
  "rare hyper": "hyper-rare",
  "gold hyper rare": "hyper-rare",
  "ace spec rare": "ace-spec",
  "ace spec": "ace-spec",
  "shiny rare": "shiny-rare",
  "baby shiny": "shiny-rare",
  "shiny ultra rare": "shiny-ultra-rare",
  // Sword & Shield
  "rare holo v": "rare-holo-v",
  "rare holo gx": "rare-holo-v",
  // Vintage EX/DP/HGSS hit rarities (from the pokemontcg.io rarity overlay)
  "rare holo ex": "ex",
  "rare holo star": "gold-star",
  "rare holo lv.x": "lv-x",
  "rare prime": "prime",
  "legend": "legend",
  "rare holo vmax": "rare-holo-vmax",
  "rare holo vstar": "rare-holo-vstar",
  // TCGdex word order (Holo Rare V / VMAX / VSTAR)
  "holo rare v": "rare-holo-v",
  "holo rare vmax": "rare-holo-vmax",
  "holo rare vstar": "rare-holo-vstar",
  // Full-art trainers are pulled in the same Ultra Rare slot as full-art Pokémon
  "full art trainer": "ultra-rare",
  "radiant rare": "radiant",
  "rare radiant": "radiant",
  "amazing rare": "amazing",
  "rare amazing": "amazing",
  "trainer gallery rare holo": "trainer-gallery",
  "trainer gallery": "trainer-gallery",
  "galarian gallery": "galarian-gallery",
  "rare secret": "secret-rare",
  "secret rare": "secret-rare",
  "rare rainbow": "rainbow-rare",
  "rainbow rare": "rainbow-rare",
  "rare gold": "gold-rare",
  "gold rare": "gold-rare",
  "rare shiny": "shiny-vault",
  "rare shiny gx": "shiny-vault",
  "shiny rare v or vmax": "shiny-vault",
  "shiny rare v": "shiny-vault",
  "shiny rare vmax": "shiny-vault",
  // Mega Evolution era
  "mega rare": "mega-ex",
  "mega ex": "mega-ex",
  "mega hyper rare": "hyper-rare",
  "black white rare": "black-white-rare",
  "rare black white": "black-white-rare",
};

export function isRarityId(value: string): value is RarityId {
  return RARITY_SET.has(value);
}

/** Normalize a raw API rarity string to a RarityId, or null when unknown. */
export function normalizeRarity(raw: string | null | undefined): RarityId | null {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (RARITY_SET.has(key)) return key as RarityId;
  return RAW_TO_ID[key] ?? null;
}
