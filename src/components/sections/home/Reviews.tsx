import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/motion/Reveal";
import { Container, Eyebrow, Hairline, Section } from "@/components/ui/Layout";
import { reviews } from "@content/reviews";

/** Real guest reviews only. Renders nothing until content/reviews.ts has entries. */
export async function Reviews({ locale }: { locale: "en" | "el" }) {
  const list = reviews.filter((r) => r.quote[locale] ?? r.quote.en);
  if (list.length === 0) return null;
  const t = await getTranslations("home.reviews");

  return (
    <Section labelledBy="reviews-title" className="bg-sand">
      <Container>
        <Reveal>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <Hairline className="mt-5" />
          <h2 id="reviews-title" className="mt-6 text-h2 text-ionian">
            {t("title")}
          </h2>
        </Reveal>
        <ul className="mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-3">
          {list.map((r, i) => (
            <li key={i}>
              <Reveal delay={i * 100}>
                <blockquote className="font-display text-xl italic leading-relaxed">
                  “{r.quote[locale] ?? r.quote.en}”
                </blockquote>
                <p className="mt-4 text-[0.875rem] text-ink-soft">
                  {r.author}
                  {r.origin ? ` · ${r.origin}` : ""}
                </p>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
