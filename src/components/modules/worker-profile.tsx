"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Award,
  BadgeCheck,
  Briefcase,
  FileDown,
  FileText,
  RefreshCw,
  Car,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NOTE_KIND_LABEL,
  NOTE_KINDS,
  type WorkerNote,
  type WorkerNoteKind,
} from "@/lib/data/worker-notes-shared";

// ---------------------------------------------------------------------------
// A person, not a table row.
//
// Everything about someone on one page: what they can do, whether they can
// travel, what they cost, and — the part that was missing entirely — what the
// company has learned about them over time.
// ---------------------------------------------------------------------------

export interface ProfileWorker {
  id: string;
  fullName: string;
  role: string | null;
  workerType: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  languages: string[];
  skills: string[];
  certificates: string[];
  industries: string[];
  preferredCountries: string[];
  availabilityStatus: string;
  availableFrom: string | null;
  hourlyRate: number | null;
  dailyRate: number | null;
  currency: string;
  reliabilityScore: number | null;
  qualityScore: number | null;
  safetyScore: number | null;
  hasPassport: boolean | null;
  hasA1Possible: boolean | null;
  hasOwnTools: boolean | null;
  hasCar: boolean | null;
  legacyNotes: string | null;
  status: string;
}

const AVAILABILITY: Record<string, { label: string; cls: string }> = {
  available: { label: "Available now", cls: "bg-emerald-100 text-emerald-800" },
  available_soon: { label: "Available soon", cls: "bg-amber-100 text-amber-800" },
  busy: { label: "On a job", cls: "bg-slate-200 text-slate-700" },
  unknown: { label: "Availability unknown", cls: "bg-slate-100 text-slate-500" },
};

