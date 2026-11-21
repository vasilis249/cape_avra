import type { Metadata } from "next";
import Link from "next/link";
import { buttonOutline, dateTime, PageTitle, shortDate, table } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { cn } from "@/lib/cn";
import { listLeads, type LeadRow } from "@/lib/leads/store";
import A from "@content/messages/admin.el.json";

export const metadata: Metadata = { title: A.leads.title };
const L = A.leads;
const KINDS = ["all", "waitlist", "contact"] as const;

export default async function LeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  await requireAdmin();
  const sp = await searchParams;
  const kind = KINDS.includes(sp.kind as (typeof KINDS)[number]) ? (sp.kind as (typeof KINDS)[number]) : "all";
  let rows: LeadRow[] | null = null;
  try {
    rows = await listLeads();
  } catch (e) {
    console.error("[admin] leads", e);
  }
  const list = rows?.filter((r) => kind === "all" || r.kind === kind) ?? [];

  return (
    <>
      <PageTitle
        actions={
          rows && rows.length > 0 ? (
            <a href={`/admin/leads/export?kind=${kind}`} className={buttonOutline} download>
              {L.export}
            </a>
          ) : undefined
        }
      >
        {L.title}
      </PageTitle>
      <p className="mb-6 text-ink-soft">{L.lead}</p>
      <nav aria-label={L.title} className="mb-6 flex flex-wrap gap-1">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={{ query: { kind: k } }}
            aria-current={k === kind ? "page" : undefined}
            className={cn("border px-3 py-1.5 text-[0.875rem]", k === kind ? "border-ionian bg-ionian text-salt" : "border-limestone bg-white")}
          >
            {L.kinds[k]}
            {rows && <span className="ml-1 opacity-70">({rows.filter((r) => k === "all" || r.kind === k).length})</span>}
          </Link>
        ))}
      </nav>
      {rows === null ? (
        <p role="alert" className="text-[#9a4a2a]">{L.unavailable}</p>
      ) : list.length === 0 ? (
        <p className="text-ink-soft">{L.empty}</p>
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                {(["date", "kind", "name", "email", "phone", "dates", "guests", "message", "marketing"] as const).map((c) => (
                  <th key={c} scope="col" className={table.th}>{L.cols[c]}</th>
                ))}
                <th scope="col" className={table.th}><span className="sr-only">{L.createBooking}</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.id ?? `${r.created_at}-${i}`}>
                  <td className={cn(table.td, "whitespace-nowrap text-ink-soft")}>{dateTime(r.created_at)}</td>
                  <td className={table.td}>{L.kinds[r.kind]}</td>
                  <td className={table.td}>{r.name}</td>
                  <td className={table.td}>
                    <a href={`mailto:${r.email}`} className="text-ionian underline underline-offset-4">{r.email}</a>
                  </td>
                  <td className={cn(table.td, "whitespace-nowrap")}>{r.phone ?? A.common.none}</td>
                  <td className={cn(table.td, "whitespace-nowrap")}>
                    {r.check_in ? `${shortDate(r.check_in)}${r.check_out ? ` → ${shortDate(r.check_out)}` : ""}` : A.common.none}
                    {r.flexible && <span className="block text-[0.75rem] text-ink-soft">{L.flexible}</span>}
                  </td>
                  <td className={cn(table.td, "tabular-nums")}>{r.guests ?? A.common.none}</td>
                  <td className={cn(table.td, "max-w-sm whitespace-pre-line")}>{r.message ?? ""}</td>
                  <td className={table.td}>{r.marketing_consent ? A.booking.yes : A.booking.no}</td>
                  <td className={table.td}>
                    <Link
                      href={{
                        pathname: "/admin/bookings/new",
                        query: Object.fromEntries(
                          Object.entries({ name: r.name, email: r.email, phone: r.phone, checkIn: r.check_in, checkOut: r.check_out, guests: r.guests, locale: r.locale, message: r.message })
                            .filter(([, v]) => v !== undefined && v !== null && v !== "")
                            .map(([k, v]) => [k, String(v)]),
                        ),
                      }}
                      className="whitespace-nowrap text-ionian underline underline-offset-4"
                    >
                      {L.createBooking} →
                    </Link>
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
