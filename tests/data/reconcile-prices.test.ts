import { describe, expect, it } from "vitest";
import { reconcileCardPrices, isEurStale } from "../../src/lib/data/reconcile-prices";

const NOW = Date.parse("2026-06-19T00:00:00Z");
const STALE = "2026/01/21"; // ~149 days before NOW → stale
const FRESH = "2026/06/12"; // ~7 days before NOW → fresh
const FX = 1.15;
const opts = (over: Partial<Parameters<typeof reconcileCardPrices>[2]> = {}) => ({
  eurUsd: FX,
  lowRarity: false,
  eurAsOf: FRESH,
  nowMs: NOW,
  ...over,
});

describe("isEurStale", () => {
  it("flags only quotes older than the window", () => {
    expect(isEurStale(STALE, NOW)).toBe(true);
    expect(isEurStale(FRESH, NOW)).toBe(false);
    expect(isEurStale(null, NOW)).toBe(false);
    expect(isEurStale("not-a-date", NOW)).toBe(false);
  });
});

describe("reconcileCardPrices — fill + passthrough", () => {
  it("returns nulls when both markets are missing", () => {
    expect(reconcileCardPrices(null, null, opts())).toEqual({ eur: null, usd: null });
  });
  it("derives the missing market at FX", () => {
    expect(reconcileCardPrices(null, 100, opts())).toEqual({ eur: 86.96, usd: 100 });
    expect(reconcileCardPrices(100, null, opts())).toEqual({ eur: 100, usd: 115 });
  });
  it("leaves an in-band pair untouched", () => {
    expect(reconcileCardPrices(100, 110, opts())).toEqual({ eur: 100, usd: 110 });
  });
});

describe("reconcileCardPrices — stale-EUR guard", () => {
  it("re-derives a stale EUR that sits well below the fresh USD (the Giratina case)", () => {
    // €183 vs $432 → ratio 0.49 (<0.8) and EUR is months old → derive from USD.
    expect(reconcileCardPrices(183, 432, opts({ eurAsOf: STALE }))).toEqual({
      eur: 375.65, // round2(432 / 1.15)
      usd: 432,
    });
  });
  it("leaves a genuine EU/US gap alone when the EUR quote is FRESH", () => {
    expect(reconcileCardPrices(183, 432, opts({ eurAsOf: FRESH }))).toEqual({ eur: 183, usd: 432 });
  });
  it("does not touch a stale EUR that is only mildly below USD (ratio ≥ 0.8)", () => {
    // €200 vs $230 → ratio 1.0 → not understated, leave it.
    expect(reconcileCardPrices(200, 230, opts({ eurAsOf: STALE }))).toEqual({ eur: 200, usd: 230 });
  });
  it("never re-derives from a FX-derived (non-real) USD", () => {
    // Only a stale EUR quote, no USD → USD is FX-filled, EUR must stay as-is.
    expect(reconcileCardPrices(183, null, opts({ eurAsOf: STALE }))).toEqual({
      eur: 183,
      usd: 210.45, // round2(183 * 1.15)
    });
  });
});

describe("reconcileCardPrices — symmetric divergence clamp (unchanged behaviour)", () => {
  it("clamps an absurd high EUR down to USD (6× for hits)", () => {
    expect(reconcileCardPrices(140, 0.44, opts())).toEqual({ eur: 0.38, usd: 0.44 });
  });
  it("clamps an absurd high USD down to EUR", () => {
    expect(reconcileCardPrices(10, 200, opts())).toEqual({ eur: 10, usd: 11.5 });
  });
  it("uses the tighter 3.5× bar for low-rarity cards", () => {
    // €44 vs $8 → ratio 6.3 → >3.5 for a common → clamp EUR to USD-implied.
    expect(reconcileCardPrices(44, 8, opts({ lowRarity: true }))).toEqual({
      eur: 6.96, // round2(8 / 1.15)
      usd: 8,
    });
  });
});
