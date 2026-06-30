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
  Stage,
  TitleReveal,
  TravelLogo,
  usePop,
  CLASH,
  INK,
  MUTE,
  SATOSHI,
} from "../lib";

export const G_FADE = 10;
export const G_REVEAL = 118; // open on the FULL card + price
export const G_ART = 204; // zoom in → slow track left→right (artist + hidden detail)
export const G_ODDS = 100;
export const G_OUTRO = 84;

export const grailsFrames = (): number => G_REVEAL + G_ART + G_ODDS + G_OUTRO - G_FADE * 3;

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

/** OPEN on the FULL card (whole, slammed in) with the grail price — the museum-piece reveal. */
const Reveal: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const lines = splitLines(p.shockHeadline);
  return (
    <Stage glowY={40}>
      <Rise delay={1} style={{ position: "absolute", top: 120, width: "100%", justifyContent: "center" }}>
        <div style={{ fontSize: 28, letterSpacing: 3, textTransform: "uppercase", color: MUTE, fontFamily: CLASH }}>
          {p.setName}{p.rarity ? ` · ${p.rarity}` : ""}
        </div>
      </Rise>
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 96, paddingBottom: SAFE_BOTTOM - 64 }}>
        <FullCard src={p.image} w={560} delay={0} shineAngle={115} />
        <Rise delay={18} style={{ flexDirection: "column", alignItems: "center", marginTop: 24 }}>
          {lines.map((l, i) => (
            <TitleReveal key={i} text={l} delay={20 + i * 4} size={54} holo={i === lines.length - 1} align="center" maxWidth={920} />
          ))}
          <MoneyCount value={p.price} delay={30} dur={26} size={126} style={{ marginTop: 8 }} />
        </Rise>
      </AbsoluteFill>
    </Stage>
  );
};

/** ZOOM into the art (centre → left), then TRACK left→right at a SLOW constant velocity to read the
 *  detail — artist first, then a hidden detail. fy holds the subject in view; no blur (read the art). */
const ArtTour: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const D = G_ART;
  const zoomEnd = 52;
  // zoom from the full card into the art, drifting toward the LEFT so the track can sweep right.
  const w = interpolate(frame, [0, zoomEnd], [FULL_W, 1880], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  // constant-velocity (trapezoidal) glide → smooth, no judder on the detailed art.
  const RAMP = 0.16;
  const vmax = 1 / (1 - RAMP);
  const px = interpolate(frame, [zoomEnd + 6, D - 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glide = px <= RAMP ? (vmax * px * px) / (2 * RAMP) : px < 1 - RAMP ? (vmax * RAMP) / 2 + vmax * (px - RAMP) : 1 - (vmax * (1 - px) * (1 - px)) / (2 * RAMP);
  const fx = frame < zoomEnd ? interpolate(frame, [0, zoomEnd], [0.5, 0.3], { easing: EASE }) : 0.3 + 0.44 * glide;
  const mid = zoomEnd + (D - zoomEnd) * 0.5;
  const artistOp = interpolate(frame, [zoomEnd + 2, zoomEnd + 18, mid - 4, mid + 16], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sceneOp = interpolate(frame, [mid + 10, mid + 26, D], [0, 1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const artist = p.craftHeadline || p.artist || "";
  const cap = (kicker: string, head: string, body: string, op: number, headSize: number) => (
    <div style={{ position: "absolute", bottom: SAFE_BOTTOM, width: "100%", opacity: op, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 80px" }}>
      <Kicker style={{ fontSize: 28 }}>{kicker}</Kicker>
      <Display size={headSize} style={{ marginTop: 10, textAlign: "center", maxWidth: 940, display: "block" }}>{head}</Display>
      {splitLines(body).slice(0, 2).map((l, i) => (
        <div key={i} style={{ fontSize: 34, color: MUTE, fontFamily: SATOSHI, marginTop: 6, textAlign: "center" }}>{l}</div>
      ))}
    </div>
  );
  return (
    <Stage glowY={40} sparkle={false}>
      <CardView src={p.image} w={w} fx={fx} fy={0.3} />
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(11,14,20,0.97) 16%, rgba(11,14,20,0) 44%)" }} />
      {artist ? cap(p.craftKicker || "The artist", artist, p.craftBody, artistOp, 64) : null}
      {p.sceneHeadline ? cap(p.sceneKicker || "Hidden detail", p.sceneHeadline, p.sceneBody, sceneOp, 56) : null}
    </Stage>
  );
};

const Odds: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const pop = usePop(6, 12);
  return (
    <Stage glowY={42}>
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
      <TransitionSeries.Sequence durationInFrames={G_REVEAL}>
        <Reveal p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={G_ART}>
        <ArtTour p={data} />
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
      <TravelLogo src={data.setLogo} hookEnd={0} startBig={false} />
      <ContinuityHalo />
      <ReelProgress total={grailsFrames()} segments={4} />
    </AbsoluteFill>
  );
};
