"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/** Sticky "check availability / early booking" bar on phones, shown once the hero is scrolled past. */
export function MobileBookBar({ label, note }: { label: string; note?: string }) {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // pointless on the booking page itself
  if (pathname === "/book") return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-limestone/50 bg-salt/94 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md transition-transform duration-500 lg:hidden",
        visible ? "translate-y-0" : "translate-y-full",
      )}
      aria-hidden={!visible}
    >
      <Link href="/book" tabIndex={visible ? 0 : -1} className={buttonClasses("primary", "md", "w-full")}>
        {label}
      </Link>
      {note && <p className="mt-2 text-center text-[0.75rem] text-ink-soft">{note}</p>}
    </div>
  );
}
