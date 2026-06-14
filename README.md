# Poké EV

**pokeev.com** — Expected Value calculator for sealed Pokémon TCG products. Enter what you
paid for a booster box / pack / ETB, get the opening EV and a clear verdict: **OPEN** (opening
beats your price) or **KEEP** (worth more sealed). Bilingual FR/EN — the language drives the
price market: FR → Cardmarket FR (€), EN → TCGPlayer US ($).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Motion · Vitest · Vercel
(serverless proxy, cron, Blob, dynamic OG).

## How EV works

```
EV(pack)    = Σ over rarities ( expected cards/pack × mean market value )
EV(display) = EV(pack) × real pack count (36)
EV(ETB)     = EV(pack) × box pack count (8–9)
```

- **Pull rates** are NOT provided by the price API. They live in `data/pull-rates/`
  (one JSON per set, schema documented there, sources cited, sum-to-1 validated).
  Sets without a file show **"EV unavailable"** — numbers are never invented.
- **Prices** come from a precomputed snapshot (see below), never live API calls.
- Verdict: KEEP when sealed market price ≥ opening EV; else OPEN when EV > price paid; else KEEP.
- Extras: profit probability (CLT over pack variance, tested against Monte Carlo),
  confidence index (rates quality 40% / price coverage 35% / freshness 25%), €/$ converter (ECB).

## Prices (real, free — TCGdex)

Real market prices come from **TCGdex** (`api.tcgdex.net`) — free, no API key, no
hard rate limit: real Cardmarket (EUR) and TCGPlayer (USD) prices per card,
refreshed daily. The catalog→TCGdex set mapping lives in
`data/sources/tcgdex-sets.json` (one line per EV set).

```
TCGdex (Cardmarket EUR + TCGPlayer USD) ──> snapshot builder ──> data/snapshot/snapshot.json (bundled)
                                                  │                          and/or Vercel Blob
   FR = Cardmarket trend, EN = TCGPlayer market   └─ where one market is missing,
   (one fetch/card, pricing is language-agnostic)    convert the other at the day's FX rate
                                                        │
                              pages (ISR 1h) ◄──────────┘   front end never calls an API
```

- `npm run snapshot` — build the real snapshot from TCGdex (free, **no key needed**).
- `npm run snapshot -- --only=151,prismatic-evolutions` — refresh specific sets.
- `npm run snapshot -- --demo` — synthetic data, flagged `demo:true` and bannered in the UI.
- `npm run snapshot -- --source=tcggo` — RapidAPI path (adds real **sealed-product** prices
  for the market-verdict; needs a paid `RAPIDAPI_KEY`). TCGdex has no sealed prices.
- In production, `vercel.json` schedules `GET /api/cron/refresh-snapshot` daily (05:00 UTC);
  it rebuilds from TCGdex and persists to Vercel Blob.
- `/api/health` — snapshot freshness, dataset counts, env wiring.

## Setup

```bash
npm install
npm run snapshot            # real prices from TCGdex (free, no key) — or `-- --demo`
npm run dev
```

## Scripts

| Command | What |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest — EV engine, verdict, confidence, rarity normalization |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run validate:data` | Validates `data/sets/*` + `data/pull-rates/*` (zod, sum-to-1, id match) |
| `npm run snapshot [-- --demo] [-- --only=ids] [-- --source=tcggo]` | Builds the price/EV snapshot |

## Deployment (Vercel)

1. Push the repo to GitHub, import it in Vercel.
2. Environment variables (see `.env.example`): `CRON_SECRET` + `BLOB_READ_WRITE_TOKEN`
   (for the daily TCGdex cron to persist fresh prices), `NEXT_PUBLIC_SITE_URL`,
   `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (+ optional `NEXT_PUBLIC_UMAMI_SRC` to override the
   Umami script URL for self-host / EU endpoint). `RAPIDAPI_KEY` is **optional** — only needed if you
   run `--source=tcggo` for real sealed-product prices. Prices work out of the box from
   the committed TCGdex snapshot with zero keys.
3. Point **pokeev.com** at the project. Canonicals, hreflang FR↔EN, sitemap, robots,
   JSON-LD (WebApplication, FAQPage, Product/AggregateOffer) and dynamic OG images
   (`/api/og`) are already wired to that domain.
4. Vercel Cron picks up `vercel.json` automatically. Commit a fresh snapshot occasionally
   so cold deploys ship recent bundled data.

## Adding a set

1. Append the set to its era file in `data/sets/` (id rule documented in `data/sets/README.md`).
2. If documented pull rates exist, add `data/pull-rates/{id}.json` (schema + rules in
   `data/pull-rates/README.md`).
3. `npm run validate:data && npm run snapshot`.

## i18n

FR at the root (`/calculateur`, `/sets`, `/faq`…), EN under `/en` (`/en/calculator`…).
First visit: `Accept-Language` detection at `/` (bots excluded), choice persisted in the
`NEXT_LOCALE` cookie, instant client-side switch. All content localized — UI, FAQ, legal
pages, set names, verdicts, meta/OG.

## Privacy

No accounts, no personal data. Umami analytics (cookieless, no consent banner needed).
One functional cookie (`NEXT_LOCALE`). Legal pages (FR law / GDPR) included in both languages.

## Disclaimer

Poké EV is a statistical estimation tool, **not financial advice**. Prices move, pull rates
are community estimates, single openings vary wildly.
