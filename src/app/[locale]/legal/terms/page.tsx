import type { Metadata } from "next";
import { LegalPage } from "@/components/sections/legal/LegalPage";
import { loadMarkdownPage } from "@/lib/markdown";
import { currentLocale, pageMetadata } from "@/lib/page-meta";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const page = await loadMarkdownPage(locale, "terms");
  return pageMetadata({ locale, href: "/legal/terms", title: page.title, description: page.description });
}

export default async function Page() {
  return <LegalPage locale={await currentLocale()} slug="terms" />;
}
