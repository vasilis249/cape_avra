import { runDaily } from "@/lib/booking/jobs";
import { isAuthorizedCron } from "@/lib/http/cron-auth";

export const maxDuration = 60;

/** Release expired holds, send pre-arrival and review emails (Vercel Cron, see vercel.json). */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runDaily());
}
