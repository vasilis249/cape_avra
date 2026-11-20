import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** "I have read the privacy policy" with a localized link (rendered on the server). */
export async function privacyConsentLabel() {
  const t = await getTranslations("form");
  return t.rich("privacy", {
    link: (chunks) => (
      <Link href="/legal/privacy" target="_blank" className="text-ionian underline decoration-ionian/40 underline-offset-4">
        {chunks}
      </Link>
    ),
  });
}
