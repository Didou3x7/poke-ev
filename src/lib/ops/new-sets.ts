// New-set radar: every day, ask TCGdex whether a main English expansion has released that
// our catalog doesn't cover yet, and ping the owner on Telegram so onboarding (still a manual,
// pull-rate-sourced step — see the new-set checklist) starts the day the set drops instead of
// whenever someone notices. Alerted ids are remembered on Blob so it nudges ONCE per set, not daily.
import { discoverNewSets, type DiscoveredSet } from "@/lib/data/discover-sets";
import { loadTcgdexMap } from "@/lib/data/build-tcgdex";
import { getAllSets } from "@/lib/data/catalog";
import { notifyOps } from "@/lib/ops/notify";

const ALERTED_PATH = "ops/new-sets-alerted.json";

async function readAlerted(): Promise<Set<string>> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return new Set();
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: ALERTED_PATH, limit: 1 });
    const b = blobs.find((x) => x.pathname === ALERTED_PATH);
    if (!b) return new Set();
    const r = await fetch(`${b.url}?v=${encodeURIComponent(b.uploadedAt.toString())}`, { cache: "no-store" });
    if (!r.ok) return new Set();
    return new Set((await r.json()) as string[]);
  } catch {
    return new Set();
  }
}

async function writeAlerted(ids: Set<string>): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(ALERTED_PATH, JSON.stringify([...ids]), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch {
    /* best-effort */
  }
}

/** Detect new expansions, alert the owner ONCE each. Returns the freshly-alerted sets. */
export async function detectAndAlertNewSets(today: string, log: (m: string) => void = () => {}): Promise<DiscoveredSet[]> {
  const knownTcgdexIds = new Set(Object.values(loadTcgdexMap()));
  const knownCatalogIds = new Set(getAllSets().map((s) => s.id));
  const found = await discoverNewSets({ knownTcgdexIds, knownCatalogIds, today, log });
  if (found.length === 0) return [];

  const alerted = await readAlerted();
  const fresh = found.filter((s) => !alerted.has(s.tcgdexId));
  if (fresh.length === 0) {
    log(`new-sets: ${found.length} found but all already alerted`);
    return [];
  }

  const lines = fresh.map(
    (s) => `• ${s.nameEn} (${s.seriesEn}) — ${s.releaseDate}, ${s.cardCount ?? "?"} cartes`,
  );
  await notifyOps(
    `🆕 Nouveau(x) set(s) Pokémon détecté(s) :\n${lines.join("\n")}\n\n` +
      `→ À onboarder (FR+EN, prix+chase, pull-rates) quand tu veux. EV restera "indisponible" jusqu'au fichier pull-rate.`,
  );
  fresh.forEach((s) => alerted.add(s.tcgdexId));
  await writeAlerted(alerted);
  log(`new-sets: alerted ${fresh.length} new set(s)`);
  return fresh;
}
