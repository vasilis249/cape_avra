import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import A from "@content/messages/admin.el.json";

export function LoginFrame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6 py-16">
      <div className="w-44 text-ionian">
        <Wordmark decorative />
      </div>
      <p className="mt-2 text-[0.75rem] tracking-[0.2em] text-ink-soft uppercase">{A.common.title}</p>
      <h1 className="mt-10 font-display text-4xl text-ionian">{title}</h1>
      <p className="mt-4 text-ink-soft">{lead}</p>
      <div className="mt-8">{children}</div>
    </main>
  );
}
