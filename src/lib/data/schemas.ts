import { z } from "zod";
import { RARITY_IDS } from "../ev/rarity";

/** Zod schemas validating the static datasets at system boundaries. */

export const rarityIdSchema = z.enum(RARITY_IDS);

const distributionSchema = z
  .record(rarityIdSchema, z.number().min(0).max(1))
  .refine(
    (dist) => {
      const sum = Object.values(dist).reduce((a, b) => a + (b ?? 0), 0);
      return Math.abs(sum - 1) < 1e-6;
    },
    { message: "slot distribution must sum to 1" },
  );

export const packSlotSchema = z.object({
  name: z.string().min(1),
  count: z.number().positive(),
  distribution: distributionSchema,
});

export const pullRateConfigSchema = z.object({
  setId: z.string().min(1),
  era: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  sources: z.array(z.string().url()).min(1),
  notes: z.string().optional(),
  packSize: z.number().int().positive(),
  slots: z.array(packSlotSchema).min(1),
  products: z.object({
    display: z.object({ packs: z.number().int().positive() }).nullable(),
    etb: z.object({ packs: z.number().int().positive() }).nullable(),
  }),
});

export type PullRateConfigInput = z.infer<typeof pullRateConfigSchema>;

export const catalogSetSchema = z.object({
  /** Canonical Poké EV id, stable, kebab-case (e.g. "sv03-5-151"). */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** Official set code when one exists (e.g. "MEW", "PAL"). */
  code: z.string().nullable(),
  nameEn: z.string().min(1),
  nameFr: z.string().min(1),
  seriesEn: z.string().min(1),
  seriesFr: z.string().min(1),
  /** ISO date of the western release. */
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Number of cards (official count, secrets excluded) when known. */
  cardCount: z.number().int().positive().nullable(),
  /** Hint used by the snapshot job to match the TCGGO episode. */
  apiMatch: z.string().nullable(),
});

export const catalogFileSchema = z.object({
  era: z.string().min(1),
  eraNameEn: z.string().min(1),
  eraNameFr: z.string().min(1),
  sets: z.array(catalogSetSchema).min(1),
});

export type CatalogSet = z.infer<typeof catalogSetSchema>;
export type CatalogFile = z.infer<typeof catalogFileSchema>;
