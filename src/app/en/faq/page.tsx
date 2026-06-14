import { FaqPage } from "@/components/pages/FaqPage";
import { pageMetadata } from "@/lib/view/seo";

export const revalidate = 3600;
export const metadata = pageMetadata("en", "faq");

export default function Page() {
  return <FaqPage locale="en" />;
}
