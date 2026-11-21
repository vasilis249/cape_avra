"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import A from "@content/messages/admin.el.json";
import type { ActionState } from "@/lib/admin/actions";
import { cn } from "@/lib/cn";

/** Submit button that asks for confirmation first (for forms bound to a plain server action). */
export function ConfirmSubmit({ children, confirm, className }: { children: ReactNode; confirm: string; className: string }) {
  return (
    <button type="submit" className={className} onClick={(e) => { if (!window.confirm(confirm)) e.preventDefault(); }}>
      {children}
    </button>
  );
}

/** Form bound to an admin server action, with pending state and an accessible result message. */
export function ActionForm({
  action,
  submit,
  submitClass,
  className,
  children,
  confirm,
  resetOnSuccess,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  submit: string;
  submitClass: string;
  className?: string;
  children?: ReactNode;
  /** native confirm() text before submitting */
  confirm?: string;
  /** clear the fields after a successful submit (e.g. a new note) */
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      className={cn("space-y-4", className)}
      // dispatched by hand: a form `action` would reset every field, also after an error
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? A.common.saving : submit}
        </button>
        {state.error && (
          <p role="alert" className="text-[0.875rem] text-[#9a4a2a]">
            {state.error}
          </p>
        )}
        {state.message && !state.error && (
          <p role="status" className="text-[0.875rem] text-olive">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
