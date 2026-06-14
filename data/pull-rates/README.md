# Pull rates dataset

One JSON file per set, named `{setId}.json` where `setId` matches the catalog id in
`data/sets/*.json`. Sets without a file simply display **"EV indisponible"** — never
add a file with guessed numbers.

## Schema

```jsonc
{
  "setId": "sv-151",            // catalog id (data/sets)
  "era": "sv",                  // era key
  "confidence": "high",         // high | medium | low — quality of the sources
  "sources": ["https://…"],     // at least one URL backing the numbers
  "notes": "optional context",
  "packSize": 10,               // cards per booster
  "slots": [                    // the booster is modeled slot by slot
    {
      "name": "rare-slot",      // free label
      "count": 1,               // cards this slot yields per pack
      "distribution": {         // P(slot resolves to rarity) — MUST sum to 1
        "rare": 0.741,
        "double-rare": 0.135,
        "ultra-rare": 0.062,
        "illustration-rare": 0.052,
        "special-illustration-rare": 0.008,
        "hyper-rare": 0.002
      }
    }
  ],
  "products": {
    "display": { "packs": 36 }, // real pack count of the booster box, null if no display exists
    "etb": { "packs": 9 }       // null when the set has no ETB
  }
}
```

Rarity keys must be normalized ids from `src/lib/ev/rarity.ts` (`RARITY_IDS`).
Within a rarity, the engine assumes a uniform pull among the set's cards of that
rarity: `P(card) = P(rarity per pack) / nb cards of that rarity`.

Reverse-holo filler slots: model the foil commons/uncommons with the plain
`common` / `uncommon` ids — their market value is what matters, and hit
replacements (illustration rares, ACE SPEC…) get their own share of the
distribution.

## Adding a set

1. Create `data/pull-rates/{setId}.json` following the schema.
2. `npm run validate:data` — checks schema, sum-to-1, rarity ids and catalog match.
3. Done — the calculator picks it up at the next snapshot build.

Validation is enforced by `scripts/validate-data.ts` (zod schemas in
`src/lib/data/schemas.ts`).
