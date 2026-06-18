import type { Dict } from "./types";

export const en: Dict = {
  common: {
    brand: "Poké EV",
    tagline: "The Expected Value terminal for sealed Pokémon products",
    nav: { calculator: "Calculator", sets: "Sets", faq: "FAQ" },
    navAria: "Main navigation",
    footer: {
      disclaimer:
        "Poké EV is a statistical estimation tool. It is not financial or investment advice. Market prices and pull rates move constantly; open your products for the fun of it first.",
      method: "How it's calculated",
      legal: "Legal notice",
      privacy: "Privacy",
      cookies: "Cookies",
      pricesUpdated: "Prices updated {date}",
      priceSource: "Prices: TCGPlayer US ($) · Pull rates: sourced community dataset",
      rights: "Pokémon and related names are trademarks of Nintendo / Creatures / GAME FREAK. Unaffiliated fan project.",
      followInstagram: "Follow on Instagram",
    },
    switchLang: "Switch to French",
    demoBanner:
      "Demo data: synthetic numbers, not real prices. Generate a snapshot with your API key for live prices.",
    loading: "Loading…",
    backToSets: "← All sets",
    skipToContent: "Skip to main content",
  },
  verdict: {
    open: "OPEN",
    keep: "KEEP",
    unavailable: "EV UNAVAILABLE",
    openSub: "Opening EV beats what you paid",
    keepSubMargin: "Opening EV doesn't cover what you paid",
    unavailableSub: "No documented pull rates for this set. We never guess",
  },
  confidence: {
    label: "Confidence index",
    high: "high",
    medium: "medium",
    low: "low",
    parts: { pullRates: "Pull rates", prices: "Priced cards", freshness: "Up-to-date" },
  },
  landing: {
    heroKicker: "EXPECTED VALUE · POKÉMON TCG",
    heroTitle1: "Rip it,",
    heroTitleHolo: "or keep it sealed",
    heroTitle2: "?",
    heroSub:
      "Poké EV calculates what you can expect to pull from a booster pack, a booster box, or an ETB, and tells you whether it's worth opening.",
    ctaCalculator: "Open the calculator",
    ctaSets: "Browse sets",
    statSets: "sets cataloged",
    statCards: "cards priced",
    statUpdated: "prices refreshed",
    miniCalcTitle: "Instant verdict",
    howTitle: "How it works",
    howSteps: [
      {
        title: "Pick your product",
        text: "Set, format (booster box, pack, ETB) and the price you paid. That's all we need.",
      },
      {
        title: "We unroll the odds",
        text: "Every rarity in the set is weighted by its documented pull rates, card by card, slot by slot.",
      },
      {
        title: "Clear-cut verdict",
        text: "OPEN when expected value beats your price paid. Otherwise KEEP.",
      },
    ],
    featuresTitle: "Why Poké EV",
    features: [
      {
        title: "Math, not vibes",
        text: "Expected value as a weighted sum over every card in the set.",
      },
      {
        title: "Today's market prices",
        text: "Daily TCGPlayer market-price snapshot, in dollars.",
      },
      {
        title: "Never a made-up number",
        text: "No documented rates? EV unavailable, full stop. Every dataset cites its sources.",
      },
      {
        title: "Probability of profit",
        text: "Beyond the average: booster variance gives you your real odds of breaking even.",
      },
    ],
    seeAllSets: "See the full catalog",
    tickerLabel: "LIVE EV",
    featuredTitle: "Top EV right now",
    featuredSub: "The expansions with the best expected value per pack, at today's market prices.",
    featuredVerdictAtMarket: "Verdict at market price",
    evLabel: "EV / pack",
  },
  calculator: {
    title: "EV Calculator",
    sub: "Booster box, pack or ETB: enter your price, we do the math.",
    setLabel: "Set",
    setPlaceholder: "Search a set (151, Prismatic Evolutions…)",
    setSearchNoResult: "No set found",
    productLabel: "Product",
    products: { booster: "Booster pack", display: "Booster box", etb: "ETB" },
    packsCount: "{n} packs",
    boosterCount: "Number of packs",
    priceLabel: "Price paid",
    pricePlaceholder: "e.g. 149.90",
    compute: "Compute EV",
    openEv: "Opening EV",
    perBooster: "per pack",
    margin: "Margin vs price paid",
    profitProbability: "Probability of profit",
    profitProbabilityNote:
      "Probability that the pulled cards beat your price (normal approximation over booster variance).",
    sealedMarket: "Sealed market price",
    sealedPremium: "Sealed premium vs opening",
    sealedUnknown: "Sealed price not quoted in the snapshot",
    sealedEstimated: "estimated",
    sealedEstimatedNote:
      "Estimated from the real single-booster price — the market quotes no sealed price for this product.",
    topCards: "Most valuable cards",
    topCardsProb: "odds / pack",
    rarityBreakdown: "Contribution by rarity",
    rarityCol: { rarity: "Rarity", perPack: "Expected / pack", meanValue: "Avg value", contribution: "EV contribution" },
    converter: "Convert",
    converterNote: "ECB rate {rate} as of {date}",
    noRates: "EV unavailable for this set",
    noRatesHint:
      "No documented pull rates exist for this expansion. We only show EV when probabilities are sourced, never made-up numbers.",
    noSnapshot:
      "Price snapshot unavailable. The site degrades gracefully: try again later or browse the set catalog.",
    selectSetFirst: "Pick a set to run the math",
    chaseLabel: "The set's chase card",
    share: "Share my result",
    shareCopied: "Link copied!",
    shareText: "{verdict} · {set}: EV {ev} for {price} paid ({margin}) via Poké EV",
    completeness: "{pct} of the set's cards carry a price",
    evUpdated: "Prices as of {date}",
    fullBreakdown: "Full breakdown →",
  },
  sets: {
    title: "All sets",
    sub: "Every Pokémon TCG expansion from 1999 to today. EV shows up for sets with documented pull rates.",
    searchPlaceholder: "Search a set (EN or FR)…",
    filterAll: "All eras",
    filterWithEv: "EV available",
    evBooster: "EV / pack",
    evUnavailable: "EV unavailable",
    cardsCount: "{n} cards",
    released: "Released",
    eraLabel: "Era",
    emptySearch: "No set matches your search.",
    sortLabel: "Sort",
    sortEv: "EV (high → low)",
    sortDate: "Newest",
    sortName: "Name (A→Z)",
    sortPrice: "Chase card (price)",
    sortConfidence: "Confidence",
    resultCount: "{n} sets",
    bestEvTitle: "Best EV right now",
    bestEvSub: "The highest Expected-Value booster packs today.",
    chaseLabel: "chase",
    conf: { high: "High confidence", medium: "Medium confidence", low: "Low confidence" },
  },
  setDetail: {
    productsTitle: "Sealed products",
    cardsTitle: "Cards in this set",
    topHits: "Top hits",
    byRarity: "Contribution by rarity",
    openInCalculator: "Run it with my price →",
    sealedKind: { booster: "Booster pack", display: "Booster box", etb: "ETB" },
    marketPrice: "Market price",
    evOpen: "Opening EV",
    verdictAtMarket: "Verdict at market price",
    noSealed: "No sealed product quoted in the snapshot for this set.",
    showAllCards: "Show all cards",
    hideCards: "Collapse",
  },
  cardPage: {
    priceLabel: "Market price (TCGPlayer US)",
    rarityLabel: "Rarity",
    numberLabel: "Number",
    intro:
      "{card} is the most valuable card in {set}, priced {price} on TCGPlayer US. Updated every day.",
    introRank:
      "{card} is the #{rank} most valuable card in {set}, priced {price} on TCGPlayer US. Updated every day.",
    introNoPrice: "{card} is one of the most sought-after cards in {set}. Price refreshing.",
    setEvLabel: "Booster pack EV",
    viewSet: "View the {set} set",
    openInCalculator: "Open the EV calculator",
    updatedDaily: "Price refreshed daily",
    priceUnavailable: "Price unavailable",
    rankText: "#{rank} most valuable card in {set}",
    rankTextTop: "Most valuable card in {set}",
    evShareText: "This single card makes up {pct}% of a {set} booster's Expected Value.",
    relatedTitle: "Other sought-after {set} cards",
    rarityPeersTitle: "Other {rarity} cards in {set}",
  },
  faq: {
    title: "FAQ",
    sub: "Everything about the math, the sources and the limits.",
    items: [
      {
        q: "What is EV (Expected Value)?",
        a: "Expected Value is the mathematical expectation of the value of the cards you pull when opening a product. Concretely: the sum, over every card in the set, of (probability of pulling that card) × (its market value). It's what you'd average by opening a very large number of identical products. Any single rip can land far above or far below it.",
      },
      {
        q: "How exactly is EV computed?",
        a: "We model each booster slot by slot: every slot has a probability distribution over rarities (documented per set), and within a rarity every card is equally likely. Pack EV = Σ pull rate × value. Booster box EV = pack EV × the real number of packs (usually 36). ETB EV = pack EV × the box's pack count. Cards with no quoted price count as zero: our EV is a floor, not a ceiling.",
      },
      {
        q: "Where do prices come from?",
        a: "From a daily snapshot of market prices aggregated by TCGdex: Cardmarket (the European market, in euros) and TCGPlayer (the US market, in dollars). In English we show the TCGPlayer market price; in French, the Cardmarket trend price. When a card isn't quoted on one marketplace, we convert the other at the day's exchange rate so the value stays real. The snapshot timestamp is shown everywhere and price freshness feeds the confidence index.",
      },
      {
        q: "Where do pull rates come from?",
        a: "The API doesn't provide them. They come from a versioned static dataset, one file per set, built from public quantitative sources: large community opening campaigns (TCGplayer Infinite, PokeBeach, JustInBasil…), and official Japanese rates where they exist. Every file cites its sources and carries a confidence level (high / medium / low).",
      },
      {
        q: "Why do some sets show \"EV unavailable\"?",
        a: "Because no reliable quantitative source documents their pull rates (true of most older sets). Rather than inventing probabilities, we show nothing: a wrong number is worse than no number. The catalog still lists every set, and EV will appear as soon as a sourced dataset exists.",
      },
      {
        q: "How is the OPEN / KEEP verdict decided?",
        a: "A single comparison: your price paid against the opening EV. If the booster, ETB or booster box has an expected value above what you paid, it's OPEN. Otherwise KEEP, with the negative margin displayed so you know exactly where you stand. The sealed market price is shown for reference (resale value) but never changes the verdict.",
      },
      {
        q: "What does the probability of profit mean?",
        a: "It's the probability that the total value of your pulls exceeds what you paid. EV is an average; a single booster's variance is huge (it's all about the big hit). We approximate the distribution of the sum of packs with a normal law (central limit theorem): reliable for a 36-pack box, indicative for a single pack.",
      },
      {
        q: "How do I read the confidence index?",
        a: "It blends three weighted components: pull-rate quality (40%), the share of the set's cards with a quoted price (35%), and price snapshot freshness (25%). Above 80 the data is solid; 55–80 is decent; below that, take the number with a grain of salt.",
      },
      {
        q: "Do reverse holos, energies and ETB goodies count?",
        a: "Reverse slots are modeled with the value of the matching commons/uncommons, and premium replacements (illustration rares, ACE SPEC…) get their documented share of the odds. Basic energies count as zero. For ETBs, V1 values the packs inside; accessories (dice, sleeves…) are not valued.",
      },
      {
        q: "Is this financial advice?",
        a: "No. Poké EV is a statistical estimation tool for informational purposes. Card prices are volatile, pull rates are community estimates, and EV doesn't predict any single opening. Never put in money you can't afford to lose. And open boosters for the fun of it first.",
      },
    ],
  },
  methodology: {
    title: "Methodology & transparency",
    intro:
      "How Poké EV turns a sealed product into a number. Sources, formula and limits — no black box.",
    updated: "Last updated: June 2026",
    sections: [
      {
        h: "The formula",
        p: [
          "A booster's Expected Value (EV) is a weighted sum: for every card in the set, we multiply its probability of showing up by its market value, then add it all up. Pack EV = Σ (pull rate × card value).",
          "A booster box's EV is the pack EV times the real number of packs in the box (usually 36). An ETB follows the same logic with its own pack count. We only value the packs — accessories and goodies count as zero.",
          "A card with no quoted price counts as zero, so our EV is a cautious floor, never inflated.",
        ],
      },
      {
        h: "The slot-by-slot model",
        p: [
          "A booster isn't a uniform draw: it's made of slots (commons, uncommons, the reverse slot, the rare or hit slot). Each slot carries its own rarity distribution, documented per set. Within a rarity, every card is assumed equally likely.",
          "Reverse slots are modeled with the value of the matching commons and uncommons; premium replacements (illustration rares, ACE SPEC…) get their documented share of the odds.",
        ],
      },
      {
        h: "Pull rates",
        p: [
          "The price API doesn't provide pull rates. They come from a versioned static dataset, one file per set, built from public quantitative sources: large community opening campaigns and official Japanese rates where they exist.",
          "Every file cites its sources and carries a confidence level. When no reliable source exists, we invent nothing: the set shows \"EV unavailable\".",
        ],
      },
      {
        h: "Prices",
        p: [
          "Prices come from a daily snapshot aggregated by TCGdex: Cardmarket (the European market, in euros) and TCGPlayer (the US market, in dollars). In English we show the TCGPlayer market price; in French, the Cardmarket trend price.",
          "When a card is quoted on only one marketplace, we convert the other at the day's exchange rate so the value stays real. The snapshot timestamp is shown everywhere.",
        ],
      },
      {
        h: "The confidence index",
        p: [
          "Every EV ships with a confidence index blending three weighted components: pull-rate quality (40%), the share of the set's cards with a quoted price (35%) and price-snapshot freshness (25%).",
          "Above 80 the data is solid; 55–80 is decent; below that, take it with a grain of salt.",
        ],
      },
      {
        h: "The OPEN / KEEP verdict",
        p: [
          "A single comparison decides the verdict: your price paid against the opening EV. If expected value beats what you paid, it's OPEN; otherwise KEEP, with the margin shown. The sealed market price is shown for reference and never changes the verdict.",
        ],
      },
      {
        h: "Probability of profit & limits",
        p: [
          "EV is an average. A single booster's variance is huge: it's all about the big hit. We approximate the distribution of the sum of packs with a normal law (central limit theorem): reliable for a box, indicative for a single pack.",
          "Poké EV is a statistical estimation tool for information only, not financial advice. Prices are volatile and pull rates are community estimates. Open your boosters for the fun of it first.",
        ],
      },
    ],
  },
  legalPages: {
    lastUpdated: "Last updated: June 2026",
    legal: {
      title: "Legal notice",
      sections: [
        {
          h: "Publisher",
          p: [
            "pokeev.com (\"Poké EV\") is published by a private individual on a non-professional, non-commercial basis. Contact: contact@pokeev.com.",
            "Under Article 6 III 2° of the French Confidence in the Digital Economy Act (LCEN), the publisher, a non-professional individual, has chosen not to make their personal contact details public; their identity is held by the site's host (see \"Hosting\") and available to the competent authorities.",
            "Publication director: the site publisher, reachable at contact@pokeev.com.",
          ],
        },
        {
          h: "Hosting",
          p: [
            "The site is hosted by Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA · vercel.com.",
          ],
        },
        {
          h: "Intellectual property",
          p: [
            "Pokémon, the Pokémon Trading Card Game and expansion names are trademarks of Nintendo, Creatures Inc. and GAME FREAK Inc. Poké EV is an independent site, neither affiliated with nor endorsed by these companies.",
            "Card images and expansion logos displayed come from public sources and remain the property of their rights holders. The site's original code and content are protected by copyright.",
          ],
        },
        {
          h: "Limitation of liability",
          p: [
            "The Expected Value estimates, verdicts and probabilities displayed are provided for information only, with no guarantee of accuracy or completeness. They do not constitute financial advice, investment advice or an inducement to buy. The publisher cannot be held liable for decisions made on the basis of this information.",
          ],
        },
      ],
    },
    privacy: {
      title: "Privacy policy",
      sections: [
        {
          h: "Data we collect",
          p: [
            "Poké EV requires no account and collects no personally identifying data: no name, no e-mail, no IP address stored by us.",
            "EV calculations (chosen set, entered price) run in your browser and are never tied to your identity.",
          ],
        },
        {
          h: "Analytics",
          p: [
            "Audience measurement relies on Umami, a cookieless solution that collects no personal data and performs no cross-site tracking. Statistics are aggregated and anonymous (page views, calculations run, language used). Under EU guidance (including CNIL's), this setup is exempt from consent.",
          ],
        },
        {
          h: "Third-party services",
          p: [
            "To operate, the site relies on technical providers that receive connection data (including your IP address) solely to deliver the pages and their content: Vercel (hosting), Umami (anonymous, cookieless audience measurement) and TCGdex (the CDN that serves card images). This data is not retained by the publisher and is not used to identify you.",
          ],
        },
        {
          h: "Your rights",
          p: [
            "Under the GDPR you have rights of access, rectification and erasure of data concerning you. As the site stores no personal data these requests are moot in practice, but you can write to contact@pokeev.com with any question.",
            "Supervisory authority: CNIL · cnil.fr.",
          ],
        },
      ],
    },
    cookies: {
      title: "Cookie policy",
      sections: [
        {
          h: "Cookies we use",
          p: [
            "Poké EV uses a single functional cookie: NEXT_LOCALE, which remembers your language choice (French or English) for 12 months. It is strictly necessary for the site to work and requires no consent.",
            "No advertising cookies, no tracking cookies, no third-party cookies are set.",
          ],
        },
        {
          h: "Cookieless analytics",
          p: [
            "Visit statistics are collected through Umami, which works without cookies or persistent identifiers. That's why no consent banner is required.",
          ],
        },
        {
          h: "Managing the language cookie",
          p: [
            "You can delete the NEXT_LOCALE cookie at any time in your browser settings; the site will simply re-detect your language on the next load.",
          ],
        },
      ],
    },
  },
  meta: {
    home: {
      title: "Poké EV · Open or keep your sealed Pokémon products? Math, not vibes",
      description:
        "Expected Value calculator for Pokémon TCG booster boxes, packs and ETBs. Documented pull rates × today's TCGPlayer prices: OPEN or KEEP verdict, margin and profit probability.",
    },
    calculator: {
      title: "Pokémon TCG EV Calculator · booster boxes, packs, ETBs | Poké EV",
      description:
        "Enter what you paid, pick your set: opening EV, OPEN/KEEP verdict, top cards, rarity breakdown and profit probability. Fresh TCGPlayer US prices.",
    },
    sets: {
      title: "Every Pokémon TCG set with EV · full EN/FR catalog | Poké EV",
      description:
        "Complete catalog of Pokémon TCG expansions from 1999 to today, English and French names, with current Expected Value for sets with documented pull rates.",
    },
    set: {
      title: "{name} EV · should you open it? | Poké EV",
      description:
        "Expected Value of {name}: pack EV {ev}, booster box/ETB verdicts at market price, top hits and rarity breakdown. Fresh TCGPlayer US prices.",
    },
    card: {
      title: "{card} {set} price · {price} | Poké EV",
      description:
        "{card} ({set}) price: {price} on TCGPlayer US, updated daily. Rarity, number, HD image and the {set} booster EV.",
    },
    faq: {
      title: "Method & FAQ · how is EV calculated? | Poké EV",
      description:
        "Full method: sourced pull rates, Cardmarket/TCGPlayer prices, OPEN/KEEP verdict, profit probability, confidence index and the tool's limits.",
    },
    methodology: {
      title: "Methodology & transparency · how EV is calculated | Poké EV",
      description:
        "Poké EV's full method: the Expected Value formula, the slot-by-slot model, pull-rate and price sources, the confidence index and the tool's limits.",
    },
    legal: { title: "Legal notice | Poké EV", description: "Legal notice for pokeev.com." },
    privacy: {
      title: "Privacy policy | Poké EV",
      description: "No personal data collected, cookieless analytics. Details of our privacy policy.",
    },
    cookies: {
      title: "Cookie policy | Poké EV",
      description: "A single functional language cookie, no tracking cookies. Details of our cookie policy.",
    },
  },
};
