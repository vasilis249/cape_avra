import type { Metadata } from "next";
import Link from "next/link";
import { NewBookingForm, type NewBookingDefaults } from "@/components/admin/NewBookingForm";
import { fill, PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { loadBookingConfig } from "@/lib/booking/config";
import { todayIn } from "@/lib/booking/dates";
import A from "@content/messages/admin.el.json";

export const metadata: Metadata = { title: A.newBooking.title };
const KEYS = ["checkIn", "checkOut", "guests", "locale", "name", "email", "phone", "message"] as const;

/** Prefilled from an early-booking request when opened from Αιτήματα (query parameters). */
export default async function NewBookingPage({ searchParams }: PageProps<"/admin/bookings/new">) {
  await requireAdmin();
  const sp = await searchParams;
  const defaults: NewBookingDefaults = {};
  for (const k of KEYS) if (typeof sp[k] === "string") defaults[k] = (sp[k] as string).slice(0, 2000);
  const config = await loadBookingConfig();
  return (
    <>
      <p className="mb-4 text-[0.875rem]">
        <Link href="/admin/bookings" className="text-ionian underline underline-offset-4">← {A.common.nav.bookings}</Link>
      </p>
      <PageTitle>{A.newBooking.title}</PageTitle>
      <p className="mb-2 max-w-3xl text-ink-soft">{A.newBooking.lead}</p>
      {defaults.name && <p className="mb-6 text-[0.9375rem] text-ionian">{fill(A.newBooking.fromLead, { name: defaults.name })}</p>}
      <div className="mt-6 max-w-4xl">
        <NewBookingForm config={config} today={todayIn(config.timeZone)} defaults={defaults} />
      </div>
    </>
  );
}
