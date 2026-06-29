// T2 · RIP OR KEEP — a sealed set's price vs its expected open value, ending on a verdict.
// Beats: HOOK (the dilemma + fanned chase) → TEMPT (the chase cards, BIG) → FACE-OFF (sealed $ vs
// EV $, numbers punch in) → VERDICT (explosive RIP IT / KEEP IT) → CTA. Crossfades only.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import type { RipKeepProps } from "../props";
import { splitLines } from "../props";
import {
  CardArt,
  Display,
  GlowBurst,
  HoloBar,
  Kicker,
  MoneyCount,
  Outro,
  ProgressDots,
  Rise,
  SAFE_BOTTOM,
  SetBadge,
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

export const R_FADE = 8;
export const R_HOOK = 80;
export const R_TEMPT = 80;
export const R_FACE = 102;
export const R_VERDICT = 102;
export const R_OUTRO = 78;

export const ripkeepFrames = (): number => R_HOOK + R_TEMPT + R_FACE + R_VERDICT + R_OUTRO - R_FADE * 4;

const RIP = "linear-gradient(116deg, #34D399 0%, #22D3EE 60%, #8B5CF6 100%)";
const KEEP = "linear-gradient(116deg, #F59E0B 0%, #E94BD0 60%, #8B5CF6 100%)";
const CARD_ASPECT = 1.395;

const Hook: React.FC<{ p: RipKeepProps }> = ({ p }) => {
  const n = p.chase.length;
  const cw = 270;
  const ch = cw * CARD_ASPECT;
  return (
    <Stage glowY={38}>
      <AbsoluteFill style={{ padding: 84, paddingTop: 150, flexDirection: "column", alignItems: "center" }}>
        {/* INSTANT context: which set, in the first second */}
        <SetBadge logo={p.setLogo} name={p.setName} delay={2} />
        <TitleReveal text="Rip or keep?" delay={10} size={150} holo align="center" style={{ justifyContent: "center", marginTop: 38 }} />
        <Rise delay={20} style={{ marginTop: 20 }}>
          <div style={{ fontSize: 42, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.3, textAlign: "center", maxWidth: 900 }}>
            A sealed {p.setName} ETB costs {p.sealed} — open it, or keep it sealed?
          </div>
        </Rise>
        <div style={{ position: "relative", width: "100%", height: ch + 40, marginTop: 40, display: "flex", justifyContent: "center", alignItems: "center" }}>
          {p.chase.map((c, i) => {
            const t = i - (n - 1) / 2;
            const pop = usePop(16 + i * 4, 13);
            return (
              <div key={i} style={{ position: "absolute", transform: `translateX(${t * 130}px) translateY(${Math.abs(t) * 10 + (1 - pop) * 130}px) rotate(${t * 6 * pop}deg) scale(${0.72 + pop * 0.28})`, opacity: pop }}>
                <CardArt src={c.image} w={cw} />
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
      <Rise delay={2} style={{ position: "absolute", top: 130, width: "100%", justifyContent: "center" }}>
        <Kicker style={{ fontSize: 28 }}>You're chasing these</Kicker>
      </Rise>
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 }}>
        {p.chase.map((c, i) => {
          const pop = usePop(8 + i * 7, 13);
          const big = i === 1 && n >= 3;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateY(${(1 - pop) * 90}px) scale(${0.85 + pop * 0.15})`, opacity: pop }}>
              <CardArt src={c.image} w={big ? 420 : 330} />
              <div style={{ marginTop: 20, fontSize: 32, color: INK, fontFamily: SATOSHI }}>{c.name}</div>
              <div style={{ marginTop: 2, fontSize: 50, fontFamily: CLASH, ...holoText() }}>{c.price}</div>
            </div>
          );
        })}
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
      <MoneyCount value={value} delay={delay + 4} dur={26} size={win ? 176 : 130} holo={win} style={win ? {} : { color: MUTE }} />
    </Rise>
  );
  return (
    <Stage glowY={40}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 38 }}>
        <Rise delay={2}>
          <Kicker style={{ fontSize: 28 }}>The math</Kicker>
        </Rise>
        {row("Sealed price", p.sealed, !evWins, 8)}
        <div style={{ fontSize: 40, color: MUTE, fontFamily: CLASH }}>vs</div>
        {row("If you rip it", p.openEv, evWins, 22)}
        <Rise delay={44} style={{ marginTop: 12 }}>
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
  const pop = usePop(6, 10, 160);
  const grad = p.verdictRip ? RIP : KEEP;
  const flash = interpolate(frame, [4, 12, 26], [0, 0.55, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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
            <div key={i} style={{ fontFamily: CLASH, fontWeight: 700, fontSize: 176, lineHeight: 0.94, letterSpacing: -3, color: "transparent", backgroundImage: grad, backgroundClip: "text", WebkitBackgroundClip: "text" }}>{w}</div>
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
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: R_FADE })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={R_HOOK}>
        <Hook p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={R_TEMPT}>
        <Tempt p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence durationInFrames={R_FACE}>
        <FaceOff p={data} />
      </TransitionSeries.Sequence>
      {fadeT}
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
