// The render-ready props the Python bot writes (reel_props in main.py) and the Remotion
// compositions consume. All prices are PRE-FORMATTED strings ("$238") so the comps only
// lay out — the verified numbers and AI copy come straight from the same plan/brief the
// carousel uses, so a Reel is never out of sync with its carousel.

export type ConnectedCard = { name: string; price: string; image: string };
export type ConnectedProps = {
  theme: "connected";
  setLabel: string;
  setLogo: string | null;
  artist: string;
  eyebrow: string;
  headline: string;
  revealTitle: string;
  total: string;
  cards: ConnectedCard[];
};

export type ChaseCard = { name: string; price: string; image: string; rarity?: string | null };
export type RipKeepProps = {
  theme: "ripkeep";
  setName: string;
  setLogo: string | null;
  booster: string | null; // sealed-pack art for the FACE-OFF background (UHD)
  sealed: string;
  openEv: string;
  gap: string;
  verdictRip: boolean;
  verdictWord: string; // "RIP IT" | "KEEP IT SEALED"
  reason: string; // may contain a "|" hard line-break
  chase: ChaseCard[];
};

export type GrailsProps = {
  theme: "grails";
  setName: string;
  setLogo: string | null;
  name: string;
  price: string;
  artist: string | null;
  rarity: string | null;
  oddsLine: string; // e.g. "1 in 143 packs" or a sentence
  shockHeadline: string; // may contain "|"
  cardKicker: string;
  cardHeadline: string;
  cardBody: string; // may contain "|"
  craftKicker: string;
  craftHeadline: string;
  craftBody: string; // may contain "|"
  sceneKicker: string;
  sceneHeadline: string;
  sceneBody: string; // may contain "|"
  image: string; // HD card art
  booster: string | null; // booster pack art for the odds scene
};

export type ReelProps = ConnectedProps | RipKeepProps | GrailsProps;

// A "|" in copy is an explicit hard line-break (same convention as the carousel briefs).
export const splitLines = (s: string): string[] => (s || "").split("|").map((x) => x.trim());
