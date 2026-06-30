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
export const R_TEMPT = 160;
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

// Jagged tear line at ~36% height — the two clip-paths share this zigzag so the halves split cleanly.
const TOP_CLIP = "polygon(0% 0%, 100% 0%, 100% 33%, 88% 39%, 76% 32%, 64% 39%, 52% 32%, 40% 39%, 28% 32%, 16% 39%, 0% 33%)";
const BOT_CLIP = "polygon(0% 33%, 16% 39%, 28% 32%, 40% 39%, 52% 32%, 64% 39%, 76% 32%, 88% 39%, 100% 33%, 100% 100%, 0% 100%)";

const Tempt: React.FC<{ p: RipKeepProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const n = p.chase.length;
  const cw = Math.min(384, Math.floor((1004 - (n - 1) * 16) / n));
  const CARD_GAP = 16;
  const hasRip = !!p.booster;
  const PACK_CY = 900; // booster centre
  const SEAM_Y = 812; // the tear line (where cards burst from)
  const ROW_CY = 956; // settled card-row centre
  // RIP beats: pack drops in → anticipation shake → TEAR (top peels up + flash + sparks) → cards
  // burst from the seam and settle into the row → title/logo fade in → torn halves fall away.
  const drop = hasRip ? interpolate(frame, [0, 16], [-300, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }) : 0;
  const shake = hasRip ? Math.sin(frame / 1.5) * Math.max(0, 7 - Math.abs(frame - 33) * 0.9) : 0;
  const rip = hasRip ? interpolate(frame, [40, 62], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }) : 1;
  const packFade = hasRip ? interpolate(frame, [74, 102], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const cardStart = hasRip ? 52 : 6;
  const logoP = usePop(hasRip ? 96 : 2, 13);
  return (
    <Stage glowY={42}>
      {/* set LOGO + title — fade in AFTER the pack is ripped open */}
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", paddingTop: 116, pointerEvents: "none" }}>
        {p.setLogo ? (
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", opacity: logoP, transform: `translateY(${(1 - logoP) * -20}px) scale(${0.9 + logoP * 0.1})` }}>
            <div style={{ position: "absolute", inset: "-28px -26px", background: "radial-gradient(ellipse, rgba(124,92,246,0.30), transparent 72%)" }} />
            <Img src={p.setLogo} style={{ height: 138, objectFit: "contain", filter: "drop-shadow(0 8px 22px rgba(0,0,0,0.8))" }} />
          </div>
        ) : null}
        <Rise delay={hasRip ? 100 : 4} style={{ marginTop: 16 }}>
          <Display size={74} holo style={{ textAlign: "center", maxWidth: 960, display: "block" }}>You're chasing these</Display>
        </Rise>
      </AbsoluteFill>

      {/* the booster pack that RIPS open */}
      {hasRip ? (
        <>
          <div style={{ position: "absolute", left: "50%", top: PACK_CY, transform: `translate(-50%, -50%) translateY(${drop}px) translateX(${shake}px)`, opacity: frame < 74 ? 1 : packFade }}>
            <Img src={p.booster as string} style={{ height: 560, objectFit: "contain", clipPath: BOT_CLIP, filter: "drop-shadow(0 24px 62px rgba(0,0,0,0.75))" }} />
          </div>
          <div style={{ position: "absolute", left: "50%", top: PACK_CY, transform: `translate(-50%, -50%) translateY(${drop}px) translateX(${shake}px) translateY(${rip * -300}px) rotate(${rip * -18}deg)`, opacity: frame < 74 ? 1 : packFade }}>
            <Img src={p.booster as string} style={{ height: 560, objectFit: "contain", clipPath: TOP_CLIP, filter: "drop-shadow(0 24px 62px rgba(0,0,0,0.75))" }} />
          </div>
          <div style={{ position: "absolute", left: "50%", top: SEAM_Y, width: 1, height: 1, transform: "translate(-50%,-50%)" }}>
            <GlowBurst delay={42} color="rgba(255,255,255,0.9)" size="-1600%" />
            <SparkBurst delay={46} count={22} spread={460} />
          </div>
        </>
      ) : null}

      {/* the chase cards — burst from the seam and settle into the row */}
      <div style={{ position: "absolute", left: 0, width: "100%", top: 0, height: "100%", perspective: 1500 }}>
        {p.chase.map((c, i) => {
          const t = i - (n - 1) / 2;
          const s = usePop(cardStart + i * 6, 13);
          const inv = 1 - s;
          const finalX = t * (cw + CARD_GAP);
          const x = finalX * s; // spread out from centre as it emerges
          const y = ROW_CY + (SEAM_Y - ROW_CY) * inv; // rise from the seam to the row
          const flip = i % 2 === 0 ? 1 : -1;
          const entry = `translateZ(${inv * -360}px) rotateY(${inv * flip * 44}deg) rotateX(${inv * 26}deg)`;
          return (
            <div key={i} style={{ position: "absolute", left: "50%", top: 0, transformOrigin: "center center", filter: `blur(${inv * 2.4}px)`, transform: `translate(-50%, -50%) translateX(${x}px) translateY(${y}px) ${entry} scale(${0.5 + s * 0.5})`, opacity: interpolate(s, [0, 0.22], [0, 1]) }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <CardArt src={c.image} w={cw} />
              <div style={{ marginTop: 18, fontSize: 32, color: INK, fontFamily: SATOSHI }}>{c.name}</div>
              <div style={{ marginTop: 2, fontSize: 52, fontFamily: CLASH, ...holoText() }}>{c.price}</div>
            </div>
            </div>
          );
        })}
      </div>
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
      {/* THREE boosters of this set, fanned at the TOP in full UHD (visible — NOT a dark backdrop),
          then the math sits below them. */}
      {p.booster ? (
        <div style={{ position: "absolute", top: 92, left: 0, width: "100%", height: 470, display: "flex", justifyContent: "center", perspective: 1400 }}>
          {[-1, 0, 1].map((k, i) => {
            const pop = usePop(4 + i * 5, 13);
            const inv = 1 - pop;
            return (
              <div key={k} style={{ position: "absolute", transformOrigin: "top center", filter: `blur(${inv * 2.4}px)`, transform: `translateX(${k * 156}px) translateY(${inv * -130}px) rotate(${k * 12}deg) scale(${0.8 + pop * 0.2})`, opacity: interpolate(pop, [0, 0.3], [0, 1]) }}>
                <Img src={p.booster as string} style={{ height: 436, objectFit: "contain", borderRadius: 12, filter: "drop-shadow(0 26px 64px rgba(0,0,0,0.72))" }} />
              </div>
            );
          })}
        </div>
      ) : null}
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30, paddingTop: 470 }}>
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
