import { describe, expect, it } from "vitest";
import { computeConfidence } from "@/lib/ev/confidence";

describe("computeConfidence", () => {
  it("scores 100/high for perfect inputs", () => {
    const c = computeConfidence({ pullRateConfidence: "high", priceCompleteness: 1, snapshotAgeDays: 0 });
    expect(c.score).toBe(100);
    expect(c.label).toBe("high");
  });

  it("decays with snapshot age and floors at 0 freshness", () => {
    const fresh = computeConfidence({ pullRateConfidence: "high", priceCompleteness: 1, snapshotAgeDays: 2 });
    const week = computeConfidence({ pullRateConfidence: "high", priceCompleteness: 1, snapshotAgeDays: 9 });
    const stale = computeConfidence({ pullRateConfidence: "high", priceCompleteness: 1, snapshotAgeDays: 40 });
    expect(fresh.parts.freshness).toBe(100);
    expect(week.parts.freshness).toBeCloseTo(100 - 7 * 6.25);
    expect(stale.parts.freshness).toBe(0);
    expect(fresh.score).toBeGreaterThan(week.score);
    expect(week.score).toBeGreaterThan(stale.score);
  });

  it("weights pull-rate quality heaviest", () => {
    const high = computeConfidence({ pullRateConfidence: "high", priceCompleteness: 0.9, snapshotAgeDays: 1 });
    const low = computeConfidence({ pullRateConfidence: "low", priceCompleteness: 0.9, snapshotAgeDays: 1 });
    expect(high.score - low.score).toBe(Math.round((100 - 40) * 0.4));
  });

  it("maps scores to labels at the documented thresholds", () => {
    expect(computeConfidence({ pullRateConfidence: "high", priceCompleteness: 1, snapshotAgeDays: 0 }).label).toBe("high");
    expect(computeConfidence({ pullRateConfidence: "medium", priceCompleteness: 0.5, snapshotAgeDays: 6 }).label).toBe("medium");
    expect(computeConfidence({ pullRateConfidence: "low", priceCompleteness: 0.2, snapshotAgeDays: 30 }).label).toBe("low");
  });

  it("clamps out-of-range completeness", () => {
    const c = computeConfidence({ pullRateConfidence: "high", priceCompleteness: 1.4, snapshotAgeDays: 0 });
    expect(c.parts.prices).toBe(100);
  });
});
