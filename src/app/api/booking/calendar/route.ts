import { getCalendarData } from "@/lib/booking/service";
import { StoreUnavailableError } from "@/lib/booking/store";

/** Availability + booking rules for the calendar (prices are public anyway). */
export async function GET() {
  try {
    return Response.json(await getCalendarData(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof StoreUnavailableError) return Response.json({ error: "unavailable" }, { status: 503 });
    console.error("[calendar] failed", e);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
