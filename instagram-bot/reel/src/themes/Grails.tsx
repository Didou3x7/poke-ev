// T3 · GRAILS — one ultra-chase card, shown like the museum piece it is.
// Inspired by the T1/carousel "défilement": we ZOOM into the card's art and PAN across it
// left→right (so the illustration reads in detail), then DEZOOM to lock the whole card — all
// framed on the art window so the subject (head + body) is always in view, for ANY card.
// Beats: SHOCK (slow push into the art + price) → THE CARD (full card) → ART (zoom · pan · dezoom,
// with the artist on a scrim) → THE ODDS → CTA. Crossfades only.
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import type { GrailsProps } from "../props";
import { splitLines } from "../props";
import {
  ContinuityHalo,
  Display,
  EASE,
  EASE_IN_OUT,
  GlowBurst,
  HoloBar,
  Kicker,
  MoneyCount,
  Outro,
  ReelProgress,
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
} from "../lib";

export const G_FADE = 10;
export const G_SHOCK = 112;
export const G_CARD = 96;
export const G_ART = 160;
export const G_ODDS = 100;
export const G_OUTRO = 84;

export const grailsFrames = (): number => G_SHOCK + G_CARD + G_ART + G_ODDS + G_OUTRO - G_FADE * 4;

const CARD_ASPECT = 1.395;
const GLOW = "drop-shadow(0 40px 90px rgba(0,0,0,0.85)) drop-shadow(0 0 80px rgba(124,92,246,0.55))";
const FULL_W = 1010; // a full card fitted to the frame width (sides never cut)

/** Draw the card at display width `w` with the normalized focal point (fx, fy) mapped to the
 *  screen centre — a blurred parallax copy behind for depth. Increasing `w` zooms IN; moving
 *  `fx` pans across the art. fy≈0.27 + a big `w` keeps the whole art window (head→feet) in view. */
const CardView: React.FC<{ src: string; w: number; fx: number; fy: number }> = ({ src, w, fx, fy }) => {
  const h = w * CARD_ASPECT;
  const left = 540 - fx * w;
  const top = 960 - fy * h;
  return (
    <AbsoluteFill>
      <Img src={src} style={{ position: "absolute", width: w * 1.7, height: h * 1.7, left: left - w * 0.35, top: top - h * 0.35, objectFit: "cover", filter: "blur(38px) brightness(0.4) saturate(1.25)" }} />
      <Img src={src} style={{ position: "absolute", width: w, height: h, left, top, objectFit: "cover", filter: "saturate(1.05)" }} />
    </AbsoluteFill>
  );
};

/** The full card, fitted to the frame, with a slam-in and a (variable) shine sweep. */
const FullCard: React.FC<{ src: string; w: number; delay?: number; shineAngle?: number }> = ({ src, w, delay = 0, shineAngle = 115 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 15, mass: 0.9, stiffness: 120 } });
  const op = interpolate(s, [0, 0.4], [0, 1]);
  const scale = interpolate(s, [0, 1], [0.86, 1.0]);
  const sweep = interpolate(frame - delay, [14, 54], [-1.3, 1.7], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "relative", display: "inline-block", lineHeight: 0, transform: `scale(${scale})`, opacity: op }}>
      <Img src={src} style={{ width: w, height: "auto", display: "block", borderRadius: 16, filter: GLOW }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: 16, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-12%", bottom: "-12%", left: `${sweep * 100}%`, width: "40%", background: `linear-gradient(${shineAngle}deg, transparent, rgba(255,255,255,0.42), transparent)`, transform: "skewX(-20deg)" }} />
      </div>
    </div>
  );
};

const TopId: React.FC<{ p: GrailsProps; delay?: number }> = ({ p, delay = 2 }) => (
  <Rise delay={delay} style={{ position: "absolute", top: 130, width: "100%", flexDirection: "column", alignItems: "center" }}>
    {p.setLogo ? <Img src={p.setLogo} style={{ height: 54, objectFit: "contain", opacity: 0.95 }} /> : null}
    <Display size={56} style={{ marginTop: 10, textAlign: "center", maxWidth: 940, display: "block" }}>{p.name}</Display>
    <div style={{ fontSize: 28, letterSpacing: 3, textTransform: "uppercase", color: MUTE, fontFamily: CLASH, marginTop: 4 }}>
      {p.setName}{p.rarity ? ` · ${p.rarity}` : ""}
    </div>
  </Rise>
);

const Shock: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const lines = splitLines(p.shockHeadline);
  // slow PUSH into the art (zoom in) — intrigue before the reveal
  const w = interpolate(frame, [0, G_SHOCK], [2050, 2360], { extrapolateRight: "clamp", easing: EASE });
  const fx = 0.5 + interpolate(frame, [0, G_SHOCK], [-0.03, 0.03], { extrapolateRight: "clamp", easing: EASE });
  return (
    <Stage glowY={42} sparkle={false}>
      <CardView src={p.image} w={w} fx={fx} fy={0.28} />
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(11,14,20,0.98) 18%, rgba(11,14,20,0) 46%)" }} />
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(11,14,20,0.95) 0%, rgba(11,14,20,0) 26%)" }} />
      <TopId p={p} />
      <div style={{ position: "absolute", bottom: SAFE_BOTTOM, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 84px" }}>
        <div style={{ flexDirection: "column", alignItems: "center", display: "flex" }}>
          {lines.map((l, i) => (
            <TitleReveal key={i} text={l} delay={1 + i * 4} size={78} holo={i === lines.length - 1} align="center" maxWidth={920} />
          ))}
        </div>
        <Rise delay={12} style={{ alignItems: "flex-end", gap: 16, marginTop: 14 }}>
          <MoneyCount value={p.price} delay={14} dur={26} size={150} />
          <div style={{ fontSize: 36, color: MUTE, marginBottom: 22 }}>for a single card</div>
        </Rise>
      </div>
    </Stage>
  );
};

