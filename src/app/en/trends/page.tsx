import { TrendsPage } from "@/components/pages/TrendsPage";
import { pageMetadata } from "@/lib/view/seo";

export const revalidate = 3600;
export const metadata = pageMetadata("en", "trends");

export default function Page() {
  return <TrendsPage locale="en" />;
}
