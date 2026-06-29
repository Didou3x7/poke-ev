// T3 · GRAILS — one ultra-chase card, shown like the museum piece it is.
// The card is ALWAYS shown FULL (never a blind crop — a fixed crop can't frame every card's
// subject), big enough to dominate the portrait frame. Beats: SHOCK (price) → THE CARD → two
// slow zoom-INTO-the-art beats (craft + scene, the card grows toward its illustration, subject
// stays in view) → THE ODDS → CTA. Crossfades only.
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import type { GrailsProps } from "../props";
import { splitLines } from "../props";
import {
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
} from "../lib";

export const G_FADE = 10;
export const G_SHOCK = 118;
export const G_CARD = 104;
export const G_ZOOM = 116;
export const G_ODDS = 104;
export const G_OUTRO = 84;

export const grailsFrames = (): number => G_SHOCK + G_CARD + G_ZOOM + G_ZOOM + G_ODDS + G_OUTRO - G_FADE * 5;

const CARD_ASPECT = 1.395;
const GLOW = "drop-shadow(0 40px 90px rgba(0,0,0,0.85)) drop-shadow(0 0 80px rgba(124,92,246,0.55))";

/** The FULL grail card — never cropped, so the subject is always framed. Slam-in, a shine sweep,
 *  and an optional slow zoom INTO the art (transform-origin on the upper-centre illustration, so
 *  the card just grows toward its subject — a "look closer" feel without ever cutting it off). */
