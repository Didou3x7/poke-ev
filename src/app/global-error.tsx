"use client";

// Catches errors thrown by the root layout itself — it replaces <html>/<body>,
// so it can't rely on globals.css; styles are inline.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          background: "#0B0E14",
          color: "#e8ecf4",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <p
          style={{
            fontSize: 56,
            fontWeight: 800,
            margin: 0,
            backgroundImage: "linear-gradient(108deg,#22d3ee,#8b5cf6,#e94bd0)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Oups
        </p>
        <p style={{ color: "#8a93a6", maxWidth: 420, margin: 0 }}>
          Une erreur est survenue · <span lang="en">Something went wrong.</span>
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "10px 24px",
            fontWeight: 600,
            color: "#07090e",
            cursor: "pointer",
            background: "linear-gradient(108deg,#22d3ee,#8b5cf6,#e94bd0)",
          }}
        >
          Réessayer / <span lang="en">Retry</span>
        </button>
      </body>
    </html>
  );
}
