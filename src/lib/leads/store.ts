import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type LeadRecord = {
  kind: "waitlist" | "contact";
  locale: "en" | "el";
  name: string;
  email: string;
  phone?: string;
  check_in?: string;
  check_out?: string;
  flexible?: boolean;
  guests?: number;
  message?: string;
  marketing_consent?: boolean;
  privacy_version: string;
};

export class StoreUnavailableError extends Error {}

/**
 * Persists a lead.
 * - Supabase (Postgres REST, service-role key, server only) when configured.
 * - Otherwise, outside Vercel: appends to .data/leads.jsonl for local testing.
 * - On Vercel without configuration: refuses, so the form tells visitors to email instead.
 */
export async function saveLead(lead: LeadRecord): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key) {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/leads`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(lead),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Supabase insert failed: ${res.status} ${await res.text()}`);
    return;
  }

  if (process.env.VERCEL) throw new StoreUnavailableError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");

  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "leads.jsonl"), JSON.stringify({ ...lead, created_at: new Date().toISOString() }) + "\n");
  console.info(`[leads] saved ${lead.kind} from ${lead.email} to .data/leads.jsonl (no Supabase configured)`);
}
