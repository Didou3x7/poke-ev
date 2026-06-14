import { LegalPage } from "@/components/pages/LegalPage";
import { pageMetadata } from "@/lib/view/seo";

export const metadata = pageMetadata("en", "legal");

export default function Page() {
  return <LegalPage locale="en" page="legal" />;
}
