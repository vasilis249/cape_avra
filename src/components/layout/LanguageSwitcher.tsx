"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type AppPathname } from "@/i18n/routing";
import { cn } from "@/lib/cn";

/** EN · EL switcher that keeps the visitor on the equivalent translated page. */
export function LanguageSwitcher({
  label,
  names,
  className,
}: {
  label: string;
  names: Record<string, string>;
  className?: string;
}) {
  const locale = useLocale();
  const pathname = usePathname() as AppPathname;
  const href = pathname in routing.pathnames ? pathname : "/";

  return (
    <nav aria-label={label} className={cn("flex items-center gap-1 text-[0.75rem] tracking-[0.18em]", className)}>
      {routing.locales.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true" className="opacity-40">·</span>}
          <Link
            href={href}
            locale={l}
            lang={l}
            hrefLang={l}
            aria-current={l === locale ? "true" : undefined}
            className={cn(
              "inline-flex min-h-11 min-w-9 items-center justify-center uppercase transition-opacity",
              l === locale ? "opacity-100" : "opacity-75 hover:opacity-100", // ≥ 4.5:1 on salt and on night
            )}
          >
            {l}
            <span className="sr-only"> · {names[l]}</span>
          </Link>
        </span>
      ))}
    </nav>
  );
}
