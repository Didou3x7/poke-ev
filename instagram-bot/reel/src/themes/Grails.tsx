// T3 · GRAILS — one ultra-chase card, shown like the museum piece it is.
// Beats: SHOCK (price over a centred push-in on the subject) → THE CARD (full card, huge) → two
// cinematic art-detail PUSH-INS (craft + scene, centred on the subject — never the feet, never a
// downward pan) → THE ODDS → CTA. Crossfades only.
import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import type { GrailsProps } from "../props";
import { splitLines } from "../props";
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

export const G_FADE = 10;
export const G_SHOCK = 118;
export const G_CARD = 104;
export const G_ZOOM = 116;
export const G_ODDS = 104;
export const G_OUTRO = 84;

export const grailsFrames = (): number => G_SHOCK + G_CARD + G_ZOOM + G_ZOOM + G_ODDS + G_OUTRO - G_FADE * 5;

const CARD_ASPECT = 1.395;

/** A slow cinematic PUSH-IN over the card art, centred on (fx, fy) in 0..1 card space — the focal
 *  point stays put while the zoom increases, so we move INTO the subject (no directional pan). A
 *  blurred parallax layer adds depth; strong top+bottom scrims hide the card's HP/title/rules text
 *  so only the illustration reads. */
const PushIn: React.FC<{ src: string; fx: number; fy: number; z0: number; z1: number; driftX?: number }> = ({ src, fx, fy, z0, z1, driftX = 0 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const z = interpolate(frame, [0, durationInFrames], [z0, z1], { easing: EASE });
  const dx = interpolate(frame, [0, durationInFrames], [-driftX, driftX], { easing: EASE });
  const baseH = 1920;
  const baseW = baseH / CARD_ASPECT;
  const w = baseW * z;
  const h = baseH * z;
  const left = 540 - fx * w + dx;
  const top = 960 - fy * h;
  return (
    <AbsoluteFill>
      <Img src={src} style={{ position: "absolute", width: w * 1.5, height: h * 1.5, left: left - w * 0.25, top: top - h * 0.25, objectFit: "cover", filter: "blur(30px) brightness(0.45) saturate(1.25)" }} />
      <Img src={src} style={{ position: "absolute", width: w, height: h, left, top, objectFit: "cover", filter: "saturate(1.06)" }} />
      <AbsoluteFill style={{ background: "radial-gradient(120% 85% at 50% 38%, rgba(11,14,20,0) 36%, rgba(11,14,20,0.72) 100%)" }} />
      {/* strong bottom scrim — copy sits here, card rules text hidden */}
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(11,14,20,1) 16%, rgba(11,14,20,0.96) 28%, rgba(11,14,20,0) 58%)" }} />
      {/* strong top scrim — fully covers the card's HP/title/evolution bar band (the subject sits
          lower, so it stays fully visible); reads as a clean cinematic vignette. */}
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(11,14,20,1) 0%, rgba(11,14,20,1) 21%, rgba(11,14,20,0.7) 31%, rgba(11,14,20,0) 48%)" }} />
    </AbsoluteFill>
  );
};

const ZoomCopy: React.FC<{ kicker: string; headline: string; body: string; step: number }> = ({ kicker, headline, body, step }) => (
  <>
    <AbsoluteFill style={{ padding: 84, paddingBottom: SAFE_BOTTOM + 30, flexDirection: "column", justifyContent: "flex-end" }}>
      <Rise delay={6}>
        <Kicker style={{ fontSize: 28 }}>{kicker}</Kicker>
      </Rise>
      <TitleReveal text={headline} delay={12} size={86} style={{ marginTop: 16, maxWidth: 900 }} />
      <Rise delay={24} style={{ marginTop: 20, flexDirection: "column" }}>
        {splitLines(body).map((line, i) => (
          <div key={i} style={{ fontSize: 42, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.32 }}>{line}</div>
        ))}
      </Rise>
    </AbsoluteFill>
    <ProgressDots total={5} step={step} />
  </>
);

