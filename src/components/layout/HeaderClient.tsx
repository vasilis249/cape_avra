"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { AppPathname } from "@/i18n/routing";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { LanguageSwitcher } from "./LanguageSwitcher";

export type NavItem = { href: AppPathname; label: string };

type HeaderClientProps = {
  variant: "overlay" | "solid";
  nav: NavItem[];
  cta: { href: AppPathname; label: string };
  labels: { menu: string; close: string; primary: string; language: string; home: string };
  languageNames: Record<string, string>;
  wordmark: ReactNode;
  monogram: ReactNode;
};

export function HeaderClient({ variant, nav, cta, labels, languageNames, wordmark, monogram }: HeaderClientProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  // Mobile menu: lock scroll, focus first link, close on Escape, trap Tab.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && panel) {
        const items = [...panel.querySelectorAll<HTMLElement>("a, button")];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const solid = variant === "solid" || scrolled;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background-color,color,box-shadow] duration-500",
        solid
          ? "bg-salt/92 text-ink shadow-[0_1px_0_rgb(191_174_147/0.45)] backdrop-blur-md"
          : "bg-gradient-to-b from-night/45 to-transparent text-salt",
      )}
    >
      <div className="mx-auto flex h-16 max-w-site items-center justify-between gap-6 px-5 sm:px-8 lg:h-20 lg:px-12">
        <Link href="/" aria-label={`Cape Avra · ${labels.home}`} className="flex min-h-11 items-center gap-3">
          <span className="w-9 shrink-0 lg:w-10">{monogram}</span>
          <span
            className={cn(
              // 1024–1279px: monogram only, so the booking button always fits
              "w-36 transition-opacity duration-500 sm:w-44 lg:max-xl:hidden",
              solid ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {wordmark}
          </span>
        </Link>

        <nav aria-label={labels.primary} className="hidden lg:block">
          <ul className="flex items-center gap-5 text-[0.8125rem] tracking-[0.12em] whitespace-nowrap uppercase xl:gap-8">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="py-3 opacity-85 transition-opacity hover:opacity-100">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2 lg:gap-6">
          <LanguageSwitcher label={labels.language} names={languageNames} className="max-sm:hidden" />
          <Link
            href={cta.href}
            className={buttonClasses(solid ? "primary" : "outline-light", "sm", "whitespace-nowrap max-lg:hidden")}
          >
            {cta.label}
          </Link>
          <button
            ref={buttonRef}
            type="button"
            className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-3 px-2 text-[0.75rem] uppercase tracking-[0.18em] lg:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen(true)}
          >
            <span>{labels.menu}</span>
            <span aria-hidden="true" className="flex w-6 flex-col gap-[5px]">
              <span className="h-px w-full bg-current" />
              <span className="h-px w-2/3 bg-current" />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        id={menuId}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labels.primary}
        hidden={!open}
        className="fixed inset-0 z-50 flex flex-col bg-night text-salt lg:hidden"
      >
        <div className="flex h-16 items-center justify-between px-5 sm:px-8">
          <span className="w-9">{monogram}</span>
          <button
            type="button"
            onClick={close}
            className="-mr-2 inline-flex min-h-11 items-center gap-3 px-2 text-[0.75rem] uppercase tracking-[0.18em]"
          >
            {labels.close}
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" stroke="currentColor">
              <path d="M2 2l12 12M14 2L2 14" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
        <nav aria-label={labels.primary} className="flex flex-1 flex-col justify-center px-8">
          <ul className="space-y-2">
            {[{ href: "/" as AppPathname, label: labels.home }, ...nav].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block py-2 font-display text-[2.1rem] leading-tight"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-6 px-8 pb-10">
          <Link href={cta.href} onClick={() => setOpen(false)} className={buttonClasses("light", "md", "w-full")}>
            {cta.label}
          </Link>
          <LanguageSwitcher label={labels.language} names={languageNames} className="justify-center" />
        </div>
      </div>
    </header>
  );
}
