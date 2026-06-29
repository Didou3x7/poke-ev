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
  SetBadge,
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
  // BIG cards — the fan fills the lower frame so the hook never feels empty
  const cw = Math.min(480, 1180 / Math.max(n, 3) + 150);
  const ch = cw * CARD_ASPECT;
  const spread = Math.min(170, 720 / Math.max(n, 2));
  return (
    <Stage glowY={32}>
      {/* compact, punchy top: set identity + bold hook line */}
      <AbsoluteFill style={{ padding: 76, paddingTop: 116, flexDirection: "column", alignItems: "center" }}>
        <SetBadge logo={p.setLogo} name={p.setLabel} delay={2} size={92} />
        <Rise delay={8} style={{ marginTop: 12 }}>
          <Kicker style={{ fontSize: 26 }}>Connecting Art</Kicker>
        </Rise>
        <TitleReveal text={p.headline || "They drew one scene."} delay={12} size={120} align="center" maxWidth={930} style={{ marginTop: 12 }} />
        <Rise delay={22} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 38, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.3, textAlign: "center", maxWidth: 860 }}>
            Watch {n} cards become one illustration ↓
          </div>
        </Rise>
      </AbsoluteFill>
      {/* a BIG fanned hand filling the lower frame */}
      <div style={{ position: "absolute", bottom: SAFE_BOTTOM - 40, width: "100%", height: ch + 120, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
        {p.cards.map((c, i) => {
          const t = i - (n - 1) / 2;
          const pop = usePop(16 + i * 4, 13);
          return (
            <div key={i} style={{ position: "absolute", transformOrigin: "bottom center", transform: `translateX(${t * spread}px) translateY(${(1 - pop) * 150}px) rotate(${t * 7 * pop}deg) scale(${0.7 + pop * 0.3})`, opacity: pop }}>
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
  const cardH = 1340;
  const cardW = Math.round(cardH / CARD_ASPECT);
  const stripW = n * cardW;
  const fitScale = Math.min(1, (1080 * 0.92) / stripW);
  const center = (n - 1) / 2;
  const panF = interpolate(frame, [26, 150], [0, n - 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IN_OUT });
  const zoom = interpolate(frame, [150, 190], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const f = panF + (center - panF) * zoom;
  const scale = 1 + (fitScale - 1) * zoom;
  const tx = (center - f) * cardW * scale;
  return (
    <Stage glowY={44} sparkle={false}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
        <div style={{ display: "flex", transform: `translateX(${tx}px) scale(${scale})`, transformOrigin: "center center", filter: "drop-shadow(0 40px 90px rgba(0,0,0,0.8))" }}>
          {p.cards.map((c, i) => (
            <Img key={i} src={c.image} style={{ width: cardW, height: cardH, objectFit: "cover", marginLeft: i ? -2 : 0 }} />
          ))}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(11,14,20,0.92) 0%, rgba(11,14,20,0) 20%, rgba(11,14,20,0) 58%, rgba(11,14,20,0.97) 100%)" }} />
      <Rise delay={2} style={{ position: "absolute", top: 116, width: "100%", flexDirection: "column", alignItems: "center" }}>
        <Kicker style={{ fontSize: 28 }}>The reveal — one illustration</Kicker>
        <Display size={56} style={{ marginTop: 12, textAlign: "center", maxWidth: 960, display: "block" }}>{p.revealTitle || p.setLabel}</Display>
      </Rise>
      <div style={{ position: "absolute", bottom: SAFE_BOTTOM, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Rise delay={168} style={{ flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 34, color: MUTE }}>Combined panorama value</div>
          <MoneyCount value={p.total} delay={170} dur={22} size={146} style={{ marginTop: 4 }} />
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
