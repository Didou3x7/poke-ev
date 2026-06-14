import { describe, expect, it } from "vitest";
import { computeVerdict, erf, normalCdf, profitProbability } from "@/lib/ev/verdict";

describe("erf / normalCdf", () => {
  it("matches known erf values", () => {
    expect(erf(0)).toBeCloseTo(0, 7);
    expect(erf(1)).toBeCloseTo(0.8427007929, 6);
    expect(erf(-1)).toBeCloseTo(-0.8427007929, 6);
    expect(erf(2)).toBeCloseTo(0.9953222650, 6);
  });

  it("normalCdf is 0.5 at the mean and handles degenerate stdDev", () => {
    // erf approximation carries a ~1.5e-7 max error — test at that precision
    expect(normalCdf(10, 10, 3)).toBeCloseTo(0.5, 6);
    expect(normalCdf(9, 10, 0)).toBe(0);
    expect(normalCdf(11, 10, 0)).toBe(1);
  });
});

describe("profitProbability", () => {
  it("is 0.5 when price equals expected value", () => {
    expect(profitProbability(36 * 5, 36, 5, 8)).toBeCloseTo(0.5, 6);
  });

  it("decreases monotonically with price", () => {
    const ps = [100, 150, 180, 220, 300].map((price) => profitProbability(price, 36, 5, 8));
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeLessThan(ps[i - 1]);
  });

  it("tightens with more packs (display safer than booster at fair price ratio)", () => {
    // paying 20% under EV: more packs → higher chance of profit
    const booster = profitProbability(4, 1, 5, 8);
    const display = profitProbability(36 * 4, 36, 5, 8);
    expect(display).toBeGreaterThan(booster);
  });
});

describe("computeVerdict", () => {
  const base = { kind: "display" as const, packs: 36, packEv: 5, packStdDev: 8 };

  it("says OPEN when open EV beats price paid and sealed is below open EV", () => {
    const v = computeVerdict({ ...base, pricePaid: 150, sealedMarketPrice: 160 });
    expect(v.kind).toBe("open");
    expect(v.openEv).toBeCloseTo(180);
    expect(v.marginAbs).toBeCloseTo(30);
    expect(v.marginPct).toBeCloseTo(0.2);
  });

  it("says OPEN when open EV beats price paid, even if the product is worth more sealed (sealed never overrides)", () => {
    const v = computeVerdict({ ...base, pricePaid: 100, sealedMarketPrice: 200 });
    expect(v.kind).toBe("open");
    // sealed premium is still reported for information (resale value)
    expect(v.sealedPremium).toBeCloseTo(20);
  });

  it("says KEEP when open EV is below price paid and no sealed price is known", () => {
    const v = computeVerdict({ ...base, pricePaid: 220, sealedMarketPrice: null });
    expect(v.kind).toBe("keep");
    expect(v.marginAbs).toBeCloseTo(-40);
    expect(v.sealedPremium).toBeNull();
  });

  it("says OPEN when open EV beats price and sealed price is unknown", () => {
    const v = computeVerdict({ ...base, pricePaid: 150, sealedMarketPrice: null });
    expect(v.kind).toBe("open");
  });

  it("is unavailable when pack EV is zero (no pull rates / no prices)", () => {
    const v = computeVerdict({ ...base, packEv: 0, pricePaid: 100, sealedMarketPrice: null });
    expect(v.kind).toBe("unavailable");
    expect(v.profitProbability).toBe(0);
  });
});
