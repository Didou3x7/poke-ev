import { describe, expect, it } from "vitest";
import { normalizeRarity, RARITY_IDS } from "@/lib/ev/rarity";

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
