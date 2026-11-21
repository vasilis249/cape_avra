import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { paymentLabels } from "@/components/booking/labels";
import { BalancePayment, CancelForm } from "@/components/booking/ManageActions";
import { StaySummary } from "@/components/booking/StaySummary";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Eyebrow, Hairline } from "@/components/ui/Layout";
import { getPathname } from "@/i18n/navigation";
import { loadBookingConfig } from "@/lib/booking/config";
import { todayIn } from "@/lib/booking/dates";
import { longDate } from "@/lib/booking/format";
import { formatMoney } from "@/lib/booking/pricing";
import { getBookingStore, type Payment, type Reservation } from "@/lib/booking/store";
import { canAccess } from "@/lib/booking/tokens";
import { currentLocale } from "@/lib/page-meta";
import { paymentDeps } from "@/lib/payments/deps";
import { balanceDueDate, cancellationPreview, outstandingCents, paidCents, reconcileReservation, type Deps } from "@/lib/payments/service";
import { siteConfig } from "@content/site.config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await currentLocale(), namespace: "meta.pages.manage" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default function ManagePage({ searchParams }: PageProps<"/[locale]/book/manage">) {
  return (
    <>
      <SiteHeader variant="solid" />
      <main id="main" className="pt-28 pb-24 lg:pt-36 lg:pb-32">
        <Suspense fallback={<div className="min-h-[40svh]" />}>
          <Manage searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-limestone/60 py-3 last:border-0">
    <dt className="text-ink-soft">{label}</dt>
    <dd className="text-right text-ink tabular-nums">{children}</dd>
  </div>
);

