import { describe, expect, it } from "vitest";
import { normalizeRarity, RARITY_IDS, reclassifyVintageShiny } from "@/lib/ev/rarity";

describe("normalizeRarity", () => {
  it("passes through already-normalized ids", () => {
    for (const id of RARITY_IDS) expect(normalizeRarity(id)).toBe(id);
  });

  it("maps API vocabulary to normalized ids", () => {
    expect(normalizeRarity("Double Rare")).toBe("double-rare");
    expect(normalizeRarity("Special Illustration Rare")).toBe("special-illustration-rare");
    expect(normalizeRarity("Rare Holo VMAX")).toBe("rare-holo-vmax");
    expect(normalizeRarity("Hyper Rare")).toBe("hyper-rare");
    expect(normalizeRarity("ACE SPEC Rare")).toBe("ace-spec");
    expect(normalizeRarity("Rare Secret")).toBe("secret-rare");
  });

  it("is whitespace and case insensitive", () => {
    expect(normalizeRarity("  double   RARE ")).toBe("double-rare");
  });

  it("returns null for unknown or empty rarities — never guesses", () => {
    expect(normalizeRarity("Mystery Rare")).toBeNull();
    expect(normalizeRarity("")).toBeNull();
    expect(normalizeRarity(null)).toBeNull();
    expect(normalizeRarity(undefined)).toBeNull();
  });
});

describe("reclassifyVintageShiny", () => {
  it("reclassifies Neo 'Shining <name>' cards tagged Rare", () => {
    expect(reclassifyVintageShiny("rare", "Shining Charizard", "107")).toBe("shining");
    expect(reclassifyVintageShiny("rare", "Shining Magikarp", "66")).toBe("shining");
  });

  it("reclassifies DP/Platinum 'SH##' Shiny secrets tagged Rare", () => {
    expect(reclassifyVintageShiny("rare", "Ponyta", "SH11")).toBe("shiny-holo-rare");
    expect(reclassifyVintageShiny("rare", "Milotic", "SH7")).toBe("shiny-holo-rare");
  });

  it("leaves modern, legitimately ultra-rare 'Shining' GX cards untouched (Shining Legends)", () => {
    // already ultra-rare → not "rare" → never downgraded into the shining bucket
    expect(reclassifyVintageShiny("ultra-rare", "Shining Celebi", "8")).toBe("ultra-rare");
  });

  it("reclassifies Stormfront SH cards even though TCGdex mis-tags them lv-x", () => {
    expect(reclassifyVintageShiny("lv-x", "Drifloon", "SH1")).toBe("shiny-holo-rare");
    // but a REAL Lv.X (numeric collector number) stays lv-x
    expect(reclassifyVintageShiny("lv-x", "Gengar LV. X", "97")).toBe("lv-x");
  });

  it("does not touch ordinary cards", () => {
    expect(reclassifyVintageShiny("rare", "Charizard", "3")).toBe("rare");
    expect(reclassifyVintageShiny("common", "Shiny Stone", "84")).toBe("common"); // 'Shiny' != 'Shining '
    expect(reclassifyVintageShiny(null, "Shining Gyarados", "65")).toBeNull();
  });
});
