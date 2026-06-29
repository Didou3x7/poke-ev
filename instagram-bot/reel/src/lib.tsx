// Retention-grade motion primitives for the @pokeev.tcg Reels. Every theme is built from these
// so the three Reels share one premium motion language: holo accents, springy slam-ins, ultra
// card zooms with a shine sweep, animated title reveals, living particle background.
import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { BG, CLASH, GLOW, HOLO, HOLO_ANGLE, INK, MUTE, SATOSHI, cardGlow, holoText } from "./brand";

const CARD_ASPECT = 1.395; // card height / width

// Signature easing — a soft, confident easeOut (expo-ish) used for every entrance.
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/** 0→1 entrance progress, eased and clamped, offset by `delay` frames. */
export const useEnter = (delay = 0, dur = 16): number => {
  const frame = useCurrentFrame();
  return interpolate(frame - delay, [0, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
};

/** A springy 0→1 value for a tactile pop (cards landing, numbers snapping). */
export const usePop = (delay = 0, damping = 13, stiffness = 120): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.8, stiffness } });
};

/** Fade + rise children in. The workhorse for staggered copy. */
export const Rise: React.FC<{
  delay?: number;
  dur?: number;
  y?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, dur = 16, y = 56, children, style }) => {
  const p = useEnter(delay, dur);
  return (
    <div style={{ display: "flex", opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>
      {children}
    </div>
  );
};

/** Drifting holo sparkle particles — gives the dark stage life and energy. Deterministic
 *  (Remotion `random`) so it never flickers between renders. */
export const Sparkles: React.FC<{ count?: number }> = ({ count = 22 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({ length: count }).map((_, i) => {
        const x = random(`x${i}`) * 1080;
        const baseY = random(`y${i}`) * 1920;
        const speed = 0.4 + random(`s${i}`) * 1.1;
        const y = ((baseY - frame * speed * 2) % 1920 + 1920) % 1920;
        const size = 2 + random(`z${i}`) * 5;
        const tw = 0.25 + 0.75 * Math.abs(Math.sin((frame + i * 23) / 16));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: "#dbeafe",
              opacity: tw * 0.5,
              boxShadow: "0 0 8px rgba(139,92,246,0.9)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** An expanding radial flash — punctuates an impact (card slam, price reveal, verdict). */
export const GlowBurst: React.FC<{ delay?: number; color?: string; size?: string }> = ({
  delay = 0,
  color = "rgba(139,92,246,0.65)",
  size = "-45%",
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const op = interpolate(frame - delay, [0, 7, 26], [0, 0.95, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        inset: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color}, transparent 62%)`,
        transform: `scale(${0.35 + p * 1.2})`,
        opacity: op,
      }}
    />
  );
};

/** The dark-holo stage: base, a slowly drifting holo aura, sparkles, a film grain, a vignette.
 *  Every scene sits on this so the Reel feels alive, never flat. */
export const Stage: React.FC<{ children: React.ReactNode; glowX?: number; glowY?: number; sparkle?: boolean }> = ({
  children,
  glowX = 50,
  glowY = 42,
  sparkle = true,
}) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 36) * 6;
  const drift2 = Math.cos(frame / 48) * 5;
  const pulse = 0.85 + Math.sin(frame / 24) * 0.15;
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: SATOSHI, color: INK }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${glowX + drift}% ${glowY + drift2}%, rgba(139,92,246,${0.46 * pulse}), rgba(34,211,238,${0.13 * pulse}) 38%, rgba(11,14,20,0) 66%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${30 - drift}% ${78 + drift2}%, rgba(233,75,208,0.18), rgba(11,14,20,0) 50%)`,
        }}
      />
      {sparkle ? <Sparkles /> : null}
      <Grain />
      <AbsoluteFill
        style={{ background: "radial-gradient(125% 80% at 50% 50%, rgba(11,14,20,0) 52%, rgba(11,14,20,0.6) 100%)" }}
      />
      {children}
    </AbsoluteFill>
  );
};

/** Subtle animated film grain (keeps gradients from banding, adds texture). */
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: 0.05, mixBlendMode: "overlay" }}>
      <svg width="100%" height="100%">
        <filter id="g">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 10} />
        </filter>
        <rect width="100%" height="100%" filter="url(#g)" />
      </svg>
    </AbsoluteFill>
  );
};

