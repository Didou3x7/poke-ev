/**
 * Auto-onboards newly released Pokémon sets into the catalog.
 *
 *   npm run discover            — detect new TCGdex sets, write catalog + map
 *   npm run discover -- --dry   — report only, write nothing
 *
 * Runs BEFORE `npm run snapshot` in the daily GitHub Action: any set added here
 * is then priced (cards + sealed) and gets a chase card on the snapshot build.
 * EV stays "indisponible" until a sourced pull-rate file is added by hand.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { discoverNewSets, type DiscoveredSet } from "../src/lib/data/discover-sets";
import { getAllSets } from "../src/lib/data/catalog";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const MAP_PATH = join(DATA_DIR, "sources", "tcgdex-sets.json");

type MapFile = Record<string, string>;

function loadMap(): MapFile {
  return JSON.parse(readFileSync(MAP_PATH, "utf8")) as MapFile;
}

/** Append discovered sets to their era file (in catalog field order, release-sorted). */
function writeEraFile(era: string, sets: DiscoveredSet[]): DiscoveredSet[] {
  const path = join(DATA_DIR, "sets", `${era}.json`);
  if (!existsSync(path)) {
    console.warn(`[discover] era file ${era}.json missing — skipping ${sets.length} set(s)`);
    return [];
  }
  const file = JSON.parse(readFileSync(path, "utf8")) as {
    era: string;
    eraNameEn: string;
    eraNameFr: string;
    sets: Record<string, unknown>[];
  };
  const existing = new Set(file.sets.map((s) => s.id as string));
  const wrote: DiscoveredSet[] = [];
  for (const s of sets) {
    if (existing.has(s.id)) continue;
    existing.add(s.id); // guard against a duplicated id within this same batch
    file.sets.push({
      id: s.id,
      code: s.code,
      nameEn: s.nameEn,
      nameFr: s.nameFr,
      seriesEn: s.seriesEn,
      seriesFr: s.seriesFr,
      releaseDate: s.releaseDate,
      cardCount: s.cardCount,
      apiMatch: s.apiMatch,
    });
    wrote.push(s);
  }
  if (wrote.length === 0) return [];
  file.sets.sort((a, b) =>
    String(a.releaseDate ?? "").localeCompare(String(b.releaseDate ?? "")),
  );
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n");
  return wrote;
}

/** Add mappings, keep `_comment` first and the rest alphabetically sorted. */
function writeMap(map: MapFile, additions: DiscoveredSet[]): void {
  const { _comment, ...rest } = map as MapFile & { _comment?: string };
  for (const s of additions) rest[s.id] = s.tcgdexId;
  const sorted: MapFile = {};
  for (const k of Object.keys(rest).sort()) sorted[k] = rest[k];
  // Splice `_comment` in as the guaranteed-first line — object key order can't be
  // trusted (V8 hoists integer-like keys such as "151" above an inserted _comment).
  let body = JSON.stringify(sorted, null, 2);
  if (_comment) {
    body = body.replace(/^{\n/, `{\n  ${JSON.stringify("_comment")}: ${JSON.stringify(_comment)},\n`);
  }
  writeFileSync(MAP_PATH, body + "\n");
}

async function main() {
  const dry = process.argv.includes("--dry");
  const map = loadMap();
  const knownTcgdexIds = new Set(
    Object.entries(map)
      .filter(([k]) => k !== "_comment")
      .map(([, v]) => v),
  );
  const knownCatalogIds = new Set(getAllSets().map((s) => s.id));
  const today = new Date().toISOString().slice(0, 10);

  const found = await discoverNewSets({
    knownTcgdexIds,
    knownCatalogIds,
    today,
    log: console.log,
  });

  if (found.length === 0) {
    console.log("discover: no new sets — catalog is up to date.");
    return;
  }
  if (dry) {
    console.log(`discover (dry): would add ${found.length} set(s):`);
    for (const s of found) console.log(`  ${s.era}/${s.id} ← ${s.tcgdexId} (${s.nameEn})`);
    return;
  }

  const byEra = new Map<string, DiscoveredSet[]>();
  for (const s of found) {
    const arr = byEra.get(s.era) ?? [];
    arr.push(s);
    byEra.set(s.era, arr);
  }
  // Map only the sets actually written to a catalog file — never orphan a map
  // entry that points at a set absent from the catalog.
  const addedSets: DiscoveredSet[] = [];
  for (const [era, sets] of byEra) addedSets.push(...writeEraFile(era, sets));
  if (addedSets.length > 0) writeMap(map, addedSets);
  console.log(`discover: added ${addedSets.length} new set(s) to the catalog + map.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
