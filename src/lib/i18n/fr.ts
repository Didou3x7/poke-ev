import type { Dict } from "./types";

export const fr: Dict = {
  common: {
    brand: "Poké EV",
    tagline: "Le terminal d'Expected Value des produits scellés Pokémon",
    nav: { calculator: "Calculateur", sets: "Sets", faq: "FAQ" },
    navAria: "Navigation principale",
    footer: {
      disclaimer:
        "Poké EV est un outil d'estimation statistique. Ce n'est ni un conseil financier, ni un conseil d'investissement. Les prix du marché et les taux de pull évoluent ; ouvrez vos produits pour le plaisir d'abord.",
      method: "Méthode de calcul",
      legal: "Mentions légales",
      privacy: "Confidentialité",
      cookies: "Cookies",
      pricesUpdated: "Prix mis à jour le {date}",
      priceSource: "Prix : Cardmarket FR (€) · Pull rates : dataset communautaire sourcé",
      rights: "Pokémon et les noms associés sont des marques de Nintendo / Creatures / GAME FREAK. Site non affilié.",
    },
    switchLang: "Passer en anglais",
    demoBanner:
      "Données de démonstration : chiffres synthétiques, pas des prix réels. Générez un snapshot avec votre clé API pour les vrais prix.",
    loading: "Chargement…",
    backToSets: "← Tous les sets",
    skipToContent: "Aller au contenu principal",
  },
  verdict: {
    open: "OUVRE",
    keep: "GARDE",
    unavailable: "EV INDISPONIBLE",
    openSub: "L'EV à l'ouverture dépasse ton prix d'achat",
    keepSubMargin: "L'EV à l'ouverture ne couvre pas ton prix d'achat",
    unavailableSub: "Pas de taux de pull documentés pour ce set. On ne devine jamais",
  },
  confidence: {
    label: "Indice de confiance",
    high: "élevé",
    medium: "moyen",
    low: "faible",
    parts: { pullRates: "Taux de pull", prices: "Cartes cotées", freshness: "Prix à jour" },
  },
  landing: {
    heroKicker: "EXPECTED VALUE · POKÉMON TCG",
    heroTitle1: "Tu l'ouvres,",
    heroTitleHolo: "ou tu le gardes",
    heroTitle2: "?",
    heroSub:
      "Poké EV calcule ce que tu peux espérer tirer d'un booster, d'un display ou d'une ETB, et te dit si ça vaut le coup de l'ouvrir.",
    ctaCalculator: "Lancer le calculateur",
    ctaSets: "Explorer les sets",
    statSets: "sets catalogués",
    statCards: "cartes valorisées",
    statUpdated: "prix actualisés",
    miniCalcTitle: "Verdict express",
    howTitle: "Comment ça marche",
    howSteps: [
      {
        title: "Choisis ton produit",
        text: "Set, format (display, booster, ETB) et prix que tu as payé. C'est tout ce qu'il nous faut.",
      },
      {
        title: "On déroule les probabilités",
        text: "Chaque rareté du set est pondérée par ses taux de pull documentés, carte par carte, slot par slot.",
      },
      {
        title: "Verdict net",
        text: "OUVRE si l'espérance dépasse ton prix d'achat. Sinon GARDE.",
      },
    ],
    featuresTitle: "Pourquoi Poké EV",
    features: [
      {
        title: "Des maths, pas du feeling",
        text: "Espérance calculée par somme pondérée sur toutes les cartes du set.",
      },
      {
        title: "Prix du jour, marché réel",
        text: "Snapshot quotidien des prix Cardmarket, en euros.",
      },
      {
        title: "Jamais de chiffre inventé",
        text: "Pas de taux documentés ? EV indisponible, point. Chaque dataset cite ses sources.",
      },
      {
        title: "Probabilité de profit",
        text: "Au-delà de la moyenne : la variance des boosters donne ta vraie chance de rentrer dans tes frais.",
      },
    ],
    seeAllSets: "Voir le catalogue complet",
    tickerLabel: "EV EN DIRECT",
    featuredTitle: "Le top EV du moment",
    featuredSub: "Les extensions à la meilleure espérance par booster, prix Cardmarket du jour.",
    featuredVerdictAtMarket: "Verdict au prix marché",
    evLabel: "EV / booster",
  },
  calculator: {
    title: "Calculateur d'EV",
    sub: "Display, booster ou ETB : entre ton prix, on fait les maths.",
    setLabel: "Extension",
    setPlaceholder: "Rechercher un set (151, Évolutions Prismatiques…)",
    setSearchNoResult: "Aucun set trouvé",
    productLabel: "Produit",
    products: { booster: "Booster", display: "Display", etb: "ETB" },
    packsCount: "{n} boosters",
    boosterCount: "Nombre de boosters",
    priceLabel: "Prix payé",
    pricePlaceholder: "ex. 149,90",
    compute: "Calculer l'EV",
    openEv: "EV à l'ouverture",
    perBooster: "par booster",
    margin: "Marge vs prix payé",
    profitProbability: "Probabilité de profit",
    profitProbabilityNote:
      "Probabilité que la valeur des cartes tirées dépasse ton prix (approximation normale sur la variance des boosters).",
    sealedMarket: "Prix du scellé sur le marché",
    sealedPremium: "Premium scellé vs ouverture",
    sealedUnknown: "Prix scellé non coté dans le snapshot",
    sealedEstimated: "estimé",
    sealedEstimatedNote:
      "Estimé à partir du prix réel du booster à l'unité — le marché ne cote pas ce produit scellé.",
    topCards: "Les cartes les plus chères",
    topCardsProb: "proba / booster",
    rarityBreakdown: "Contribution par rareté",
    rarityCol: { rarity: "Rareté", perPack: "Attendu / booster", meanValue: "Valeur moy.", contribution: "Contribution EV" },
    converter: "Convertir",
    converterNote: "Taux BCE {rate} du {date}",
    noRates: "EV indisponible pour ce set",
    noRatesHint:
      "Aucun taux de pull documenté n'existe pour cette extension. On affiche l'EV uniquement quand les probabilités sont sourcées, jamais de chiffre inventé.",
    noSnapshot:
      "Snapshot de prix indisponible. Le site dégrade proprement : relance plus tard ou consulte le catalogue des sets.",
    selectSetFirst: "Choisis un set pour lancer le calcul",
    chaseLabel: "La carte chase du set",
    share: "Partager mon résultat",
    shareCopied: "Lien copié !",
    shareText: "{verdict} · {set} : EV {ev} pour {price} payé ({margin}) via Poké EV",
    completeness: "{pct} des cartes du set ont un prix",
    evUpdated: "Prix du {date}",
    fullBreakdown: "Analyse complète →",
  },
  sets: {
    title: "Tous les sets",
    sub: "L'intégralité des extensions Pokémon TCG, de 1999 à aujourd'hui. L'EV s'affiche pour les sets aux taux de pull documentés.",
    searchPlaceholder: "Rechercher un set (FR ou EN)…",
    filterAll: "Toutes les ères",
    filterWithEv: "EV disponible",
    evBooster: "EV / booster",
    evUnavailable: "EV indisponible",
    cardsCount: "{n} cartes",
    released: "Sortie",
    eraLabel: "Ère",
    emptySearch: "Aucun set ne correspond à ta recherche.",
    sortLabel: "Trier",
    sortEv: "EV décroissant",
    sortDate: "Plus récent",
    sortName: "Nom (A→Z)",
    sortPrice: "Carte chase (prix)",
    sortConfidence: "Confiance",
    resultCount: "{n} sets",
    bestEvTitle: "Meilleurs EV du moment",
    bestEvSub: "Les boosters au plus haut Expected Value aujourd'hui.",
    chaseLabel: "chase",
    conf: { high: "Confiance élevée", medium: "Confiance moyenne", low: "Confiance faible" },
  },
  setDetail: {
    productsTitle: "Produits scellés",
    cardsTitle: "Cartes du set",
    topHits: "Top hits",
    byRarity: "Contribution par rareté",
    openInCalculator: "Calculer avec mon prix →",
    sealedKind: { booster: "Booster", display: "Display", etb: "ETB" },
    marketPrice: "Prix marché",
    evOpen: "EV ouverture",
    verdictAtMarket: "Verdict au prix marché",
    noSealed: "Aucun produit scellé coté dans le snapshot pour ce set.",
    showAllCards: "Afficher toutes les cartes",
    hideCards: "Réduire",
  },
  cardPage: {
    priceLabel: "Prix marché (Cardmarket FR)",
    rarityLabel: "Rareté",
    numberLabel: "Numéro",
    intro:
      "{card} est la carte la plus chère de {set}, cotée {price} sur Cardmarket FR. Prix mis à jour chaque jour.",
    introRank:
      "{card} est la {rank}ᵉ carte la plus chère de {set}, cotée {price} sur Cardmarket FR. Prix mis à jour chaque jour.",
    introNoPrice:
      "{card} est l'une des cartes les plus recherchées de {set}. Cote en cours d'actualisation.",
    setEvLabel: "EV du booster",
    viewSet: "Voir l'extension {set}",
    openInCalculator: "Ouvrir le calculateur d'EV",
    updatedDaily: "Cote rafraîchie quotidiennement",
    priceUnavailable: "Cote indisponible",
    rankText: "{rank}ᵉ carte la plus chère de {set}",
    rankTextTop: "Carte la plus chère de {set}",
    evShareText: "À elle seule, cette carte représente {pct} % de l'Expected Value d'un booster {set}.",
    relatedTitle: "Autres cartes recherchées de {set}",
    rarityPeersTitle: "Autres cartes {rarity} de {set}",
  },
  faq: {
    title: "FAQ",
    sub: "Tout ce qu'il faut savoir sur le calcul, les sources et les limites.",
    items: [
      {
        q: "C'est quoi, l'EV (Expected Value) ?",
        a: "L'Expected Value est l'espérance mathématique de la valeur des cartes que tu tires en ouvrant un produit. Concrètement : la somme, sur toutes les cartes du set, de (probabilité de tirer la carte) × (sa valeur marché). C'est la moyenne que tu obtiendrais en ouvrant un très grand nombre de produits identiques. Une ouverture individuelle peut être bien au-dessus ou bien en dessous.",
      },
      {
        q: "Comment l'EV est-il calculé exactement ?",
        a: "On modélise chaque booster slot par slot : chaque slot a une distribution de probabilités sur les raretés (documentée par set), et au sein d'une rareté, chaque carte est équiprobable. L'EV booster = Σ taux de pull × valeur. L'EV display = EV booster × nombre réel de boosters (36 en général). L'EV ETB = EV booster × nombre de boosters de la boîte. Les cartes sans prix coté comptent pour zéro : notre EV est un plancher, pas un plafond.",
      },
      {
        q: "D'où viennent les prix ?",
        a: "D'un snapshot quotidien des prix marché agrégés par TCGdex : Cardmarket (marché européen, en euros) et TCGPlayer (marché US, en dollars). En français on affiche le prix de tendance Cardmarket ; en anglais le market price TCGPlayer. Quand une carte n'est pas cotée sur l'une des deux places, on convertit l'autre au taux de change du jour pour garder une valeur réelle. L'horodatage du snapshot est affiché partout, et la fraîcheur des prix entre dans l'indice de confiance.",
      },
      {
        q: "D'où viennent les taux de pull ?",
        a: "L'API ne les fournit pas. Ils proviennent d'un dataset statique versionné, un fichier par set, construit à partir de sources publiques quantitatives : grandes campagnes d'ouvertures communautaires (TCGplayer Infinite, PokeBeach, JustInBasil…), taux officiels japonais quand ils existent. Chaque fichier cite ses sources et porte un niveau de confiance (élevé / moyen / faible).",
      },
      {
        q: "Pourquoi certains sets affichent « EV indisponible » ?",
        a: "Parce qu'aucune source quantitative fiable ne documente leurs taux de pull (c'est le cas de la plupart des sets anciens). Plutôt que d'inventer des probabilités, on n'affiche rien : un chiffre faux est pire qu'une absence de chiffre. Le catalogue liste quand même tous les sets, et l'EV apparaîtra dès qu'un dataset sourcé existera.",
      },
      {
        q: "Comment le verdict OUVRE / GARDE est-il rendu ?",
        a: "Une seule comparaison : ton prix d'achat face à l'EV d'ouverture. Si le booster, l'ETB ou le display a une espérance supérieure au prix que tu as payé, c'est OUVRE. Sinon GARDE, avec la marge négative affichée pour que tu saches exactement où tu en es. Le prix du scellé sur le marché est indiqué à titre indicatif (valeur de revente), mais il ne change jamais le verdict.",
      },
      {
        q: "Que signifie la probabilité de profit ?",
        a: "C'est la probabilité que la valeur totale des cartes tirées dépasse ton prix d'achat. L'EV est une moyenne ; la variance d'un booster est énorme (tout dépend du gros hit). On approxime la distribution de la somme des boosters par une loi normale (théorème central limite) : fiable pour une display (36 boosters), indicatif pour un booster seul.",
      },
      {
        q: "Comment lire l'indice de confiance ?",
        a: "Il agrège trois composantes pondérées : la qualité des taux de pull (40 %), la part des cartes du set ayant un prix coté (35 %) et la fraîcheur du snapshot de prix (25 %). Au-dessus de 80, la donnée est solide ; entre 55 et 80, correcte ; en dessous, prends le chiffre avec des pincettes.",
      },
      {
        q: "Les cartes reverse, les énergies et les goodies d'ETB comptent-ils ?",
        a: "Les slots reverse sont modélisés avec la valeur des cartes communes/peu communes correspondantes, et les remplacements premium (illustration rare, ACE SPEC…) avec leur part de probabilité documentée. Les énergies de base comptent pour zéro. Pour les ETB, la V1 valorise les boosters contenus ; les accessoires (dés, protèges-cartes…) ne sont pas valorisés.",
      },
      {
        q: "Est-ce un conseil financier ?",
        a: "Non. Poké EV est un outil d'estimation statistique à but informatif. Les prix des cartes sont volatils, les taux de pull sont des estimations communautaires, et l'EV ne prédit pas le résultat d'une ouverture individuelle. N'investis jamais d'argent que tu ne peux pas te permettre de perdre. Et ouvre tes boosters d'abord pour le plaisir.",
      },
    ],
  },
  methodology: {
    title: "Méthodologie & transparence",
    intro:
      "Comment Poké EV transforme un produit scellé en un chiffre. Sources, formule et limites, sans boîte noire.",
    updated: "Dernière mise à jour : juin 2026",
    sections: [
      {
        h: "La formule",
        p: [
          "L'Expected Value (EV) d'un booster est une somme pondérée : pour chaque carte du set, on multiplie sa probabilité d'apparition par sa valeur marché, puis on additionne le tout. EV booster = Σ (taux de pull × valeur de la carte).",
          "L'EV d'un display vaut l'EV d'un booster multipliée par le nombre réel de boosters de la boîte (36 le plus souvent). L'EV d'une ETB suit la même logique avec son nombre de boosters. On ne valorise que les boosters : accessoires et goodies comptent pour zéro.",
          "Une carte sans prix coté compte pour zéro. Notre EV est donc un plancher prudent, jamais gonflé.",
        ],
      },
      {
        h: "Le modèle slot par slot",
        p: [
          "Un booster n'est pas un tirage uniforme : il est composé de slots (communes, peu communes, slot reverse, slot rare ou hit). Chaque slot porte sa propre distribution de raretés, documentée pour le set. Au sein d'une rareté, chaque carte est supposée équiprobable.",
          "Les slots reverse sont modélisés avec la valeur des communes et peu communes correspondantes ; les remplacements premium (illustration rare, ACE SPEC…) reçoivent leur part de probabilité documentée.",
        ],
      },
      {
        h: "Les taux de pull",
        p: [
          "L'API de prix ne fournit pas les taux de pull. Ils proviennent d'un dataset statique versionné, un fichier par set, construit à partir de sources publiques quantitatives : grandes campagnes d'ouvertures communautaires et taux officiels japonais quand ils existent.",
          "Chaque fichier cite ses sources et porte un niveau de confiance. Quand aucune source fiable n'existe, on n'invente rien : le set affiche « EV indisponible ».",
        ],
      },
      {
        h: "Les prix",
        p: [
          "Les prix viennent d'un snapshot quotidien agrégé par TCGdex : Cardmarket (marché européen, en euros) et TCGPlayer (marché US, en dollars). En français on affiche le prix de tendance Cardmarket ; en anglais le market price TCGPlayer.",
          "Quand une carte n'est cotée que sur une seule place de marché, on convertit l'autre au taux de change du jour pour garder une valeur réelle. L'horodatage du snapshot est affiché partout.",
        ],
      },
      {
        h: "L'indice de confiance",
        p: [
          "Chaque EV est accompagnée d'un indice de confiance qui agrège trois composantes pondérées : la qualité des taux de pull (40 %), la part des cartes du set ayant un prix coté (35 %) et la fraîcheur du snapshot de prix (25 %).",
          "Au-dessus de 80, la donnée est solide ; entre 55 et 80, correcte ; en dessous, à prendre avec des pincettes.",
        ],
      },
      {
        h: "Le verdict OUVRE / GARDE",
        p: [
          "Une seule comparaison décide du verdict : ton prix d'achat face à l'EV d'ouverture. Si l'espérance dépasse le prix payé, c'est OUVRE ; sinon GARDE, avec la marge affichée. Le prix du scellé sur le marché est indiqué à titre indicatif et ne change jamais le verdict.",
        ],
      },
      {
        h: "Probabilité de profit & limites",
        p: [
          "L'EV est une moyenne. La variance d'un booster est énorme : tout dépend du gros hit. On approxime la distribution de la somme des boosters par une loi normale (théorème central limite) : fiable pour un display, indicative pour un booster seul.",
          "Poké EV est un outil d'estimation statistique à but informatif, pas un conseil financier. Les prix sont volatils et les taux de pull sont des estimations communautaires. Ouvre tes boosters pour le plaisir d'abord.",
        ],
      },
    ],
  },
  legalPages: {
    lastUpdated: "Dernière mise à jour : juin 2026",
    legal: {
      title: "Mentions légales",
      sections: [
        {
          h: "Éditeur du site",
          p: [
            "Le site pokeev.com (« Poké EV ») est édité par un particulier à titre non professionnel et non commercial. Contact : contact@pokeev.com.",
            "Conformément à l'article 6 III 2° de la loi pour la confiance dans l'économie numérique (LCEN), l'éditeur, personne physique non professionnelle, a choisi de ne pas rendre publiques ses coordonnées personnelles ; son identité est tenue à la disposition des autorités compétentes auprès de l'hébergeur du site (voir « Hébergement »).",
            "Directeur de la publication : l'éditeur du site, joignable à contact@pokeev.com.",
          ],
        },
        {
          h: "Hébergement",
          p: [
            "Le site est hébergé par Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis · vercel.com.",
          ],
        },
        {
          h: "Propriété intellectuelle",
          p: [
            "Pokémon, le Jeu de Cartes à Collectionner Pokémon et les noms des extensions sont des marques de Nintendo, Creatures Inc. et GAME FREAK Inc. Poké EV est un site indépendant, non affilié à ces sociétés et non approuvé par elles.",
            "Les images de cartes et logos d'extensions affichés proviennent de sources publiques et restent la propriété de leurs ayants droit. Le code et les contenus originaux du site sont protégés par le droit d'auteur.",
          ],
        },
        {
          h: "Limitation de responsabilité",
          p: [
            "Les estimations d'Expected Value, verdicts et probabilités affichés sont fournis à titre purement informatif, sans garantie d'exactitude ni d'exhaustivité. Ils ne constituent en aucun cas un conseil financier, un conseil en investissement ou une incitation à l'achat. L'éditeur ne saurait être tenu responsable des décisions prises sur la base de ces informations.",
          ],
        },
      ],
    },
    privacy: {
      title: "Politique de confidentialité",
      sections: [
        {
          h: "Données collectées",
          p: [
            "Poké EV ne demande aucune création de compte et ne collecte aucune donnée personnelle identifiante : pas de nom, pas d'e-mail, pas d'adresse IP stockée par nos soins.",
            "Les calculs d'EV (set choisi, prix saisi) sont effectués dans ton navigateur et ne sont pas associés à ton identité.",
          ],
        },
        {
          h: "Mesure d'audience",
          p: [
            "La mesure d'audience repose sur Umami, une solution sans cookie qui ne collecte aucune donnée personnelle et n'effectue aucun suivi inter-sites. Les statistiques sont agrégées et anonymes (pages vues, calculs lancés, langue utilisée). Conformément aux lignes directrices de la CNIL, ce dispositif est exempté de consentement.",
          ],
        },
        {
          h: "Services tiers",
          p: [
            "Pour fonctionner, le site fait appel à des prestataires techniques qui reçoivent des données de connexion (dont l'adresse IP), uniquement pour acheminer les pages et leur contenu : Vercel (hébergement), Umami (mesure d'audience anonyme et sans cookie) et TCGdex (CDN délivrant les images de cartes). Ces données ne sont pas conservées par l'éditeur et ne servent pas à t'identifier.",
          ],
        },
        {
          h: "Vos droits",
          p: [
            "Conformément au RGPD, tu disposes de droits d'accès, de rectification et d'effacement des données te concernant. Le site ne stockant pas de données personnelles, ces demandes sont en pratique sans objet, mais tu peux nous écrire à contact@pokeev.com pour toute question.",
            "Autorité de contrôle : CNIL · cnil.fr.",
          ],
        },
      ],
    },
    cookies: {
      title: "Politique cookies",
      sections: [
        {
          h: "Cookies utilisés",
          p: [
            "Poké EV utilise un unique cookie fonctionnel : NEXT_LOCALE, qui mémorise la langue choisie (français ou anglais) pendant 12 mois. Ce cookie est strictement nécessaire au fonctionnement du site et ne nécessite pas de consentement.",
            "Aucun cookie publicitaire, aucun cookie de suivi, aucun cookie tiers n'est déposé.",
          ],
        },
        {
          h: "Mesure d'audience sans cookie",
          p: [
            "Les statistiques de visite sont collectées via Umami, qui fonctionne sans cookie et sans identifiant persistant. C'est pourquoi aucun bandeau de consentement n'est requis.",
          ],
        },
        {
          h: "Gérer le cookie de langue",
          p: [
            "Tu peux supprimer le cookie NEXT_LOCALE à tout moment via les réglages de ton navigateur ; le site re-détectera alors ta langue au prochain chargement.",
          ],
        },
      ],
    },
  },
  meta: {
    home: {
      title: "Poké EV · Ouvrir ou garder vos produits scellés Pokémon ? Le calcul, pas le feeling",
      description:
        "Calculateur d'Expected Value pour displays, boosters et ETB Pokémon TCG : taux de pull documentés × prix Cardmarket du jour, verdict OUVRE ou GARDE.",
    },
    calculator: {
      title: "Calculateur d'EV Pokémon TCG · display, booster, ETB | Poké EV",
      description:
        "Entre ton prix, choisis ton set : EV à l'ouverture, verdict OUVRE/GARDE, top cartes et probabilité de profit. Prix Cardmarket FR du jour.",
    },
    sets: {
      title: "Tous les sets Pokémon TCG avec EV · catalogue complet FR/EN | Poké EV",
      description:
        "Catalogue complet des extensions Pokémon TCG de 1999 à aujourd'hui, avec l'Expected Value courant pour les sets aux taux de pull documentés.",
    },
    set: {
      title: "EV {name} · faut-il ouvrir ? | Poké EV",
      description:
        "Expected Value de {name} : EV booster {ev}, verdicts display/ETB au prix marché, top hits et contribution par rareté. Prix Cardmarket FR du jour.",
    },
    card: {
      title: "Prix {card} {set} · cote {price} | Poké EV",
      description:
        "Prix de {card} ({set}) : {price} sur Cardmarket FR, mis à jour chaque jour. Rareté, numéro, image HD et EV du booster {set}.",
    },
    faq: {
      title: "Méthode de calcul & FAQ · comment l'EV est-il calculé ? | Poké EV",
      description:
        "Méthode complète : taux de pull sourcés, prix Cardmarket/TCGPlayer, verdict OUVRE/GARDE, probabilité de profit, indice de confiance et limites de l'outil.",
    },
    methodology: {
      title: "Méthodologie & transparence · comment l'EV est calculée | Poké EV",
      description:
        "La méthode complète de Poké EV : formule de l'Expected Value, modèle slot par slot, sources des taux de pull et des prix, indice de confiance et limites.",
    },
    legal: { title: "Mentions légales | Poké EV", description: "Mentions légales du site pokeev.com." },
    privacy: {
      title: "Politique de confidentialité | Poké EV",
      description: "Aucune donnée personnelle collectée, analytics sans cookie. Détails de notre politique de confidentialité.",
    },
    cookies: {
      title: "Politique cookies | Poké EV",
      description: "Un seul cookie fonctionnel de langue, pas de cookies de suivi. Détails de notre politique cookies.",
    },
  },
};
