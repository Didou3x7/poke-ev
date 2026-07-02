// T1 · CONNECTING ART — N cards whose artworks join into one illustration.
// Beats: HOOK (fanned hand) → one ULTRA-ZOOM hero per card → THE REVEAL (a slow cinematic pan
// across the FULL-HEIGHT panorama — the cards stay huge, never shrunk) → CTA. Crossfades only.
import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import type { ConnectedProps } from "../props";
import {
  CardArt,
  CardHero,
  ContinuityHalo,
  Display,
  EASE,
  HoloBar,
  Kicker,
  MoneyCount,
  Outro,
  Rise,
  SAFE_BOTTOM,
  Stage,
  TitleReveal,
  TravelLogo,
  usePop,
  CLASH,
  INK,
  MUTE,
  SATOSHI,
  holoText,
} from "../lib";

export const C_FADE = 10;
export const C_HOOK = 96;
export const C_CARD = 78;
export const C_REVEAL = 344; // trimmed ~0.8s off the final full-panorama hold (owner: a touch too long)
export const C_OUTRO = 86;

export const connectedFrames = (n: number): number => C_HOOK + n * C_CARD + C_REVEAL + C_OUTRO - C_FADE * (n + 2);

const CARD_ASPECT = 1.395;

const Hook: React.FC<{ p: ConnectedProps }> = ({ p }) => {
  const n = p.cards.length;
  // BIG cards that ALWAYS fit inside the 9:16 frame: the fan's outer extent is bounded to the
  // safe width so the side cards are never clipped, whatever the card count.
  // Tighter splay + bigger cards so the fan is tall enough to reach the title with no gap.
  const spread = Math.min(70, 360 / Math.max(n - 1, 1));
  const cw = Math.min(720, Math.round((530 - ((n - 1) / 2) * spread) / 0.6));
  const ch = Math.round(cw * CARD_ASPECT);
  const rot = Math.min(8, 30 / n);
  return (
    <Stage glowY={36}>
      {/* title near the top — the hero logo is the root TravelLogo (lands above it, then glides away) */}
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", paddingTop: 96 }}>
        {/* the hero logo is the root-level TravelLogo (it lands here, then glides to the corner) */}
        <div style={{ height: 168 }} />
        <TitleReveal text={p.headline || "They drew one scene."} delay={10} size={134} align="center" maxWidth={950} style={{ marginTop: 22 }} />
      </AbsoluteFill>
      {/* a BIG 3D fanned hand whose TOPS are pinned just under the title (no gap), filling down toward
          the safe zone. Each card flies in from deep space on its OWN arc (no two alike) with a touch
          of motion blur, then settles into a splayed, dimensional hand. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 1312 - ch, height: ch, perspective: 1700 }}>
        {p.cards.map((c, i) => {
          const t = i - (n - 1) / 2;
          const pop = usePop(15 + i * 5, 14);
          const inv = 1 - pop;
          const flip = i % 2 === 0 ? 1 : -1;
          const entry = `translateZ(${inv * -820}px) rotateY(${inv * flip * 78}deg) rotateX(${inv * 22}deg) translateY(${inv * 120}px)`;
          const restY = -t * 9; // cards turn slightly toward the centre → real fanned-hand depth
          return (
            <div key={i} style={{ position: "absolute", left: "50%", bottom: 0, transformOrigin: "bottom center", filter: `blur(${inv * 2.8}px)`, transform: `translateX(-50%) translateX(${t * spread}px) ${entry} rotateZ(${t * rot}deg) rotateY(${restY}deg) scale(${0.74 + pop * 0.26})`, opacity: interpolate(pop, [0, 0.3], [0, 1]) }}>
              <CardArt src={c.image} w={cw} />
            </div>
          );
        })}
      </div>
    </Stage>
  );
};

const CardScene: React.FC<{ p: ConnectedProps; i: number }> = ({ p, i }) => {
  const c = p.cards[i];
  const n = p.cards.length;
  return (
    <Stage glowY={40}>
      <Rise delay={1} style={{ position: "absolute", top: 140, width: "100%", justifyContent: "center" }}>
        <Kicker style={{ fontSize: 28 }}>{`Piece ${i + 1} of ${n}`}</Kicker>
      </Rise>
      {/* card + title as ONE centred column — a real gap so the card never overlaps the name */}
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 104, paddingBottom: SAFE_BOTTOM - 70 }}>
        {/* each card enters with its OWN 3D animation (turn / swing / barrel roll / corner tumble) */}
        <CardHero src={c.image} w={636} delay={0} variant={i} />
        <Rise delay={16} style={{ flexDirection: "column", alignItems: "center", marginTop: 52 }}>
          <Display size={70}>{c.name}</Display>
          <div style={{ fontSize: 90, fontFamily: CLASH, ...holoText() }}>{c.price}</div>
        </Rise>
      </AbsoluteFill>
    </Stage>
  );
};

