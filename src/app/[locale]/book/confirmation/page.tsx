import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { bookingLabels } from "@/components/booking/labels";
import { PriceSummary } from "@/components/booking/PriceSummary";
import { StaySummary } from "@/components/booking/StaySummary";
import { AgaveMotif } from "@/components/brand/AgaveMotif";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Eyebrow, Hairline } from "@/components/ui/Layout";
import { loadBookingConfig } from "@/lib/booking/config";
import { getBookingStore, type Payment } from "@/lib/booking/store";
import { paymentDeps } from "@/lib/payments/deps";
import { reconcileReservation } from "@/lib/payments/service";
import { AutoRefresh } from "@/components/booking/AutoRefresh";
import { tokenMatches } from "@/lib/booking/tokens";
import { currentLocale } from "@/lib/page-meta";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await currentLocale(), namespace: "meta.pages.confirmation" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default function ConfirmationPage({ searchParams }: PageProps<"/[locale]/book/confirmation">) {
  return (
    <>
      <SiteHeader variant="solid" />
      <main id="main" className="pt-28 pb-24 lg:pt-36 lg:pb-32">
        <Suspense fallback={<div className="min-h-[40svh]" />}>
          <Confirmation searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function Confirmation({ searchParams }: Pick<PageProps<"/[locale]/book/confirmation">, "searchParams">) {
  const locale = await currentLocale();
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" ? sp.ref : "";
  const token = typeof sp.t === "string" ? sp.t : "";
  const t = await getTranslations("booking.confirmation");
  const tc = await getTranslations("booking.checkout");
  const te = await getTranslations("emails.confirmation");
  let r = ref && token ? await getBookingStore().getByRef(ref) : null;
  if (r && !tokenMatches(token, r.tokenHash)) r = null;

  // webhook not here yet (or not configured): ask the provider directly
  let payments: Payment[] = [];
  if (r) {
    try {
      const deps = await paymentDeps();
      if (r.status !== "confirmed" && r.status !== "cancelled") r = await reconcileReservation(deps, r);
      payments = await deps.store.listPayments(r.id);
    } catch (e) {
      console.error(`[booking] reconcile ${ref} failed`, e);
      payments = await getBookingStore().listPayments(r.id);
    }
  }

  const notFound = (
    <Container>
      <p className="max-w-prose text-lead text-ink-soft">{tc("notFound")}</p>
      <ButtonLink href="/book" variant="outline" className="mt-8">
        {tc("backToDates")}
      </ButtonLink>
    </Container>
  );
  if (!r || !r.guest) return notFound;

  const checkoutHref = { pathname: "/book/checkout" as const, query: { ref, t: token } };
  const holdActive = r.status === "hold" && !!r.expiresAt && r.expiresAt > new Date().toISOString();
  const stayPayments = payments.filter((p) => p.kind === "deposit" || p.kind === "full");

  if (r.status === "cancelled" && r.cancellation?.reason === "dates-taken") {
    return (
      <Message eyebrow={t("eyebrow")} title={t("conflictTitle")} lead={t("conflictLead")}>
        <ButtonLink href="/book" className="mt-8">
          {tc("backToDates")}
        </ButtonLink>
      </Message>
    );
  }
  if (r.status !== "confirmed") {
    if (stayPayments.some((p) => p.status === "pending")) {
      return (
        <Message eyebrow={t("pendingEyebrow")} title={t("pendingTitle")} lead={t("pendingLead")} live>
          <AutoRefresh />
        </Message>
      );
    }
    if (holdActive) {
      return (
        <Message eyebrow={tc("eyebrow")} title={t("failedTitle")} lead={t("failedLead")}>
          <ButtonLink href={checkoutHref} className="mt-8">
            {t("tryAgain")}
          </ButtonLink>
        </Message>
      );
    }
    return notFound;
  }

  const config = await loadBookingConfig();
  const labels = await bookingLabels();
  const test = payments.some((p) => p.provider === "test");

  return (
    <Container className="grid gap-14 lg:grid-cols-12 lg:gap-12">
      <div className="relative lg:col-span-6">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <Hairline className="mt-5" />
        <h1 className="mt-6 text-h1 text-ionian">{t("title")}</h1>
        <p className="mt-6 max-w-prose text-lead text-ink-soft">{t("lead", { name: r.guest.name, email: r.guest.email })}</p>
        <div className="mt-10 inline-block border border-limestone px-6 py-5">
          <p className="text-[0.75rem] tracking-[0.14em] text-ink-soft uppercase">{t("reference")}</p>
          <p className="mt-1 font-display text-3xl tracking-[0.08em] text-ionian select-all">{r.ref}</p>
        </div>
        <p className="mt-10 max-w-prose text-ink-soft">{t("next", { days: config.emails.preArrivalDaysBefore })}</p>
        {test && <p className="mt-4 text-[0.875rem] text-[#9a4a2a]">{te("testNote")}</p>}
        <ButtonLink href={{ pathname: "/book/manage", query: { ref, t: token } }} variant="outline" className="mt-8">
          {t("manage")}
        </ButtonLink>
        <AgaveMotif className="mt-12 w-10 text-limestone" />
      </div>
      <aside className="lg:col-span-5 lg:col-start-8">
        <div className="bg-sand p-6 sm:p-8">
          <StaySummary reservation={r} locale={locale} />
          <PriceSummary
            quote={r.quote}
            locale={locale}
            labels={labels.summary}
            depositPercent={config.payment.depositPercent}
            balanceDaysBeforeArrival={config.payment.balanceDaysBeforeArrival}
            className="mt-6"
          />
        </div>
      </aside>
    </Container>
  );
}

function Message({ eyebrow, title, lead, live, children }: { eyebrow: string; title: string; lead: string; live?: boolean; children?: React.ReactNode }) {
  return (
    <Container>
      <div className="max-w-2xl" aria-live={live ? "polite" : undefined}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Hairline className="mt-5" />
        <h1 className="mt-6 text-h1 text-ionian">{title}</h1>
        <p className="mt-6 max-w-prose text-lead text-ink-soft">{lead}</p>
        {children}
      </div>
    </Container>
  );
}
