// T2 · RIP OR KEEP — a sealed set's price vs its expected open value, ending on a verdict.
// Beats: HOOK (the dilemma) → TEMPT (the chase cards) → FACE-OFF (sealed $ vs EV $, counting)
// → VERDICT (RIP IT / KEEP IT) → CTA.
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import type { RipKeepProps } from "../props";
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

export const R_FADE = 12;
export const R_HOOK = 78;
export const R_TEMPT = 76;
export const R_FACE = 100;
export const R_VERDICT = 100;
export const R_OUTRO = 80;

export const ripkeepFrames = (): number =>
  R_HOOK + R_TEMPT + R_FACE + R_VERDICT + R_OUTRO - R_FADE * 4;

const RIP = "linear-gradient(116deg, #34D399 0%, #22D3EE 60%, #8B5CF6 100%)";
const KEEP = "linear-gradient(116deg, #F59E0B 0%, #E94BD0 60%, #8B5CF6 100%)";

const Hook: React.FC<{ p: RipKeepProps }> = ({ p }) => {
  const n = p.chase.length;
  return (
    <Stage glowY={40}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ padding: 90, flexDirection: "column", justifyContent: "center" }}>
        <Rise delay={2}>
          <Kicker>The collector's dilemma</Kicker>
        </Rise>
        <Rise delay={8} style={{ marginTop: 24 }}>
          <Display size={150} holo>
            Rip
          </Display>
        </Rise>
        <Rise delay={12} style={{ alignItems: "center", gap: 26 }}>
          <Display size={150}>or keep?</Display>
        </Rise>
        <Rise delay={20}>
          <HoloBar w={210} style={{ marginTop: 30 }} />
        </Rise>
        <Rise delay={26} style={{ marginTop: 34 }}>
          <div style={{ fontSize: 46, color: MUTE, fontFamily: SATOSHI, lineHeight: 1.3 }}>
            A sealed {p.setName} ETB costs {p.sealed}. Open it, or keep it sealed?
          </div>
        </Rise>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 64 }}>
          {p.chase.map((c, i) => {
            const pop = usePop(30 + i * 5, 16);
            const rot = (i - (n - 1) / 2) * 7;
            return (
              <div
                key={i}
                style={{
                  transform: `translateY(${(1 - pop) * 120}px) rotate(${rot * pop}deg)`,
                  opacity: pop,
                  display: "flex",
                }}
              >
                <CardArt src={c.image} w={Math.min(210, 720 / n)} />
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
            const pop = usePop(8 + i * 7, 14);
            const big = i === 1 && n >= 3;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  transform: `translateY(${(1 - pop) * 90}px) scale(${0.9 + pop * 0.1})`,
                  opacity: pop,
                }}
              >
                <CardArt src={c.image} w={big ? 360 : 300} />
                <div style={{ marginTop: 22, fontSize: 34, color: INK, fontFamily: SATOSHI }}>{c.name}</div>
                <div style={{ marginTop: 4, fontSize: 52, fontFamily: CLASH, ...holoText() }}>{c.price}</div>
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
      <div style={{ fontSize: 34, letterSpacing: 2, color: win ? INK : MUTE, fontFamily: CLASH, textTransform: "uppercase" }}>
        {label}
      </div>
      <MoneyCount
        value={value}
        delay={delay + 4}
        dur={28}
        size={win ? 168 : 132}
        holo={win}
        style={win ? {} : { color: MUTE }}
      />
    </Rise>
  );
  return (
    <Stage glowY={40}>
      <SetLogo src={p.setLogo} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
        <Rise delay={2}>
          <Kicker style={{ fontSize: 28 }}>The math</Kicker>
        </Rise>
        {row("Sealed price", p.sealed, !evWins, 8)}
        <div style={{ fontSize: 40, color: MUTE, fontFamily: CLASH }}>vs</div>
        {row("If you rip it", p.openEv, evWins, 20)}
        <Rise delay={40} style={{ marginTop: 18 }}>
          <div style={{ fontSize: 36, color: MUTE }}>
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
  const pop = usePop(4, 11);
  const grad = p.verdictRip ? RIP : KEEP;
  const flash = interpolate(frame, [0, 8, 16], [0, 0.5, 0], { extrapolateRight: "clamp" });
  const words = splitLines(p.verdictWord);
  const reason = splitLines(p.reason);
  return (
    <Stage glowY={46}>
      <AbsoluteFill style={{ background: grad, opacity: flash }} />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80, textAlign: "center" }}>
        <Rise delay={2}>
          <Kicker style={{ fontSize: 30 }}>The verdict</Kicker>
        </Rise>
        <div style={{ transform: `scale(${0.7 + pop * 0.3})`, marginTop: 26, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {words.map((w, i) => (
            <div
              key={i}
              style={{
                fontFamily: CLASH,
                fontWeight: 700,
                fontSize: 168,
                lineHeight: 0.96,
                letterSpacing: -3,
                color: "transparent",
                backgroundImage: grad,
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
              }}
            >
              {w}
            </div>
          ))}
        </div>
        <Rise delay={20} style={{ flexDirection: "column", alignItems: "center", marginTop: 44 }}>
          {reason.map((line, i) => (
            <div key={i} style={{ fontSize: 44, color: INK, fontFamily: SATOSHI, lineHeight: 1.3 }}>
              {line}
            </div>
          ))}
        </Rise>
      </AbsoluteFill>
      <ProgressDots total={4} step={3} />
    </Stage>
  );
};

export const RipKeep: React.FC<{ data: RipKeepProps }> = ({ data }) => {
  const t = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: R_FADE })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={R_HOOK}>
        <Hook p={data} />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence durationInFrames={R_TEMPT}>
        <Tempt p={data} />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence durationInFrames={R_FACE}>
        <FaceOff p={data} />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence durationInFrames={R_VERDICT}>
        <Verdict p={data} />
      </TransitionSeries.Sequence>
      {t}
      <TransitionSeries.Sequence durationInFrames={R_OUTRO}>
        <Outro logo={data.setLogo} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
