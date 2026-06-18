"use client";

import { useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";

/**
 * Premium FAQ accordion. Replaces the native <details> snap with a smooth
 * height + opacity slide, a spring-rotated +→× glyph and a holo edge accent
 * that wipes in on the open item. Each row toggles independently (first open by
 * default), matching the previous <details> behaviour.
 *
 * Accessible: real <button> triggers with aria-expanded / aria-controls and a
 * labelled region. Under prefers-reduced-motion every transition collapses to
 * an instant show (durations → 0), so nothing slides for vestibular-sensitive
 * users. The page's JSON-LD already exposes every Q&A to crawlers, so collapsing
 * closed panels out of the DOM costs nothing for SEO.
 */
const EASE = [0.22, 1, 0.36, 1] as const;

export function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = open.has(i);
        return (
          <m.div
            key={item.q}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : Math.min(i * 0.05, 0.3), ease: EASE }}
            className={`group relative rounded-2xl border bg-surface transition-colors duration-300 ${
              isOpen ? "border-line-strong" : "border-line hover:border-line-strong"
            }`}
          >
            {/* holo edge accent — wipes down the left rail when open. Inset past
                the rounded corners (and rounded) so it never pokes outside them;
                the card no longer clips (overflow-hidden removed) so the trigger's
                focus outline stays fully visible. */}
            <m.span
              aria-hidden
              className="absolute inset-y-4 left-0 w-[2px] origin-top rounded-full"
              style={{ background: "var(--holo-gradient)" }}
              initial={false}
              animate={{ scaleY: isOpen ? 1 : 0, opacity: isOpen ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
            />

            <h2>
              <button
                type="button"
                id={`faq-trigger-${i}`}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                onClick={() => toggle(i)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left font-display text-base font-semibold"
              >
                <span>{item.q}</span>
                <m.span
                  aria-hidden
                  className={`shrink-0 font-mono text-lg leading-none transition-colors duration-300 ${
                    isOpen ? "text-holo-cyan" : "text-fg-faint group-hover:text-fg-muted"
                  }`}
                  animate={{ rotate: isOpen ? 135 : 0 }}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 22 }}
                >
                  +
                </m.span>
              </button>
            </h2>

            <AnimatePresence initial={false}>
              {isOpen ? (
                <m.div
                  key="panel"
                  id={`faq-panel-${i}`}
                  role="region"
                  aria-labelledby={`faq-trigger-${i}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    height: { duration: reduce ? 0 : 0.4, ease: EASE },
                    opacity: { duration: reduce ? 0 : 0.3, ease: "linear" },
                  }}
                  className="overflow-hidden"
                >
                  <m.p
                    initial={reduce ? false : { y: -6 }}
                    animate={{ y: 0 }}
                    transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
                    className="px-5 pb-5 text-sm leading-relaxed text-fg-muted"
                  >
                    {item.a}
                  </m.p>
                </m.div>
              ) : null}
            </AnimatePresence>
          </m.div>
        );
      })}
    </div>
  );
}
