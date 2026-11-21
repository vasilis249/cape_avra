import type { Metadata } from "next";
import { LoginFrame } from "@/components/admin/LoginFrame";
import { VerifyForm } from "@/components/admin/LoginForms";
import A from "@content/messages/admin.el.json";

export const metadata: Metadata = { title: A.login.verifyTitle };

/** GET only shows a button: link scanners in mail clients must not be able to sign in or burn the link. */
export default async function VerifyPage({ searchParams }: PageProps<"/admin/login/verify">) {
  const token = String((await searchParams).token ?? "");
  return (
    <LoginFrame title={A.login.verifyTitle} lead={A.login.verifyLead}>
      <VerifyForm token={token} />
    </LoginFrame>
  );
}
