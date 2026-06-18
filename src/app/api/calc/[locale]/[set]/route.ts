import { NextResponse } from "next/server";
import { getCalcSetData } from "@/lib/view/calculator-vm";

/**
 * On-demand per-set EV data for the calculator. The page ships only the light
 * shell (set options); the client fetches a set's data here when it's picked,
 * so the LCP-critical initial load stays small. Cached at the edge for 1h
 * (matches the snapshot refresh cadence).
 */
export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; set: string }> }) {
  const { locale, set } = await params;
  if (locale !== "fr" && locale !== "en") {
    return NextResponse.json({ error: "bad locale" }, { status: 400 });
  }
  const data = await getCalcSetData(locale, decodeURIComponent(set));
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data, {
    headers: { "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
