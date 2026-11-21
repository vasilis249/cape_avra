import "server-only";
import { appendFile, mkdir, readFile } from "node:fs/promises";
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

export type LeadRow = LeadRecord & { id?: string; created_at: string };

/** All leads, newest first (admin). Throws StoreUnavailableError on Vercel without Supabase. */
export async function listLeads(): Promise<LeadRow[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/leads?select=*&order=created_at.desc&limit=5000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Supabase select failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as LeadRow[];
  }
  if (process.env.VERCEL) throw new StoreUnavailableError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  try {
    const text = await readFile(path.join(process.cwd(), ".data", "leads.jsonl"), "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LeadRow)
      .reverse();
  } catch {
    return [];
  }
}

const CSV_COLUMNS = ["created_at", "kind", "locale", "name", "email", "phone", "check_in", "check_out", "flexible", "guests", "message", "marketing_consent"] as const;

/** CSV for Excel/Sheets: UTF-8 BOM (Greek), quoted cells, formula injection neutralised. */
export function leadsToCsv(rows: LeadRow[]): string {
  const cell = (v: unknown) => {
    let s = v === undefined || v === null ? "" : String(v);
    // formula injection: =, @, tabs, or +/- followed by anything but a number (phone numbers stay as they are)
    if (/^[=@\t\r]/.test(s) || /^[+-].*[^\d\s().-]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [CSV_COLUMNS.join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => cell(r[c as keyof LeadRow])).join(","))];
  return "\ufeff" + lines.join("\r\n") + "\r\n";
}
