// Retention-grade motion primitives for the @pokeev.tcg Reels — v2, card-forward and boxless.
// Principles: cards DOMINATE the frame in max HD; never force an aspect (height:auto, so a card
// never squishes); glow is a soft drop-shadow, never a hard rectangle; text effects are clipped
// to the GLYPHS, never a box; transitions are clean crossfades, never slides.
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

// Signature easing — a soft, confident easeOut (expo-ish) used for every entrance.
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

// Instagram's Reels UI overlays the bottom ~14% (caption, account, audio) and the right ~12%
// (action buttons), so nothing essential goes there. Keep key copy inside the central band.
export const SAFE_BOTTOM = 250;

// Soft, boxless glow under a card (a drop-shadow, so it follows the card's rounded rect with no
// hard edge — never a visible rectangle around the art).
const CARD_GLOW = "drop-shadow(0 38px 80px rgba(0,0,0,0.85)) drop-shadow(0 0 70px rgba(124,92,246,0.5))";

/** 0→1 entrance progress, eased and clamped, offset by `delay` frames. */
export const useEnter = (delay = 0, dur = 16): number => {
  const frame = useCurrentFrame();
  return interpolate(frame - delay, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
};

/** A springy 0→1 value for a tactile pop (cards landing, numbers snapping). */
export const usePop = (delay = 0, damping = 13, stiffness = 130): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.85, stiffness } });
};

/** Fade + rise children in. The workhorse for staggered copy. */
export const Rise: React.FC<{ delay?: number; dur?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  dur = 16,
  y = 52,
  children,
  style,
}) => {
  const p = useEnter(delay, dur);
  return <div style={{ display: "flex", opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>{children}</div>;
};

/** Drifting holo sparkle particles — subtle life on the dark stage. Deterministic. */
export const Sparkles: React.FC<{ count?: number }> = ({ count = 16 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({ length: count }).map((_, i) => {
        const x = random(`x${i}`) * 1080;
        const baseY = random(`y${i}`) * 1920;
        const speed = 0.4 + random(`s${i}`) * 1.0;
        const y = (((baseY - frame * speed * 2) % 1920) + 1920) % 1920;
        const size = 2 + random(`z${i}`) * 4;
        const tw = 0.25 + 0.75 * Math.abs(Math.sin((frame + i * 23) / 16));
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: size, height: size, borderRadius: "50%", background: "#dbeafe", opacity: tw * 0.4, boxShadow: "0 0 8px rgba(124,92,246,0.9)" }} />;
      })}
    </AbsoluteFill>
  );
};

/** An expanding radial flash — punctuates an impact. Soft (radial gradient), never a box. */
export const GlowBurst: React.FC<{ delay?: number; color?: string; size?: string }> = ({ delay = 0, color = "rgba(124,92,246,0.6)", size = "-45%" }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const op = interpolate(frame - delay, [0, 7, 26], [0, 0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ position: "absolute", inset: size, borderRadius: "50%", background: `radial-gradient(circle, ${color}, transparent 62%)`, transform: `scale(${0.35 + p * 1.2})`, opacity: op, pointerEvents: "none" }} />;
};

/** An expanding stroked RING that bursts outward on impact — punches a card landing. */
export const ImpactRing: React.FC<{ delay?: number; color?: string; radius?: number }> = ({ delay = 0, color = "rgba(150,120,255,0.95)", radius = 30 }) => {
  const frame = useCurrentFrame();
  const t = frame - delay;
  if (t < 0 || t > 30) return null;
  const p = interpolate(t, [0, 28], [0, 1], { easing: EASE });
  const op = interpolate(t, [0, 5, 28], [0, 0.85, 0]);
  return <div style={{ position: "absolute", inset: "6%", borderRadius: radius, border: "4px solid", borderColor: color, transform: `scale(${0.66 + p * 1.7})`, opacity: op, pointerEvents: "none" }} />;
};

