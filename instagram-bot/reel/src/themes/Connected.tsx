// T1 · CONNECTING ART — N cards whose artworks join into one illustration.
// Beats: HOOK → one scene per card (the pieces) → THE REVEAL (they line up into a panorama)
// → CTA. The reveal is the payoff: the cards slide flush together while the total counts up.
import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import type { ConnectedProps } from "../props";
import {
  CardArt,
  Display,
  EASE,
  HoloBar,
  Kicker,
  MoneyCount,
  Outro,
  ProgressDots,
  Rise,
  SetLogo,
  Stage,
  usePop,
  CLASH,
  INK,
  MUTE,
  SATOSHI,
  holoText,
} from "../lib";

export const C_FADE = 12;
export const C_HOOK = 80;
export const C_CARD = 58;
export const C_REVEAL = 124;
export const C_OUTRO = 80;

export const connectedFrames = (n: number): number =>
  C_HOOK + n * C_CARD + C_REVEAL + C_OUTRO - C_FADE * (n + 2);

const Hook: React.FC<{ p: ConnectedProps }> = ({ p }) => {
  const n = p.cards.length;
  return (
    <Stage glowY={38}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ padding: 90, flexDirection: "column", justifyContent: "center" }}>
        <Rise delay={2}>
          <Kicker>Connecting Art</Kicker>
        </Rise>
        <Rise delay={8} style={{ marginTop: 26 }}>
          <Display size={118}>{p.headline || "They drew one scene."}</Display>
        </Rise>
        <Rise delay={16}>
          <HoloBar w={210} style={{ marginTop: 30 }} />
        </Rise>
        <Rise delay={22} style={{ marginTop: 34 }}>
          <div style={{ fontSize: 44, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.3 }}>
            {n} cards. One continuous illustration by {p.artist || "one illustrator"}.
          </div>
        </Rise>
        {/* the pieces peek in at the bottom, fanned, hinting at the reveal */}
        <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 70 }}>
          {p.cards.map((c, i) => {
            const pop = usePop(26 + i * 5, 16);
            const rot = (i - (n - 1) / 2) * 6;
            return (
              <div
                key={i}
                style={{
                  transform: `translateY(${(1 - pop) * 120}px) rotate(${rot * pop}deg)`,
                  opacity: pop,
                  display: "flex",
                }}
              >
                <CardArt src={c.image} w={Math.min(220, 760 / n)} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <Rise delay={40} style={{ position: "absolute", bottom: 120, width: "100%", justifyContent: "center" }}>
        <div style={{ fontSize: 34, letterSpacing: 2, ...holoText() }}>watch them connect ↓</div>
      </Rise>
    </Stage>
  );
};

const CardScene: React.FC<{ p: ConnectedProps; i: number }> = ({ p, i }) => {
  const c = p.cards[i];
  const n = p.cards.length;
  const frame = useCurrentFrame();
  const pop = usePop(0, 13);
  const ken = interpolate(frame, [0, C_CARD], [1.0, 1.06], { easing: EASE });
  const running = p.cards.slice(0, i + 1).reduce((s, x) => s + Number(x.price.replace(/[^0-9.]/g, "")), 0);
  return (
    <Stage glowY={40}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Rise delay={1} style={{ position: "absolute", top: 150, width: "100%", justifyContent: "center" }}>
          <Kicker style={{ fontSize: 28 }}>{`Piece ${i + 1} of ${n}`}</Kicker>
        </Rise>
        <div
          style={{
            transform: `scale(${(0.86 + pop * 0.14) * ken})`,
            opacity: pop,
            display: "flex",
          }}
        >
          <CardArt src={c.image} w={560} />
        </div>
        <Rise delay={11} style={{ flexDirection: "column", alignItems: "center", marginTop: 44 }}>
          <Display size={76}>{c.name}</Display>
          <div style={{ marginTop: 10, fontSize: 92, fontFamily: CLASH, ...holoText() }}>{c.price}</div>
        </Rise>
      </AbsoluteFill>
      <Rise delay={18} style={{ position: "absolute", bottom: 128, width: "100%", justifyContent: "center" }}>
        <div style={{ fontSize: 32, color: MUTE }}>
          ${running.toLocaleString("en-US")} of {p.total} shown
        </div>
      </Rise>
      <ProgressDots total={n + 2} step={i + 1} />
    </Stage>
  );
};

const Reveal: React.FC<{ p: ConnectedProps }> = ({ p }) => {
  const n = p.cards.length;
  const frame = useCurrentFrame();
  // cards slide from spread-apart to flush together — "they line up into one picture"
  const assemble = interpolate(frame, [6, 46], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const cw = Math.min(330, 980 / n);
  const ch = Math.round(cw * 1.395);
  const settle = interpolate(frame, [46, 78], [1.06, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  return (
    <Stage glowY={44}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Rise delay={2} style={{ flexDirection: "column", alignItems: "center" }}>
          <Kicker style={{ fontSize: 28 }}>The reveal</Kicker>
          <Display size={64} style={{ marginTop: 16, textAlign: "center", maxWidth: 900, display: "block" }}>
            {p.revealTitle || p.setLabel}
          </Display>
        </Rise>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 54, transform: `scale(${settle})` }}>
          {p.cards.map((c, i) => {
            const off = (i - (n - 1) / 2) * (cw + 90) * assemble;
            return (
              <div key={i} style={{ display: "flex", transform: `translateX(${off}px)`, marginLeft: i ? -1 : 0 }}>
                <Img src={c.image} style={{ width: cw, height: ch, objectFit: "contain", borderRadius: 10 }} />
              </div>
            );
          })}
        </div>
        <Rise delay={52} style={{ flexDirection: "column", alignItems: "center", marginTop: 60 }}>
          <div style={{ fontSize: 36, color: MUTE }}>Combined panorama value</div>
          <MoneyCount value={p.total} delay={56} dur={30} size={150} style={{ marginTop: 8 }} />
        </Rise>
      </AbsoluteFill>
      <Rise delay={74} style={{ position: "absolute", bottom: 118, width: "100%", justifyContent: "center" }}>
        <div style={{ fontSize: 30, color: MUTE }}>every value priced live on pokeev.com</div>
      </Rise>
      <ProgressDots total={n + 2} step={n + 1} />
    </Stage>
  );
};

export const Connected: React.FC<{ data: ConnectedProps }> = ({ data }) => {
  const n = data.cards.length;
  const t = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: C_FADE })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={C_HOOK}>
        <Hook p={data} />
      </TransitionSeries.Sequence>
      {data.cards.map((_, i) => (
        <React.Fragment key={i}>
          {t}
          <TransitionSeries.Sequence durationInFrames={C_CARD}>
            <CardScene p={data} i={i} />
          </TransitionSeries.Sequence>
        </React.Fragment>
      ))}
      {t}
      <TransitionSeries.Sequence durationInFrames={C_REVEAL}>
        <Reveal p={data} />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence durationInFrames={C_OUTRO}>
        <Outro logo={data.setLogo} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
