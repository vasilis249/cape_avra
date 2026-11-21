import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { CheckoutForm } from "@/components/booking/CheckoutForm";
import { bookingLabels, paymentLabels } from "@/components/booking/labels";
import { PriceSummary } from "@/components/booking/PriceSummary";
import { StaySummary } from "@/components/booking/StaySummary";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Eyebrow, Hairline } from "@/components/ui/Layout";
import { getPathname, Link } from "@/i18n/navigation";
import { loadBookingConfig } from "@/lib/booking/config";
import { formatMoney } from "@/lib/booking/pricing";
import { longDate } from "@/lib/booking/format";
import { getBookingStore } from "@/lib/booking/store";
import { tokenMatches } from "@/lib/booking/tokens";
import { currentLocale } from "@/lib/page-meta";
import { getPaymentProvider } from "@/lib/payments/provider";
import { siteConfig } from "@content/site.config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await currentLocale(), namespace: "meta.pages.checkout" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default function CheckoutPage({ searchParams }: PageProps<"/[locale]/book/checkout">) {
  return (
    <>
      <SiteHeader variant="solid" />
      <main id="main" className="pt-28 pb-24 lg:pt-36 lg:pb-32">
        <Suspense fallback={<div className="min-h-[40svh]" />}>
          <Checkout searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function Checkout({ searchParams }: Pick<PageProps<"/[locale]/book/checkout">, "searchParams">) {
  const locale = await currentLocale();
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" ? sp.ref : "";
  const token = typeof sp.t === "string" ? sp.t : "";
  const t = await getTranslations("booking.checkout");
  const tf = await getTranslations("form");
  const labels = await bookingLabels();

  const r = ref && token ? await getBookingStore().getByRef(ref) : null;
  if (!r || !tokenMatches(token, r.tokenHash)) {
    return (
      <Container>
        <p className="max-w-prose text-lead text-ink-soft">{t("notFound")}</p>
        <ButtonLink href="/book" variant="outline" className="mt-8">
          {t("backToDates")}
        </ButtonLink>
      </Container>
    );
  }
  if (r.status === "confirmed") redirect(getPathname({ href: { pathname: "/book/confirmation", query: { ref, t: token } }, locale }));
  const active = r.status === "hold" && !!r.expiresAt && r.expiresAt > new Date().toISOString();

  const config = await loadBookingConfig();
  const client = await getPaymentProvider()
    .then((p) => p.client())
    .catch(() => null);
  const due = formatMoney(r.quote.payment.depositCents, locale);
  const { balanceCents, balanceDueDate } = r.quote.payment;
  const note =
    balanceCents > 0 && balanceDueDate
      ? t("savedCardNote", { balance: formatMoney(balanceCents, locale), date: longDate(balanceDueDate, locale) })
      : config.payment.securityDeposit > 0
        ? t("savedCardNoteFull")
        : null;
  const tiers = [...config.cancellation].sort((a, b) => b.daysBefore - a.daysBefore);
  const formErrors = Object.fromEntries(
    ["required", "email", "tooLong", "generic"].map((k) => [k, (tf.raw(`errors.${k}` as "errors.required") as string).replace("{email}", siteConfig.contact.email)]),
  );

  return (
    <Container className="grid gap-14 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-7">
        <Eyebrow>{t("eyebrow")} · {r.ref}</Eyebrow>
        <Hairline className="mt-5" />
        <h1 className="mt-6 text-h1 text-ionian">{t("title")}</h1>
        <div className="mt-10">
          {!active ? (
            <div role="alert" className="bg-sand p-8">
              <p className="text-ink">{t("expired")}</p>
              <ButtonLink href="/book" className="mt-6">
                {t("backToDates")}
              </ButtonLink>
            </div>
          ) : !client ? (
            <p className="bg-sand p-8 text-ink">{t("paymentsUnavailable")}</p>
          ) : (
            <CheckoutForm
              refCode={r.ref}
              token={token}
              locale={locale}
              expiresAt={r.expiresAt!}
              provider={client}
              confirmationPath={getPathname({ href: { pathname: "/book/confirmation", query: { ref, t: token } }, locale })}
              termsLabel={t.rich("terms", {
                terms: (chunks) => (
                  <Link href="/legal/terms" target="_blank" className="text-ionian underline decoration-ionian/40 underline-offset-4">
                    {chunks}
                  </Link>
                ),
              })}
              labels={{
                detailsTitle: t("detailsTitle"),
                name: tf("name"),
                email: tf("email"),
                phone: tf("phone"),
                phoneHint: tf("phoneHint"),
                country: t("country"),
                arrivalTime: t("arrivalTime"),
                message: t("message"),
                optional: tf("optional"),
                marketing: tf("marketing"),
                submit: t("continueToPayment"),
                processing: t("processing"),
                editDetails: t("editDetails"),
                payment: await paymentLabels({ submit: t("pay", { amount: due }), note, test: client.provider === "test" }),
                heldFor: t.raw("heldFor") as string,
                expired: t("expired"),
                backToDates: t("backToDates"),
                errors: {
                  ...formErrors,
                  terms: t("termsError"),
                  notFound: t("notFound"),
                  paymentsUnavailable: t("paymentsUnavailable"),
                  paymentFailed: t("paymentFailed"),
                },
              }}
            />
          )}
        </div>
      </div>

      <aside className="lg:col-span-5" aria-label={labels.summaryTitle}>
        <div className="bg-sand p-6 sm:p-8 lg:sticky lg:top-28">
          <StaySummary reservation={r} locale={locale} />
          <PriceSummary
            quote={r.quote}
            locale={locale}
            labels={labels.summary}
            depositPercent={config.payment.depositPercent}
            balanceDaysBeforeArrival={config.payment.balanceDaysBeforeArrival}
            className="mt-6"
          />
          <Link href="/book" className="mt-4 inline-block text-[0.8125rem] text-ionian underline underline-offset-4">
            {t("change")}
          </Link>
          <div className="mt-8 border-t border-limestone/60 pt-6">
            <h2 className="text-[0.75rem] tracking-[0.14em] text-ink-soft uppercase">{t("cancellationTitle")}</h2>
            <ul className="mt-3 space-y-1 text-[0.875rem] text-ink-soft">
              {tiers.map((tier, i) =>
                tier.daysBefore > 0 ? (
                  <li key={i}>{t("cancellationTier", { days: tier.daysBefore, percent: tier.refundPercent })}</li>
                ) : (
                  <li key={i}>{t("cancellationLast", { days: tiers[i - 1]?.daysBefore ?? 0, percent: tier.refundPercent })}</li>
                ),
              )}
            </ul>
          </div>
        </div>
      </aside>
    </Container>
  );
}
