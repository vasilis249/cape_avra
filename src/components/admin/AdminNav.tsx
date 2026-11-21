"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import A from "@content/messages/admin.el.json";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/admin", label: A.common.nav.dashboard },
  { href: "/admin/bookings", label: A.common.nav.bookings },
  { href: "/admin/calendar", label: A.common.nav.calendar },
  { href: "/admin/pricing", label: A.common.nav.pricing },
  { href: "/admin/leads", label: A.common.nav.leads },
  { href: "/admin/photos", label: A.common.nav.photos },
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label={A.common.navLabel} className="overflow-x-auto">
      <ul className="flex gap-1 whitespace-nowrap">
        {ITEMS.map((i) => {
          const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn("block px-3 py-2 text-[0.875rem]", active ? "bg-salt text-ionian" : "text-salt/85 hover:text-salt")}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
