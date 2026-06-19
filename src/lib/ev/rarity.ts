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
  // Vintage secret SHINY chases that BOTH price sources mislabel as plain "Rare"
  // (so they can only be detected by name/number, see reclassifyVintageHits): the
  // Neo-era "Shining Pokémon" and the DP/Platinum-era "SH##" Shiny secrets. They are
  // rare INSERTS, not rare-slot pulls — bucketing them as "rare" wildly inflates EV.
  "shining", // Neo Genesis-Destiny "Shining <name>"
  "shiny-holo-rare", // Diamond&Pearl/Platinum "SH##" Shiny secret
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
  // Vintage secret shinies — only set if a source ever labels them (both currently
  // say plain "Rare"; reclassifyVintageHits is the real detector).
  "shining": "shining",
  "shining rare": "shining",
  "shiny holo rare": "shiny-holo-rare",
  "shiny rare holo": "shiny-holo-rare",
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

const SHINING_NAME = /^shining\s/i;
const SH_NUMBER = /^sh\d+$/i;

/**
 * Reclassify the vintage secret SHINY chases that BOTH price sources mislabel as
 * plain "Rare": the Neo-era "Shining <name>" cards and the Diamond&Pearl/Platinum
 * "SH##" Shiny secrets. They are rare INSERTS (a few per booster box), NOT rare-slot
 * pulls, so leaving them in the "rare" pool inflates a set's EV many-fold (e.g. a
 * $4000 Shining Charizard treated as a ~1-in-1.5-pack rare).
 *
 * Scoped HARD to cards whose current rarity is exactly "rare", so the modern,
 * legitimately ultra-rare "Shining" GX cards (Shining Legends, tagged ultra-rare)
 * and the lv-x "SH" cards (Stormfront) are left untouched. Returns the corrected id.
 */
export function reclassifyVintageShiny(
  rarity: RarityId | null,
  name: string,
  number: string | null | undefined,
): RarityId | null {
  // "SH##" is the unambiguous DP/Platinum Shiny-secret numbering (SH1-SH12 only) —
  // reclassify regardless of the source rarity, which TCGdex tags inconsistently
  // (lv-x in Stormfront, plain rare in Platinum/Arceus/Supreme Victors).
  if ((rarity === "rare" || rarity === "lv-x") && SH_NUMBER.test(number ?? "")) return "shiny-holo-rare";
  // "Shining <name>" is the Neo shining ONLY while a source still calls it a plain
  // rare; the modern Shining Legends GX cards are already ultra-rare and must stay.
  if (rarity === "rare" && SHINING_NAME.test(name)) return "shining";
  return rarity;
}
