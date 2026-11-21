"use client";

import Link from "next/link";
import { useActionState } from "react";
import A from "@content/messages/admin.el.json";
import { requestLoginLink, verifyLogin, type ActionState } from "@/lib/admin/actions";
import { button, input, label } from "./ui-client";

export function RequestLinkForm({ devHint }: { devHint: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestLoginLink, {});
  if (state.ok) {
    return (
      <div role="status" className="space-y-3 bg-sand p-5 text-ink">
        <p>{state.message}</p>
        {devHint && <p className="text-[0.875rem] text-ink-soft">{A.login.devHint}</p>}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className={label}>
          {A.login.email}
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={input} />
      </div>
      {state.error && (
        <p role="alert" className="text-[0.875rem] text-[#9a4a2a]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={button}>
        {pending ? A.login.sending : A.login.submit}
      </button>
    </form>
  );
}

export function VerifyForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(verifyLogin, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="text-[0.875rem] text-[#9a4a2a]">
          {state.error}{" "}
          <Link href="/admin/login" className="text-ionian underline underline-offset-4">
            {A.login.requestNew}
          </Link>
        </p>
      )}
      <button type="submit" disabled={pending} className={button}>
        {pending ? A.common.saving : A.login.verifySubmit}
      </button>
    </form>
  );
}
