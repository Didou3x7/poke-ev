/**
 * Discovers newly released Pokémon sets from TCGdex (free, no key) and returns
 * catalog-ready entries for MAIN English booster expansions only.
 *
 * Pure fetch + filter: the caller writes the catalog/map files. Pull rates (and
 * therefore EV) are NEVER auto-derived — a discovered set lands as "EV
 * indisponible" until a sourced pull-rate file is added by hand. Card + sealed
 * prices and the chase card fill in automatically on the next snapshot build.
 */

const TCGDEX = "https://api.tcgdex.net/v2";

/**
 * Per-generation allowlist. A new English booster generation (≈ once a year)
 * is onboarded by adding ONE line here; new sets WITHIN a known generation are
 * picked up automatically. The series names mirror the catalog exactly so
 * auto-added entries match the hand-curated ones.
 */
const SERIES: Record<string, { era: string; prefix: string; en: string; fr: string }> = {
  sv: { era: "sv", prefix: "sv", en: "Scarlet & Violet", fr: "Écarlate et Violet" },
  swsh: { era: "swsh", prefix: "swsh", en: "Sword & Shield", fr: "Épée et Bouclier" },
  me: { era: "mega", prefix: "me", en: "Mega Evolution", fr: "Méga-Évolution" },
};

export interface TcgdexBrief {
  id: string;
  name: string;
  cardCount?: { total?: number; official?: number };
}

export interface TcgdexDetail {
  id: string;
  name: string;
  releaseDate?: string;
  serie?: { id: string; name: string };
  cardCount?: { official?: number; total?: number };
  abbreviation?: { official?: string; localized?: string };
}

export interface DiscoveredSet {
  era: string;
  id: string;
  code: string | null;
  nameEn: string;
  nameFr: string;
  seriesEn: string;
  seriesFr: string;
  releaseDate: string;
  cardCount: number | null;
  apiMatch: string;
  tcgdexId: string;
}

/** Catalog id slug: lowercase, accent-stripped, alphanumerics joined by hyphens. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** True for a real YYYY-MM-DD calendar date (rejects 2024-99-99, 2024-02-31). */
export function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * True only for a main English booster expansion that has actually released.
 * Excludes promos (id ends in "p"), basic-energy sets, Pokémon Pocket (A1/B1…),
 * legacy series, and anything not yet out.
 */
export function isMainExpansion(d: TcgdexDetail, todayIso: string): boolean {
  const serie = d.serie?.id;
  if (!serie || !(serie in SERIES)) return false; // known booster series only
  if (!/^[a-z]/.test(d.id)) return false; // Pocket uses A1/A2/B1…
  if (/p$/i.test(d.id)) return false; // promos: svp / swshp / mep
  if (/\benergy\b/i.test(d.name)) return false; // basic-energy sets
  const official = d.cardCount?.official ?? 0;
  if (official < 30) return false; // energy / promo stubs
  const rd = d.releaseDate;
  // Require a REAL calendar date. A malformed/impossible date (2024-99-99) would
  // render as "Invalid Date" in the UI, and a partial one could fail the catalog
  // schema and make catalog.ts drop a whole era. Never let either happen.
  if (!rd || !isCalendarDate(rd) || rd > todayIso) return false; // released only
  return true;
}

type Fetcher = (url: string) => Promise<Response>;

async function getJson<T>(url: string, fetchImpl: Fetcher): Promise<T | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface DiscoverOptions {
  /** TCGdex set ids already mapped (values of tcgdex-sets.json). */
  knownTcgdexIds: Set<string>;
  /** Catalog ids already present (to avoid slug collisions). */
  knownCatalogIds: Set<string>;
  /** Today as YYYY-MM-DD; only sets released on or before this are added. */
  today: string;
  log?: (m: string) => void;
  fetchImpl?: Fetcher;
  /** Safety cap on how many sets a single run may add. */
  maxAdds?: number;
}

export async function discoverNewSets(opts: DiscoverOptions): Promise<DiscoveredSet[]> {
  const log = opts.log ?? (() => {});
  const fetchImpl = opts.fetchImpl ?? ((u: string) => fetch(u));
  const max = opts.maxAdds ?? 8;
  const prefixes = Object.values(SERIES).map((s) => s.prefix);

  // Array.isArray, not just truthiness: a 200 with an error-shaped body
  // ({message:"rate limited"}) is truthy and would crash .filter/.map.
  const enList = await getJson<TcgdexBrief[]>(`${TCGDEX}/en/sets`, fetchImpl);
  if (!Array.isArray(enList)) {
    log("discover: TCGdex EN list unavailable or malformed — skipping discovery this run");
    return [];
  }
  const frRaw = await getJson<TcgdexBrief[]>(`${TCGDEX}/fr/sets`, fetchImpl);
  const frName = new Map((Array.isArray(frRaw) ? frRaw : []).map((s) => [s.id, s.name]));

  // Cheap pre-filter on the list before spending a detail call per candidate.
  const candidates = enList.filter(
    (s) =>
      !opts.knownTcgdexIds.has(s.id) &&
      /^[a-z]/.test(s.id) &&
      !/p$/i.test(s.id) &&
      prefixes.some((p) => s.id.startsWith(p)),
  );
  log(`discover: ${candidates.length} unmapped candidate id(s) in known series`);

  // Dedup against the existing catalog AND ids added earlier in THIS run, so two
  // new sets that slugify to the same id can't both be pushed (one id, two rows).
  const seen = new Set(opts.knownCatalogIds);
  const found: DiscoveredSet[] = [];
  for (const c of candidates) {
    const d = await getJson<TcgdexDetail>(`${TCGDEX}/en/sets/${c.id}`, fetchImpl);
    if (!d || !isMainExpansion(d, opts.today)) continue;
    const serie = SERIES[d.serie!.id];
    const id = slugify(d.name);
    if (!id || seen.has(id)) {
      log(`discover: skip ${d.id} — catalog id "${id}" already exists or empty`);
      continue;
    }
    seen.add(id);
    found.push({
      era: serie.era,
      id,
      code: d.abbreviation?.official?.toUpperCase() || null,
      nameEn: d.name,
      nameFr: frName.get(d.id) ?? d.name,
      seriesEn: serie.en,
      seriesFr: serie.fr,
      releaseDate: d.releaseDate!,
      cardCount: d.cardCount?.official ?? null,
      apiMatch: d.name,
      tcgdexId: d.id,
    });
    log(`discover: ✓ ${d.id} → ${id} (${d.name} / ${frName.get(d.id) ?? "?"}) ${d.releaseDate}`);
    if (found.length >= max) {
      log(`discover: reached maxAdds=${max}, stopping (rest picked up next run)`);
      break;
    }
  }
  return found;
}