const Reveal: React.FC<{ p: ConnectedProps }> = ({ p }) => {
  const n = p.cards.length;
  const frame = useCurrentFrame();
  // Full-height cards flush in a strip. PHASE A: a SLOW pan across the panorama (cards stay huge,
  // the illustration flows by). PHASE B: zoom OUT so all N cards lock together in one shot, held.
  const cardH = 1180; // fits with clear top/bottom margin so card tops are never cut in the pan
  const cardW = Math.round(cardH / CARD_ASPECT);
  const stripW = n * cardW;
  const fitScale = Math.min(1, (1080 * 0.94) / stripW);
  const center = (n - 1) / 2;
  // SMOOTHEST possible scroll: a TRAPEZOIDAL velocity — a short eased ramp in & out with CONSTANT
  // velocity through the middle. Constant speed is what the eye tracks most fluidly (no accel/decel
  // judder), and it's slow, so the per-frame step is small. No blur — the point is to read the
  // joined art. (Authored at 30fps; constant-velocity is the best fluidity short of a 60fps comp.)
  const RAMP = 0.18;
  const vmax = 1 / (1 - RAMP);
  const x = interpolate(frame, [34, 262], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glide = x <= RAMP ? (vmax * x * x) / (2 * RAMP)
    : x < 1 - RAMP ? (vmax * RAMP) / 2 + vmax * (x - RAMP)
    : 1 - (vmax * (1 - x) * (1 - x)) / (2 * RAMP);
  const panF = glide * (n - 1);
  const zoom = interpolate(frame, [262, 296], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const f = panF + (center - panF) * zoom;
  const scale = 1 + (fitScale - 1) * zoom;
  const tx = (center - f) * cardW * scale;
  // The title HUGS the top of the strip and the total HUGS its bottom, both riding INWARD as the
  // strip shrinks on dezoom — so the final shot is one centred, harmonious group (title · cards ·
  // total), never title-pinned-top / cards-pinned-bottom with a dead gap between them.
  const CY = 960; // frame centre (1920 / 2)
  const halfStrip = (cardH * scale) / 2;
  return (
    <Stage glowY={44} sparkle={false}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
        <div style={{ display: "flex", transform: `translateX(${tx}px) scale(${scale})`, transformOrigin: "center center", filter: "drop-shadow(0 40px 90px rgba(0,0,0,0.8))" }}>
          {p.cards.map((c, i) => (
            <Img key={i} src={c.image} style={{ width: cardW, height: cardH, objectFit: "cover", marginLeft: i ? -2 : 0 }} />
          ))}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(11,14,20,0.94) 0%, rgba(11,14,20,0) 24%, rgba(11,14,20,0) 62%, rgba(11,14,20,0.97) 100%)" }} />
      <div style={{ position: "absolute", left: 0, width: "100%", top: CY - halfStrip - 36, transform: "translateY(-100%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Rise delay={2} style={{ flexDirection: "column", alignItems: "center" }}>
          <Display size={66} style={{ textAlign: "center", maxWidth: 980, display: "block" }}>The full panorama</Display>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 0, width: "100%", top: CY + halfStrip + 40, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Rise delay={300} style={{ flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 34, color: MUTE }}>Combined value</div>
          <MoneyCount value={p.total} delay={302} dur={18} size={138} style={{ marginTop: 2 }} />
        </Rise>
      </div>
    </Stage>
  );
};

export const Connected: React.FC<{ data: ConnectedProps }> = ({ data }) => {
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: C_FADE })} />;
  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={C_HOOK}>
        <Hook p={data} />
      </TransitionSeries.Sequence>
      {data.cards.map((_, i) => (
        <React.Fragment key={i}>
          {fadeT}
          <TransitionSeries.Sequence durationInFrames={C_CARD}>
            <CardScene p={data} i={i} />
          </TransitionSeries.Sequence>
        </React.Fragment>
      ))}
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={C_REVEAL}>
        <Reveal p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={C_OUTRO}>
        <Outro logo={data.setLogo} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
      <TravelLogo src={data.setLogo} hookEnd={C_HOOK} />
      <ContinuityHalo />
    </AbsoluteFill>
  );
};
