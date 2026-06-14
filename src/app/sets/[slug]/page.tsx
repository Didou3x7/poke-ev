import type { Metadata } from "next";
import { SetDetailPage } from "@/components/pages/SetDetailPage";
import { setDetailMetadata, setDetailStaticParams } from "@/lib/view/set-detail-meta";

export const revalidate = 3600;

export function generateStaticParams() {
  return setDetailStaticParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return setDetailMetadata("fr", slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SetDetailPage locale="fr" slug={slug} />;
}