const TheCard: React.FC<{ p: GrailsProps }> = ({ p }) => (
  <Stage glowY={40}>
    <SetLogo src={p.setLogo} />
    <Rise delay={1} style={{ position: "absolute", top: 142, width: "100%", justifyContent: "center" }}>
      <Kicker style={{ fontSize: 28 }}>{p.cardKicker || "The card"}</Kicker>
    </Rise>
    <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 118, paddingBottom: SAFE_BOTTOM - 50 }}>
      <FullCard src={p.image} w={700} delay={0} shineAngle={115} />
      <Rise delay={16} style={{ flexDirection: "column", alignItems: "center", marginTop: 44 }}>
        <Display size={60} style={{ textAlign: "center", maxWidth: 940, display: "block" }}>{p.cardHeadline || p.name}</Display>
        {splitLines(p.cardBody).slice(0, 2).map((line, i) => (
          <div key={i} style={{ fontSize: 38, color: MUTE, fontFamily: SATOSHI, marginTop: 6, textAlign: "center" }}>{line}</div>
        ))}
      </Rise>
    </AbsoluteFill>
  </Stage>
);

/** ZOOM into the art → PAN across it left→right → DEZOOM to the full card. The artist sits on a
 *  strong bottom scrim so it's always readable (never lost on the card). */
const Art: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const D = G_ART;
  const zoomEnd = 32;
  const panEnd = D - 46;
  const w = frame < zoomEnd
    ? interpolate(frame, [0, zoomEnd], [FULL_W, 2780], { easing: EASE })
    : frame < panEnd
      ? 2780
      : interpolate(frame, [panEnd, D], [2780, FULL_W], { easing: EASE });
  const fx = frame < zoomEnd
    ? 0.5
    : frame < panEnd
      ? interpolate(frame, [zoomEnd, panEnd], [0.27, 0.73], { easing: EASE_IN_OUT })
      : interpolate(frame, [panEnd, D], [0.73, 0.5], { easing: EASE });
  const fy = frame < panEnd ? 0.28 : interpolate(frame, [panEnd, D], [0.28, 0.5], { easing: EASE });
  const artist = p.craftHeadline || p.artist || "";
  // fade the label out as we dezoom, so the final full-card reveal is clean (no overlap on the card)
  const labelOp = interpolate(frame, [panEnd - 14, panEnd + 16], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scrimOp = interpolate(frame, [panEnd - 4, panEnd + 22], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Stage glowY={40} sparkle={false}>
      <CardView src={p.image} w={w} fx={fx} fy={fy} />
      <AbsoluteFill style={{ opacity: scrimOp, background: "linear-gradient(to top, rgba(11,14,20,0.97) 15%, rgba(11,14,20,0) 42%)" }} />
      <SetLogo src={p.setLogo} />
      {artist ? (
        <div style={{ position: "absolute", bottom: SAFE_BOTTOM, width: "100%", opacity: labelOp, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Rise delay={8} style={{ flexDirection: "column", alignItems: "center" }}>
            <Kicker style={{ fontSize: 28 }}>{p.craftKicker || "The artist"}</Kicker>
            <TitleReveal text={artist} delay={12} size={82} align="center" maxWidth={900} style={{ marginTop: 10 }} />
          </Rise>
        </div>
      ) : null}
    </Stage>
  );
};

const Odds: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const pop = usePop(6, 12);
  return (
    <Stage glowY={42}>
      <SetLogo src={p.setLogo} />
      <Rise delay={2} style={{ position: "absolute", top: 140, width: "100%", justifyContent: "center" }}>
        <Kicker style={{ fontSize: 30 }}>The odds</Kicker>
      </Rise>
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: SAFE_BOTTOM - 40 }}>
        <div style={{ position: "relative", transform: `translateY(${(1 - pop) * 70}px) scale(${0.9 + pop * 0.1})`, opacity: pop, display: "flex" }}>
          <GlowBurst delay={6} />
          {p.booster ? (
            <Img src={p.booster} style={{ height: 760, objectFit: "contain", filter: "drop-shadow(0 40px 90px rgba(34,211,238,0.4))" }} />
          ) : (
            <Img src={p.image} style={{ width: 470, height: "auto", display: "block", borderRadius: 16, filter: "drop-shadow(0 40px 90px rgba(34,211,238,0.5))" }} />
          )}
        </div>
        <Rise delay={16} style={{ flexDirection: "column", alignItems: "center", marginTop: 30 }}>
          <HoloBar w={170} delay={16} />
          {splitLines(p.oddsLine).map((line, i) => (
            <div key={i} style={{ fontSize: 44, color: INK, fontFamily: SATOSHI, marginTop: 16, textAlign: "center" }}>{line}</div>
          ))}
        </Rise>
      </AbsoluteFill>
    </Stage>
  );
};

export const Grails: React.FC<{ data: GrailsProps }> = ({ data }) => {
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: G_FADE })} />;
  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={G_SHOCK}>
        <Shock p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={G_CARD}>
        <TheCard p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={G_ART}>
        <Art p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={G_ODDS}>
        <Odds p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={G_OUTRO}>
        <Outro logo={data.setLogo} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
      <ContinuityHalo />
      <ReelProgress total={grailsFrames()} segments={5} />
    </AbsoluteFill>
  );
};
