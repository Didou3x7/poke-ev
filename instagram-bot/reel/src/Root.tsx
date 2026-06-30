import { Composition } from "remotion";

import { ensureFonts } from "./brand";
import { Connected, connectedFrames } from "./themes/Connected";
import { RipKeep, ripkeepFrames } from "./themes/RipKeep";
import { Grails, grailsFrames } from "./themes/Grails";
import type { ConnectedProps, GrailsProps, RipKeepProps } from "./props";

ensureFonts();

const FPS = 30;
const W = 1080;
const H = 1920;

// Real Southern Islands data (today's connected post) — used as defaultProps so the comp
// renders standalone in the Studio / a no-props render. The bot overrides this via --props.
const SAMPLE_CONNECTED: ConnectedProps = {
  theme: "connected",
  setLabel: "Southern Islands",
  setLogo: "https://images.pokemontcg.io/si1/logo.png",
  artist: "Naoyo Kimura",
  eyebrow: "SOUTHERN ISLANDS",
  headline: "They drew one scene.",
  revealTitle: "Tentacruel, Marill & Lapras",
  total: "$238",
  cards: [
    { name: "Tentacruel", price: "$43", image: "https://mauzhr1mqvtu52ju.public.blob.vercel-storage.com/ig-cards/ad1faf6f4cdf5edc1980a715866140c6.png" },
    { name: "Marill", price: "$132", image: "https://mauzhr1mqvtu52ju.public.blob.vercel-storage.com/ig-cards/8545ad6a6dff69854640c737351874ed.png" },
    { name: "Lapras", price: "$63", image: "https://mauzhr1mqvtu52ju.public.blob.vercel-storage.com/ig-cards/d920771787bd0b11e0b7c35d9c2a9f3a.png" },
  ],
};

const SAMPLE_RIPKEEP: RipKeepProps = {
  theme: "ripkeep",
  setName: "Base Set",
  setLogo: "https://images.pokemontcg.io/base1/logo.png",
  booster: "https://images.pokemontcg.io/base1/4_hires.png",
  sealed: "$420",
  openEv: "$510",
  gap: "$90",
  verdictRip: true,
  verdictWord: "RIP IT",
  reason: "Ripping averages $510.|Sealed it sits at $420. Open it.",
  chase: [
    { name: "Blastoise", price: "$300", image: "https://images.pokemontcg.io/base1/2_hires.png" },
    { name: "Charizard", price: "$1,200", image: "https://images.pokemontcg.io/base1/4_hires.png" },
    { name: "Venusaur", price: "$250", image: "https://images.pokemontcg.io/base1/15_hires.png" },
  ],
};

const SAMPLE_GRAILS: GrailsProps = {
  theme: "grails",
  setName: "Base Set",
  setLogo: "https://images.pokemontcg.io/base1/logo.png",
  name: "Charizard",
  price: "$1,200",
  artist: "Mitsuhiro Arita",
  rarity: "Holo Rare",
  oddsLine: "Rip a sealed booster.|The odds are 1 in 110.",
  shockHeadline: "Worth more than|a PS5 Pro",
  cardKicker: "The card",
  cardHeadline: "Base Set Charizard",
  cardBody: "The card that started it all.|The original chase.",
  craftKicker: "The artist",
  craftHeadline: "Mitsuhiro Arita",
  craftBody: "Hand-painted in 1996.|The flame that defined a hobby.",
  sceneKicker: "The scene",
  sceneHeadline: "That roar",
  sceneBody: "The pose every collector|knows by heart.",
  image: "https://images.pokemontcg.io/base1/4_hires.png",
  booster: "https://images.pokemontcg.io/base1/logo.png",
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Connected"
        component={Connected as React.FC<Record<string, unknown>>}
        durationInFrames={connectedFrames(SAMPLE_CONNECTED.cards.length)}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{ data: SAMPLE_CONNECTED } as Record<string, unknown>}
        calculateMetadata={({ props }) => {
          const data = (props as { data: ConnectedProps }).data;
          return { durationInFrames: connectedFrames(data.cards.length), fps: FPS, width: W, height: H };
        }}
      />
      <Composition
        id="RipKeep"
        component={RipKeep as React.FC<Record<string, unknown>>}
        durationInFrames={ripkeepFrames()}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{ data: SAMPLE_RIPKEEP } as Record<string, unknown>}
      />
      <Composition
        id="Grails"
        component={Grails as React.FC<Record<string, unknown>>}
        durationInFrames={grailsFrames()}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{ data: SAMPLE_GRAILS } as Record<string, unknown>}
      />
    </>
  );
};
