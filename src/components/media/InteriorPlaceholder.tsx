import { getTranslations } from "next-intl/server";
import { AgaveMotif } from "@/components/brand/AgaveMotif";
import { cn } from "@/lib/cn";

/**
 * Elegant stand-in for interior photos that don't exist yet.
 * Rendered automatically when a space in content/property.ts has `photo: null`.
 */
export async function InteriorPlaceholder({ label, className }: { label: string; className?: string }) {
  const t = await getTranslations("placeholder");
  return (
    <figure className={cn("linen relative flex flex-col justify-between overflow-hidden p-5 sm:p-6", className)}>
      <AgaveMotif className="absolute -right-3 bottom-0 w-16 text-limestone/60 sm:w-20" />
      <figcaption className="relative font-display text-h3 text-ink">{label}</figcaption>
      <p className="relative max-w-[14rem] text-[0.6875rem] font-medium uppercase leading-relaxed tracking-[0.2em] text-ink-soft">
        {t("comingSoon")}
      </p>
    </figure>
  );
}
