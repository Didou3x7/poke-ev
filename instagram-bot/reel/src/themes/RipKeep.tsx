// T2 · RIP OR KEEP — a sealed set's price vs its expected open value, ending on a verdict.
// Beats: HOOK (the dilemma + fanned chase) → TEMPT (the chase cards, BIG) → FACE-OFF (sealed $ vs
// EV $, numbers punch in) → VERDICT (explosive RIP IT / KEEP IT) → CTA. Crossfades only.
import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import type { RipKeepProps } from "../props";
import { splitLines } from "../props";
import {
  CardArt,
  Display,
  EASE,
  GlowBurst,
  Kicker,
  MoneyCount,
  Outro,
  ProgressDots,
  Rise,
  SAFE_BOTTOM,
  SetLogo,
  SparkBurst,
  Stage,
  TitleReveal,
  usePop,
  CLASH,
  INK,
  MUTE,
  SATOSHI,
  holoText,
} from "../lib";

export const R_FADE = 10;
export const R_HOOK = 96;
export const R_TEMPT = 112;
export const R_FACE = 124;
export const R_VERDICT = 120;
export const R_OUTRO = 84;

export const ripkeepFrames = (): number => R_HOOK + R_TEMPT + R_FACE + R_VERDICT + R_OUTRO - R_FADE * 4;

const RIP = "linear-gradient(116deg, #34D399 0%, #22D3EE 60%, #8B5CF6 100%)";
const KEEP = "linear-gradient(116deg, #F59E0B 0%, #E94BD0 60%, #8B5CF6 100%)";
const CARD_ASPECT = 1.395;

const Hook: React.FC<{ p: RipKeepProps }> = ({ p }) => {
  const n = p.chase.length;
  // Same premium hook layout as T1: set LOGO (big, top) + bold line, then a 3D fanned hand of the
  // chase cards pinned right under the title (no gap). The sealed price gets its big moment in FACE-OFF.
  const spread = Math.min(110, 440 / Math.max(n - 1, 1));
  const cw = Math.min(660, Math.round((520 - ((n - 1) / 2) * spread) / 0.6));
  const ch = Math.round(cw * CARD_ASPECT);
  const rot = Math.min(8, 30 / n);
  const logoP = usePop(2, 13);
  return (
    <Stage glowY={36}>
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", paddingTop: 96 }}>
        {p.setLogo ? (
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", opacity: logoP, transform: `translateY(${(1 - logoP) * -26}px) scale(${0.86 + logoP * 0.14})` }}>
            <div style={{ position: "absolute", inset: "-34px -30px", background: "radial-gradient(ellipse, rgba(124,92,246,0.32), transparent 72%)" }} />
            <Img src={p.setLogo} style={{ height: 168, objectFit: "contain", filter: "drop-shadow(0 8px 22px rgba(0,0,0,0.8))" }} />
          </div>
        ) : null}
        <TitleReveal text="Rip or keep?" delay={10} size={138} holo align="center" maxWidth={940} style={{ marginTop: 22 }} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 1312 - ch, height: ch, perspective: 1700 }}>
        {p.chase.map((c, i) => {
          const t = i - (n - 1) / 2;
          const pop = usePop(15 + i * 5, 14);
          const inv = 1 - pop;
          const flip = i % 2 === 0 ? 1 : -1;
          const entry = `translateZ(${inv * -820}px) rotateY(${inv * flip * 78}deg) rotateX(${inv * 22}deg) translateY(${inv * 120}px)`;
          return (
            <div key={i} style={{ position: "absolute", left: "50%", bottom: 0, transformOrigin: "bottom center", filter: `blur(${inv * 2.8}px)`, transform: `translateX(-50%) translateX(${t * spread}px) ${entry} rotateZ(${t * rot}deg) rotateY(${-t * 9}deg) scale(${0.74 + pop * 0.26})`, opacity: interpolate(pop, [0, 0.3], [0, 1]) }}>
              <CardArt src={c.image} w={cw} />
            </div>
          );
        })}
      </div>
    </Stage>
  );
};

