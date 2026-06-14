import { describe, expect, it } from "vitest";
import { overlayPtcgPrices, type PtcgCard } from "@/lib/data/pokemontcg";
import type { PricedCard } from "@/lib/ev/types";

const card = (o: { number: string; name: string; eur?: number | null; usd?: number | null; image?: string | null }): PricedCard => ({
  id: o.number,
  name: o.name,
  number: o.number,
  rarity: null,
  rawRarity: null,
  prices: { eur: o.eur ?? null, usd: o.usd ?? null },
  image: o.image ?? null,
});

const p = (o: Partial<PtcgCard> & { number: string; name: string }): PtcgCard => ({
  image: null,
  eur: null,
  usd: null,
  ...o,
});

describe("overlayPtcgPrices", () => {
  it("overlays prices and fills a missing image on an exact number match", () => {
    const cards = [card({ number: "199", name: "Charizard ex", eur: 3, usd: 4 })];
    const matched = overlayPtcgPrices(cards, [p({ number: "199", name: "Charizard ex", eur: 235, usd: 494, image: "img" })]);
    expect(matched).toBe(1);
    expect(cards[0].prices).toEqual({ eur: 235, usd: 494 });
    expect(cards[0].image).toBe("img");
  });

  it("matches across zero-padding (TCGdex 072 ↔ pokemontcg 72)", () => {
    const cards = [card({ number: "072", name: "Mewtwo V", eur: 4.28, usd: 65 })];
    overlayPtcgPrices(cards, [p({ number: "72", name: "Mewtwo V", eur: 48, usd: 65 })]);
    expect(cards[0].prices.eur).toBe(48);
  });

  it("falls back to a unique name match when numbers differ (Celebrations 4A ↔ 4)", () => {
    const cards = [card({ number: "4A", name: "Charizard", eur: 204.9, usd: null, image: null })];
    overlayPtcgPrices(cards, [p({ number: "4", name: "Charizard", eur: null, usd: 208.58, image: "ptcg-img" })]);
    expect(cards[0].prices.usd).toBe(208.58); // pokemontcg USD overlaid
    expect(cards[0].prices.eur).toBe(204.9); // pokemontcg EUR null → keep TCGdex Cardmarket
    expect(cards[0].image).toBe("ptcg-img"); // image filled where TCGdex had none
  });

  it("disambiguates same-number candidates by name", () => {
    const cards = [card({ number: "15", name: "Lunala", eur: 1, usd: 1 })];
    overlayPtcgPrices(cards, [
      p({ number: "15", name: "Venusaur", eur: 99, usd: 99 }),
      p({ number: "15", name: "Lunala", eur: 19, usd: 20 }),
    ]);
    expect(cards[0].prices).toEqual({ eur: 19, usd: 20 });
  });

  it("keeps TCGdex prices when there is no match", () => {
    const cards = [card({ number: "5", name: "Pikachu", eur: 1, usd: 2 })];
    const matched = overlayPtcgPrices(cards, [p({ number: "99", name: "Snorlax", eur: 10, usd: 12 })]);
    expect(matched).toBe(0);
    expect(cards[0].prices).toEqual({ eur: 1, usd: 2 });
    expect(cards[0].image).toBeNull();
  });
});