/** A thin holo bar — brand divider, optionally growing in. */
export const HoloBar: React.FC<{ w?: number; h?: number; delay?: number; style?: React.CSSProperties }> = ({
  w = 150,
  h = 8,
  delay,
  style,
}) => {
  const frame = useCurrentFrame();
  const grow = delay == null ? 1 : interpolate(frame - delay, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  return <div style={{ width: w * grow, height: h, borderRadius: 999, backgroundImage: HOLO, ...style }} />;
};

/** Small ALL-CAPS holo kicker label. */
export const Kicker: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      display: "flex",
      fontFamily: CLASH,
      fontSize: 30,
      letterSpacing: 3,
      textTransform: "uppercase",
      ...holoText(116),
      ...style,
    }}
  >
    {children}
  </div>
);

/** Big display text in Clash. `holo` clips the gradient to the glyphs. */
export const Display: React.FC<{
  children: React.ReactNode;
  size?: number;
  holo?: boolean;
  style?: React.CSSProperties;
}> = ({ children, size = 96, holo, style }) => (
  <div
    style={{
      display: "flex",
      fontFamily: CLASH,
      fontWeight: 700,
      fontSize: size,
      lineHeight: 1.04,
      letterSpacing: -1.5,
      color: INK,
      ...(holo ? holoText(116) : {}),
      ...style,
    }}
  >
    {children}
  </div>
);

/** Animated title — each WORD slides up out of a blur and fades in, staggered, with an optional
 *  holo shine that sweeps across once it lands. The signature "title appears with wow" effect. */
export const TitleReveal: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  holo?: boolean;
  stagger?: number;
  align?: "flex-start" | "center";
  style?: React.CSSProperties;
}> = ({ text, delay = 0, size = 110, holo = false, stagger = 4, align = "flex-start", style }) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align,
        rowGap: 4,
        columnGap: "0.26em",
        fontFamily: CLASH,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.0,
        letterSpacing: -1.5,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const d = delay + i * stagger;
        const p = interpolate(frame - d, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
        const shine = interpolate(frame - d, [10, 34], [-1, 2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <span key={i} style={{ position: "relative", display: "inline-block", overflow: "hidden", paddingBottom: "0.06em" }}>
            <span
              style={{
                display: "inline-block",
                opacity: p,
                transform: `translateY(${(1 - p) * 0.55 * size}px)`,
                filter: `blur(${(1 - p) * 12}px)`,
                ...(holo ? holoText() : { color: INK }),
              }}
            >
              {w}
            </span>
            <span
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${shine * 100}%`,
                width: "55%",
                background: "linear-gradient(105deg, transparent, rgba(255,255,255,0.55), transparent)",
                transform: "skewX(-18deg)",
                opacity: shine > -0.5 && shine < 1.5 ? 1 : 0,
              }}
            />
          </span>
        );
      })}
    </div>
  );
};

/** Card art with the brand holo edge-glow, a thin holo frame, and rounded corners. */
export const CardArt: React.FC<{
  src: string;
  w: number;
  style?: React.CSSProperties;
  frame?: boolean;
}> = ({ src, w, style, frame = true }) => {
  const h = Math.round(w * CARD_ASPECT);
  return (
    <div style={{ display: "flex", position: "relative", width: w, height: h, ...style }}>
      {frame ? (
        <div style={{ position: "absolute", inset: -6, borderRadius: 22, backgroundImage: HOLO, opacity: 0.9, filter: "blur(0.5px)" }} />
      ) : null}
      <Img src={src} style={{ position: "relative", width: w, height: h, objectFit: "contain", borderRadius: 18, boxShadow: cardGlow }} />
    </div>
  );
};

/** THE hero card moment: a glow burst fires, the card slams in from a big scale with spring
 *  overshoot, a specular shine sweeps across it, then it holds on a slow Ken Burns push. This is
 *  the "ultra zoom on the card" the brand leans on. */
export const CardHero: React.FC<{ src: string; w?: number; delay?: number; kenTo?: number }> = ({
  src,
  w = 600,
  delay = 0,
  kenTo = 1.06,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 13, mass: 0.85, stiffness: 145 } });
  const scale = interpolate(s, [0, 1], [1.5, 1.0]);
  const ken = interpolate(frame - delay, [6, 110], [1.0, kenTo], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const shine = interpolate(frame - delay, [12, 46], [-1.2, 1.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const h = Math.round(w * CARD_ASPECT);
  return (
    <div style={{ position: "relative", width: w, height: h, display: "flex", transform: `scale(${scale * ken})`, opacity: interpolate(s, [0, 0.35], [0, 1]) }}>
      <GlowBurst delay={delay} size="-55%" />
      <div style={{ position: "absolute", inset: -7, borderRadius: 24, backgroundImage: HOLO, filter: "blur(1px)" }} />
      <Img src={src} style={{ position: "relative", width: w, height: h, objectFit: "contain", borderRadius: 18, boxShadow: cardGlow }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${shine * 100}%`,
            width: "60%",
            background: "linear-gradient(105deg, transparent, rgba(255,255,255,0.5), transparent)",
            transform: "skewX(-18deg)",
          }}
        />
      </div>
    </div>
  );
};

