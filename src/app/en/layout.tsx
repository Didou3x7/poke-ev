import { LangSetter } from "@/components/LangSetter";

/** EN segment — flips <html lang> to "en" after hydration (root stays static). */
export default function EnLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LangSetter lang="en" />
      {children}
    </>
  );
}
