import Link from "next/link";

// Bilingual 404 in the Poké EV DA — self-contained so it reads well with or
// without the site shell.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <p className="rise holo-text font-display text-7xl font-bold tracking-tight sm:text-8xl">404</p>
      <h1 className="font-display text-2xl font-semibold text-fg">Page introuvable · Page not found</h1>
      <p className="max-w-md leading-relaxed text-fg-muted">
        Cette page n&apos;existe pas ou a été déplacée. This page doesn&apos;t exist or has moved.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-full px-6 py-2.5 font-display text-sm font-semibold tracking-wide text-ink-950 transition-transform duration-150 hover:scale-[1.03]"
          style={{ background: "var(--holo-gradient)" }}
        >
          Accueil / Home
        </Link>
        <Link
          href="/calculateur"
          className="rounded-full border border-line px-5 py-2 text-sm text-fg transition-colors duration-150 hover:border-line-strong hover:bg-surface"
        >
          Calculateur
        </Link>
      </div>
    </main>
  );
}
