import { getTranslations } from "next-intl/server";
import { AgaveMotif } from "@/components/brand/AgaveMotif";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Layout";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <>
      <SiteHeader variant="solid" />
      <main id="main" className="flex min-h-[80svh] items-center pt-20">
        <Container className="flex flex-col items-start gap-6 py-24">
          <AgaveMotif className="w-10 text-limestone" />
          <h1 className="text-h1 text-ionian">{t("title")}</h1>
          <p className="max-w-prose text-lead text-ink-soft">{t("text")}</p>
          <ButtonLink href="/" variant="outline">
            {t("back")}
          </ButtonLink>
        </Container>
      </main>
    </>
  );
}