// Instagram's Reels UI overlays the bottom ~14% (caption, account, audio) and the right ~12%
// (action buttons), so nothing essential goes there. Keep key copy inside the central band.
export const SAFE_BOTTOM = 250;

/** Progress dots, lifted above IG's bottom UI safe-zone (which beat of the story we're on). */
export const ProgressDots: React.FC<{ total: number; step: number }> = ({ total, step }) => (
  <div style={{ position: "absolute", bottom: SAFE_BOTTOM, left: 0, width: "100%", display: "flex", justifyContent: "center", gap: 12 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        style={{
          width: i === step ? 44 : 14,
          height: 14,
          borderRadius: 999,
          ...(i <= step ? { backgroundImage: HOLO } : { background: "#222a36" }),
        }}
      />
    ))}
  </div>
);

/** Top-right set logo (matches the carousel header), faded in. */
export const SetLogo: React.FC<{ src: string | null }> = ({ src }) => {
  const p = useEnter(4, 14);
  if (!src) return null;
  return <Img src={src} style={{ position: "absolute", top: 84, right: 84, height: 60, objectFit: "contain", opacity: p * 0.92 }} />;
};

/** Pull a number out of a formatted money string ("$1,234" → 1234) for count-up animations. */
export const numFrom = (s: string): number => Number((s || "").replace(/[^0-9.]/g, "")) || 0;

/** A money value that counts up to its target then SNAPS with a spring punch + glow on landing. */
export const MoneyCount: React.FC<{
  value: string;
  delay?: number;
  dur?: number;
  size?: number;
  holo?: boolean;
  style?: React.CSSProperties;
}> = ({ value, delay = 0, dur = 26, size = 150, holo = true, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const target = numFrom(value);
  const prefix = value.trim().startsWith("€") ? "€" : "$";
  const p = interpolate(frame - delay, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const n = Math.round(target * p);
  const punch = spring({ frame: frame - (delay + dur), fps, config: { damping: 9, mass: 0.6, stiffness: 160 } });
  const scale = 1 + interpolate(punch, [0, 1], [0.18, 0]);
  return (
    <div style={{ position: "relative", display: "flex", transform: `scale(${scale})` }}>
      {p >= 1 ? <GlowBurst delay={delay + dur} color="rgba(34,211,238,0.5)" /> : null}
      <div
        style={{
          display: "flex",
          fontFamily: CLASH,
          fontWeight: 700,
          fontSize: size,
          letterSpacing: -2,
          ...(holo ? holoText(116) : { color: INK }),
          ...style,
        }}
      >
        {prefix}
        {n.toLocaleString("en-US")}
      </div>
    </div>
  );
};

/** The shared closing CTA — same sign-off on every Reel, every theme. */
export const Outro: React.FC<{ logo?: string | null }> = ({ logo }) => {
  const pop = usePop(2, 11);
  return (
    <Stage glowY={48}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90, textAlign: "center" }}>
        <Rise delay={2}>
          <Kicker style={{ fontSize: 34, letterSpacing: 5 }}>POKÉ EV</Kicker>
        </Rise>
        <div style={{ transform: `scale(${0.88 + pop * 0.12})`, marginTop: 26, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <GlowBurst delay={4} />
          <TitleReveal text="Know before you rip." delay={6} size={104} holo align="center" style={{ justifyContent: "center", maxWidth: 760 }} />
        </div>
        <Rise delay={22} style={{ flexDirection: "column", alignItems: "center", marginTop: 40 }}>
          <div style={{ fontSize: 40, color: INK, fontFamily: SATOSHI }}>Live Expected Value on every sealed set.</div>
          <HoloBar w={180} delay={26} style={{ marginTop: 34 }} />
          <div style={{ marginTop: 34, fontSize: 46, fontFamily: CLASH, color: INK }}>pokeev.com</div>
          <div style={{ marginTop: 10, fontSize: 34, color: MUTE }}>@pokeev.tcg · link in bio</div>
        </Rise>
      </AbsoluteFill>
    </Stage>
  );
};

export { BG, CLASH, GLOW, HOLO, HOLO_ANGLE, INK, MUTE, SATOSHI, cardGlow, holoText };