async function Manage({ searchParams }: Pick<PageProps<"/[locale]/book/manage">, "searchParams">) {
  const locale = await currentLocale();
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" ? sp.ref : "";
  const token = typeof sp.t === "string" ? sp.t : "";
  const t = await getTranslations("booking.manage");
  const tc = await getTranslations("booking.checkout");

  let r: Reservation | null = ref && token ? await getBookingStore().getByRef(ref) : null;
  if (r && !canAccess(ref, token, r.tokenHash)) r = null;
  if (!r || !r.guest || (r.status !== "confirmed" && r.status !== "cancelled")) {
    return (
      <Container>
        <p className="max-w-prose text-lead text-ink-soft">{tc("notFound")}</p>
        <ButtonLink href="/book" variant="outline" className="mt-8">
          {tc("backToDates")}
        </ButtonLink>
      </Container>
    );
  }

  let deps: Deps | null = null;
  let payments: Payment[];
  try {
    deps = await paymentDeps();
    r = await reconcileReservation(deps, r); // e.g. just back from paying the balance
    payments = await deps.store.listPayments(r.id);
  } catch (e) {
    console.error(`[booking] manage ${ref}: payments unavailable`, e);
    payments = await getBookingStore().listPayments(r.id);
  }
  const config = deps?.config ?? (await loadBookingConfig());
  const today = todayIn(config.timeZone);
  const money = (c: number) => formatMoney(c, locale);
  const paid = paidCents(payments);
  const refunded = payments.reduce((s, p) => s + (p.kind === "security_deposit" ? 0 : p.refundedCents), 0);
  const outstanding = r.status === "confirmed" ? outstandingCents(r, payments) : 0;
  const dueDate = balanceDueDate(r, config);
  const preview = cancellationPreview(config, r, payments, today);
  const client = deps?.provider.client() ?? null;
  const link = { refCode: r.ref, token, locale };
  const selfPath = getPathname({ href: { pathname: "/book/manage", query: { ref, t: token } }, locale });
  const canPayNow = r.status === "confirmed" && outstanding > 0 && today < r.checkIn && !!client;
  const balancePending = payments.some((p) => p.kind === "balance" && p.status === "pending");

  return (
    <Container className="grid gap-14 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-7">
        <Eyebrow>
          {t("eyebrow")} · {r.ref}
        </Eyebrow>
        <Hairline className="mt-5" />
        <h1 className="mt-6 text-h1 text-ionian">{t("title")}</h1>

        <dl className="mt-10 text-[0.9375rem]">
          <Row label={t("status")}>{r.status === "confirmed" ? t("statusConfirmed") : t("statusCancelled")}</Row>
          <Row label={t("paid")}>{money(paid)}</Row>
          {refunded > 0 && <Row label={t("refunded")}>{money(refunded)}</Row>}
          {r.status === "confirmed" && (
            <Row label={t("balance")}>
              {outstanding === 0 ? t("paidInFull") : dueDate > today ? t("balanceAuto", { amount: money(outstanding), date: longDate(dueDate, locale) }) : t("balanceNow", { amount: money(outstanding) })}
            </Row>
          )}
          {r.status === "confirmed" && config.payment.securityDeposit > 0 && (
            <Row label={t("securityDeposit")}>
              {(await getTranslations("emails.rows"))("securityDepositNote", { amount: money(config.payment.securityDeposit * 100), days: config.payment.securityDepositReleaseDays })}
            </Row>
          )}
        </dl>

        {r.status === "cancelled" && (
          <div className="mt-10 bg-sand p-6 sm:p-8">
            <p className="text-ink">{t("cancelledLead", { date: longDate((r.cancelledAt ?? r.cancellation?.at ?? today).slice(0, 10), locale) })}</p>
            {(r.cancellation?.refundCents ?? 0) > 0 && <p className="mt-3 text-ink-soft">{t("refundLine", { amount: money(r.cancellation!.refundCents) })}</p>}
          </div>
        )}

        {canPayNow && !balancePending && (
          <section className="mt-12" aria-labelledby="pay-balance">
            <h2 id="pay-balance" className="font-display text-h3 text-ionian">
              {t("payBalanceTitle")}
            </h2>
            <div className="mt-5">
              <BalancePayment
                link={link}
                provider={client!}
                returnPath={selfPath}
                billing={{ name: r.guest?.name, email: r.guest?.email, phone: r.guest?.phone }}
                labels={{
                  open: t("payBalance", { amount: money(outstanding) }),
                  error: t("cancelError"),
                  payment: await paymentLabels({ submit: t("payBalance", { amount: money(outstanding) }), note: null, test: client!.provider === "test" }),
                }}
              />
            </div>
          </section>
        )}

        {preview.allowed && (
          <section className="mt-12 bg-sand p-6 sm:p-8" aria-labelledby="cancel-title">
            <h2 id="cancel-title" className="font-display text-h3 text-ionian">
              {t("cancelTitle")}
            </h2>
            <p className="mt-4 max-w-prose text-ink-soft">
              {preview.refundCents > 0
                ? t("cancelPreview", { days: preview.daysBefore, amount: money(preview.refundCents), percent: preview.percent })
                : t("cancelNoRefund", { days: preview.daysBefore })}
            </p>
            <div className="mt-6">
              <CancelForm
                link={link}
                labels={{
                  confirm: t("cancelConfirm"),
                  button: t("cancelButton"),
                  busy: t("cancelling"),
                  errors: { confirm: t("cancelConfirmError"), notAllowed: t("cancelNotAllowed"), generic: t("cancelError") },
                }}
              />
            </div>
          </section>
        )}
        {r.status === "confirmed" && !preview.allowed && <p className="mt-12 text-ink-soft">{t("cancelNotAllowed")}</p>}

        <p className="mt-12 text-[0.9375rem] text-ink-soft">{t("contact", { email: siteConfig.contact.email })}</p>
      </div>

      <aside className="lg:col-span-5">
        <div className="bg-sand p-6 sm:p-8 lg:sticky lg:top-28">
          <StaySummary reservation={r} locale={locale} />
          <dl className="mt-6 border-t border-limestone/60 pt-4 text-[0.9375rem]">
            <Row label={(await getTranslations("booking.summary"))("total")}>{money(r.totalCents)}</Row>
          </dl>
        </div>
      </aside>
    </Container>
  );
}
