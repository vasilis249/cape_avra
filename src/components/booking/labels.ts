import { getTranslations } from "next-intl/server";
import type { PriceSummaryLabels } from "./PriceSummary";

/** Booking UI strings for client components (templates keep their {placeholders}). */
export async function bookingLabels() {
  const t = await getTranslations("booking");
  // templates are passed raw ({placeholders} filled in the client); keys are checked by the JSON parity check
  const rawAny = t.raw as unknown as (k: string) => unknown;
  const raw = (k: string) => rawAny(k) as string;
  const summary: PriceSummaryLabels = {
    nights: raw("summary.nights"),
    nightOne: raw("nightOne"),
    nightOther: raw("nightOther"),
    extraGuests: raw("summary.extraGuests"),
    cleaning: raw("summary.cleaning"),
    discount: raw("summary.discount"),
    total: raw("summary.total"),
    deposit: raw("summary.deposit"),
    full: raw("summary.full"),
    balance: raw("summary.balance"),
    onArrival: raw("summary.onArrival"),
    adjustment: raw("summary.adjustment"),
  };
  return {
    summary,
    calendarLabel: raw("calendarLabel"),
    selectArrival: raw("selectArrival"),
    selectDeparture: raw("selectDeparture"),
    prevMonth: raw("prevMonth"),
    nextMonth: raw("nextMonth"),
    clear: raw("clear"),
    guests: raw("guests"),
    arrival: raw("arrival"),
    departure: raw("departure"),
    nightOne: raw("nightOne"),
    nightOther: raw("nightOther"),
    legendAvailable: raw("legendAvailable"),
    legendBooked: raw("legendBooked"),
    legendNoArrival: raw("legendNoArrival"),
    dayAvailable: raw("dayAvailable"),
    dayBooked: raw("dayBooked"),
    dayNoArrival: raw("dayNoArrival"),
    dayUnavailable: raw("dayUnavailable"),
    daySelected: raw("daySelected"),
    loading: raw("loading"),
    loadError: raw("loadError"),
    minNightsHint: raw("minNightsHint"),
    checkInDaysHint: raw("checkInDaysHint"),
    problems: rawAny("problems") as Record<string, string>,
    summaryTitle: raw("summary.title"),
    note: raw("summary.note"),
    continue: raw("summary.continue"),
    holding: raw("summary.holding"),
    rate: (await getTranslations("form")).raw("errors.rate") as string,
  };
}
export type BookingLabels = Awaited<ReturnType<typeof bookingLabels>>;

/** Strings for <PaymentStep>. */
export async function paymentLabels(opts: { submit: string; note: string | null; test: boolean }) {
  const t = await getTranslations("booking.checkout");
  return {
    title: t("paymentTitle"),
    details: t("paymentDetails"),
    submit: opts.test ? t("payTest") : opts.submit,
    processing: t("processing"),
    securePayment: t("securePayment"),
    note: opts.note,
    testNotice: opts.test ? t("testNotice") : null,
    testDecline: t("payTestDecline"),
    failed: t("paymentFailed"),
    loading: t("loadingPayment"),
    loadError: t("paymentLoadError"),
  };
}
