import { describe, expect, it } from "vitest";
import { classifySealed } from "@/lib/data/provider";

describe("classifySealed", () => {
  it("classifies the three core product kinds", () => {
    expect(classifySealed("Dark Explorers Booster Box")).toBe("display");
    expect(classifySealed("Brilliant Stars Booster Display")).toBe("display");
    expect(classifySealed("Brilliant Stars Elite Trainer Box")).toBe("etb");
    expect(classifySealed("Surging Sparks ETB")).toBe("etb");
    expect(classifySealed("Dark Explorers Booster Pack")).toBe("booster");
  });

  it("keeps real boosters of sets whose NAME contains a soft blockword", () => {
    // "collection" / "premium" used to nuke these via the set name.
    expect(classifySealed("Legendary Collection Booster Pack")).toBe("booster");
    expect(classifySealed("Legendary Collection Booster Box")).toBe("display");
  });

  it("still drops premium collections, theme decks and accessories", () => {
    expect(classifySealed("Blastoise GX Premium Collection")).toBeNull();
    expect(classifySealed("Mythical Pokemon Collection Box [Mew]")).toBeNull();
    expect(classifySealed("Neo Destiny Theme Deck - Light")).toBeNull();
    expect(classifySealed("Alolan Marowak GX Box")).toBeNull();
  });

  it("drops cases, blisters, bundles, tins and code cards", () => {
    expect(classifySealed("Brilliant Stars Booster Box Case")).toBeNull();
    expect(classifySealed("Dark Explorers 3 Pack Blister [Luxray]")).toBeNull();
    expect(classifySealed("Unbroken Bonds Booster Pack Art Bundle [Set of 4]")).toBeNull();
    expect(classifySealed("Hoenn Power Tin [Sceptile]")).toBeNull();
    expect(classifySealed("Code Card - Dark Explorers Booster Pack")).toBeNull();
  });
});
