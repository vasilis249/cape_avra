import type { Metadata } from "next";
import Link from "next/link";
import { button, input, money, PageTitle, shortDate, StatusBadge, table } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { netPaidOf } from "@/lib/admin/stats";
import { loadBookingConfig } from "@/lib/booking/config";
import { diffDays, todayIn } from "@/lib/booking/dates";
import { getBookingStore, type ReservationScope } from "@/lib/booking/store";
import { cn } from "@/lib/cn";
import A from "@content/messages/admin.el.json";

export const metadata: Metadata = { title: A.bookings.title };
const B = A.bookings;
const SCOPES: ReservationScope[] = ["upcoming", "past", "cancelled", "all"];

export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  await requireAdmin();
  const sp = await searchParams;
  const scope = SCOPES.includes(sp.scope as ReservationScope) ? (sp.scope as ReservationScope) : "upcoming";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const config = await loadBookingConfig();
  const store = getBookingStore();
  const [list, payments] = await Promise.all([store.listReservations({ scope, today: todayIn(config.timeZone), q: q || undefined }), store.allPayments()]);

  return (
    <>
      <PageTitle>{B.title}</PageTitle>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label={B.title} className="flex flex-wrap gap-1">
          {SCOPES.map((s) => (
            <Link
              key={s}
              href={{ pathname: "/admin/bookings", query: { scope: s, ...(q ? { q } : {}) } }}
              aria-current={s === scope ? "page" : undefined}
              className={cn("border px-3 py-1.5 text-[0.875rem]", s === scope ? "border-ionian bg-ionian text-salt" : "border-limestone bg-white text-ink")}
            >
              {B.scopes[s]}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2">
          <input type="hidden" name="scope" value={scope} />
          <label htmlFor="q" className="sr-only">
            {B.search}
          </label>
          <input id="q" name="q" defaultValue={q} placeholder={B.search} className={cn(input, "w-72 max-w-full")} />
          <button type="submit" className={button}>
            {B.searchSubmit}
          </button>
        </form>
      </div>

      {list.length === 0 ? (
        <p className="text-ink-soft">{B.empty}</p>
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                {(["ref", "guest", "dates", "nights", "guests", "total", "paid", "status"] as const).map((c) => (
                  <th key={c} scope="col" className={table.th}>
                    {B.cols[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-salt">
                  <td className={table.td}>
                    <Link href={`/admin/bookings/${r.id}`} className="font-medium whitespace-nowrap text-ionian underline-offset-4 hover:underline">
                      {r.ref}
                    </Link>
                  </td>
                  <td className={table.td}>
                    {r.guest?.name ?? A.common.none}
                    <div className="text-[0.8125rem] text-ink-soft">{r.guest?.email}</div>
                  </td>
                  <td className={cn(table.td, "whitespace-nowrap")}>
                    {shortDate(r.checkIn)} → {shortDate(r.checkOut)}
                  </td>
                  <td className={cn(table.td, "tabular-nums")}>{diffDays(r.checkIn, r.checkOut)}</td>
                  <td className={cn(table.td, "tabular-nums")}>{r.guests}</td>
                  <td className={cn(table.td, "text-right tabular-nums whitespace-nowrap")}>{money(r.totalCents)}</td>
                  <td className={cn(table.td, "text-right tabular-nums whitespace-nowrap")}>{money(netPaidOf(r, payments))}</td>
                  <td className={table.td}>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
