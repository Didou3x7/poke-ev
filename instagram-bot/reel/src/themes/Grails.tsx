// T3 · GRAILS — one ultra-chase card, shown like the museum piece it is.
// Beats: SHOCK (the price over a zoom into the art) → THE CARD (hero slam) → two cinematic
// art-detail zooms (craft + scene) with parallax → THE ODDS → CTA.
import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";

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

export const G_FADE = 14;
export const G_SHOCK = 98;
export const G_CARD = 78;
export const G_ZOOM = 88;
export const G_ODDS = 84;
export const G_OUTRO = 80;

export const grailsFrames = (): number =>
  G_SHOCK + G_CARD + G_ZOOM + G_ZOOM + G_ODDS + G_OUTRO - G_FADE * 5;

const CARD_ASPECT = 1.395;

/** A slow cinematic zoom/pan over the card art, focused on (fx, fy) in 0..1 card space, with a
 *  blurred parallax layer behind for depth and a STRONG bottom scrim so the card's rules text
 *  never bleeds through the copy. */
const ZoomArt: React.FC<{ src: string; fx: number; fy: number; z0: number; z1: number; panX?: number }> = ({
  src,
  fx,
  fy,
  z0,
  z1,
  panX = 0,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const z = interpolate(frame, [0, durationInFrames], [z0, z1], { easing: EASE });
  const px = interpolate(frame, [0, durationInFrames], [-panX, panX], { easing: EASE });
  const baseH = 1920;
  const baseW = baseH * (1 / CARD_ASPECT);
  const w = baseW * z;
  const h = baseH * z;
  const left = 540 - fx * w + px;
  const top = 960 - fy * h;
  return (
    <AbsoluteFill>
      {/* parallax background: a softened, larger copy drifting the opposite way */}
      <Img src={src} style={{ position: "absolute", width: w * 1.5, height: h * 1.5, left: left - px * 2 - w * 0.25, top: top - h * 0.25, objectFit: "cover", filter: "blur(28px) brightness(0.5) saturate(1.2)" }} />
      <Img src={src} style={{ position: "absolute", width: w, height: h, left, top, objectFit: "cover", filter: "saturate(1.06)" }} />
      <AbsoluteFill style={{ background: "radial-gradient(120% 85% at 50% 40%, rgba(11,14,20,0) 38%, rgba(11,14,20,0.7) 100%)" }} />
      {/* strong bottom scrim — hides the card's title/rules text behind the copy */}
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(11,14,20,1) 14%, rgba(11,14,20,0.96) 26%, rgba(11,14,20,0) 56%)" }} />
      {/* strong top scrim — hides the card's HP/title bar so only the illustration reads */}
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(11,14,20,1) 0%, rgba(11,14,20,0.95) 15%, rgba(11,14,20,0) 38%)" }} />
    </AbsoluteFill>
  );
};

const ZoomCopy: React.FC<{ kicker: string; headline: string; body: string }> = ({ kicker, headline, body }) => (
  <AbsoluteFill style={{ padding: 84, paddingBottom: SAFE_BOTTOM + 40, flexDirection: "column", justifyContent: "flex-end" }}>
    <Rise delay={6}>
      <Kicker style={{ fontSize: 28 }}>{kicker}</Kicker>
    </Rise>
    <TitleReveal text={headline} delay={12} size={86} style={{ marginTop: 16, maxWidth: 900 }} />
    <Rise delay={24} style={{ marginTop: 22, flexDirection: "column" }}>
      {splitLines(body).map((line, i) => (
        <div key={i} style={{ fontSize: 42, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.32 }}>{line}</div>
      ))}
    </Rise>
  </AbsoluteFill>
);

const Shock: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const lines = splitLines(p.shockHeadline);
  return (
    <Stage glowY={34} sparkle={false}>
      <ZoomArt src={p.image} fx={0.5} fy={0.42} z0={1.5} z1={1.7} panX={22} />
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ padding: 84, paddingBottom: SAFE_BOTTOM + 40, flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ flexDirection: "column", display: "flex" }}>
          {lines.map((l, i) => (
            <TitleReveal key={i} text={l} delay={1 + i * 4} size={90} holo={i === lines.length - 1} />
          ))}
        </div>
        <Rise delay={10} style={{ alignItems: "flex-end", gap: 18, marginTop: 24 }}>
          <MoneyCount value={p.price} delay={12} dur={26} size={154} />
          <div style={{ fontSize: 38, color: MUTE, marginBottom: 24 }}>for a single card</div>
        </Rise>
        <ProgressDots total={5} step={0} />
      </AbsoluteFill>
    </Stage>
  );
};

