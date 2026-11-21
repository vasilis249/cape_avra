import type { ReactNode } from "react";
import A from "@content/messages/admin.el.json";
import { cn } from "@/lib/cn";
import type { ReservationStatus } from "@/lib/booking/store";

export const money = (cents: number) =>
  new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
export const shortDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("el-GR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" });

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <h1 className="font-display text-4xl text-ionian">{children}</h1>
      {actions}
    </div>
  );
}

export function Card({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border border-limestone/60 bg-white p-5 sm:p-6", className)}>
      {title && <h2 className="mb-4 text-[0.75rem] font-sans tracking-[0.14em] text-ink-soft uppercase">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="border border-limestone/60 bg-white p-5">
      <p className="text-[0.75rem] font-sans tracking-[0.14em] text-ink-soft uppercase">{label}</p>
      <p className="mt-2 font-display text-3xl text-ionian tabular-nums">{value}</p>
      {note && <p className="mt-1 text-[0.8125rem] text-ink-soft">{note}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<ReservationStatus, string> = {
  confirmed: "bg-ionian text-salt",
  hold: "bg-sand text-ink",
  cancelled: "bg-[#f3e3dc] text-[#7a3517]",
  expired: "bg-sand text-ink-soft",
};
export function StatusBadge({ status }: { status: ReservationStatus }) {
  return <span className={cn("inline-block px-2 py-0.5 text-[0.75rem] whitespace-nowrap", STATUS_STYLE[status])}>{A.common.status[status]}</span>;
}

export const table = {
  wrap: "relative overflow-x-auto border border-limestone/60 bg-white",
  table: "w-full border-collapse text-left text-[0.875rem]",
  th: "border-b border-limestone/60 bg-sand/60 px-3 py-2 font-normal text-[0.75rem] tracking-[0.08em] text-ink-soft uppercase whitespace-nowrap",
  td: "border-b border-limestone/40 px-3 py-2 align-top",
};

export { button, buttonDanger, buttonOutline, fill, input, label } from "./ui-client";
