import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "light" | "outline-light" | "text";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-3 text-center text-[0.8125rem] font-medium uppercase tracking-[0.18em] transition-colors duration-300 ease-[var(--ease-breeze)]";

const sizes: Record<Size, string> = {
  md: "min-h-12 px-7 py-3",
  sm: "min-h-11 px-5 py-2",
};

const variants: Record<Variant, string> = {
  primary: "bg-ionian text-salt hover:bg-ionian-deep",
  outline: "border border-ionian/40 text-ionian hover:border-ionian hover:bg-ionian hover:text-salt",
  light: "bg-salt text-ionian hover:bg-white",
  "outline-light": "border border-salt/50 text-salt hover:border-salt hover:bg-salt hover:text-night",
  text: "min-h-11 text-ionian underline decoration-ionian/30 underline-offset-8 hover:decoration-ionian",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variant !== "text" && sizes[size], variants[variant], className);
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

/** Locale-aware link styled as a button. */
export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link {...props} className={buttonClasses(variant, size, className)} />;
}

export function ArrowRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 12" className={cn("h-3 w-6", className)} fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M0 6h22M17 1l5 5-5 5" strokeWidth="1.2" />
    </svg>
  );
}
