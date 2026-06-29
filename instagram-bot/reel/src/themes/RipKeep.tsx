// T2 · RIP OR KEEP — a sealed set's price vs its expected open value, ending on a verdict.
// Beats: HOOK (the dilemma) → TEMPT (the chase cards slam in) → FACE-OFF (sealed $ vs EV $, the
// numbers punch in) → VERDICT (an explosive RIP IT / KEEP IT reveal) → CTA.
import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";

import type { RipKeepProps } from "../props";
import { splitLines } from "../props";
import {
  CardArt,
  Display,
  EASE,
  GlowBurst,
  HoloBar,
  Kicker,
  MoneyCount,
  Outro,
  ProgressDots,
  Rise,
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

export const R_FADE = 14;
export const R_HOOK = 84;
export const R_TEMPT = 78;
export const R_FACE = 106;
export const R_VERDICT = 106;
export const R_OUTRO = 80;

export const ripkeepFrames = (): number =>
  R_HOOK + R_TEMPT + R_FACE + R_VERDICT + R_OUTRO - R_FADE * 4;

const RIP = "linear-gradient(116deg, #34D399 0%, #22D3EE 60%, #8B5CF6 100%)";
const KEEP = "linear-gradient(116deg, #F59E0B 0%, #E94BD0 60%, #8B5CF6 100%)";
const CARD_ASPECT = 1.395;

const Hook: React.FC<{ p: RipKeepProps }> = ({ p }) => {
  const n = p.chase.length;
  const cw = 240;
  const ch = Math.round(cw * CARD_ASPECT);
  return (
    <Stage glowY={38}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ padding: 90, flexDirection: "column", justifyContent: "center" }}>
        <Rise delay={2}>
          <Kicker>The collector's dilemma</Kicker>
        </Rise>
        <TitleReveal text="Rip or keep?" delay={3} size={150} holo style={{ marginTop: 22 }} />
        <Rise delay={14}>
          <HoloBar w={210} delay={14} style={{ marginTop: 28 }} />
        </Rise>
        <Rise delay={18} style={{ marginTop: 32 }}>
          <div style={{ fontSize: 46, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.3 }}>
            A sealed {p.setName} ETB costs {p.sealed}. Open it, or keep it sealed?
          </div>
        </Rise>
        <div style={{ position: "relative", height: ch + 70, marginTop: 60, display: "flex", justifyContent: "center", alignItems: "center" }}>
          {p.chase.map((c, i) => {
            const t = i - (n - 1) / 2;
            const pop = usePop(16 + i * 4, 13);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: cw,
                  height: ch,
                  transform: `translateX(${t * 118}px) translateY(${Math.abs(t) * 12 + (1 - pop) * 130}px) rotate(${t * 7 * pop}deg) scale(${0.7 + pop * 0.3})`,
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
    </Stage>
  );
};

const Tempt: React.FC<{ p: RipKeepProps }> = ({ p }) => {
  const n = p.chase.length;
  return (
    <Stage glowY={42}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Rise delay={2} style={{ flexDirection: "column", alignItems: "center" }}>
          <Kicker style={{ fontSize: 28 }}>You're chasing these</Kicker>
        </Rise>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 26, marginTop: 54 }}>
          {p.chase.map((c, i) => {
            const pop = usePop(8 + i * 8, 12);
            const big = i === 1 && n >= 3;
            const shine = interpolate(useCurrentFrame() - (8 + i * 8), [10, 40], [-1.2, 1.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateY(${(1 - pop) * 110}px) scale(${0.86 + pop * 0.14})`, opacity: pop }}>
                <div style={{ position: "relative", overflow: "hidden", borderRadius: 18, display: "flex" }}>
                  <CardArt src={c.image} w={big ? 360 : 300} />
                  <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: `${shine * 100}%`, width: "55%", background: "linear-gradient(105deg, transparent, rgba(255,255,255,0.45), transparent)", transform: "skewX(-18deg)" }} />
                  </div>
                </div>
                <div style={{ marginTop: 22, fontSize: 34, color: INK, fontFamily: SATOSHI }}>{c.name}</div>
                <div style={{ marginTop: 4, fontSize: 54, fontFamily: CLASH, ...holoText() }}>{c.price}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <ProgressDots total={4} step={1} />
    </Stage>
  );
};

const FaceOff: React.FC<{ p: RipKeepProps }> = ({ p }) => {
  const evWins = p.verdictRip;
  const row = (label: string, value: string, win: boolean, delay: number) => (
    <Rise delay={delay} style={{ flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 34, letterSpacing: 2, color: win ? INK : MUTE, fontFamily: CLASH, textTransform: "uppercase" }}>{label}</div>
      <MoneyCount value={value} delay={delay + 4} dur={26} size={win ? 172 : 130} holo={win} style={win ? {} : { color: MUTE }} />
    </Rise>
  );
  return (
    <Stage glowY={40}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36 }}>
        <Rise delay={2}>
          <Kicker style={{ fontSize: 28 }}>The math</Kicker>
        </Rise>
        {row("Sealed price", p.sealed, !evWins, 8)}
        <div style={{ fontSize: 40, color: MUTE, fontFamily: CLASH }}>vs</div>
        {row("If you rip it", p.openEv, evWins, 22)}
        <Rise delay={44} style={{ marginTop: 14 }}>
          <div style={{ fontSize: 36, color: evWins ? "#34D399" : "#F59E0B", fontFamily: CLASH }}>
            {evWins ? `+${p.gap} in your favour` : `${p.gap} lost on average`}
          </div>
        </Rise>
      </AbsoluteFill>
      <ProgressDots total={4} step={2} />
    </Stage>
  );
};

const Verdict: React.FC<{ p: RipKeepProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const pop = usePop(6, 10, 150);
  const grad = p.verdictRip ? RIP : KEEP;
  const flash = interpolate(frame, [4, 12, 26], [0, 0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const words = splitLines(p.verdictWord);
  const reason = splitLines(p.reason);
  return (
    <Stage glowY={46} sparkle={false}>
      <AbsoluteFill style={{ background: grad, opacity: flash }} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80, textAlign: "center" }}>
        <Rise delay={2}>
          <Kicker style={{ fontSize: 30 }}>The verdict</Kicker>
        </Rise>
        <div style={{ position: "relative", transform: `scale(${0.6 + pop * 0.4})`, marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <GlowBurst delay={6} color={p.verdictRip ? "rgba(52,211,153,0.7)" : "rgba(245,158,11,0.7)"} size="-60%" />
          {words.map((w, i) => (
            <div key={i} style={{ fontFamily: CLASH, fontWeight: 700, fontSize: 172, lineHeight: 0.94, letterSpacing: -3, color: "transparent", backgroundImage: grad, backgroundClip: "text", WebkitBackgroundClip: "text" }}>
              {w}
            </div>
          ))}
        </div>
        <Rise delay={22} style={{ flexDirection: "column", alignItems: "center", marginTop: 44 }}>
          {reason.map((line, i) => (
            <div key={i} style={{ fontSize: 44, color: INK, fontFamily: SATOSHI, lineHeight: 1.3 }}>{line}</div>
          ))}
        </Rise>
      </AbsoluteFill>
      <ProgressDots total={4} step={3} />
    </Stage>
  );
};

export const RipKeep: React.FC<{ data: RipKeepProps }> = ({ data }) => {
  const slideT = <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: R_FADE })} />;
  const wipeT = <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: R_FADE })} />;
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: R_FADE })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={R_HOOK}>
        <Hook p={data} />
      </TransitionSeries.Sequence>
      {slideT}
      <TransitionSeries.Sequence durationInFrames={R_TEMPT}>
        <Tempt p={data} />
      </TransitionSeries.Sequence>
      {wipeT}
      <TransitionSeries.Sequence durationInFrames={R_FACE}>
        <FaceOff p={data} />
      </TransitionSeries.Sequence>
      {wipeT}
      <TransitionSeries.Sequence durationInFrames={R_VERDICT}>
        <Verdict p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={R_OUTRO}>
        <Outro logo={data.setLogo} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