const Tempt: React.FC<{ p: RipKeepProps }> = ({ p }) => {
  const n = p.chase.length;
  // equal cards sized so the whole row fits inside the frame with even margins (never clipped)
  const cw = Math.min(360, Math.floor((948 - (n - 1) * 20) / n));
  return (
    <Stage glowY={42}>
      <SetLogo src={p.setLogo} />
      <Rise delay={2} style={{ position: "absolute", top: 132, width: "100%", justifyContent: "center" }}>
        <Kicker style={{ fontSize: 28 }}>You're chasing these</Kicker>
      </Rise>
      {/* each chase card flies in on its OWN 3D arc (depth + flip, alternating), then settles */}
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, perspective: 1500 }}>
        {p.chase.map((c, i) => {
          const s = usePop(6 + i * 7, 13);
          const inv = 1 - s;
          const flip = i % 2 === 0 ? 1 : -1;
          const entry = `translateZ(${inv * -720}px) rotateY(${inv * flip * 72}deg) rotateX(${inv * 18}deg)`;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", transformOrigin: "center bottom", filter: `blur(${inv * 2.6}px)`, transform: `${entry} translateY(${inv * 70}px) scale(${0.82 + s * 0.18})`, opacity: interpolate(s, [0, 0.3], [0, 1]) }}>
              <CardArt src={c.image} w={cw} />
              <div style={{ marginTop: 18, fontSize: 32, color: INK, fontFamily: SATOSHI }}>{c.name}</div>
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
  const frame = useCurrentFrame();
  const evWins = p.verdictRip;
  // The two values CHARGE IN from opposite sides and clash in the middle; the winner keeps a glow +
  // a soft pulse so the eye lands on it. Far more dynamic than two static rows of numbers.
  const sealedIn = interpolate(frame, [8, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const evIn = interpolate(frame, [36, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const pulse = 1 + Math.sin(frame / 11) * 0.018 * interpolate(frame, [60, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const row = (label: string, value: string, win: boolean, prog: number, fromLeft: boolean, delay: number) => (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", opacity: prog, transform: `translateX(${(1 - prog) * (fromLeft ? -680 : 680)}px) scale(${win ? pulse : 1})` }}>
      {win ? <GlowBurst delay={delay + 4} color={evWins ? "rgba(34,211,238,0.5)" : "rgba(245,158,11,0.5)"} size="-55%" /> : null}
      <div style={{ fontSize: 34, letterSpacing: 2, color: win ? INK : MUTE, fontFamily: CLASH, textTransform: "uppercase" }}>{label}</div>
      <MoneyCount value={value} delay={delay} dur={24} size={win ? 188 : 126} holo={win} style={win ? {} : { color: MUTE }} />
    </div>
  );
  return (
    <Stage glowY={40}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32 }}>
        <Rise delay={2}>
          <Kicker style={{ fontSize: 28 }}>The math</Kicker>
        </Rise>
        {row("Sealed price", p.sealed, !evWins, sealedIn, true, 12)}
        <div style={{ position: "relative", fontSize: 50, color: MUTE, fontFamily: CLASH, fontWeight: 700 }}>
          <GlowBurst delay={34} color="rgba(233,75,208,0.65)" size="-130%" />
          vs
        </div>
        {row("If you rip it", p.openEv, evWins, evIn, false, 40)}
        <Rise delay={66} style={{ marginTop: 12 }}>
          <div style={{ fontSize: 40, color: evWins ? "#34D399" : "#F59E0B", fontFamily: CLASH, fontWeight: 700 }}>
            {evWins ? `▲  +${p.gap} in your favour` : `▼  ${p.gap} lost on average`}
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
  const flash = interpolate(frame, [4, 12, 30], [0, 0.62, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const words = splitLines(p.verdictWord);
  const reason = splitLines(p.reason);
  return (
    <Stage glowY={46}>
      <AbsoluteFill style={{ background: grad, opacity: flash }} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80, textAlign: "center" }}>
        <Rise delay={2}>
          <Kicker style={{ fontSize: 30 }}>The verdict</Kicker>
        </Rise>
        <div style={{ position: "relative", transform: `scale(${0.6 + pop * 0.4})`, marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <GlowBurst delay={6} color={p.verdictRip ? "rgba(52,211,153,0.7)" : "rgba(245,158,11,0.7)"} size="-60%" />
          <SparkBurst delay={10} count={20} spread={460} />
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
