/** Static-demo stand-in for @/i18n/navigation (no Next.js router on GitHub Pages). */
import type { AnchorHTMLAttributes } from "react";

export function Link({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: unknown }) {
  return <a href={typeof href === "string" ? href : "#"} {...rest} />;
}
export const useRouter = () => ({ push: () => {}, replace: () => {} });
export const usePathname = () => "/book";
export const getPathname = () => "#";
export const redirect = () => {};
