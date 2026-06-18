import { describe, expect, it } from "vitest";
import { getAllSets } from "@/lib/data/catalog";
import { getSnapshot } from "@/lib/data/snapshot";
import { pickChaseCard } from "@/lib/data/snapshot-types";
import { cardSlugMap, getCardPage } from "@/lib/view/card-meta";
import type { Locale } from "@/lib/i18n/config";

/**
 * The "most valuable card in {set}" guarantee.
 *
 * The set page shows a chase card — the priciest rare+ card in the locale's own
 * market (EUR on FR, USD on EN) — and links it to its card page, whose eyebrow
 * reads "Most valuable card in {set}". That claim only holds if the chase card
 * is ALSO rank #1 on its card page IN THE SAME LOCALE. EUR and USD orderings
 * genuinely differ (~46 sets), so the card-page rank must be locale-aware. This
 * locks both halves: the chase is always clickable AND lands on a rank-#1 page.
 */
describe("card-page rank agrees with the set-page chase, per locale", () => {
  const locales: Locale[] = ["fr", "en"];

  it("ranks every set's locale chase card #1 on its own card page", async () => {
    const snapshot = await getSnapshot();
    expect(Object.keys(snapshot.sets).length).toBeGreaterThan(100);

    const failures: string[] = [];
    for (const set of getAllSets()) {
      const snap = snapshot.sets[set.id];
      if (!snap) continue;
      const slugMap = await cardSlugMap(set.id);
      for (const locale of locales) {
        const chase = pickChaseCard(snap, locale);
        if (!chase) continue;
        // Skip the rare set with only low-rarity priced cards (fallback chase
        // gets no card page — there's nothing to be #1 of).
        const chaseCard = snap.cards.find((c) => c.image === chase.imageEn);
        if (!chaseCard?.rarity || chaseCard.rarity === "common" || chaseCard.rarity === "uncommon") continue;

        const slug = slugMap.get(chaseCard.id);
        if (!slug) {
          failures.push(`${set.id}/${locale}: chase "${chase.name}" has no card page (not clickable)`);
          continue;
        }
        const page = await getCardPage(slug, locale);
        if (!page) {
          failures.push(`${set.id}/${locale}: getCardPage(${slug}) returned null`);
          continue;
        }
        if (page.rank !== 1) {
          failures.push(`${set.id}/${locale}: chase "${chase.name}" ranks #${page.rank}, not #1`);
        }
        // The card page must price the very card the set page advertised.
        if (page.price !== chase.value) {
          failures.push(`${set.id}/${locale}: price ${page.price} ≠ chase value ${chase.value}`);
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