const Shock: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const lines = splitLines(p.shockHeadline);
  return (
    <Stage glowY={34} sparkle={false}>
      <PushIn src={p.image} fx={0.5} fy={0.3} z0={1.36} z1={1.52} driftX={14} />
      {/* INSTANT context: WHICH card, WHICH set — top, over the scrim */}
      <Rise delay={2} style={{ position: "absolute", top: 138, width: "100%", flexDirection: "column", alignItems: "center" }}>
        {p.setLogo ? <Img src={p.setLogo} style={{ height: 62, objectFit: "contain", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.7))" }} /> : null}
        <Display size={66} style={{ marginTop: 12, textAlign: "center", maxWidth: 940, display: "block" }}>{p.name}</Display>
        <div style={{ fontSize: 30, letterSpacing: 3, textTransform: "uppercase", color: MUTE, fontFamily: CLASH, marginTop: 6 }}>
          {p.setName}{p.rarity ? ` · ${p.rarity}` : ""}
        </div>
      </Rise>
      <AbsoluteFill style={{ padding: 84, paddingBottom: SAFE_BOTTOM + 20, flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ flexDirection: "column", display: "flex" }}>
          {lines.map((l, i) => (
            <TitleReveal key={i} text={l} delay={1 + i * 4} size={88} holo={i === lines.length - 1} />
          ))}
        </div>
        <Rise delay={10} style={{ alignItems: "flex-end", gap: 18, marginTop: 22 }}>
          <MoneyCount value={p.price} delay={12} dur={26} size={158} />
          <div style={{ fontSize: 38, color: MUTE, marginBottom: 26 }}>for a single card</div>
        </Rise>
      </AbsoluteFill>
      <ProgressDots total={5} step={0} />
    </Stage>
  );
};

const TheCard: React.FC<{ p: GrailsProps }> = ({ p }) => (
  <Stage glowY={40}>
    <SetLogo src={p.setLogo} />
    <Rise delay={1} style={{ position: "absolute", top: 140, width: "100%", justifyContent: "center" }}>
      <Kicker style={{ fontSize: 28 }}>{p.cardKicker || "The card"}</Kicker>
    </Rise>
    {/* card + title as ONE centred column — a real gap so the card never overlaps the name */}
    <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 110, paddingBottom: SAFE_BOTTOM - 70 }}>
      <CardHero src={p.image} w={620} delay={0} />
      <Rise delay={16} style={{ flexDirection: "column", alignItems: "center", marginTop: 52 }}>
        <Display size={62} style={{ textAlign: "center", maxWidth: 940, display: "block" }}>{p.cardHeadline || p.name}</Display>
        {splitLines(p.cardBody).map((line, i) => (
          <div key={i} style={{ fontSize: 38, color: MUTE, fontFamily: SATOSHI, marginTop: 6 }}>{line}</div>
        ))}
      </Rise>
    </AbsoluteFill>
    <ProgressDots total={5} step={1} />
  </Stage>
);

const Odds: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const pop = usePop(6, 12);
  return (
    <Stage glowY={42}>
      <SetLogo src={p.setLogo} />
      <Rise delay={2} style={{ position: "absolute", top: 130, width: "100%", justifyContent: "center" }}>
        <Kicker style={{ fontSize: 30 }}>The odds</Kicker>
      </Rise>
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", transform: `translateY(${(1 - pop) * 70}px) scale(${0.9 + pop * 0.1})`, opacity: pop, display: "flex" }}>
          <GlowBurst delay={6} />
          {p.booster ? (
            <Img src={p.booster} style={{ height: 820, objectFit: "contain", filter: "drop-shadow(0 40px 90px rgba(34,211,238,0.4))" }} />
          ) : (
            <Img src={p.image} style={{ width: 520, height: "auto", display: "block", borderRadius: 16, filter: "drop-shadow(0 40px 90px rgba(34,211,238,0.5))" }} />
          )}
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", bottom: SAFE_BOTTOM, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Rise delay={16} style={{ flexDirection: "column", alignItems: "center" }}>
          <HoloBar w={170} delay={16} />
          {splitLines(p.oddsLine).map((line, i) => (
            <div key={i} style={{ fontSize: 44, color: INK, fontFamily: SATOSHI, marginTop: 16, textAlign: "center" }}>{line}</div>
          ))}
        </Rise>
      </div>
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
        <Stage glowY={38} sparkle={false}>
          <PushIn src={data.image} fx={0.5} fy={0.26} z0={1.7} z1={2.05} driftX={16} />
          <ZoomCopy kicker={data.craftKicker || "The artist"} headline={data.craftHeadline} body={data.craftBody} step={2} />
        </Stage>
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={G_ZOOM}>
        <Stage glowY={44} sparkle={false}>
          <PushIn src={data.image} fx={0.5} fy={0.33} z0={1.55} z1={1.9} driftX={-16} />
          <ZoomCopy kicker={data.sceneKicker || "The scene"} headline={data.sceneHeadline} body={data.sceneBody} step={3} />
        </Stage>
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
