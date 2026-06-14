import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { catalogFileSchema, pullRateConfigSchema, type CatalogFile, type CatalogSet } from "./schemas";
import type { PullRateConfig } from "../ev/types";

/**
 * Loads the static datasets (set catalog + pull rates) from /data.
 * Server-side only — results are memoized for the process lifetime.
 */

const DATA_DIR = join(process.cwd(), "data");

export interface CatalogEra extends Omit<CatalogFile, "sets"> {
  sets: CatalogSet[];
}

let erasCache: CatalogEra[] | null = null;
let ratesCache: Map<string, PullRateConfig> | null = null;

/** Chronological era order for display. */
const ERA_ORDER = ["wotc", "ex", "dp", "hgss", "bw", "xy", "sm", "swsh", "sv", "mega"];

function readJsonDir(dir: string): { file: string; json: unknown }[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.map((file) => ({
    file,
    json: JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown,
  }));
}

export function getEras(): CatalogEra[] {
  if (erasCache) return erasCache;
  const eras: CatalogEra[] = [];
  for (const { file, json } of readJsonDir(join(DATA_DIR, "sets"))) {
    const parsed = catalogFileSchema.safeParse(json);
    if (!parsed.success) {
      console.error(`[catalog] invalid ${file}: ${parsed.error.message}`);
      continue;
    }
    eras.push(parsed.data);
  }
  eras.sort((a, b) => ERA_ORDER.indexOf(a.era) - ERA_ORDER.indexOf(b.era));
  erasCache = eras;
  return eras;
}

export function getAllSets(): CatalogSet[] {
  return getEras().flatMap((e) => e.sets);
}

export function getSetById(id: string): CatalogSet | null {
  return getAllSets().find((s) => s.id === id) ?? null;
}

export function getEraOfSet(id: string): CatalogEra | null {
  return getEras().find((e) => e.sets.some((s) => s.id === id)) ?? null;
}

export function getPullRates(): Map<string, PullRateConfig> {
  if (ratesCache) return ratesCache;
  const map = new Map<string, PullRateConfig>();
  for (const { file, json } of readJsonDir(join(DATA_DIR, "pull-rates"))) {
    const parsed = pullRateConfigSchema.safeParse(json);
    if (!parsed.success) {
      console.error(`[pull-rates] invalid ${file}: ${parsed.error.message}`);
      continue;
    }
    map.set(parsed.data.setId, parsed.data as PullRateConfig);
  }
  ratesCache = map;
  return map;
}

export function getPullRatesForSet(setId: string): PullRateConfig | null {
  return getPullRates().get(setId) ?? null;
}
