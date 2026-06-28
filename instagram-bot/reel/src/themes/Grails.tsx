// T3 · GRAILS — one ultra-chase card, shown like the museum piece it is.
// Beats: SHOCK (the price) → THE CARD → two cinematic art-detail zooms (craft + scene)
// → THE ODDS → CTA.
import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import type { GrailsProps } from "../props";
import { splitLines } from "../props";
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

export const G_FADE = 12;
export const G_SHOCK = 94;
export const G_CARD = 78;
export const G_ZOOM = 86;
export const G_ODDS = 82;
export const G_OUTRO = 80;

export const grailsFrames = (): number =>
  G_SHOCK + G_CARD + G_ZOOM + G_ZOOM + G_ODDS + G_OUTRO - G_FADE * 5;

const CARD_ASPECT = 0.717; // w / h of a Pokémon card

/** A slow cinematic zoom/pan over the card art, focused on (fx, fy) in 0..1 card space. */
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
  const baseW = baseH * CARD_ASPECT;
  const w = baseW * z;
  const h = baseH * z;
  const left = 540 - fx * w + px;
  const top = 960 - fy * h;
  return (
    <AbsoluteFill>
      <Img src={src} style={{ position: "absolute", width: w, height: h, left, top, objectFit: "cover", filter: "saturate(1.05)" }} />
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 42%, rgba(11,14,20,0) 40%, rgba(11,14,20,0.72) 100%)" }} />
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(11,14,20,0.96) 16%, rgba(11,14,20,0) 52%)" }} />
    </AbsoluteFill>
  );
};

const ZoomCopy: React.FC<{ kicker: string; headline: string; body: string }> = ({ kicker, headline, body }) => (
  <AbsoluteFill style={{ padding: 84, flexDirection: "column", justifyContent: "flex-end" }}>
    <Rise delay={6}>
      <Kicker style={{ fontSize: 28 }}>{kicker}</Kicker>
    </Rise>
    <Rise delay={12} style={{ marginTop: 16 }}>
      <Display size={84}>{headline}</Display>
    </Rise>
    <Rise delay={20} style={{ marginTop: 22, flexDirection: "column" }}>
      {splitLines(body).map((line, i) => (
        <div key={i} style={{ fontSize: 42, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.32 }}>
          {line}
        </div>
      ))}
    </Rise>
  </AbsoluteFill>
);

const Shock: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const lines = splitLines(p.shockHeadline);
  return (
    <Stage glowY={36}>
      <ZoomArt src={p.image} fx={0.5} fy={0.37} z0={1.32} z1={1.48} panX={24} />
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ padding: 84, flexDirection: "column", justifyContent: "flex-end" }}>
        <Rise delay={2} style={{ flexDirection: "column" }}>
          {lines.map((l, i) => (
            <Display key={i} size={88} holo={i === lines.length - 1}>
              {l}
            </Display>
          ))}
        </Rise>
        <Rise delay={14} style={{ alignItems: "flex-end", gap: 18, marginTop: 24 }}>
          <MoneyCount value={p.price} delay={16} dur={30} size={150} />
          <div style={{ fontSize: 38, color: MUTE, marginBottom: 22 }}>for a single card</div>
        </Rise>
        <ProgressDots total={5} step={0} />
      </AbsoluteFill>
    </Stage>
  );
};

const TheCard: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const pop = usePop(2, 12);
  return (
    <Stage glowY={40}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Rise delay={1} style={{ position: "absolute", top: 150, width: "100%", justifyContent: "center" }}>
          <Kicker style={{ fontSize: 28 }}>{p.cardKicker || "The card"}</Kicker>
        </Rise>
        <div style={{ transform: `scale(${0.84 + pop * 0.16})`, opacity: pop, display: "flex" }}>
          <CardArt src={p.image} w={600} />
        </div>
        <Rise delay={12} style={{ flexDirection: "column", alignItems: "center", marginTop: 40 }}>
          <Display size={68} style={{ textAlign: "center", maxWidth: 920, display: "block" }}>
            {p.cardHeadline || p.name}
          </Display>
          {splitLines(p.cardBody).map((line, i) => (
            <div key={i} style={{ fontSize: 40, color: MUTE, fontFamily: SATOSHI, marginTop: 8 }}>
              {line}
            </div>
          ))}
        </Rise>
      </AbsoluteFill>
      <ProgressDots total={5} step={1} />
    </Stage>
  );
};

const Odds: React.FC<{ p: GrailsProps }> = ({ p }) => {
  const pop = usePop(6, 13);
  return (
    <Stage glowY={42}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Rise delay={2}>
          <Kicker style={{ fontSize: 30 }}>The odds</Kicker>
        </Rise>
        <div style={{ transform: `translateY(${(1 - pop) * 80}px) scale(${0.9 + pop * 0.1})`, opacity: pop, marginTop: 40, display: "flex" }}>
          {p.booster ? (
            <Img src={p.booster} style={{ height: 760, objectFit: "contain", filter: "drop-shadow(0 40px 90px rgba(34,211,238,0.4))" }} />
          ) : (
            <CardArt src={p.image} w={440} />
          )}
        </div>
        <Rise delay={16} style={{ flexDirection: "column", alignItems: "center", marginTop: 36 }}>
          <HoloBar w={170} />
          {splitLines(p.oddsLine).map((line, i) => (
            <div key={i} style={{ fontSize: 46, color: INK, fontFamily: SATOSHI, marginTop: 18, textAlign: "center" }}>
              {line}
            </div>
          ))}
        </Rise>
      </AbsoluteFill>
      <ProgressDots total={5} step={4} />
    </Stage>
  );
};

export const Grails: React.FC<{ data: GrailsProps }> = ({ data }) => {
  const t = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: G_FADE })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={G_SHOCK}>
        <Shock p={data} />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence durationInFrames={G_CARD}>
        <TheCard p={data} />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence durationInFrames={G_ZOOM}>
        <Stage glowY={38}>
          <ZoomArt src={data.image} fx={0.34} fy={0.28} z0={1.7} z1={2.0} panX={30} />
          <ZoomCopy kicker={data.craftKicker || "The artist"} headline={data.craftHeadline} body={data.craftBody} />
          <ProgressDots total={5} step={2} />
        </Stage>
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence durationInFrames={G_ZOOM}>
        <Stage glowY={44}>
          <ZoomArt src={data.image} fx={0.62} fy={0.36} z0={2.0} z1={1.7} panX={-30} />
          <ZoomCopy kicker={data.sceneKicker || "The scene"} headline={data.sceneHeadline} body={data.sceneBody} />
          <ProgressDots total={5} step={3} />
        </Stage>
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence durationInFrames={G_ODDS}>
        <Odds p={data} />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence durationInFrames={G_OUTRO}>
        <Outro logo={data.setLogo} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
