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
  GlowBurst,
  Kicker,
  MoneyCount,
  Outro,
  Rise,
  SAFE_BOTTOM,
  Stage,
  TravelLogo,
  usePop,
  CLASH,
  INK,
  MUTE,
  SATOSHI,
  holoText,
} from "../lib";

export const G_FADE = 10;
export const G_GRAIL = 300; // ONE continuous scene: full card → zoom in (no cut) → slow track L→R
export const G_ODDS = 100;
export const G_OUTRO = 84;

export const grailsFrames = (): number => G_GRAIL + G_ODDS + G_OUTRO - G_FADE * 2;

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

/** ONE continuous take (NO crossfade): open on the WHOLE card + price → SMOOTH zoom into the art →
 *  SLOW constant-velocity track left→right, captioning the artist, then a hidden detail. Same card
 *  throughout, fy holds the subject in view, no blur (read the art), each caption held long to read. */
const TheGrail: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const D = G_GRAIL;
  const holdEnd = 76; // show the full card + price
  const zoomEnd = 128; // zoomed into the art
  const lines = splitLines(p.shockHeadline);
  // ONE CardView the whole time: full card (whole, centred) → zoom into the art (drift left) → track.
  const w = frame < holdEnd ? 920 : interpolate(frame, [holdEnd, zoomEnd], [920, 1900], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const fy = frame < holdEnd ? 0.5 : interpolate(frame, [holdEnd, zoomEnd], [0.5, 0.3], { easing: EASE });
  const RAMP = 0.16;
  const vmax = 1 / (1 - RAMP);
  const px = interpolate(frame, [zoomEnd + 4, D - 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glide = px <= RAMP ? (vmax * px * px) / (2 * RAMP) : px < 1 - RAMP ? (vmax * RAMP) / 2 + vmax * (px - RAMP) : 1 - (vmax * (1 - px) * (1 - px)) / (2 * RAMP);
  const fx = frame < holdEnd ? 0.5 : frame < zoomEnd ? interpolate(frame, [holdEnd, zoomEnd], [0.5, 0.3], { easing: EASE }) : 0.3 + 0.44 * glide;
  // overlays
  const priceOp = interpolate(frame, [10, 24, holdEnd - 6, holdEnd + 8], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const split = zoomEnd + (D - zoomEnd) * 0.5;
  // artist text is fully in BY the end of the zoom (appears during the last of the push-in)
  const artistOp = interpolate(frame, [zoomEnd - 28, zoomEnd - 6, split - 4, split + 16], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sceneOp = interpolate(frame, [split + 14, split + 30, D - 4], [0, 1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const artist = p.craftHeadline || p.artist || "";
  const cap = (kicker: string, head: string, body: string, op: number, headSize: number) => (
    <div style={{ position: "absolute", bottom: SAFE_BOTTOM - 60, width: "100%", opacity: op, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 80px" }}>
      <Kicker style={{ fontSize: 28 }}>{kicker}</Kicker>
      <Display size={headSize} style={{ marginTop: 10, textAlign: "center", maxWidth: 940, display: "block" }}>{head}</Display>
      {splitLines(body).slice(0, 1).map((l, i) => (
        <div key={i} style={{ fontSize: 34, color: MUTE, fontFamily: SATOSHI, marginTop: 8, textAlign: "center" }}>{l}</div>
      ))}
    </div>
  );
  return (
    <Stage glowY={40} sparkle={false}>
      <CardView src={p.image} w={w} fx={fx} fy={fy} />
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(11,14,20,0.97) 16%, rgba(11,14,20,0) 44%)" }} />
      <div style={{ position: "absolute", bottom: SAFE_BOTTOM - 70, width: "100%", opacity: priceOp, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 80px" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ fontFamily: CLASH, fontWeight: 700, fontSize: 52, lineHeight: 1.05, textAlign: "center", ...(i === lines.length - 1 ? holoText(116) : { color: INK }) }}>{l}</div>
        ))}
        <MoneyCount value={p.price} delay={14} dur={24} size={120} style={{ marginTop: 8 }} />
      </div>
      {artist ? cap(p.craftKicker || "The artist", artist, p.craftBody, artistOp, 64) : null}
      {p.sceneHeadline ? cap(p.sceneKicker || "Hidden detail", p.sceneHeadline, p.sceneBody, sceneOp, 56) : null}
    </Stage>
  );
};

const Odds: React.FC<{ p: GrailsProps }> = ({ p }) => {
  return (
    <Stage glowY={44}>
      {/* the odds line at the TOP — nothing below the fan */}
      <Rise delay={2} style={{ position: "absolute", top: 360, width: "100%", flexDirection: "column", alignItems: "center", padding: "0 70px" }}>
        <Kicker style={{ fontSize: 30 }}>The odds</Kicker>
        {splitLines((p.oddsLine || "").replace(/rip a sealed booster\.?/gi, "")).filter(Boolean).map((l, i) => (
          <Display key={i} size={56} holo style={{ marginTop: 24, textAlign: "center", maxWidth: 940, display: "block" }}>{l}</Display>
        ))}
      </Rise>
      {/* a FAN of boosters, BIG & centred (sits right under the title), highlighted in the THEME
          (holo) colour — and that's it */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", perspective: 1500 }}>
        <GlowBurst delay={6} color="rgba(124,92,246,0.55)" size="-18%" />
        {[-1, 0, 1].map((k, i) => {
          const pop = usePop(4 + i * 6, 13);
          const inv = 1 - pop;
          if (!p.booster) return k === 0 ? <Img key={k} src={p.image} style={{ position: "absolute", width: 500, height: "auto", borderRadius: 16, filter: "drop-shadow(0 30px 80px rgba(124,92,246,0.6)) drop-shadow(0 0 70px rgba(34,211,238,0.5))", opacity: pop }} /> : null;
          return (
            <div key={k} style={{ position: "absolute", transformOrigin: "bottom center", filter: `blur(${inv * 2}px)`, transform: `translateY(${inv * 100}px) translateX(${k * 152}px) rotate(${k * 12}deg) scale(${0.82 + pop * 0.18})`, opacity: interpolate(pop, [0, 0.3], [0, 1]) }}>
              <Img src={p.booster} style={{ height: 760, objectFit: "contain", filter: "drop-shadow(0 30px 70px rgba(124,92,246,0.7)) drop-shadow(0 0 70px rgba(34,211,238,0.55))" }} />
            </div>
          );
        })}
      </AbsoluteFill>
    </Stage>
  );
};

export const Grails: React.FC<{ data: GrailsProps }> = ({ data }) => {
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: G_FADE })} />;
  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={G_GRAIL}>
        <TheGrail p={data} />
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
    </AbsoluteFill>
  );
};
