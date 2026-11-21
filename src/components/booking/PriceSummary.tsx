import { addDays } from "@/lib/booking/dates";
import { formatMoney, type Quote } from "@/lib/booking/pricing";
import { cn } from "@/lib/cn";

export type PriceSummaryLabels = {
  nights: string; // "{nights} × average {rate}"
  nightOne: string;
  nightOther: string;
  extraGuests: string;
  cleaning: string;
  discount: string; // "{percent}"
  total: string;
  deposit: string; // "{percent}"
  full: string;
  balance: string; // "{date}"
  onArrival: string;
  /** owner-agreed price difference */
  adjustment?: string;
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** Price breakdown of a quote. No hooks: renders on the server (checkout) and in the browser (calendar). */
export function PriceSummary({
  quote,
  locale,
  labels,
  depositPercent,
  balanceDaysBeforeArrival,
  className,
}: {
  quote: Quote;
  locale: "en" | "el";
  labels: PriceSummaryLabels;
  depositPercent: number;
  balanceDaysBeforeArrival: number;
  className?: string;
}) {
  const money = (c: number) => formatMoney(c, locale);
  const n = quote.nights.length;
  const nightsLabel = n === 1 ? labels.nightOne : fill(labels.nightOther, { count: n });
  // indicative average, shown in whole euros
  const avg = Math.round(quote.accommodationCents / n / 100) * 100;
  const dueDate = new Date(`${addDays(quote.checkIn, -balanceDaysBeforeArrival)}T12:00:00Z`).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const row = "flex items-baseline justify-between gap-6 py-2";
  return (
    <div className={cn("text-[0.9375rem]", className)}>
      <dl className="divide-y divide-limestone/50">
        <div className={row}>
          <dt className="text-ink-soft">{fill(labels.nights, { nights: nightsLabel, rate: money(avg) })}</dt>
          <dd className="tabular-nums">{money(quote.accommodationCents)}</dd>
        </div>
        {quote.extraGuestCents > 0 && (
          <div className={row}>
            <dt className="text-ink-soft">{labels.extraGuests}</dt>
            <dd className="tabular-nums">{money(quote.extraGuestCents)}</dd>
          </div>
        )}
        {quote.discount && (
          <div className={row}>
            <dt className="text-ink-soft">{fill(labels.discount, { percent: quote.discount.percent })}</dt>
            <dd className="tabular-nums text-olive">−{money(quote.discount.cents)}</dd>
          </div>
        )}
        <div className={row}>
          <dt className="text-ink-soft">{labels.cleaning}</dt>
          <dd className="tabular-nums">{money(quote.cleaningCents)}</dd>
        </div>
        {quote.lineItems
          .filter((l) => l.includedInTotal)
          .map((l) => (
            <div key={l.id} className={row}>
              <dt className="text-ink-soft">{l.label[locale]}</dt>
              <dd className="tabular-nums">{money(l.cents)}</dd>
            </div>
          ))}
        {!!quote.adjustmentCents && (
          <div className={row}>
            <dt className="text-ink-soft">{labels.adjustment}</dt>
            <dd className={cn("tabular-nums", quote.adjustmentCents < 0 && "text-olive")}>
              {quote.adjustmentCents < 0 ? `−${money(-quote.adjustmentCents)}` : money(quote.adjustmentCents)}
            </dd>
          </div>
        )}
        <div className={cn(row, "pt-4")}>
          <dt className="font-display text-xl text-ink">{labels.total}</dt>
          <dd className="font-display text-xl tabular-nums text-ink">{money(quote.totalCents)}</dd>
        </div>
        <div className={row}>
          <dt className="text-ink">{quote.payment.mode === "full" ? labels.full : fill(labels.deposit, { percent: depositPercent })}</dt>
          <dd className="tabular-nums text-ink">{money(quote.payment.depositCents)}</dd>
        </div>
        {quote.payment.balanceCents > 0 && (
          <div className={row}>
            <dt className="text-ink-soft">{fill(labels.balance, { date: dueDate })}</dt>
            <dd className="tabular-nums text-ink-soft">{money(quote.payment.balanceCents)}</dd>
          </div>
        )}
        {quote.payOnArrivalCents > 0 && (
          <div className={row}>
            <dt className="text-ink-soft">{labels.onArrival}</dt>
            <dd className="tabular-nums text-ink-soft">{money(quote.payOnArrivalCents)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
