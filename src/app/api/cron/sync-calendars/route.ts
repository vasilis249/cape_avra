import { syncCalendars } from "@/lib/booking/jobs";
import { isAuthorizedCron } from "@/lib/http/cron-auth";

export const maxDuration = 60;

/** Import Airbnb / Booking.com calendars (Vercel Cron, see vercel.json). */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  const results = await syncCalendars();
  return Response.json({ results }, { status: results.some((r) => !r.ok) ? 207 : 200 });
}
