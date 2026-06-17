import { LangSetter } from "@/components/LangSetter";

/**
 * EN segment. The root <html> stays lang="fr" (static, FR is the route root), so
 * we tag the English subtree server-side with a transparent wrapper
 * (display:contents = no layout box) — crawlers + screen readers read the
 * correct lang in the initial HTML. LangSetter then syncs document.lang client-side.
 */
export default function EnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="en" style={{ display: "contents" }}>
      <LangSetter lang="en" />
      {children}
    </div>
  );
}
