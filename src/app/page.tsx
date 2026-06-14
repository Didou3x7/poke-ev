import { LandingPage } from "@/components/pages/LandingPage";
import { pageMetadata } from "@/lib/view/seo";

export const revalidate = 3600;
export const metadata = pageMetadata("fr", "home");

export default function Page() {
  return <LandingPage locale="fr" />;
}
