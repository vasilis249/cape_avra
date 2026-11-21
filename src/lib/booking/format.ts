/** Long date for UI and emails, e.g. "Saturday 12 June 2027" / "Σάββατο 12 Ιουνίου 2027". */
export const longDate = (d: string, locale: "en" | "el", weekday: "long" | "short" = "long") =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { weekday, day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
