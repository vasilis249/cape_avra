import type { Metadata } from "next";
import Link from "next/link";
import { Card, dateTime, fill, money, PageTitle, shortDate, Stat } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { dashboard, type Occupancy } from "@/lib/admin/stats";
import { loadBookingConfig } from "@/lib/booking/config";
import { addDays, diffDays, todayIn } from "@/lib/booking/dates";
import { getBookingStore, type Reservation } from "@/lib/booking/store";
import { listLeads } from "@/lib/leads/store";
import A from "@content/messages/admin.el.json";

export const metadata: Metadata = { title: A.dashboard.title };
const D = A.dashboard;

export default async function DashboardPage() {
  await requireAdmin();
  const store = getBookingStore();
  const config = await loadBookingConfig();
  const today = todayIn(config.timeZone);
  const y = Number(today.slice(0, 4));
  const [reservations, payments, blocks, leads] = await Promise.all([
    store.listReservations({ scope: "all", today }),
    store.allPayments(),
    store.listBlocks(`${y}-01-01`, addDays(`${y + 1}-12-31`, 1)),
    listLeads().catch(() => null),
  ]);
  const d = dashboard(config, today, reservations, payments, blocks);
  const weekAgo = addDays(today, -7);
  const newLeads = leads?.filter((l) => l.created_at.slice(0, 10) >= weekAgo).length ?? 0;
  const occ = (o: Occupancy) => fill(D.occupancyNote, { direct: o.directPercent });

  const now = new Date().toISOString();
  const awaiting = reservations.filter((r) => r.status === "hold" && !!r.guest && !!r.expiresAt && r.expiresAt > now);
  const attention: { label: string; items: { r: Reservation; extra?: string }[] }[] = [
    { label: D.awaitingPayment, items: awaiting.map((r) => ({ r, extra: `≤ ${dateTime(r.expiresAt!)}` })) },
    { label: D.balanceFailed, items: d.balanceFailed.map((r) => ({ r })) },
    { label: D.securityFailed, items: d.securityFailed.map((r) => ({ r })) },
    { label: D.securityHeld, items: d.securityHeld.map(({ r, p }) => ({ r, extra: money(p.amountCents) })) },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <PageTitle>{D.title}</PageTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={fill(D.revenueYear, { year: d.revenueYear })} value={money(d.revenueCents)} note={D.revenueNote} />
        <Stat label={D.bookedValue} value={money(d.bookedValueCents)} note={fill(D.bookedNote, { count: d.upcomingCount })} />
        <Stat label={D.outstanding} value={money(d.outstandingCents)} />
        <Stat label={D.occupancy30} value={`${d.occ30.percent}%`} note={occ(d.occ30)} />
        <Stat label={D.occupancy90} value={`${d.occ90.percent}%`} note={occ(d.occ90)} />
        <Stat label={fill(D.occupancySeason, { year: d.seasonYear })} value={`${d.occSeason.percent}%`} note={occ(d.occSeason)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card title={D.arrivals} className="lg:col-span-2">
          {d.inHouse.length > 0 && (
            <>
              <h3 className="mb-2 font-sans text-[0.8125rem] text-ink-soft">{D.inHouse}</h3>
              <StayList list={d.inHouse} today={today} />
              <hr className="my-4 border-limestone/60" />
            </>
          )}
          {d.arrivals.length ? <StayList list={d.arrivals} today={today} /> : <p className="text-ink-soft">{D.noArrivals}</p>}
        </Card>
        <Card title={D.attention}>
          {attention.length === 0 && newLeads === 0 && <p className="text-ink-soft">{D.allGood}</p>}
          <div className="space-y-5">
            {attention.map((g) => (
              <div key={g.label}>
                <h3 className="font-sans text-[0.875rem] text-ink">{g.label}</h3>
                <ul className="mt-1 space-y-1 text-[0.875rem]">
                  {g.items.map(({ r, extra }) => (
                    <li key={r.id}>
                      <Link href={`/admin/bookings/${r.id}`} className="text-ionian underline underline-offset-4">
                        {r.ref}
                      </Link>{" "}
                      · {r.guest?.name} · {shortDate(r.checkIn)}
                      {extra ? ` · ${extra}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {newLeads > 0 && (
              <p className="text-[0.875rem]">
                <Link href="/admin/leads" className="text-ionian underline underline-offset-4">
                  {D.newLeads}: {newLeads}
                </Link>
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function StayList({ list, today }: { list: Reservation[]; today: string }) {
  return (
    <ul className="divide-y divide-limestone/40">
      {list.map((r) => (
        <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-[0.9375rem]">
          <span>
            <Link href={`/admin/bookings/${r.id}`} className="font-medium text-ionian underline-offset-4 hover:underline">
              {r.guest?.name ?? r.ref}
            </Link>{" "}
            <span className="text-ink-soft">
              · {fill(D.nights, { count: diffDays(r.checkIn, r.checkOut) })} · {fill(D.guests, { count: r.guests })}
            </span>
          </span>
          <span className="text-ink-soft tabular-nums">
            {shortDate(r.checkIn)} → {shortDate(r.checkOut)}
            {r.checkIn > today && <span className="ml-2 text-[0.8125rem]">(+{diffDays(today, r.checkIn)})</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
