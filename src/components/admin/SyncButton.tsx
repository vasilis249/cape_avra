"use client";

import { useState, useTransition } from "react";
import A from "@content/messages/admin.el.json";
import { syncNow } from "@/lib/admin/actions";
import type { SyncResult } from "@/lib/booking/jobs";
import { buttonOutline, fill } from "./ui-client";

export function SyncButton() {
  const [pending, start] = useTransition();
  const [results, setResults] = useState<SyncResult[] | null>(null);
  return (
    <div className="space-y-3">
      <button type="button" disabled={pending} className={buttonOutline} onClick={() => start(async () => setResults(((await syncNow()).data as SyncResult[]) ?? []))}>
        {pending ? A.common.saving : A.calendar.syncNow}
      </button>
      {results && (
        <ul role="status" className="space-y-1 text-[0.875rem]">
          {results.length === 0 && <li className="text-ink-soft">{A.calendar.syncNone}</li>}
          {results.map((r) => (
            <li key={r.source} className={r.ok ? "text-olive" : "text-[#9a4a2a]"}>
              {r.ok ? fill(A.calendar.syncOk, { source: r.source, count: r.events ?? 0 }) : fill(A.calendar.syncFail, { source: r.source, error: r.error ?? "" })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
