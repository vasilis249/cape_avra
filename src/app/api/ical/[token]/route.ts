import { timingSafeEqual } from "node:crypto";
import { buildICal } from "@/lib/booking/ical";
import { getBookingStore } from "@/lib/booking/store";

/**
 * Our availability for Airbnb / Booking.com to import:
 *   https://capeavra.com/api/ical/<ICAL_EXPORT_TOKEN>
 * The token keeps the feed unlisted; rotate it by changing the env var.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = process.env.ICAL_EXPORT_TOKEN;
  const given = token.replace(/\.ics$/, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("Not found", { status: 404 });
  }
  const ics = buildICal(await getBookingStore().exportEvents(), { name: "Cape Avra" });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="cape-avra.ics"',
      "Cache-Control": "no-store",
    },
  });
}
