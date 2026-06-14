import { LegalPage } from "@/components/pages/LegalPage";
import { pageMetadata } from "@/lib/view/seo";

export const metadata = pageMetadata("fr", "cookies");

export default function Page() {
  return <LegalPage locale="fr" page="cookies" />;
}
