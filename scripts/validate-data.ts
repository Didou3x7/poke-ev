/**
 * Validates every static dataset against the zod schemas.
 * Run with: npm run validate:data
 * Exits non-zero on the first structural problem, printing every issue found.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { catalogFileSchema, pullRateConfigSchema } from "../src/lib/data/schemas";

const root = join(import.meta.dirname, "..");
const errors: string[] = [];
const setIds = new Set<string>();
const setsDir = join(root, "data", "sets");
const ratesDir = join(root, "data", "pull-rates");

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json"));
}

for (const file of jsonFiles(setsDir)) {
  const path = join(setsDir, file);
  try {
    const parsed = catalogFileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success) {
      errors.push(`${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      continue;
    }
    for (const set of parsed.data.sets) {
      if (setIds.has(set.id)) errors.push(`${file}: duplicate set id "${set.id}"`);
      setIds.add(set.id);
    }
    const dates = parsed.data.sets.map((s) => s.releaseDate);
    const sorted = [...dates].sort();
    if (JSON.stringify(dates) !== JSON.stringify(sorted)) {
      errors.push(`${file}: sets are not ordered by releaseDate`);
    }
  } catch (e) {
    errors.push(`${file}: invalid JSON — ${(e as Error).message}`);
  }
}

let rateCount = 0;
for (const file of jsonFiles(ratesDir)) {
  const path = join(ratesDir, file);
  try {
    const parsed = pullRateConfigSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success) {
      errors.push(`pull-rates/${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      continue;
    }
    rateCount++;
    const cfg = parsed.data;
    if (file !== `${cfg.setId}.json`) {
      errors.push(`pull-rates/${file}: filename does not match setId "${cfg.setId}"`);
    }
    if (setIds.size > 0 && !setIds.has(cfg.setId)) {
      errors.push(`pull-rates/${file}: setId "${cfg.setId}" not found in catalog`);
    }
    const cardsPerPack = cfg.slots.reduce((a, s) => a + s.count, 0);
    if (Math.abs(cardsPerPack - cfg.packSize) > 1) {
      errors.push(
        `pull-rates/${file}: slots yield ${cardsPerPack} cards but packSize is ${cfg.packSize} (energy/code cards may account for 1)`,
      );
    }
  } catch (e) {
    errors.push(`pull-rates/${file}: invalid JSON — ${(e as Error).message}`);
  }
}

console.log(`Catalog: ${setIds.size} sets — Pull rates: ${rateCount} sets`);
if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s):`);
  for (const err of errors) console.error(` ✗ ${err}`);
  process.exit(1);
}
console.log("✓ All datasets valid");