const TheCard: React.FC<{ p: GrailsProps }> = ({ p }) => (
  <Stage glowY={40}>
    <SetLogo src={p.setLogo} />
    <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <Rise delay={1} style={{ position: "absolute", top: 150, width: "100%", justifyContent: "center" }}>
        <Kicker style={{ fontSize: 28 }}>{p.cardKicker || "The card"}</Kicker>
      </Rise>
      <CardHero src={p.image} w={600} delay={0} />
      <Rise delay={14} style={{ flexDirection: "column", alignItems: "center", marginTop: 40 }}>
        <Display size={68} style={{ textAlign: "center", maxWidth: 920, display: "block" }}>{p.cardHeadline || p.name}</Display>
        {splitLines(p.cardBody).map((line, i) => (
          <div key={i} style={{ fontSize: 40, color: MUTE, fontFamily: SATOSHI, marginTop: 8 }}>{line}</div>
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
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Rise delay={2}>
          <Kicker style={{ fontSize: 30 }}>The odds</Kicker>
        </Rise>
        <div style={{ transform: `translateY(${(1 - pop) * 80}px) scale(${0.9 + pop * 0.1})`, opacity: pop, marginTop: 40, display: "flex", position: "relative" }}>
          <GlowBurst delay={6} />
          {p.booster ? (
            <Img src={p.booster} style={{ height: 760, objectFit: "contain", filter: "drop-shadow(0 40px 90px rgba(34,211,238,0.4))" }} />
          ) : (
            <Img src={p.image} style={{ width: 440, height: Math.round(440 * CARD_ASPECT), objectFit: "contain", borderRadius: 18, boxShadow: "0 40px 110px -30px rgba(34,211,238,0.5)" }} />
          )}
        </div>
        <Rise delay={16} style={{ flexDirection: "column", alignItems: "center", marginTop: 36 }}>
          <HoloBar w={170} delay={16} />
          {splitLines(p.oddsLine).map((line, i) => (
            <div key={i} style={{ fontSize: 46, color: INK, fontFamily: SATOSHI, marginTop: 18, textAlign: "center" }}>{line}</div>
          ))}
        </Rise>
      </AbsoluteFill>
      <ProgressDots total={5} step={4} />
    </Stage>
  );
};

export const Grails: React.FC<{ data: GrailsProps }> = ({ data }) => {
  const slideT = <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: G_FADE })} />;
  const wipeT = <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: G_FADE })} />;
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: G_FADE })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={G_SHOCK}>
        <Shock p={data} />
      </TransitionSeries.Sequence>
      {wipeT}
      <TransitionSeries.Sequence durationInFrames={G_CARD}>
        <TheCard p={data} />
      </TransitionSeries.Sequence>
      {slideT}
      <TransitionSeries.Sequence durationInFrames={G_ZOOM}>
        <Stage glowY={38} sparkle={false}>
          <ZoomArt src={data.image} fx={0.34} fy={0.3} z0={1.85} z1={2.2} panX={28} />
          <ZoomCopy kicker={data.craftKicker || "The artist"} headline={data.craftHeadline} body={data.craftBody} />
          <ProgressDots total={5} step={2} />
        </Stage>
      </TransitionSeries.Sequence>
      {slideT}
      <TransitionSeries.Sequence durationInFrames={G_ZOOM}>
        <Stage glowY={44} sparkle={false}>
          <ZoomArt src={data.image} fx={0.64} fy={0.4} z0={2.2} z1={1.85} panX={-28} />
          <ZoomCopy kicker={data.sceneKicker || "The scene"} headline={data.sceneHeadline} body={data.sceneBody} />
          <ProgressDots total={5} step={3} />
        </Stage>
      </TransitionSeries.Sequence>
      {wipeT}
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
