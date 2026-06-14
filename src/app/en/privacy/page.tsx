import { LegalPage } from "@/components/pages/LegalPage";
import { pageMetadata } from "@/lib/view/seo";

export const metadata = pageMetadata("en", "privacy");

export default function Page() {
  return <LegalPage locale="en" page="privacy" />;
}
