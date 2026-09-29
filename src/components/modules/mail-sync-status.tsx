"use client";

import { mailboxReadSentence } from "@/lib/job-intake/sync-status";

export interface MailSyncStatusRow {
  emailAddress: string;
  readThrough: string | null;
  lastAttempt: string | null;
  failure: string | null;
  paused: boolean;
}

// Settings → Diagnostics. One line per mailbox Triangle reads itself.
// Not a page, and not a control: the read runs on its own.

export function MailSyncStatus({ rows }: { rows: MailSyncStatusRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-slate-500">
        No mailbox is connected for Triangle to read.
      </p>
    );
  }

  const format = (iso: string) => new Date(iso).toLocaleString();

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
      {rows.map((row) => {
        const sentence = mailboxReadSentence({
          emailAddress: row.emailAddress,
          readThrough: row.readThrough,
          lastAttempt: row.lastAttempt,
          failure: row.failure,
          paused: row.paused,
          format,
        });
        return (
          <li
            key={row.emailAddress}
            className="px-3 py-2.5 text-[13px] text-slate-700"
            suppressHydrationWarning
          >
            {sentence}
          </li>
        );
      })}
    </ul>
  );
}
