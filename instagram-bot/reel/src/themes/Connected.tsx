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
  Display,
  EASE,
  EASE_IN_OUT,
  HoloBar,
  Kicker,
  MoneyCount,
  Outro,
  ProgressDots,
  Rise,
  SAFE_BOTTOM,
  SetLogo,
  Stage,
  TitleReveal,
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
export const C_REVEAL = 220;
export const C_OUTRO = 86;

export const connectedFrames = (n: number): number => C_HOOK + n * C_CARD + C_REVEAL + C_OUTRO - C_FADE * (n + 2);

const CARD_ASPECT = 1.395;

const Hook: React.FC<{ p: ConnectedProps }> = ({ p }) => {
  const n = p.cards.length;
  // BIG cards that ALWAYS fit inside the 9:16 frame: the fan's outer extent is bounded to the
  // safe width so the side cards are never clipped, whatever the card count.
  const spread = Math.min(130, 460 / Math.max(n - 1, 1));
  const cw = Math.min(600, Math.round((520 - ((n - 1) / 2) * spread) / 0.6));
  const rot = Math.min(7, 26 / n);
  const logoP = usePop(2, 13);
  return (
    <Stage glowY={40}>
      {/* ONE tight column that fills the whole frame — no dead space between the copy and the cards */}
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", padding: 64, paddingTop: 92, paddingBottom: SAFE_BOTTOM - 34 }}>
        {/* the set LOGO alone identifies the set — no redundant spelled-out name cluttering the frame */}
        {p.setLogo ? (
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", opacity: logoP, transform: `translateY(${(1 - logoP) * -24}px)` }}>
            <div style={{ position: "absolute", inset: "-30px -28px", background: "radial-gradient(ellipse, rgba(124,92,246,0.30), transparent 72%)" }} />
            <Img src={p.setLogo} style={{ height: 128, objectFit: "contain", filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.75))" }} />
          </div>
        ) : null}
        <TitleReveal text={p.headline || "They drew one scene."} delay={10} size={118} align="center" maxWidth={940} style={{ marginTop: 18 }} />
        <Rise delay={20} style={{ marginTop: 12 }}>
          <div style={{ fontSize: 38, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.25, textAlign: "center", maxWidth: 880 }}>
            {n} cards, one illustration ↓
          </div>
        </Rise>
        {/* the fanned hand FILLS the rest of the column — bottom-anchored, always inside the frame */}
        <div style={{ flex: 1, width: "100%", position: "relative", marginTop: 26 }}>
          {p.cards.map((c, i) => {
            const t = i - (n - 1) / 2;
            const pop = usePop(16 + i * 4, 13);
            return (
              <div key={i} style={{ position: "absolute", left: "50%", bottom: 0, transformOrigin: "bottom center", transform: `translateX(-50%) translateX(${t * spread}px) translateY(${(1 - pop) * 160}px) rotate(${t * rot * pop}deg) scale(${0.7 + pop * 0.3})`, opacity: pop }}>
                <CardArt src={c.image} w={cw} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

const CardScene: React.FC<{ p: ConnectedProps; i: number }> = ({ p, i }) => {
  const c = p.cards[i];
  const n = p.cards.length;
  const running = p.cards.slice(0, i + 1).reduce((s, x) => s + Number(x.price.replace(/[^0-9.]/g, "")), 0);
  return (
    <Stage glowY={40}>
      <SetLogo src={p.setLogo} />
      <Rise delay={1} style={{ position: "absolute", top: 140, width: "100%", justifyContent: "center" }}>
        <Kicker style={{ fontSize: 28 }}>{`Piece ${i + 1} of ${n}`}</Kicker>
      </Rise>
      {/* card + title as ONE centred column — a real gap so the card never overlaps the name */}
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 110, paddingBottom: SAFE_BOTTOM - 70 }}>
        {/* each card enters with a DIFFERENT animation (slam / slide-R / rise / slide-L / flip) */}
        <CardHero src={c.image} w={600} delay={0} variant={i} />
        <Rise delay={16} style={{ flexDirection: "column", alignItems: "center", marginTop: 56 }}>
          <Display size={68}>{c.name}</Display>
          <div style={{ fontSize: 86, fontFamily: CLASH, ...holoText() }}>{c.price}</div>
        </Rise>
      </AbsoluteFill>
      <ProgressDots total={n + 2} step={i + 1} />
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
  const panF = interpolate(frame, [26, 150], [0, n - 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IN_OUT });
  const zoom = interpolate(frame, [150, 190], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
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
          <Kicker style={{ fontSize: 28 }}>One illustration</Kicker>
          <Display size={58} style={{ marginTop: 10, textAlign: "center", maxWidth: 980, display: "block" }}>{p.revealTitle || p.setLabel}</Display>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 0, width: "100%", top: CY + halfStrip + 40, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Rise delay={168} style={{ flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 34, color: MUTE }}>Combined value</div>
          <MoneyCount value={p.total} delay={170} dur={22} size={138} style={{ marginTop: 2 }} />
        </Rise>
      </div>
      <ProgressDots total={n + 2} step={n + 1} />
    </Stage>
  );
};

export const Connected: React.FC<{ data: ConnectedProps }> = ({ data }) => {
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: C_FADE })} />;
  return (
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
  );
};
