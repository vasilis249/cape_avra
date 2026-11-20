import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** Locale negotiation + translated-slug rewrites (Next 16 "Proxy", formerly Middleware). */
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, Vercel internals and any file with an extension.
  matcher: "/((?!api|admin|_next|_vercel|.*\\..*).*)",
};
