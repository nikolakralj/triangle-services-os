import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// What the company knows about a person, over time.
//
// The old `workers.notes` column was one text box the last editor overwrote.
// This is a dated log instead, because the useful question is almost always
// "when" — when did the client complain, when did he say he'd be free, when
// did we last place him.
// ---------------------------------------------------------------------------

import {
  NOTE_KINDS,
  type WorkerNote,
  type WorkerNoteKind,
} from "@/lib/data/worker-notes-shared";

export {
  NOTE_KINDS,
  NOTE_KIND_LABEL,
  type WorkerNote,
  type WorkerNoteKind,
} from "@/lib/data/worker-notes-shared";

export async function listWorkerNotes(
  workerId: string,
  orgId: string,
): Promise<WorkerNote[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data } = await svc
    .from("worker_notes")
    .select("id, kind, body, occurred_on, author_id, created_at")
    .eq("worker_id", workerId)
    .eq("org_id", orgId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Author names are presentation only — the log still reads without them.
  const names = new Map<string, string>();
  try {
    const { data: users } = await svc.auth.admin.listUsers({ page: 1, perPage: 100 });
    for (const u of users?.users ?? []) names.set(u.id, u.email ?? "member");
  } catch {
    /* ignore */
  }

  return rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as WorkerNoteKind,
    body: r.body as string,
    occurredOn: r.occurred_on as string,
    authorName: r.author_id ? names.get(r.author_id as string) ?? null : null,
    createdAt: r.created_at as string,
  }));
}

export async function addWorkerNote(params: {
  workerId: string;
  orgId: string;
  userId: string | null;
  kind: WorkerNoteKind;
  body: string;
  occurredOn?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, error: "Database unavailable" };

  const body = params.body.trim().slice(0, 4000);
  if (!body) return { ok: false, error: "Write something first." };

  // The worker must belong to this org — never take the id on trust from a
  // request just because the session is valid for some organisation.
  const { data: worker } = await svc
    .from("workers")
    .select("id")
    .eq("id", params.workerId)
    .eq("organization_id", params.orgId)
    .maybeSingle();
  if (!worker) return { ok: false, error: "Worker not found." };

  const { error } = await svc.from("worker_notes").insert({
    org_id: params.orgId,
    worker_id: params.workerId,
    kind: NOTE_KINDS.includes(params.kind) ? params.kind : "note",
    body,
    occurred_on: params.occurredOn || undefined,
    author_id: params.userId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Note counts for a list of workers, so the pool can show who has history. */
export async function countNotesByWorker(
  workerIds: string[],
  orgId: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const svc = createServiceSupabaseClient();
  if (!svc || workerIds.length === 0) return out;

  const { data } = await svc
    .from("worker_notes")
    .select("worker_id")
    .eq("org_id", orgId)
    .in("worker_id", workerIds);

  for (const r of data ?? []) {
    const k = r.worker_id as string;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}
