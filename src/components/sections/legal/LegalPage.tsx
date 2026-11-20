import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/ui/Layout";
import type { Locale } from "@/i18n/routing";
import { loadMarkdownPage } from "@/lib/markdown";

/** Long-form page rendered from content/pages/<locale>/<slug>.md */
export async function LegalPage({ locale, slug }: { locale: Locale; slug: string }) {
  const page = await loadMarkdownPage(locale, slug);
  const t = await getTranslations("legal");
  const tn = await getTranslations("nav");
  const date = new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", { dateStyle: "long" }).format(new Date(page.updated));
  return (
    <>
      <SiteHeader variant="solid" />
      <main id="main">
        <PageHeader eyebrow={tn("legal")} title={page.title} />
        <Container className="pb-24 lg:pb-32">
          {page.draft && (
            <p className="mb-10 max-w-prose border-l border-dusk pl-4 text-[0.875rem] text-ink-soft">{t("draftNote")}</p>
          )}
          <div className="prose-ca" dangerouslySetInnerHTML={{ __html: page.html }} />
          <p className="mt-14 text-[0.8125rem] text-ink-soft">{t("updated", { date })}</p>
        </Container>
      </main>
    </>
  );
}
