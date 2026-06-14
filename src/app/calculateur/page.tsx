import { CalculatorPage } from "@/components/pages/CalculatorPage";
import { pageMetadata } from "@/lib/view/seo";

export const revalidate = 3600;
export const metadata = pageMetadata("fr", "calculator");

export default function Page() {
  return <CalculatorPage locale="fr" />;
}
