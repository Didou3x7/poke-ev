import { describe, expect, it } from "vitest";
import { isMainExpansion, isCalendarDate, slugify, discoverNewSets, type TcgdexDetail } from "@/lib/data/discover-sets";

const TODAY = "2026-06-14";

const detail = (over: Partial<TcgdexDetail>): TcgdexDetail => ({
  id: "sv11",
  name: "Some Expansion",
  releaseDate: "2026-01-01",
  serie: { id: "sv", name: "Scarlet & Violet" },
  cardCount: { official: 180, total: 240 },
  abbreviation: { official: "SOM" },
  ...over,
});

describe("slugify", () => {
  it("kebab-cases and strips accents + punctuation", () => {
    expect(slugify("Destined Rivals")).toBe("destined-rivals");
    expect(slugify("Pokémon GO")).toBe("pokemon-go");
    expect(slugify("Écarlate & Violet")).toBe("ecarlate-violet");
    expect(slugify("151")).toBe("151");
    expect(slugify("Scarlet & Violet—Base")).toBe("scarlet-violet-base");
  });
});

describe("isMainExpansion", () => {
  it("accepts a released main SV/SwSh/Mega expansion", () => {
    expect(isMainExpansion(detail({ id: "sv11", serie: { id: "sv", name: "" } }), TODAY)).toBe(true);
    expect(isMainExpansion(detail({ id: "swsh13", serie: { id: "swsh", name: "" } }), TODAY)).toBe(true);
    expect(isMainExpansion(detail({ id: "me05", serie: { id: "me", name: "" } }), TODAY)).toBe(true);
  });

  it("accepts curated decimal subsets (151-style)", () => {
    expect(isMainExpansion(detail({ id: "sv11.5", cardCount: { official: 86 } }), TODAY)).toBe(true);
  });

  it("rejects unknown / legacy series", () => {
    expect(isMainExpansion(detail({ id: "base1", serie: { id: "base", name: "" } }), TODAY)).toBe(false);
    expect(isMainExpansion(detail({ id: "sm12", serie: { id: "sm", name: "" } }), TODAY)).toBe(false);
  });

  it("rejects promos, energy, and stubs", () => {
    expect(isMainExpansion(detail({ id: "svp" }), TODAY)).toBe(false); // ends in p
    expect(isMainExpansion(detail({ id: "sve", name: "Scarlet & Violet Energy", cardCount: { official: 24 } }), TODAY)).toBe(false);
    expect(isMainExpansion(detail({ id: "mee", name: "Mega Evolution Energy", cardCount: { official: 8 } }), TODAY)).toBe(false);
    expect(isMainExpansion(detail({ id: "sv11", cardCount: { official: 12 } }), TODAY)).toBe(false); // under 30
  });

  it("rejects Pokémon Pocket (capitalised ids) and future releases", () => {
    expect(isMainExpansion(detail({ id: "A3", serie: { id: "tcgp", name: "" } }), TODAY)).toBe(false);
    expect(isMainExpansion(detail({ id: "sv11", releaseDate: "2099-01-01" }), TODAY)).toBe(false);
    expect(isMainExpansion(detail({ id: "sv11", releaseDate: undefined }), TODAY)).toBe(false);
  });

  it("rejects malformed AND calendar-impossible release dates", () => {
    expect(isMainExpansion(detail({ id: "sv11", releaseDate: "2026-05" }), TODAY)).toBe(false);
    expect(isMainExpansion(detail({ id: "sv11", releaseDate: "2026/05/01" }), TODAY)).toBe(false);
    expect(isMainExpansion(detail({ id: "sv11", releaseDate: "2024-99-99" }), TODAY)).toBe(false);
    expect(isMainExpansion(detail({ id: "sv11", releaseDate: "2024-02-31" }), TODAY)).toBe(false);
  });
});

describe("isCalendarDate", () => {
  it("accepts real dates, rejects malformed and impossible ones", () => {
    expect(isCalendarDate("2026-06-14")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true); // leap day
    expect(isCalendarDate("2026-05")).toBe(false);
    expect(isCalendarDate("2024-99-99")).toBe(false);
    expect(isCalendarDate("2024-02-31")).toBe(false);
    expect(isCalendarDate("2023-02-29")).toBe(false); // not a leap year
  });
});

describe("discoverNewSets", () => {
  // A fake TCGdex backed by an in-memory fixture, so the filter + dedup + FR-join
  // logic is tested without network.
  const enSets = [
    { id: "sv10", name: "Destined Rivals", cardCount: { official: 182 } }, // already mapped
    { id: "sv11", name: "Phantom Tide", cardCount: { official: 178 } }, // NEW main set
    { id: "svp", name: "SVP Black Star Promos", cardCount: { official: 200 } }, // promo
    { id: "A3", name: "Pocket Set", cardCount: { official: 200 } }, // Pocket
    { id: "base1", name: "Base Set", cardCount: { official: 102 } }, // legacy
  ];
  const frSets = [{ id: "sv11", name: "Marée Fantôme" }];
  const detailById: Record<string, TcgdexDetail> = {
    sv11: detail({ id: "sv11", name: "Phantom Tide", serie: { id: "sv", name: "Scarlet & Violet" }, abbreviation: { official: "PHT" }, releaseDate: "2026-05-01", cardCount: { official: 178 } }),
    svp: detail({ id: "svp", serie: { id: "sv", name: "" } }),
    base1: detail({ id: "base1", serie: { id: "base", name: "" } }),
  };

  const fetchImpl = async (url: string): Promise<Response> => {
    const json = url.endsWith("/en/sets")
      ? enSets
      : url.endsWith("/fr/sets")
        ? frSets
        : detailById[url.split("/").pop()!] ?? null;
    return { ok: json != null, json: async () => json } as Response;
  };

  it("finds only the new main set, with FR name + correct era/code", async () => {
    const found = await discoverNewSets({
      knownTcgdexIds: new Set(["sv10"]),
      knownCatalogIds: new Set(["destined-rivals"]),
      today: TODAY,
      fetchImpl,
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: "phantom-tide",
      era: "sv",
      code: "PHT",
      nameEn: "Phantom Tide",
      nameFr: "Marée Fantôme",
      seriesEn: "Scarlet & Violet",
      seriesFr: "Écarlate et Violet",
      releaseDate: "2026-05-01",
      cardCount: 178,
      apiMatch: "Phantom Tide",
      tcgdexId: "sv11",
    });
  });

  it("returns nothing when everything is already mapped", async () => {
    const found = await discoverNewSets({
      knownTcgdexIds: new Set(["sv10", "sv11"]),
      knownCatalogIds: new Set(),
      today: TODAY,
      fetchImpl,
    });
    expect(found).toEqual([]);
  });
});
