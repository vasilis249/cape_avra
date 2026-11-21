import { z } from "zod";
import { capacity } from "@content/property";

/**
 * Server-side validation for the public forms. Error messages are codes;
 * the client maps them to translated text (content/messages: form.errors.*).
 */
const trimmed = (max: number) => z.string().trim().max(max, "tooLong");
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

const base = {
  locale: z.enum(["en", "el"]),
  name: trimmed(120).min(2, "required"),
  email: z.string().trim().max(200, "tooLong").email("email"),
  phone: optionalText(40),
  privacy: z.literal("on", { message: "privacy" }),
};

export const waitlistSchema = z
  .object({
    ...base,
    checkIn: isoDate,
    checkOut: isoDate,
    flexible: z
      .literal("on")
      .optional()
      .transform((v) => v === "on"),
    guests: z.coerce.number({ message: "guests" }).int("guests").min(1, "guests").max(capacity.guests, "guests"),
    message: optionalText(2000),
    marketing: z
      .literal("on")
      .optional()
      .transform((v) => v === "on"),
  })
  .superRefine((v, ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    if (v.checkIn && v.checkIn < today) ctx.addIssue({ code: "custom", path: ["checkIn"], message: "datesPast" });
    if (v.checkIn && v.checkOut && v.checkOut <= v.checkIn)
      ctx.addIssue({ code: "custom", path: ["checkOut"], message: "dates" });
  });

/** Date checks on raw input, so they can be reported together with other field errors. */
export function dateIssues(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const inD = typeof raw.checkIn === "string" ? raw.checkIn : "";
  const outD = typeof raw.checkOut === "string" ? raw.checkOut : "";
  const today = new Date().toISOString().slice(0, 10);
  if (inD && inD < today) out.checkIn = "datesPast";
  if (inD && outD && outD <= inD) out.checkOut = "dates";
  return out;
}

export const contactSchema = z.object({
  ...base,
  message: trimmed(4000).min(2, "required"),
});

export type WaitlistInput = z.infer<typeof waitlistSchema>;
export type ContactInput = z.infer<typeof contactSchema>;

// client-safe part lives in form-state.ts so the browser bundle does not include zod
export { initialFormState, type FormState } from "./form-state";
