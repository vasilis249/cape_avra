import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-site px-5 sm:px-8 lg:px-12", className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-sans text-eyebrow font-medium uppercase text-ink-soft", className)}>{children}</p>
  );
}

/** Thin limestone rule used between eyebrow and heading. */
export function Hairline({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block h-px w-12 bg-limestone", className)} />;
}

export function Section({
  children,
  className,
  id,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  labelledBy?: string;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("py-20 sm:py-28 lg:py-36", className)}>
      {children}
    </section>
  );
}
