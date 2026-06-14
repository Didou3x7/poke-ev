import type { Locale } from "./config";
import type { Dict } from "./types";
import { fr } from "./fr";
import { en } from "./en";

const dicts: Record<Locale, Dict> = { fr, en };

export function getDict(locale: Locale): Dict {
  return dicts[locale];
}

/** Tiny template helper: tpl("EV {name}", { name: "151" }) → "EV 151". */
export function tpl(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`,
  );
}

export * from "./config";
export type { Dict, FaqItem, LegalSection } from "./types";
