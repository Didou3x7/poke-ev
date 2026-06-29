// T1 · CONNECTING ART — N cards whose artworks join into one illustration.
// Beats: HOOK (a fanned hand) → one ULTRA-ZOOM scene per card → THE REVEAL (a cinematic pan
// across the full-height panorama, then pull back so it all locks together) → CTA.
import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";

import type { ConnectedProps } from "../props";
import {
  CardHero,
  Display,
  EASE,
  GlowBurst,
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

export const C_FADE = 14;
export const C_HOOK = 86;
export const C_CARD = 58;
export const C_REVEAL = 140;
export const C_OUTRO = 80;

export const connectedFrames = (n: number): number =>
  C_HOOK + n * C_CARD + C_REVEAL + C_OUTRO - C_FADE * (n + 2);

const CARD_ASPECT = 1.395;

const Hook: React.FC<{ p: ConnectedProps }> = ({ p }) => {
  const n = p.cards.length;
  const cw = 250;
  const ch = Math.round(cw * CARD_ASPECT);
  return (
    <Stage glowY={36}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ padding: 90, flexDirection: "column", justifyContent: "center" }}>
        <Rise delay={2}>
          <Kicker>Connecting Art</Kicker>
        </Rise>
        <TitleReveal text={p.headline || "They drew one scene."} delay={3} size={120} style={{ marginTop: 26, maxWidth: 920 }} />
        <Rise delay={12}>
          <HoloBar w={210} delay={12} style={{ marginTop: 30 }} />
        </Rise>
        <Rise delay={16} style={{ marginTop: 34 }}>
          <div style={{ fontSize: 44, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.3 }}>
            {n} cards. One continuous illustration by {p.artist || "one illustrator"}.
          </div>
        </Rise>
        {/* a fanned hand — overlapping, so it never crams no matter the card count */}
        <div style={{ position: "relative", height: ch + 80, marginTop: 70, display: "flex", justifyContent: "center", alignItems: "center" }}>
          {p.cards.map((c, i) => {
            const t = i - (n - 1) / 2;
            const pop = usePop(14 + i * 4, 13);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: cw,
                  height: ch,
                  transform: `translateX(${t * 116}px) translateY(${Math.abs(t) * 14 + (1 - pop) * 130}px) rotate(${t * 7 * pop}deg) scale(${0.7 + pop * 0.3})`,
                  opacity: pop,
                }}
              >
                <div style={{ position: "absolute", inset: -5, borderRadius: 18, backgroundImage: "linear-gradient(116deg,#22D3EE,#8B5CF6,#E94BD0)", opacity: 0.85 }} />
                <Img src={c.image} style={{ position: "relative", width: cw, height: ch, objectFit: "contain", borderRadius: 14, boxShadow: "0 30px 70px -24px rgba(0,0,0,0.85)" }} />
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
        <Rise delay={2} style={{ position: "absolute", top: 150, width: "100%", justifyContent: "center" }}>
          <Kicker style={{ fontSize: 28 }}>{`Piece ${i + 1} of ${n}`}</Kicker>
        </Rise>
        <CardHero src={c.image} w={560} delay={0} />
        <Rise delay={14} style={{ flexDirection: "column", alignItems: "center", marginTop: 40 }}>
          <Display size={78}>{c.name}</Display>
          <div style={{ marginTop: 8, fontSize: 96, fontFamily: CLASH, ...holoText() }}>{c.price}</div>
        </Rise>
      </AbsoluteFill>
      <Rise delay={22} style={{ position: "absolute", bottom: SAFE_BOTTOM + 64, width: "100%", justifyContent: "center" }}>
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
  // Full-height cards flush in a strip; the CAMERA pans across them (never squished), then
  // pulls back so the whole connected illustration locks together with the total.
  const cardH = 1120;
  const cardW = Math.round(cardH / CARD_ASPECT);
  const stripW = n * cardW;
  const fit = Math.min(1, (1080 * 0.94) / stripW);
  // focus index 0→(n-1) during the pan, then settle to the centre during the pullback
  const focus = interpolate(frame, [14, 84], [0, n - 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const settleFocus = interpolate(frame, [84, 110], [n - 1, (n - 1) / 2], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const f = frame < 84 ? focus : settleFocus;
  const scale = interpolate(frame, [84, 112], [1, fit], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const tx = ((n - 1) / 2 - f) * cardW * scale;
  return (
    <Stage glowY={44} sparkle={false}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
        <div style={{ display: "flex", transform: `translateX(${tx}px) scale(${scale})`, transformOrigin: "center center" }}>
          {p.cards.map((c, i) => (
            <Img key={i} src={c.image} style={{ width: cardW, height: cardH, objectFit: "contain", marginLeft: i ? -2 : 0 }} />
          ))}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(11,14,20,0.85) 0%, rgba(11,14,20,0) 22%, rgba(11,14,20,0) 62%, rgba(11,14,20,0.96) 100%)" }} />
      <Rise delay={2} style={{ position: "absolute", top: 120, width: "100%", flexDirection: "column", alignItems: "center" }}>
        <Kicker style={{ fontSize: 28 }}>The reveal</Kicker>
        <Display size={58} style={{ marginTop: 14, textAlign: "center", maxWidth: 940, display: "block" }}>
          {p.revealTitle || p.setLabel}
        </Display>
      </Rise>
      <div style={{ position: "absolute", bottom: SAFE_BOTTOM + 36, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Rise delay={92} style={{ flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 36, color: MUTE }}>Combined panorama value</div>
          <MoneyCount value={p.total} delay={96} dur={26} size={150} style={{ marginTop: 6 }} />
          <div style={{ fontSize: 28, color: MUTE, marginTop: 10 }}>every value priced live on pokeev.com</div>
        </Rise>
      </div>
      <ProgressDots total={n + 2} step={n + 1} />
    </Stage>
  );
};

export const Connected: React.FC<{ data: ConnectedProps }> = ({ data }) => {
  const n = data.cards.length;
  const slideT = <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: C_FADE })} />;
  const wipeT = <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: C_FADE })} />;
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: C_FADE })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={C_HOOK}>
        <Hook p={data} />
      </TransitionSeries.Sequence>
      {data.cards.map((_, i) => (
        <React.Fragment key={i}>
          {slideT}
          <TransitionSeries.Sequence durationInFrames={C_CARD}>
            <CardScene p={data} i={i} />
          </TransitionSeries.Sequence>
        </React.Fragment>
      ))}
      {wipeT}
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
