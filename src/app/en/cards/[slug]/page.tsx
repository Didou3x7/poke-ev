import type { Metadata } from "next";
import { CardPage } from "@/components/pages/CardPage";
import { cardPageMetadata, cardStaticParams } from "@/lib/view/card-meta";

export const revalidate = 3600;
// Pre-render the top cards; any other valid card slug renders on-demand (ISR)
// and is then cached — so thousands of cards are indexable without a huge build.
export const dynamicParams = true;

export async function generateStaticParams() {
  return cardStaticParams();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return cardPageMetadata("en", slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CardPage locale="en" slug={slug} />;
}
