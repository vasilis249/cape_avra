import { getTranslations } from "next-intl/server";
import type { LeadFormLabels } from "./LeadForm";

/** Builds the form's translated labels on the server (client components get plain strings). */
export async function leadFormLabels(kind: "waitlist" | "contact"): Promise<LeadFormLabels> {
  const t = await getTranslations("form");
  const codes = ["required", "email", "dates", "datesPast", "guests", "privacy", "tooLong", "generic", "rate", "unavailable"] as const;
  return {
    name: t("name"),
    email: t("email"),
    phone: t("phone"),
    optional: t("optional"),
    phoneHint: t("phoneHint"),
    checkIn: t("checkIn"),
    checkOut: t("checkOut"),
    flexible: t("flexible"),
    guests: t("guests"),
    message: t("message"),
    marketing: t("marketing"),
    submit: kind === "waitlist" ? t("submitWaitlist") : t("submitContact"),
    sending: t("sending"),
    successTitle: t("successTitle"),
    success: (kind === "waitlist" ? t.raw("successWaitlist") : t.raw("successContact")) as string,
    errors: Object.fromEntries(codes.map((c) => [c, t.raw(`errors.${c}`) as string])),
  };
}
