/** Shared dictionary shape — both locales must fill every key. */

export interface FaqItem {
  q: string;
  a: string;
}

export interface LegalSection {
  h: string;
  p: string[];
}

export interface Dict {
  common: {
    brand: string;
    tagline: string;
    nav: { calculator: string; sets: string; faq: string };
    navAria: string;
    footer: {
      disclaimer: string;
      method: string;
      legal: string;
      privacy: string;
      cookies: string;
      pricesUpdated: string; // {date}
      priceSource: string;
      rights: string;
      followInstagram: string;
    };
    switchLang: string;
    demoBanner: string;
    loading: string;
    backToSets: string;
    skipToContent: string;
  };
  verdict: {
    open: string;
    keep: string;
    unavailable: string;
    openSub: string; // shown under OPEN
    keepSubMargin: string; // KEEP because EV ≤ price paid
    unavailableSub: string;
  };
  confidence: {
    label: string;
    high: string;
    medium: string;
    low: string;
    parts: { pullRates: string; prices: string; freshness: string };
  };
  landing: {
    heroKicker: string;
    heroTitle1: string;
    heroTitleHolo: string;
    heroTitle2: string;
    heroSub: string;
    ctaCalculator: string;
    ctaSets: string;
    statSets: string;
    statCards: string;
    statUpdated: string;
    miniCalcTitle: string;
    howTitle: string;
    howSteps: { title: string; text: string }[];
    featuresTitle: string;
    features: { title: string; text: string }[];
    seeAllSets: string;
    tickerLabel: string;
    featuredTitle: string;
    featuredSub: string;
    featuredVerdictAtMarket: string;
    evLabel: string;
  };
  calculator: {
    title: string;
    sub: string;
    setLabel: string;
    setPlaceholder: string;
    setSearchNoResult: string;
    productLabel: string;
    products: { booster: string; display: string; etb: string };
    packsCount: string; // {n}
    boosterCount: string;
    priceLabel: string;
    pricePlaceholder: string;
    compute: string;
    openEv: string;
    perBooster: string;
    margin: string;
    profitProbability: string;
    profitProbabilityNote: string;
    sealedMarket: string;
    sealedPremium: string;
    sealedUnknown: string;
    sealedEstimated: string;
    sealedEstimatedNote: string;
    topCards: string;
    topCardsProb: string;
    rarityBreakdown: string;
    rarityCol: { rarity: string; perPack: string; meanValue: string; contribution: string };
    converter: string;
    converterNote: string; // {rate} {date}
    noRates: string;
    noRatesHint: string;
    noSnapshot: string;
    selectSetFirst: string;
    chaseLabel: string;
    share: string;
    shareCopied: string;
    shareText: string; // {verdict} {set} {margin}
    completeness: string; // {pct}
    evUpdated: string; // {date}
    fullBreakdown: string; // mini-calc → full calculator link
  };
  sets: {
    title: string;
    sub: string;
    searchPlaceholder: string;
    filterAll: string;
    filterWithEv: string;
    evBooster: string;
    evUnavailable: string;
    cardsCount: string; // {n}
    released: string;
    eraLabel: string;
    emptySearch: string;
    sortLabel: string;
    sortEv: string;
    sortDate: string;
    sortName: string;
    sortPrice: string;
    sortConfidence: string;
    resultCount: string; // {n}
    bestEvTitle: string;
    bestEvSub: string;
    chaseLabel: string;
    conf: { high: string; medium: string; low: string };
  };
  setDetail: {
    productsTitle: string;
    cardsTitle: string;
    topHits: string;
    byRarity: string;
    openInCalculator: string;
    sealedKind: { booster: string; display: string; etb: string };
    marketPrice: string;
    evOpen: string;
    verdictAtMarket: string;
    noSealed: string;
    showAllCards: string;
    hideCards: string;
  };
  cardPage: {
    priceLabel: string;
    rarityLabel: string;
    numberLabel: string;
    intro: string; // {card} {set} {price} — rank #1 only
    introRank: string; // {card} {rank} {set} {price} — rank #2+
    introNoPrice: string; // {card} {set}
    setEvLabel: string;
    viewSet: string;
    openInCalculator: string;
    updatedDaily: string;
    priceUnavailable: string;
    rankText: string; // {rank} {set}
    rankTextTop: string; // {set} — when it's the #1 card
    evShareText: string; // {pct} {set}
    relatedTitle: string; // {set}
    rarityPeersTitle: string; // {rarity} {set}
  };
  faq: {
    title: string;
    sub: string;
    items: FaqItem[];
  };
  methodology: {
    title: string;
    intro: string;
    updated: string;
    sections: LegalSection[];
  };
  legalPages: {
    lastUpdated: string;
    legal: { title: string; sections: LegalSection[] };
    privacy: { title: string; sections: LegalSection[] };
    cookies: { title: string; sections: LegalSection[] };
  };
  meta: {
    home: { title: string; description: string };
    calculator: { title: string; description: string };
    sets: { title: string; description: string };
    set: { title: string; description: string }; // {name} {ev}
    card: { title: string; description: string }; // {card} {set} {price}
    faq: { title: string; description: string };
    methodology: { title: string; description: string };
    legal: { title: string; description: string };
    privacy: { title: string; description: string };
    cookies: { title: string; description: string };
  };
}
