# Set catalog

Complete catalog of Pokémon TCG expansions, one JSON file per era, each validated by
`catalogFileSchema` (`src/lib/data/schemas.ts`). Promo-only series (Black Star
Promos, McDonald's…) are excluded — they have no sealed EV story.

```jsonc
{
  "era": "sv",
  "eraNameEn": "Scarlet & Violet",
  "eraNameFr": "Écarlate et Violet",
  "sets": [
    {
      "id": "sv-151",                  // canonical kebab-case id, stable forever
      "code": "MEW",                   // official set code, null if none
      "nameEn": "151",
      "nameFr": "151",
      "seriesEn": "Scarlet & Violet",
      "seriesFr": "Écarlate et Violet",
      "releaseDate": "2023-09-22",     // western release, ISO
      "cardCount": 165,                // official count, null if unknown
      "apiMatch": "151"                // name hint to match the TCGGO episode
    }
  ]
}
```

Adding a future set = appending one object to the era file (or creating the next
era file). Run `npm run validate:data` after any edit.

Era files: `wotc.json`, `ex.json`, `dp.json`, `hgss.json`, `bw.json`, `xy.json`,
`sm.json`, `swsh.json`, `sv.json`, `mega.json`.
