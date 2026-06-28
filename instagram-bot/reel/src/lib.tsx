// Shared motion primitives for the @pokeev.tcg Reels. Every theme is built from these so the
// three Reels share one motion language: holo accents, springy rises, a living background.
import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { BG, CLASH, GLOW, HOLO, HOLO_ANGLE, INK, MUTE, SATOSHI, cardGlow, holoText } from "./brand";

// Signature easing — a soft, confident easeOut (expo-ish) used for every entrance.
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

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
export const usePop = (delay = 0, damping = 14): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.7, stiffness: 120 } });
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

/** The dark-holo stage: base background, a slowly drifting holo glow, a vignette, and a
 *  faint film grain. Every scene sits on this so the Reel feels alive, never flat. */
export const Stage: React.FC<{ children: React.ReactNode; glowX?: number; glowY?: number }> = ({
  children,
  glowX = 50,
  glowY = 42,
}) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 38) * 5;
  const pulse = 0.85 + Math.sin(frame / 26) * 0.15;
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: SATOSHI, color: INK }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${glowX + drift}% ${glowY}%, rgba(139,92,246,${0.42 * pulse}), rgba(34,211,238,${0.12 * pulse}) 38%, rgba(11,14,20,0) 66%)`,
        }}
      />
      <Grain />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 80% at 50% 50%, rgba(11,14,20,0) 55%, rgba(11,14,20,0.55) 100%)",
        }}
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

/** A thin holo bar — brand divider. */
export const HoloBar: React.FC<{ w?: number; h?: number; style?: React.CSSProperties }> = ({
  w = 150,
  h = 8,
  style,
}) => <div style={{ width: w, height: h, borderRadius: 999, backgroundImage: HOLO, ...style }} />;

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

/** Card art with the brand holo edge-glow, a thin holo frame, and rounded corners. */
export const CardArt: React.FC<{
  src: string;
  w: number;
  style?: React.CSSProperties;
  frame?: boolean;
}> = ({ src, w, style, frame = true }) => {
  const h = Math.round(w * 1.395);
  return (
    <div style={{ display: "flex", position: "relative", width: w, height: h, ...style }}>
      {frame ? (
        <div
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: 22,
            backgroundImage: HOLO,
            opacity: 0.9,
            filter: "blur(0.5px)",
          }}
        />
      ) : null}
      <Img
        src={src}
        style={{
          position: "relative",
          width: w,
          height: h,
          objectFit: "contain",
          borderRadius: 18,
          boxShadow: cardGlow,
        }}
      />
    </div>
  );
};

/** Progress dots at the bottom (which beat of the story we're on). */
export const ProgressDots: React.FC<{ total: number; step: number }> = ({ total, step }) => (
  <div
    style={{
      position: "absolute",
      bottom: 70,
      left: 0,
      width: "100%",
      display: "flex",
      justifyContent: "center",
      gap: 12,
    }}
  >
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
  return (
    <Img
      src={src}
      style={{
        position: "absolute",
        top: 84,
        right: 84,
        height: 60,
        objectFit: "contain",
        opacity: p * 0.92,
      }}
    />
  );
};

/** Pull a number out of a formatted money string ("$1,234" → 1234) for count-up animations. */
export const numFrom = (s: string): number => Number((s || "").replace(/[^0-9.]/g, "")) || 0;

/** A money value that counts up to its target, then holds. Keeps the "$" and the brand font. */
export const MoneyCount: React.FC<{
  value: string;
  delay?: number;
  dur?: number;
  size?: number;
  holo?: boolean;
  style?: React.CSSProperties;
}> = ({ value, delay = 0, dur = 26, size = 150, holo = true, style }) => {
  const frame = useCurrentFrame();
  const target = numFrom(value);
  const prefix = value.trim().startsWith("€") ? "€" : "$";
  const p = interpolate(frame - delay, [0, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const n = Math.round(target * p);
  return (
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
  );
};

/** The shared closing CTA — same sign-off on every Reel, every theme. */
export const Outro: React.FC<{ logo?: string | null }> = ({ logo }) => {
  const pop = usePop(2, 12);
  return (
    <Stage glowY={48}>
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", padding: 90, textAlign: "center" }}
      >
        <Rise delay={2}>
          <Kicker style={{ fontSize: 34, letterSpacing: 5 }}>POKÉ EV</Kicker>
        </Rise>
        <div style={{ transform: `scale(${0.9 + pop * 0.1})`, marginTop: 26, display: "flex" }}>
          <Display size={104} holo style={{ textAlign: "center", display: "block" }}>
            Know before
            <br />
            you rip.
          </Display>
        </div>
        <Rise delay={16} style={{ flexDirection: "column", alignItems: "center", marginTop: 40 }}>
          <div style={{ fontSize: 40, color: INK, fontFamily: SATOSHI }}>
            Live Expected Value on every sealed set.
          </div>
          <HoloBar w={180} style={{ marginTop: 34 }} />
          <div style={{ marginTop: 34, fontSize: 46, fontFamily: CLASH, color: INK }}>pokeev.com</div>
          <div style={{ marginTop: 10, fontSize: 34, color: MUTE }}>@pokeev.tcg · link in bio</div>
        </Rise>
      </AbsoluteFill>
    </Stage>
  );
};

export { BG, CLASH, GLOW, HOLO, HOLO_ANGLE, INK, MUTE, SATOSHI, cardGlow, holoText };
