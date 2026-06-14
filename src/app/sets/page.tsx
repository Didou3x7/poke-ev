import { SetsPage } from "@/components/pages/SetsPage";
import { pageMetadata } from "@/lib/view/seo";

export const revalidate = 3600;
export const metadata = pageMetadata("fr", "sets");

export default function Page() {
  return <SetsPage locale="fr" />;
}
