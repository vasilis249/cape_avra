import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { SyncButton } from "@/components/admin/SyncButton";
import { button, Card, fill, input, label, PageTitle, shortDate } from "@/components/admin/ui";
import { addBlock, removeBlock } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { loadBookingConfig } from "@/lib/booking/config";
import { addDays, addMonths, todayIn, type ISODate } from "@/lib/booking/dates";
import { configuredFeeds } from "@/lib/booking/jobs";
import { getBookingStore, type CalendarBlock, type Reservation } from "@/lib/booking/store";
import { cn } from "@/lib/cn";
import { siteUrl } from "@/lib/seo";
import A from "@content/messages/admin.el.json";

export const metadata: Metadata = { title: A.calendar.title };
const C = A.calendar;
const MONTHS = 3;

type DayInfo = { kind: "direct" | "hold" | "imported" | "manual"; label: string; href?: string };

export default async function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  await requireAdmin();
  const config = await loadBookingConfig();
  const today = todayIn(config.timeZone);
  const sp = await searchParams;
  const m = typeof sp.m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const start = `${m}-01` as ISODate;
  const end = addMonths(start, MONTHS);
  const store = getBookingStore();
  const [reservations, blocks] = await Promise.all([store.listReservations({ scope: "all", today }), store.listBlocks(start, end)]);

  const days = new Map<ISODate, DayInfo>();
  const paint = (from: ISODate, to: ISODate, info: DayInfo) => {
    for (let d = from; d < to; d = addDays(d, 1)) if (!days.has(d) || info.kind === "direct") days.set(d, info);
  };
  for (const b of blocks) paint(b.start, b.end, { kind: b.source === "manual" ? "manual" : "imported", label: b.source === "manual" ? b.summary || C.legendManual : fill(C.legendImported, { source: b.source }) });
  for (const r of reservations.filter((x) => x.status === "hold" && x.expiresAt && x.expiresAt > new Date().toISOString())) paint(r.checkIn, r.checkOut, { kind: "hold", label: `${r.ref} · ${C.legendHold}`, href: `/admin/bookings/${r.id}` });
  for (const r of reservations.filter((x: Reservation) => x.status === "confirmed")) paint(r.checkIn, r.checkOut, { kind: "direct", label: `${r.ref} · ${r.guest?.name ?? ""}`, href: `/admin/bookings/${r.id}` });

  const manual = (await store.listBlocks(today, addMonths(today, 24))).filter((b: CalendarBlock) => b.source === "manual");
  const sources = [...new Set(blocks.filter((b) => b.source !== "manual").map((b) => b.source))];
  const feeds = Object.keys(configuredFeeds());
  const exportToken = process.env.ICAL_EXPORT_TOKEN;

  return (
    <>
      <PageTitle
        actions={
          <div className="flex gap-2 text-[0.875rem]">
            <Link href={{ query: { m: addMonths(start, -MONTHS).slice(0, 7) } }} className="border border-limestone bg-white px-3 py-1.5" aria-label={C.prev}>←</Link>
            <Link href={{ query: { m: addMonths(start, MONTHS).slice(0, 7) } }} className="border border-limestone bg-white px-3 py-1.5" aria-label={C.next}>→</Link>
          </div>
        }
      >
        {C.title}
      </PageTitle>

      <ul className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-[0.8125rem] text-ink-soft">
        <Legend kind="direct" text={C.legendDirect} />
        <Legend kind="hold" text={C.legendHold} />
        {(sources.length ? sources : ["Airbnb / Booking.com"]).map((s) => <Legend key={s} kind="imported" text={fill(C.legendImported, { source: s })} />)}
        <Legend kind="manual" text={C.legendManual} />
      </ul>

      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: MONTHS }, (_, i) => addMonths(start, i)).map((first) => (
          <Month key={first} first={first} days={days} today={today} />
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card title={C.addTitle} className="lg:col-span-2">
          <p className="mb-4 text-[0.9375rem] text-ink-soft">{C.addLead}</p>
          <ActionForm action={addBlock} submit={C.addSubmit} submitClass={button} resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="b-start" className={label}>{C.from}</label>
                <input id="b-start" name="start" type="date" min={today} required className={input} />
              </div>
              <div>
                <label htmlFor="b-end" className={label}>{C.to}</label>
                <input id="b-end" name="end" type="date" min={today} required className={input} />
              </div>
              <div>
                <label htmlFor="b-summary" className={label}>{C.summary}</label>
                <input id="b-summary" name="summary" maxLength={120} className={input} />
              </div>
            </div>
          </ActionForm>
          <h3 className="mt-8 mb-2 text-[0.75rem] font-sans tracking-[0.14em] text-ink-soft uppercase">{C.blocksTitle}</h3>
          {manual.length === 0 ? (
            <p className="text-[0.9375rem] text-ink-soft">{C.noBlocks}</p>
          ) : (
            <ul className="divide-y divide-limestone/40">
              {manual.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-4 py-2 text-[0.9375rem]">
                  <span>
                    {shortDate(b.start)} → {shortDate(b.end)}
                    {b.summary && <span className="text-ink-soft"> · {b.summary}</span>}
                  </span>
                  <form action={removeBlock}>
                    <input type="hidden" name="id" value={b.id} />
                    <button type="submit" className="text-[0.875rem] text-ionian underline underline-offset-4">{C.removeBlock}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={C.syncTitle}>
          <p className="mb-4 text-[0.9375rem] text-ink-soft">{feeds.length ? `${C.syncLead} (${feeds.join(", ")})` : C.syncNone}</p>
          {feeds.length > 0 && <SyncButton />}
          <h3 className="mt-6 mb-2 font-sans text-[0.8125rem] text-ink-soft">{C.exportUrl}</h3>
          {exportToken ? (
            <input readOnly aria-label={C.exportUrl} value={`${siteUrl}/api/ical/${exportToken}`} className={cn(input, "text-[0.8125rem]")} />
          ) : (
            <p className="text-[0.875rem] text-ink-soft">{C.exportMissing}</p>
          )}
        </Card>
      </div>
    </>
  );
}

const KIND_STYLE: Record<DayInfo["kind"], string> = {
  direct: "bg-ionian text-salt",
  hold: "bg-agave text-night",
  imported: "bg-limestone text-night",
  manual: "bg-night/80 text-salt",
};

function Legend({ kind, text }: { kind: DayInfo["kind"]; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className={cn("inline-block h-3 w-3", KIND_STYLE[kind])} /> {text}
    </li>
  );
}

function Month({ first, days, today }: { first: ISODate; days: Map<ISODate, DayInfo>; today: ISODate }) {
  const title = new Date(`${first}T12:00:00Z`).toLocaleDateString("el-GR", { month: "long", year: "numeric", timeZone: "UTC" });
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const next = addMonths(first, 1);
  const cells: (ISODate | null)[] = Array.from({ length: offset }, () => null);
  for (let d = first; d < next; d = addDays(d, 1)) cells.push(d);
  const wd = A.pricing.weekdays;
  return (
    <section className="border border-limestone/60 bg-white p-4">
      <h2 className="mb-3 font-display text-xl text-ionian capitalize">{title}</h2>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.8125rem]" role="grid" aria-label={title}>
        {[1, 2, 3, 4, 5, 6, 0].map((i) => (
          <div key={i} className="pb-1 text-[0.75rem] text-ink-soft" role="columnheader">{wd[i]}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} />;
          const info = days.get(d);
          const content = (
            <span className={cn("flex aspect-square items-center justify-center tabular-nums", info ? KIND_STYLE[info.kind] : "bg-salt", d === today && "ring-2 ring-dusk ring-inset", d < today && "opacity-50")}>
              {Number(d.slice(8))}
            </span>
          );
          return (
            <div key={d} role="gridcell" title={info ? `${shortDate(d)} · ${info.label}` : shortDate(d)}>
              {info?.href ? <Link href={info.href} aria-label={`${shortDate(d)}: ${info.label}`}>{content}</Link> : content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
