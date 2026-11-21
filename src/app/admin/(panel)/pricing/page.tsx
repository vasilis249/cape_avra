import type { Metadata } from "next";
import { ConfirmSubmit } from "@/components/admin/ActionForm";
import { PricingEditor } from "@/components/admin/PricingEditor";
import { buttonOutline, PageTitle } from "@/components/admin/ui";
import { resetPricing } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { loadBookingConfig } from "@/lib/booking/config";
import { todayIn } from "@/lib/booking/dates";
import { getBookingStore } from "@/lib/booking/store";
import A from "@content/messages/admin.el.json";

export const metadata: Metadata = { title: A.pricing.title };

export default async function PricingPage() {
  await requireAdmin();
  const config = await loadBookingConfig();
  const stored = await getBookingStore().loadConfig().catch(() => null);
  return (
    <>
      <PageTitle
        actions={
          stored ? (
            <form action={resetPricing}>
              <ConfirmSubmit confirm={A.pricing.resetConfirm} className={buttonOutline}>{A.pricing.reset}</ConfirmSubmit>
            </form>
          ) : undefined
        }
      >
        {A.pricing.title}
      </PageTitle>
      <p className="mb-2 max-w-3xl text-ink-soft">{A.pricing.lead}</p>
      <p className="mb-8 text-[0.875rem] text-ink-soft">{stored ? A.pricing.source.db : A.pricing.source.seed}</p>
      <PricingEditor initial={config} today={todayIn(config.timeZone)} />
    </>
  );
}
