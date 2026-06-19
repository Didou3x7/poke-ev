/**
 * Anti-regression guard for the built snapshot. Runs in the deploy workflow right
 * after `npm run snapshot`, BEFORE the commit + Vercel deploy — so if a price/EV bug
 * we already fixed ever recurs (e.g. pokemontcg.io changes its variant data, or the
 * rarity reclassification stops firing), the build FAILS and the bad data never ships;
 * the site keeps serving the last good snapshot.
 *
 * FAIL-level invariants (block the deploy) target the exact bugs fixed in June 2026:
 *   1. reverse-holo leak — a base common/uncommon priced like a hit (mean >> sane).
 *   2. unreclassified vintage shiny — a "Shining …"/"SH##" card still tagged rare/lv-x.
 *   3. chase inversion — a set's single priciest card is a common/uncommon.
 * WARN-level checks (logged, non-blocking) surface softer anomalies for review.
 *
 *   npm run validate:snapshot            # validates data/snapshot/snapshot.json
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface Card { name: string; number: string | null; rarity: string | null; usd: number | null; eur: number | null }
interface RB { rarity: string; meanValue: number; evContribution: number }
interface SetEntry { ev?: { en?: { rarityBreakdown?: RB[]; packEv?: number } | null; fr?: { packEv?: number } | null } | null; cards: Card[] }
interface Snap { sets: Record<string, SetEntry>; fx?: { eurUsd?: number } }

const path = process.argv[2] ?? join(process.cwd(), "data", "snapshot", "snapshot.json");
const snap = JSON.parse(readFileSync(path, "utf8")) as Snap;
const fx = snap.fx?.eurUsd ?? 1.15;

const fails: string[] = [];
const warns: string[] = [];

// The reverse-holo leak drove base commons/uncommons to hit-level prices ($30-700),
// so their pool out-valued the set's actual holos. We test that RELATIVE inversion
// (set-relative, so genuine e-Card scarcity like Skyridge commons ≈$26 — still far
// below its holos — never trips it), plus a very high absolute backstop.
const NONHOLO_MEAN_BACKSTOP = 120; // no real base common/uncommon pool averages this
const NONHOLO_MEAN_FLOOR = 15; // ignore low-value sets (noise)
const CHASE_NONHOLO_MIN = 30; // a common/uncommon priced above this as the set's top card is a leak/mistag

for (const [sid, s] of Object.entries(snap.sets)) {
  const cards = s.cards ?? [];

  // (2) vintage shiny must have been reclassified out of rare/lv-x
  for (const c of cards) {
    const num = String(c.number ?? "");
    if (c.rarity === "rare" && /^shining\s/i.test(c.name))
      fails.push(`${sid}: "${c.name}" still tagged rare — reclassifyVintageShiny did not fire`);
    if ((c.rarity === "rare" || c.rarity === "lv-x") && /^SH\d+$/i.test(num))
      fails.push(`${sid}: ${c.name} #${num} still tagged ${c.rarity} — SH reclassify did not fire`);
  }

  // (1) reverse-holo leak — a base common/uncommon pool priced like hits (out-values
  // the set's own holos), or an impossibly high absolute mean.
  const rb = s.ev?.en?.rarityBreakdown ?? [];
  const holoMean = Math.max(0, ...rb.filter((r) => r.rarity === "rare-holo").map((r) => r.meanValue));
  for (const r of rb) {
    if (r.rarity !== "common" && r.rarity !== "uncommon") continue;
    if (r.meanValue > NONHOLO_MEAN_BACKSTOP)
      fails.push(`${sid}: ${r.rarity} mean $${r.meanValue.toFixed(0)} — impossible for a base pool (reverse-holo/variant leak)`);
    else if (holoMean > 0 && r.meanValue > holoMean && r.meanValue > NONHOLO_MEAN_FLOOR)
      fails.push(`${sid}: ${r.rarity} mean $${r.meanValue.toFixed(0)} > rare-holo mean $${holoMean.toFixed(0)} — reverse-holo/variant leak`);
  }

  // (3) chase inversion — priciest card in the set is a base common/uncommon
  const priced = cards.filter((c) => typeof c.usd === "number" && (c.usd as number) > 0);
  if (priced.length) {
    const top = priced.reduce((a, b) => ((b.usd as number) > (a.usd as number) ? b : a));
    if ((top.rarity === "common" || top.rarity === "uncommon") && (top.usd as number) >= CHASE_NONHOLO_MIN)
      fails.push(`${sid}: top card ${top.name} [${top.rarity}] $${(top.usd as number).toFixed(0)} — chase inversion (mis-tagged secret?)`);
  }

  // WARN — FR/EN packEv divergence beyond ~2.2× after FX (vintage Cardmarket blend)
  const en = s.ev?.en?.packEv, frv = s.ev?.fr?.packEv;
  if (en && frv && en > 0) {
    const ratio = (frv * fx) / en;
    if (ratio > 2.2 || ratio < 1 / 2.2)
      warns.push(`${sid}: FR/EN packEv off ${ratio.toFixed(1)}× (EN $${en.toFixed(0)} vs FR €${frv.toFixed(0)})`);
  }
}

const setCount = Object.keys(snap.sets).length;
console.log(`validate-snapshot: ${setCount} sets, ${fails.length} FAIL, ${warns.length} WARN`);
for (const w of warns) console.log(`  ⚠ ${w}`);
if (fails.length) {
  console.error(`\n❌ ${fails.length} blocking regression(s):`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  console.error("\nThe snapshot will NOT be deployed. Fix the pipeline (see pokeev-price-source / pokeev-vintage-shiny-rarity) and rebuild.");
  process.exit(1);
}
console.log("✓ no price/EV regressions — snapshot is safe to deploy");
