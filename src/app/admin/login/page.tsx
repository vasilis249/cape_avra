import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginFrame } from "@/components/admin/LoginFrame";
import { RequestLinkForm } from "@/components/admin/LoginForms";
import { fill } from "@/components/admin/ui";
import { adminConfigured, getAdmin, LINK_MINUTES } from "@/lib/admin/auth";
import A from "@content/messages/admin.el.json";

export const metadata: Metadata = { title: A.login.title };

export default async function LoginPage() {
  if (await getAdmin()) redirect("/admin");
  return (
    <LoginFrame title={A.login.title} lead={fill(A.login.lead, { minutes: LINK_MINUTES })}>
      {adminConfigured() ? <RequestLinkForm devHint={!process.env.RESEND_API_KEY} /> : <p role="alert">{A.login.notConfigured}</p>}
    </LoginFrame>
  );
}
