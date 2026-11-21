"use server";

import { after } from "next/server";
import { emailLayout, sendEmail } from "@/lib/email";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { siteConfig } from "@content/site.config";
import { contactSchema, dateIssues, waitlistSchema, type FormState } from "./schema";
import { saveLead, StoreUnavailableError, type LeadRecord } from "./store";

const PRIVACY_VERSION = "2026-11-20";
const MIN_FILL_MS = 2000; // measured from page load; humans take longer than this to fill the form

async function guard(form: FormData): Promise<FormState | null> {
  // honeypot: real visitors never see or fill this field
  if (form.get("website")) return { status: "success", email: String(form.get("email") ?? "") };
  const started = Number(form.get("startedAt") ?? 0);
  if (started && Date.now() - started < MIN_FILL_MS) return { status: "success", email: String(form.get("email") ?? "") };
  if (rateLimited(`lead:${await clientIp()}`)) return { status: "error", formError: "rate", values: values(form) };
  return null;
}

function values(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && !k.startsWith("$") && k !== "website" && k !== "startedAt") out[k] = v;
  return out;
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

async function persist(lead: LeadRecord, form: FormData, notify: () => Promise<void>): Promise<FormState> {
  try {
    await saveLead(lead);
  } catch (e) {
    console.error("[leads] save failed", e);
    return { status: "error", formError: e instanceof StoreUnavailableError ? "unavailable" : "generic", values: values(form) };
  }
  // emails go out after the response, so the visitor never waits for them
  after(async () => {
    try {
      await notify();
    } catch (e) {
      console.error("[leads] notification failed", e);
    }
  });
  return { status: "success", email: lead.email };
}

const ownerEmail = () => process.env.OWNER_NOTIFICATION_EMAIL ?? siteConfig.contact.email;
const fmtDate = (d?: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("el-GR", { dateStyle: "medium" }) : "—");

export async function submitWaitlist(_: FormState, form: FormData): Promise<FormState> {
  const blocked = await guard(form);
  if (blocked) return blocked;
  const raw = Object.fromEntries(form);
  const parsed = waitlistSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: { ...dateIssues(raw), ...fieldErrors(parsed.error.issues) }, values: values(form) };
  }
  const v = parsed.data;

  return persist(
    {
      kind: "waitlist",
      locale: v.locale,
      name: v.name,
      email: v.email,
      phone: v.phone,
      check_in: v.checkIn,
      check_out: v.checkOut,
      flexible: v.flexible,
      guests: v.guests,
      message: v.message,
      marketing_consent: v.marketing,
      privacy_version: PRIVACY_VERSION,
    },
    form,
    async () => {
      // to the owner (Greek)
      const owner = emailLayout(`Νέο αίτημα πρώιμης κράτησης: ${v.name}`, [
        ["Όνομα", v.name],
        ["Email", v.email],
        ["Τηλέφωνο", v.phone ?? "—"],
        ["Άφιξη", fmtDate(v.checkIn)],
        ["Αναχώρηση", fmtDate(v.checkOut)],
        ["Ευέλικτες ημερομηνίες", v.flexible ? "Ναι" : "Όχι"],
        ["Επισκέπτες", String(v.guests)],
        ["Γλώσσα", v.locale === "el" ? "Ελληνικά" : "Αγγλικά"],
        ["Νέα (marketing)", v.marketing ? "Ναι" : "Όχι"],
        ["Μήνυμα", v.message ?? "—"],
      ]);
      await sendEmail({ to: ownerEmail(), subject: `Αίτημα κράτησης: ${v.name} (${v.guests} άτομα)`, replyTo: v.email, ...owner });

      // auto-reply to the guest, in their language
      const el = v.locale === "el";
      const guest = emailLayout(
        el ? "Λάβαμε το αίτημά σας" : "We have received your request",
        [
          [el ? "Άφιξη" : "Arrival", v.checkIn ?? "—"],
          [el ? "Αναχώρηση" : "Departure", v.checkOut ?? "—"],
          [el ? "Επισκέπτες" : "Guests", String(v.guests)],
        ],
        el
          ? `Γεια σας ${v.name},\n\nευχαριστούμε για το ενδιαφέρον σας για το Cape Avra. Θα σας απαντήσουμε προσωπικά με τη διαθεσιμότητα και την τιμή για τις ημερομηνίες σας.\n\nCape Avra · Μύτικας, Πρέβεζα`
          : `Dear ${v.name},\n\nthank you for your interest in Cape Avra. We will reply personally with availability and the price for your dates.\n\nCape Avra · Mytikas, Preveza`,
      );
      await sendEmail({
        to: v.email,
        subject: el ? "Cape Avra: λάβαμε το αίτημά σας" : "Cape Avra: we have received your request",
        replyTo: siteConfig.contact.email,
        ...guest,
      });
    },
  );
}

export async function submitContact(_: FormState, form: FormData): Promise<FormState> {
  const blocked = await guard(form);
  if (blocked) return blocked;
  const parsed = contactSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error.issues), values: values(form) };
  const v = parsed.data;

  return persist(
    { kind: "contact", locale: v.locale, name: v.name, email: v.email, phone: v.phone, message: v.message, privacy_version: PRIVACY_VERSION },
    form,
    async () => {
      const owner = emailLayout(`Νέο μήνυμα: ${v.name}`, [
        ["Όνομα", v.name],
        ["Email", v.email],
        ["Τηλέφωνο", v.phone ?? "—"],
        ["Γλώσσα", v.locale === "el" ? "Ελληνικά" : "Αγγλικά"],
        ["Μήνυμα", v.message],
      ]);
      await sendEmail({ to: ownerEmail(), subject: `Μήνυμα από ${v.name}`, replyTo: v.email, ...owner });
    },
  );
}
