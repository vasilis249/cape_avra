"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

/** Re-renders the server component every few seconds (payment confirmation pending). Stops after `max` tries. */
export function AutoRefresh({ seconds = 3, max = 20 }: { seconds?: number; max?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      if (++n > max) return window.clearInterval(id);
      router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds, max]);
  return null;
}