const GrailCard: React.FC<{ src: string; w: number; delay?: number; zoom?: number; rise?: boolean }> = ({ src, w, delay = 0, zoom = 0, rise = false }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16, mass: 0.9, stiffness: 120 } });
  const inv = 1 - s;
  const op = interpolate(s, [0, 0.4], [0, 1]);
  const ken = zoom ? interpolate(frame - delay, [0, durationInFrames], [1.0, 1 + zoom], { extrapolateRight: "clamp", easing: EASE }) : 1;
  const sweep = interpolate(frame - delay, [16, 56], [-1.3, 1.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const entry = rise ? `translateY(${inv * 90}px) scale(${1 - inv * 0.05})` : `scale(${1 + inv * 0.16})`;
  return (
    <div style={{ position: "relative", display: "inline-block", lineHeight: 0, transform: `${entry} scale(${ken})`, transformOrigin: "50% 31%", opacity: op }}>
      <Img src={src} style={{ width: w, height: "auto", display: "block", borderRadius: 18, filter: GLOW }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-10%", bottom: "-10%", left: `${sweep * 100}%`, width: "40%", background: "linear-gradient(105deg, transparent, rgba(255,255,255,0.4), transparent)", transform: "skewX(-18deg)" }} />
      </div>
    </div>
  );
};

/** Top identity — set logo + card name + set·rarity, so it's instantly clear which grail. */
const TopId: React.FC<{ p: GrailsProps; delay?: number }> = ({ p, delay = 2 }) => (
  <Rise delay={delay} style={{ position: "absolute", top: 132, width: "100%", flexDirection: "column", alignItems: "center" }}>
    {p.setLogo ? <Img src={p.setLogo} style={{ height: 54, objectFit: "contain", opacity: 0.95 }} /> : null}
    <Display size={56} style={{ marginTop: 10, textAlign: "center", maxWidth: 940, display: "block" }}>{p.name}</Display>
    <div style={{ fontSize: 28, letterSpacing: 3, textTransform: "uppercase", color: MUTE, fontFamily: CLASH, marginTop: 4 }}>
      {p.setName}{p.rarity ? ` · ${p.rarity}` : ""}
    </div>
  </Rise>
);

const Shock: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const lines = splitLines(p.shockHeadline);
  return (
    <Stage glowY={42} sparkle={false}>
      <TopId p={p} />
      {/* full card, centred between the top identity and the price */}
      <div style={{ position: "absolute", top: 350, width: "100%", display: "flex", justifyContent: "center" }}>
        <GrailCard src={p.image} w={560} delay={0} />
      </div>
      <div style={{ position: "absolute", bottom: SAFE_BOTTOM, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 84px" }}>
        <div style={{ flexDirection: "column", display: "flex", alignItems: "center" }}>
          {lines.map((l, i) => (
            <TitleReveal key={i} text={l} delay={1 + i * 4} size={78} holo={i === lines.length - 1} align="center" maxWidth={920} />
          ))}
        </div>
        <Rise delay={12} style={{ alignItems: "flex-end", gap: 16, marginTop: 14 }}>
          <MoneyCount value={p.price} delay={14} dur={26} size={148} />
          <div style={{ fontSize: 36, color: MUTE, marginBottom: 22 }}>for a single card</div>
        </Rise>
      </div>
      <ProgressDots total={5} step={0} />
    </Stage>
  );
};

const TheCard: React.FC<{ p: GrailsProps }> = ({ p }) => (
  <Stage glowY={40}>
    <SetLogo src={p.setLogo} />
    <Rise delay={1} style={{ position: "absolute", top: 142, width: "100%", justifyContent: "center" }}>
      <Kicker style={{ fontSize: 28 }}>{p.cardKicker || "The card"}</Kicker>
    </Rise>
    <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 120, paddingBottom: SAFE_BOTTOM - 60 }}>
      <GrailCard src={p.image} w={680} delay={0} />
      <Rise delay={16} style={{ flexDirection: "column", alignItems: "center", marginTop: 46 }}>
        <Display size={60} style={{ textAlign: "center", maxWidth: 940, display: "block" }}>{p.cardHeadline || p.name}</Display>
        {splitLines(p.cardBody).map((line, i) => (
          <div key={i} style={{ fontSize: 38, color: MUTE, fontFamily: SATOSHI, marginTop: 6, textAlign: "center" }}>{line}</div>
        ))}
      </Rise>
    </AbsoluteFill>
    <ProgressDots total={5} step={1} />
  </Stage>
);

const ArtBeat: React.FC<{ p: GrailsProps; kicker: string; headline: string; body: string; step: number; zoom: number }> = ({ p, kicker, headline, body, step, zoom }) => (
  <Stage glowY={step === 2 ? 38 : 46}>
    <SetLogo src={p.setLogo} />
    <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80, paddingBottom: SAFE_BOTTOM + 70 }}>
      {/* the full card slowly zooms toward its art (subject stays in view) */}
      <GrailCard src={p.image} w={620} delay={0} zoom={zoom} rise />
    </AbsoluteFill>
    <div style={{ position: "absolute", bottom: SAFE_BOTTOM, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 84px" }}>
      <Rise delay={8} style={{ flexDirection: "column", alignItems: "center" }}>
        <Kicker style={{ fontSize: 28 }}>{kicker}</Kicker>
        <TitleReveal text={headline} delay={12} size={74} align="center" maxWidth={900} style={{ marginTop: 12 }} />
        <div style={{ marginTop: 14, flexDirection: "column", alignItems: "center", display: "flex" }}>
          {splitLines(body).map((line, i) => (
            <div key={i} style={{ fontSize: 40, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.3, textAlign: "center" }}>{line}</div>
          ))}
        </div>
      </Rise>
    </div>
    <ProgressDots total={5} step={step} />
  </Stage>
);

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
            <Img src={p.booster} style={{ height: 780, objectFit: "contain", filter: "drop-shadow(0 40px 90px rgba(34,211,238,0.4))" }} />
          ) : (
            <Img src={p.image} style={{ width: 480, height: "auto", display: "block", borderRadius: 16, filter: "drop-shadow(0 40px 90px rgba(34,211,238,0.5))" }} />
          )}
        </div>
        <Rise delay={16} style={{ flexDirection: "column", alignItems: "center", marginTop: 32 }}>
          <HoloBar w={170} delay={16} />
          {splitLines(p.oddsLine).map((line, i) => (
            <div key={i} style={{ fontSize: 44, color: INK, fontFamily: SATOSHI, marginTop: 16, textAlign: "center" }}>{line}</div>
          ))}
        </Rise>
      </AbsoluteFill>
      <ProgressDots total={5} step={4} />
    </Stage>
  );
};

export const Grails: React.FC<{ data: GrailsProps }> = ({ data }) => {
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: G_FADE })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={G_SHOCK}>
        <Shock p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={G_CARD}>
        <TheCard p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={G_ZOOM}>
        <ArtBeat p={data} kicker={data.craftKicker || "The artist"} headline={data.craftHeadline} body={data.craftBody} step={2} zoom={0.22} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={G_ZOOM}>
        <ArtBeat p={data} kicker={data.sceneKicker || "The scene"} headline={data.sceneHeadline} body={data.sceneBody} step={3} zoom={0.15} />
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
  );
};
