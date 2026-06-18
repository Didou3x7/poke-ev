import { MethodologyPage } from "@/components/pages/MethodologyPage";
import { pageMetadata } from "@/lib/view/seo";

export const revalidate = 3600;
export const metadata = pageMetadata("fr", "methodology");

export default function Page() {
  return <MethodologyPage locale="fr" />;
}