const KIND_STYLE: Record<string, string> = {
  note: "bg-slate-100 text-slate-600",
  feedback: "bg-emerald-50 text-emerald-700",
  availability: "bg-amber-50 text-amber-800",
  issue: "bg-rose-50 text-rose-700",
  commercial: "bg-sky-50 text-sky-700",
  document: "bg-violet-50 text-violet-700",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Chips({ items, tone }: { items: string[]; tone: string }) {
  if (items.length === 0) {
    return <p className="text-xs text-slate-400">Nothing recorded</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span key={s} className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export function WorkerProfile({
  worker,
  initialNotes,
  cvDocumentId = null,
  cvFileName = null,
}: {
  worker: ProfileWorker;
  initialNotes: WorkerNote[];
  /** The CV this profile was built from, if one is on file. */
  cvDocumentId?: string | null;
  cvFileName?: string | null;
}) {
  const router = useRouter();
  const [rereading, setRereading] = useState(false);
  const [rereadNote, setRereadNote] = useState<string | null>(null);

  // Every profile made before the upload started reading CVs is a husk. The
  // document is still on file, so the fix is to read it again rather than ask
  // for the same PDF twice.
  async function reread() {
    setRereading(true);
    setRereadNote(null);
    try {
      const res = await fetch(`/api/workers/${worker.id}/reread-cv`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        filled?: string[];
        note?: string;
      };
      if (!res.ok) {
        setRereadNote(data.error ?? "Could not read it.");
        return;
      }
      setRereadNote(
        data.filled?.length
          ? `Filled in ${data.filled.join(", ")}.`
          : (data.note ?? "Nothing new in it."),
      );
      router.refresh();
    } catch {
      setRereadNote("Network error.");
    } finally {
      setRereading(false);
    }
  }
  const [notes, setNotes] = useState<WorkerNote[]>(initialNotes);
  const [open, setOpen] = useState(initialNotes.length === 0);
  const [kind, setKind] = useState<WorkerNoteKind>("note");
  const [body, setBody] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avail = AVAILABILITY[worker.availabilityStatus] ?? AVAILABILITY.unknown;

  const facts: Array<{ label: string; on: boolean | null }> = [
    { label: "Passport", on: worker.hasPassport },
    { label: "A1 possible", on: worker.hasA1Possible },
    { label: "Own tools", on: worker.hasOwnTools },
    { label: "Car", on: worker.hasCar },
  ];

  async function save() {
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workers/${worker.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, kind, occurredOn: occurredOn || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        notes?: WorkerNote[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not save that.");
        return;
      }
      setNotes(data.notes ?? []);
      setBody("");
      setOccurredOn("");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  const rate =
    worker.dailyRate != null
      ? `${worker.dailyRate} ${worker.currency}/day`
      : worker.hourlyRate != null
        ? `${worker.hourlyRate} ${worker.currency}/h`
        : null;

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-white">
            {initials(worker.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-slate-950">{worker.fullName}</h1>
            <p className="mt-0.5 text-sm text-slate-600">
              {worker.role ?? "Role not recorded"}
              {worker.workerType ? ` · ${worker.workerType}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              {(worker.city || worker.country) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {[worker.city, worker.country].filter(Boolean).join(", ")}
                </span>
              )}
              {worker.email && (
                <a
                  href={`mailto:${worker.email}`}
                  className="inline-flex items-center gap-1 hover:text-slate-800"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {worker.email}
                </a>
              )}
              {worker.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {worker.phone}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${avail.cls}`}>
              {avail.label}
            </span>
            {worker.availableFrom && (
              <span className="text-xs text-slate-500">
                from{" "}
                {new Date(worker.availableFrom).toLocaleDateString([], {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
            {rate && <span className="text-sm font-semibold text-slate-800">{rate}</span>}

            {/* The document a buyer actually asks for. Anonymised first, and
                the named version is a separate, deliberate click — releasing a
                name and an address to a prospect who has committed to nothing
                is a disclosure, and an invitation to go direct. Neither
                version carries the rate: that is Triangle's cost. */}
            <div className="mt-1 flex flex-col items-end gap-1">
              <a
                href={`/api/workers/${worker.id}/cv`}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <FileDown className="h-3.5 w-3.5" />
                Triangle CV
              </a>
              <a
                href={`/api/workers/${worker.id}/cv?identity=1`}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
              >
                Named version, with contact details
              </a>
              {/* The document this profile was built from. It was stored and
                  attached to the person all along and shown on no screen, so
                  there was no way to check what the app had read against what
                  the CV actually said. */}
              {cvDocumentId && (
                <a
                  href={`/api/documents/${cvDocumentId}/signed-url?redirect=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:text-sky-900"
                >
                  <FileText className="h-3 w-3" />
                  {cvFileName ?? "Original CV"}
                </a>
              )}
              {cvDocumentId && (
                <button
                  type="button"
                  onClick={() => void reread()}
                  disabled={rereading}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
                >
                  {rereading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Read it again
                </button>
              )}
              {rereadNote && (
                <span className="max-w-[220px] text-right text-[11px] text-slate-500">
                  {rereadNote}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Memory — the reason this page exists */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  What we know about {worker.fullName.split(" ")[0]}
                </h2>
                <p className="text-xs text-slate-500">
                  Dated entries. This is the part a person forgets and the system does not.
                </p>
              </div>
              <Button
                variant={open ? "ghost" : "secondary"}
                className="h-8 px-2.5 text-xs"
                onClick={() => setOpen((v) => !v)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            {open && (
              <div className="space-y-2 border-b border-slate-100 bg-slate-50/60 p-4">
                <div className="flex flex-wrap gap-2">
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as WorkerNoteKind)}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    {NOTE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {NOTE_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={occurredOn}
                    onChange={(e) => setOccurredOn(e.target.value)}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    title="When did this happen? Defaults to today."
                  />
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={2}
                  placeholder="e.g. Client at BASF asked for him by name. Or: cannot do night shifts."
                  className="w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    className="h-8 px-3 text-xs"
                    disabled={saving || !body.trim()}
                    onClick={() => void save()}
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Save
                  </Button>
                  {error && (
                    <span className="flex items-center gap-1 text-xs text-rose-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {error}
                    </span>
                  )}
                </div>
              </div>
            )}

            {notes.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                Nothing recorded yet. Every time you learn something about this
                person — a client&apos;s reaction, a constraint, a rate they
                accepted — put it here and it stops being something only you know.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notes.map((n) => (
                  <li key={n.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_STYLE[n.kind] ?? KIND_STYLE.note}`}
                      >
                        {NOTE_KIND_LABEL[n.kind]}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(n.occurredOn).toLocaleDateString([], {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {n.authorName ? ` · ${n.authorName}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                      {n.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {worker.legacyNotes && (
            <Panel title="Imported note" icon={Briefcase}>
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {worker.legacyNotes}
              </p>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Skills" icon={Wrench}>
            <Chips items={worker.skills} tone="bg-slate-100 text-slate-700" />
          </Panel>

          <Panel title="Certificates" icon={Award}>
            <Chips items={worker.certificates} tone="bg-violet-50 text-violet-700" />
          </Panel>

          <Panel title="Languages" icon={Globe}>
            <Chips items={worker.languages} tone="bg-sky-50 text-sky-700" />
          </Panel>

          <Panel title="Can travel" icon={Car}>
            <ul className="space-y-1">
              {facts.map((f) => (
                <li key={f.label} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{f.label}</span>
                  <span
                    className={
                      f.on === true
                        ? "font-medium text-emerald-700"
                        : f.on === false
                          ? "text-slate-400"
                          : "text-slate-300"
                    }
                  >
                    {f.on === true ? "Yes" : f.on === false ? "No" : "Not known"}
                  </span>
                </li>
              ))}
            </ul>
            {worker.preferredCountries.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="mb-1 text-[11px] text-slate-500">Prefers</p>
                <Chips
                  items={worker.preferredCountries}
                  tone="bg-slate-100 text-slate-700"
                />
              </div>
            )}
          </Panel>

          {/* Explicitly boolean. `(0 || 0 || 0) && <Panel/>` is `0`, and React
              renders that as a literal "0" — a bare zero floating under the
              panels on every profile whose scores are all unset. */}
          {[worker.reliabilityScore, worker.qualityScore, worker.safetyScore].some(
            (s) => typeof s === "number" && s > 0,
          ) && (
            <Panel title="Track record" icon={BadgeCheck}>
              <ul className="space-y-1 text-xs">
                {[
                  ["Reliability", worker.reliabilityScore],
                  ["Quality", worker.qualityScore],
                  ["Safety", worker.safetyScore],
                ].map(([label, val]) => (
                  <li key={String(label)} className="flex items-center justify-between">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-medium text-slate-800">{val ?? 0}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
