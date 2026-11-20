import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { isLocale, routing } from "./routing";

export default getRequestConfig(async ({ locale: override }) => {
  const candidate = override ?? (await rootLocale());
  const locale = isLocale(candidate) ? candidate : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../content/messages/${locale}.json`)).default,
    timeZone: "Europe/Athens",
  };
});