/** A burst of holo sparks flung outward from the centre on impact — energy on a card landing. */
export const SparkBurst: React.FC<{ delay?: number; count?: number; spread?: number }> = ({ delay = 0, count = 14, spread = 260 }) => {
  const frame = useCurrentFrame();
  const t = frame - delay;
  if (t < 0 || t > 32) return null;
  const p = interpolate(t, [0, 32], [0, 1], { easing: EASE });
  const op = interpolate(t, [0, 6, 32], [0, 1, 0]);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const ang = (i / count) * Math.PI * 2 + random(`sa${i}`) * 0.6;
        const dist = (spread * 0.5 + random(`sd${i}`) * spread) * p;
        const sz = 4 + random(`ss${i}`) * 7;
        return <div key={i} style={{ position: "absolute", left: "50%", top: "50%", width: sz, height: sz, borderRadius: "50%", background: i % 2 ? "#a78bfa" : "#67e8f9", transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px)`, opacity: op, boxShadow: "0 0 12px rgba(124,92,246,0.95)" }} />;
      })}
    </div>
  );
};

/** Persistent pokeev.com wordmark — bottom-centre on EVERY scene of every reel (rendered by Stage).
 *  Fades in with its scene and crossfades out at the scene change, like the other text. */
export const BrandMark: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [5, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const rise = (1 - op) * 14;
  return (
    <div style={{ position: "absolute", bottom: 96, left: 0, width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 12, pointerEvents: "none", zIndex: 60, opacity: op, transform: `translateY(${rise}px)` }}>
      <div style={{ width: 8, height: 8, borderRadius: 999, backgroundImage: HOLO }} />
      <div style={{ fontFamily: CLASH, fontWeight: 700, fontSize: 38, letterSpacing: 2, ...holoText(116) }}>pokeev.com</div>
      <div style={{ width: 8, height: 8, borderRadius: 999, backgroundImage: HOLO }} />
    </div>
  );
};

/** The dark-holo stage: base, a slowly drifting holo aura, sparkles, grain, vignette. */
export const Stage: React.FC<{ children: React.ReactNode; glowX?: number; glowY?: number; sparkle?: boolean }> = ({ children, glowX = 50, glowY = 42, sparkle = true }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 36) * 6;
  const drift2 = Math.cos(frame / 48) * 5;
  const pulse = 0.85 + Math.sin(frame / 24) * 0.15;
  return (
    // textWrap:balance cascades to all text so a wrapped phrase never orphans a single word.
    <AbsoluteFill style={{ background: BG, fontFamily: SATOSHI, color: INK, ["textWrap" as "whiteSpace"]: "balance" }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${glowX + drift}% ${glowY + drift2}%, rgba(124,92,246,${0.44 * pulse}), rgba(34,211,238,${0.12 * pulse}) 38%, rgba(11,14,20,0) 66%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${30 - drift}% ${78 + drift2}%, rgba(233,75,208,0.16), rgba(11,14,20,0) 50%)` }} />
      {sparkle ? <Sparkles /> : null}
      <Grain />
      <AbsoluteFill style={{ background: "radial-gradient(125% 80% at 50% 50%, rgba(11,14,20,0) 54%, rgba(11,14,20,0.6) 100%)" }} />
      {children}
      <BrandMark />
    </AbsoluteFill>
  );
};

/** Subtle animated film grain. */
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: 0.045, mixBlendMode: "overlay" }}>
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
export const HoloBar: React.FC<{ w?: number; h?: number; delay?: number; style?: React.CSSProperties }> = ({ w = 150, h = 8, delay, style }) => {
  const frame = useCurrentFrame();
  const grow = delay == null ? 1 : interpolate(frame - delay, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  return <div style={{ width: w * grow, height: h, borderRadius: 999, backgroundImage: HOLO, ...style }} />;
};

/** Small ALL-CAPS holo kicker label. */
export const Kicker: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ display: "flex", fontFamily: CLASH, fontSize: 30, letterSpacing: 3, textTransform: "uppercase", ...holoText(116), ...style }}>{children}</div>
);

/** Big display text in Clash. `holo` clips the gradient to the glyphs. */
export const Display: React.FC<{ children: React.ReactNode; size?: number; holo?: boolean; style?: React.CSSProperties }> = ({ children, size = 96, holo, style }) => (
  <div style={{ display: "flex", fontFamily: CLASH, fontWeight: 700, fontSize: size, lineHeight: 1.04, letterSpacing: -1.5, color: INK, ...(holo ? holoText(116) : {}), ...style }}>{children}</div>
);

/** A bright band that sweeps across the GLYPHS only (background-clip:text), never a box. Layer
 *  this over text for a premium holo shimmer. */
