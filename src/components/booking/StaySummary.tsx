import { getTranslations } from "next-intl/server";
import { diffDays } from "@/lib/booking/dates";
import type { Reservation } from "@/lib/booking/store";
import { stayTimes } from "@content/property";

/** Arrival / departure / guests block for checkout and confirmation. */
export async function StaySummary({ reservation: r, locale }: { reservation: Reservation; locale: "en" | "el" }) {
  const t = await getTranslations("booking");
  const te = await getTranslations("emails.rows");
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const n = diffDays(r.checkIn, r.checkOut);
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
      <div>
        <dt className="text-[0.75rem] tracking-[0.14em] text-ink-soft uppercase">{t("arrival")}</dt>
        <dd className="mt-1 font-display text-lg text-ink">{fmt(r.checkIn)}</dd>
        {stayTimes.checkIn && <dd className="text-[0.8125rem] text-ink-soft">{te("from", { time: stayTimes.checkIn })}</dd>}
      </div>
      <div>
        <dt className="text-[0.75rem] tracking-[0.14em] text-ink-soft uppercase">{t("departure")}</dt>
        <dd className="mt-1 font-display text-lg text-ink">{fmt(r.checkOut)}</dd>
        {stayTimes.checkOut && <dd className="text-[0.8125rem] text-ink-soft">{te("by", { time: stayTimes.checkOut })}</dd>}
      </div>
      <div>
        <dt className="text-[0.75rem] tracking-[0.14em] text-ink-soft uppercase">{te("nights")}</dt>
        <dd className="mt-1 text-ink">{n === 1 ? t("nightOne") : t("nightOther", { count: n })}</dd>
      </div>
      <div>
        <dt className="text-[0.75rem] tracking-[0.14em] text-ink-soft uppercase">{t("guests")}</dt>
        <dd className="mt-1 text-ink">{r.guests}</dd>
      </div>
    </dl>
  );
}
