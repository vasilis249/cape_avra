"use client";

import { Analytics } from "@vercel/analytics/next";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/Button";

const KEY = "ca-consent";
const OPEN_EVENT = "ca:consent-open";
type Choice = "granted" | "denied";

function read(): Choice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(KEY, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(KEY, cb);
  };
};

/**
 * Cookie/consent banner. Only essential storage is used without consent;
 * Vercel Web Analytics (cookieless) loads only after "Allow analytics".
 */
export function ConsentBanner({
  labels,
}: {
  labels: { label: string; text: string; accept: string; decline: string; policy: string };
}) {
  // undefined on the server/first paint → banner hidden until we know the stored choice
  const choice = useSyncExternalStore(subscribe, read, () => undefined);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  const decide = (c: Choice) => {
    try {
      localStorage.setItem(KEY, c);
    } catch {}
    window.dispatchEvent(new Event(KEY));
    setReopened(false);
  };

  const show = choice === null || reopened;

  return (
    <>
      {choice === "granted" && <Analytics />}
      {show && (
        <section
          role="region"
          aria-label={labels.label}
          className="fixed inset-x-3 bottom-3 z-50 bg-night p-5 text-salt shadow-[0_10px_40px_rgb(27_36_51/0.35)] sm:inset-x-auto sm:left-6 sm:bottom-6 sm:max-w-md sm:p-6"
        >
          <p className="text-[0.9375rem] leading-relaxed text-salt/90">
            {labels.text}{" "}
            <Link href="/legal/cookies" className="underline decoration-salt/40 underline-offset-4 hover:decoration-salt">
              {labels.policy}
            </Link>
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => decide("granted")} className={buttonClasses("light", "sm", "flex-1")}>
              {labels.accept}
            </button>
            <button type="button" onClick={() => decide("denied")} className={buttonClasses("outline-light", "sm", "flex-1")}>
              {labels.decline}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

/** Footer link that reopens the banner. */
export function CookieSettingsButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} className={className}>
      {label}
    </button>
  );
}
