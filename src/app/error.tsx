"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <p className="rise holo-text font-display text-6xl font-bold tracking-tight sm:text-7xl">Oups</p>
      <h1 className="font-display text-2xl font-semibold text-fg">Une erreur est survenue</h1>
      <p className="max-w-md leading-relaxed text-fg-muted">
        Quelque chose s&apos;est mal passé de notre côté. Réessaie, ou reviens à l&apos;accueil.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full px-6 py-2.5 font-display text-sm font-semibold tracking-wide text-ink-950 transition-transform duration-150 hover:scale-[1.03]"
          style={{ background: "var(--holo-gradient)" }}
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="rounded-full border border-line px-5 py-2 text-sm text-fg transition-colors duration-150 hover:border-line-strong hover:bg-surface"
        >
          Accueil
        </Link>
      </div>
    </main>
  );
}