const GlyphShine: React.FC<{ text: string; delay: number; size: number }> = ({ text, delay, size }) => {
  const frame = useCurrentFrame();
  const pos = interpolate(frame - delay, [0, 30], [140, -40], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const vis = frame - delay >= 0 && frame - delay <= 30 ? 1 : 0;
  return (
    <span
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        fontFamily: CLASH,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.0,
        letterSpacing: -1.5,
        color: "transparent",
        backgroundImage: "linear-gradient(100deg, transparent 42%, rgba(255,255,255,0.95) 50%, transparent 58%)",
        backgroundSize: "260% 100%",
        backgroundPosition: `${pos}% 0`,
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        opacity: vis,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
};

/** Break a title into BALANCED lines so a phrase never orphans a single word onto its own line
 *  (e.g. "One sky. Four cards." → "One sky." / "Four cards.", never "...Four" / "cards"). One line
 *  if it fits; otherwise the 2-line split that minimises the longest line; greedy for 3+. */
const splitBalanced = (words: string[], maxChars: number): string[][] => {
  const total = words.join(" ").length;
  if (words.length < 2 || total <= maxChars) return [words];
  if (total <= maxChars * 2) {
    let best = 1;
    let bestCost = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" ").length;
      const b = words.slice(i).join(" ").length;
      const cost = Math.max(a, b);
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    return [words.slice(0, best), words.slice(best)];
  }
  const nLines = Math.ceil(total / maxChars);
  const target = total / nLines;
  const lines: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const w of words) {
    const add = (len ? 1 : 0) + w.length;
    if (cur.length && len + add > target && lines.length < nLines - 1) {
      lines.push(cur);
      cur = [w];
      len = w.length;
    } else {
      cur.push(w);
      len += add;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
};

/** Animated title — each WORD rises out of a blur and fades in, staggered, then a holo shine
 *  sweeps across the GLYPHS (no rectangle). Lines are BALANCED (no orphan word ever). */
export const TitleReveal: React.FC<{ text: string; delay?: number; size?: number; holo?: boolean; stagger?: number; align?: "flex-start" | "center"; shimmer?: boolean; maxWidth?: number; style?: React.CSSProperties }> = ({
  text,
  delay = 0,
  size = 110,
  holo = false,
  stagger = 4,
  align = "flex-start",
  shimmer = true,
  maxWidth = 900,
  style,
}) => {
  const frame = useCurrentFrame();
  const charsPerLine = Math.max(6, Math.floor(maxWidth / (size * 0.55)));
  const lines = splitBalanced(text.split(" "), charsPerLine);
  let wi = 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align, fontFamily: CLASH, fontWeight: 700, fontSize: size, lineHeight: 1.04, letterSpacing: -1.5, ...style }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", flexDirection: "row", columnGap: "0.26em" }}>
          {line.map((w, k) => {
            const d = delay + wi++ * stagger;
            const p = interpolate(frame - d, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
            return (
              <span key={k} style={{ position: "relative", display: "inline-block" }}>
                <span style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 0.5 * size}px)`, filter: `blur(${(1 - p) * 11}px)`, ...(holo ? holoText() : { color: INK }) }}>{w}</span>
                {shimmer ? <GlyphShine text={w} delay={d + 8} size={size} /> : null}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Card art — height:auto so it NEVER squishes, a soft boxless glow, rounded corners. */
export const CardArt: React.FC<{ src: string; w: number; radius?: number; style?: React.CSSProperties }> = ({ src, w, radius = 14, style }) => (
  <Img src={src} style={{ width: w, height: "auto", display: "block", borderRadius: radius, filter: CARD_GLOW, ...style }} />
);

/** A holographic FOIL sheen, clipped to the card's rounded rect, screen-blended so the art reads
 *  like a real holo catching light. `shift` (driven by the card's live tilt) slides the rainbow band
 *  so the foil shimmers as the card moves — the signature "wow" on a Pokémon card. */
export const HoloFoil: React.FC<{ shift: number; radius?: number; intensity?: number }> = ({ shift, radius = 16, intensity = 0.2 }) => (
  <div style={{ position: "absolute", inset: 0, borderRadius: radius, overflow: "hidden", pointerEvents: "none", opacity: intensity, mixBlendMode: "screen" }}>
    <div style={{ position: "absolute", inset: "-45%", background: "linear-gradient(118deg, transparent 18%, rgba(255,90,180,0.85) 34%, rgba(120,220,255,0.85) 50%, rgba(150,255,180,0.85) 62%, rgba(255,205,90,0.85) 74%, transparent 88%)", transform: `translateX(${shift}%)` }} />
  </div>
);

/** THE hero card moment: a spring slam-in from a big scale, a soft holo glow (no rectangle), and
 *  a specular shine that sweeps across the CARD ITSELF (clipped to the card, not a box), then a
 *  slow Ken Burns push. The card dominates the frame. */
export const CardHero: React.FC<{ src: string; w?: number; delay?: number; kenTo?: number; shine?: boolean; variant?: number }> = ({ src, w = 900, delay = 0, kenTo = 1.05, shine = true, variant = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Punchy spring with a touch of OVERSHOOT → the card arrives with real impact, then settles.
  const s = spring({ frame: frame - delay, fps, config: { damping: 13, mass: 1, stiffness: 116 } });
  const inv = 1 - s;
  const ken = interpolate(frame - delay, [6, 150], [1.0, kenTo], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const op = interpolate(s, [0, 0.22], [0, 1]);
  // FIVE BIG, genuinely-3D entrances (deep perspective + a full spin) — no two consecutive alike.
  // Each `t3d` converges to nothing as the spring settles, leaving only the living float.
  const v = ((variant % 5) + 5) % 5;
  let t3d = "";
  let origin = "center center";
  if (v === 0) t3d = `rotateY(${inv * 132}deg) translateZ(${inv * -280}px) translateX(${inv * 160}px)`;                   // big card TURN sweeping in from the right
  else if (v === 1) { t3d = `rotateX(${inv * -118}deg) translateY(${inv * -170}px)`; origin = "center top"; }             // hard SWING down on a top hinge
  else if (v === 2) t3d = `translateZ(${inv * -1500}px) rotateZ(${inv * -360}deg)`;                                       // deep-space BARREL ROLL (full 360°)
  else if (v === 3) t3d = `rotateY(${inv * 64}deg) rotateX(${inv * 44}deg) translateX(${inv * -440}px) translateY(${inv * 300}px)`; // big 3D CORNER tumble
  else t3d = `rotateY(${inv * -132}deg) translateZ(${inv * -280}px) translateX(${inv * -160}px)`;                         // big card TURN sweeping in from the left
  // A living 3D float once settled — the "hovering hologram" premium feel.
  const sway = Math.sin((frame - delay) / 40) * 1.9 * s;
  const lift = Math.cos((frame - delay) / 52) * 1.2 * s;
  const transform = `perspective(1500px) ${t3d} rotateY(${sway}deg) rotateX(${lift}deg) scale(${ken})`;
  const blur = inv * 5; // strong MOTION BLUR while the card flies fast, clears as it settles
  // Specular highlight tracks the tilt: bright & wide while the card is still angled, then sweeps clean.
  const dir = v % 2 === 0 ? 1 : -1;
  const sweep = interpolate(frame - delay, [6, 50], dir > 0 ? [-1.4, 1.8] : [1.8, -1.4], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gloss = interpolate(s, [0, 0.7], [0.78, 0.42], { extrapolateRight: "clamp" });
  const holoShift = -24 + sway * 7 + Math.sin((frame - delay) / 28) * 11; // foil shimmers with the float
  // Clean & premium: JUST the 3D card (holo foil + specular gloss + entrance motion blur + float).
  // No impact ring / sparks / god-ray frame — those read as a gimmicky "futuristic frame".
  return (
    <div style={{ position: "relative", display: "inline-block", lineHeight: 0, transform, transformOrigin: origin, opacity: op, willChange: "transform" }}>
      <Img src={src} style={{ width: w, height: "auto", display: "block", borderRadius: 16, filter: `${CARD_GLOW} blur(${blur}px)` }} />
      <HoloFoil shift={holoShift} intensity={0.22} />
      {shine ? (
        <div style={{ position: "absolute", inset: 0, borderRadius: 16, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: "-14%", bottom: "-14%", left: `${sweep * 100}%`, width: `${36 + (v % 3) * 10}%`, background: `linear-gradient(${100 + v * 16}deg, transparent, rgba(255,255,255,${gloss}), transparent)`, transform: `skewX(${dir > 0 ? -18 : 18}deg)` }} />
        </div>
      ) : null}
    </div>
  );
};

/** Progress dots, lifted above IG's bottom UI safe-zone. */
export const ProgressDots: React.FC<{ total: number; step: number }> = ({ total, step }) => (
  <div style={{ position: "absolute", bottom: SAFE_BOTTOM, left: 0, width: "100%", display: "flex", justifyContent: "center", gap: 12 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{ width: i === step ? 44 : 14, height: 14, borderRadius: 999, ...(i <= step ? { backgroundImage: HOLO } : { background: "#222a36" }) }} />
    ))}
  </div>
);

/** Top-right set logo, faded in. */
export const SetLogo: React.FC<{ src: string | null }> = ({ src }) => {
  const p = useEnter(4, 14);
  if (!src) return null;
  return <Img src={src} style={{ position: "absolute", top: 84, right: 84, height: 56, objectFit: "contain", opacity: p * 0.9 }} />;
};

/** PROMINENT set identity for the hook — so a viewer knows WHICH set/extension in the first
 *  second. Big set logo on a soft glow (boxless), with the set name spelled out below as a
 *  guaranteed-legible fallback (some logos are faint on dark). Drops in from the top. */
export const SetBadge: React.FC<{ logo: string | null; name: string; delay?: number; size?: number }> = ({ logo, name, delay = 0, size = 116 }) => {
  const p = useEnter(delay, 14);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: p, transform: `translateY(${(1 - p) * -28}px)` }}>
      {logo ? (
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: "-34px -24px", background: "radial-gradient(ellipse, rgba(124,92,246,0.28), transparent 72%)" }} />
          <Img src={logo} style={{ height: size, objectFit: "contain", filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.75))" }} />
        </div>
      ) : null}
      <div style={{ marginTop: logo ? 14 : 0, fontSize: logo ? 36 : 76, letterSpacing: logo ? 5 : -1, textTransform: "uppercase", fontFamily: CLASH, fontWeight: 700, ...holoText() }}>{name}</div>
    </div>
  );
};

/** Pull a number out of a formatted money string for count-up animations. */
export const numFrom = (s: string): number => Number((s || "").replace(/[^0-9.]/g, "")) || 0;

/** A money value that counts up then SNAPS with a spring punch + a soft glow on landing. */
export const MoneyCount: React.FC<{ value: string; delay?: number; dur?: number; size?: number; holo?: boolean; style?: React.CSSProperties }> = ({ value, delay = 0, dur = 26, size = 150, holo = true, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const target = numFrom(value);
  const prefix = value.trim().startsWith("€") ? "€" : "$";
  const p = interpolate(frame - delay, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const n = Math.round(target * p);
  const punch = spring({ frame: frame - (delay + dur), fps, config: { damping: 9, mass: 0.6, stiffness: 160 } });
  const scale = 1 + interpolate(punch, [0, 1], [0.16, 0]);
  return (
    <div style={{ position: "relative", display: "flex", transform: `scale(${scale})` }}>
      {p >= 1 ? <GlowBurst delay={delay + dur} color="rgba(34,211,238,0.45)" /> : null}
      <div style={{ display: "flex", fontFamily: CLASH, fontWeight: 700, fontSize: size, letterSpacing: -2, ...(holo ? holoText(116) : { color: INK }), ...style }}>
        {prefix}
        {n.toLocaleString("en-US")}
      </div>
    </div>
  );
};

/** The shared closing CTA — same sign-off on every Reel. Ends bright (clean loop back to hook). */
export const Outro: React.FC<{ logo?: string | null }> = ({ logo }) => {
  const pop = usePop(2, 11);
  return (
    <Stage glowY={48}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90, textAlign: "center" }}>
        <Rise delay={2}>
          <Kicker style={{ fontSize: 34, letterSpacing: 5 }}>POKÉ EV</Kicker>
        </Rise>
        <div style={{ position: "relative", transform: `scale(${0.9 + pop * 0.1})`, marginTop: 26, display: "flex", flexDirection: "column", alignItems: "center" }}>
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
