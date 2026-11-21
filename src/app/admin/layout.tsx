import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import A from "@content/messages/admin.el.json";
import { display, sans } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: `${A.common.title} · Cape Avra`, template: `%s · ${A.common.title} Cape Avra` },
  robots: { index: false, follow: false, nocache: true },
  referrer: "same-origin",
};
export const viewport: Viewport = { themeColor: "#1b2433", width: "device-width", initialScale: 1 };

/** Separate root layout: the admin has no public header/footer, no analytics, no consent banner. */
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="el" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-svh bg-salt text-ink">
        {/* every admin page reads the session cookie at request time */}
        <Suspense fallback={null}>{children}</Suspense>
      </body>
    </html>
  );
}
