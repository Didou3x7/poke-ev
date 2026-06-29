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

export const C_FADE = 8;
export const C_HOOK = 80;
export const C_CARD = 54;
export const C_REVEAL = 150;
export const C_OUTRO = 78;

export const connectedFrames = (n: number): number => C_HOOK + n * C_CARD + C_REVEAL + C_OUTRO - C_FADE * (n + 2);

const CARD_ASPECT = 1.395;

const Hook: React.FC<{ p: ConnectedProps }> = ({ p }) => {
  const n = p.cards.length;
  const cw = Math.min(310, 1000 / Math.max(n, 3) + 80);
  const ch = cw * CARD_ASPECT;
  return (
    <Stage glowY={36}>
      <AbsoluteFill style={{ padding: 84, paddingTop: 140, flexDirection: "column", alignItems: "center" }}>
        {/* INSTANT context: which set, in the first second */}
        <SetBadge logo={p.setLogo} name={p.setLabel} delay={2} />
        <Rise delay={10} style={{ marginTop: 20 }}>
          <Kicker style={{ fontSize: 26 }}>Connecting Art</Kicker>
        </Rise>
        <TitleReveal text={p.headline || "They drew one scene."} delay={14} size={112} align="center" style={{ justifyContent: "center", marginTop: 14, maxWidth: 940 }} />
        <Rise delay={22} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 40, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.3, textAlign: "center", maxWidth: 880 }}>
            {n} cards form one continuous illustration by {p.artist || "one illustrator"}.
          </div>
        </Rise>
        {/* a fanned hand — overlapping, big, never crams regardless of card count */}
        <div style={{ position: "relative", width: "100%", height: ch + 50, marginTop: 40, display: "flex", justifyContent: "center", alignItems: "center" }}>
          {p.cards.map((c, i) => {
            const t = i - (n - 1) / 2;
            const pop = usePop(18 + i * 4, 13);
            return (
              <div key={i} style={{ position: "absolute", transform: `translateX(${t * 132}px) translateY(${Math.abs(t) * 12 + (1 - pop) * 130}px) rotate(${t * 6 * pop}deg) scale(${0.72 + pop * 0.28})`, opacity: pop }}>
                <CardArt src={c.image} w={cw} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <Rise delay={34} style={{ position: "absolute", bottom: SAFE_BOTTOM, width: "100%", justifyContent: "center" }}>
        <div style={{ fontSize: 34, letterSpacing: 2, ...holoText() }}>watch them connect ↓</div>
      </Rise>
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
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Rise delay={1} style={{ position: "absolute", top: 130, width: "100%", justifyContent: "center" }}>
          <Kicker style={{ fontSize: 28 }}>{`Piece ${i + 1} of ${n}`}</Kicker>
        </Rise>
        {/* the card DOMINATES the frame */}
        <CardHero src={c.image} w={760} delay={0} />
      </AbsoluteFill>
      <div style={{ position: "absolute", bottom: SAFE_BOTTOM, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Rise delay={12} style={{ flexDirection: "column", alignItems: "center" }}>
          <Display size={66}>{c.name}</Display>
          <div style={{ marginTop: 2, fontSize: 84, fontFamily: CLASH, ...holoText() }}>{c.price}</div>
        </Rise>
      </div>
      <ProgressDots total={n + 2} step={i + 1} />
    </Stage>
  );
};

const Reveal: React.FC<{ p: ConnectedProps }> = ({ p }) => {
  const n = p.cards.length;
  const frame = useCurrentFrame();
  // Full-height cards flush in a strip; the CAMERA pans across them. They stay HUGE the whole
  // time (no shrink-to-fit), so the connected illustration flows by, card to card.
  const cardH = 1360;
  const cardW = Math.round(cardH / CARD_ASPECT);
  const f = interpolate(frame, [14, 128], [0, n - 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const tx = ((n - 1) / 2 - f) * cardW;
  const breathe = interpolate(frame, [0, 150], [1.05, 1.0], { extrapolateRight: "clamp", easing: EASE });
  return (
    <Stage glowY={44} sparkle={false}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
        <div style={{ display: "flex", transform: `translateX(${tx}px) scale(${breathe})`, transformOrigin: "center center", filter: "drop-shadow(0 40px 90px rgba(0,0,0,0.8))" }}>
          {p.cards.map((c, i) => (
            <Img key={i} src={c.image} style={{ width: cardW, height: cardH, objectFit: "cover", marginLeft: i ? -2 : 0 }} />
          ))}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(11,14,20,0.92) 0%, rgba(11,14,20,0) 20%, rgba(11,14,20,0) 60%, rgba(11,14,20,0.97) 100%)" }} />
      <Rise delay={2} style={{ position: "absolute", top: 116, width: "100%", flexDirection: "column", alignItems: "center" }}>
        <Kicker style={{ fontSize: 28 }}>The reveal — one illustration</Kicker>
        <Display size={56} style={{ marginTop: 12, textAlign: "center", maxWidth: 960, display: "block" }}>{p.revealTitle || p.setLabel}</Display>
      </Rise>
      <div style={{ position: "absolute", bottom: SAFE_BOTTOM, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Rise delay={118} style={{ flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 34, color: MUTE }}>Combined panorama value</div>
          <MoneyCount value={p.total} delay={120} dur={24} size={146} style={{ marginTop: 4 }} />
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
