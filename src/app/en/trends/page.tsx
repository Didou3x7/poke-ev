import { TrendsPage } from "@/components/pages/TrendsPage";
import { pageMetadata } from "@/lib/view/seo";

// Always render fresh: this page's whole value is showing TODAY's movers, and the data lives in a
// blob the daily cron rewrites. As an ISR/static page it froze on a build-time empty prerender;
// explicit dynamic shows current movers every request and never throws "static to dynamic at runtime".
export const dynamic = "force-dynamic";
export const metadata = pageMetadata("en", "trends");

export default function Page() {
  return <TrendsPage locale="en" />;
}
