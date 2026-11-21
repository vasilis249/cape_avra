import { getAdmin } from "@/lib/admin/auth";
import { leadsToCsv, listLeads } from "@/lib/leads/store";

/** CSV of all leads (signed-in owner only). */
export async function GET(req: Request) {
  if (!(await getAdmin())) return new Response("Unauthorized", { status: 401 });
  const kind = new URL(req.url).searchParams.get("kind");
  const rows = (await listLeads()).filter((r) => !kind || kind === "all" || r.kind === kind);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(leadsToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cape-avra-leads-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
