import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { fill } from "@/components/admin/ui";
import { logout } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import A from "@content/messages/admin.el.json";

/** Shell for signed-in pages. Every page and action also checks the session itself. */
export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const payments = process.env.PAYMENTS_PROVIDER ?? (process.env.VERCEL_ENV === "production" ? "" : "test");
  const testMode = payments === "test" || (payments === "stripe" && /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? ""));
  return (
    <div className="min-h-svh">
      <header className="bg-night text-salt">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-4 sm:px-6">
          <p className="font-display text-xl tracking-[0.2em]">
            CAPE AVRA <span className="ml-2 font-sans text-[0.75rem] tracking-[0.14em] text-salt/70 uppercase">{A.common.title}</span>
          </p>
          <div className="flex items-center gap-4 text-[0.8125rem] text-salt/80">
            <span className="hidden sm:inline">{fill(A.common.signedInAs, { email: admin.email })}</span>
            <Link href="/" className="underline underline-offset-4 hover:text-salt">
              {A.common.viewSite}
            </Link>
            <form action={logout}>
              <button type="submit" className="underline underline-offset-4 hover:text-salt">
                {A.common.logout}
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-2 pt-3 sm:px-4">
          <AdminNav />
        </div>
      </header>
      {testMode && <p className="bg-sand px-4 py-2 text-center text-[0.8125rem] text-[#7a3517]">{payments ? A.common.testPayments : A.common.paymentsOff}</p>}
      {!payments && <p className="bg-sand px-4 py-2 text-center text-[0.8125rem] text-[#7a3517]">{A.common.paymentsOff}</p>}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">{children}</main>
    </div>
  );
}
