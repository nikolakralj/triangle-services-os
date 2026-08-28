"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

// ---------------------------------------------------------------------------
// One toolbar, filtering as you go.
//
// This used to be four full-width dropdowns stacked in a card, plus Filter and
// Reset buttons — half the screen spent on controls before a single worker was
// visible, and nothing happened until you pressed a button. A filter should
// answer immediately and get out of the way.
//
// Availability comes first as buttons rather than a select: "who can start
// now" is the question actually being asked, and it deserves one click.
// ---------------------------------------------------------------------------

const AVAILABILITY = [
  { value: "", label: "Anyone" },
  { value: "available", label: "Available" },
  { value: "available_soon", label: "Soon" },
  { value: "busy", label: "On a job" },
];

export function WorkersFilterForm({
  roles,
  skills,
  countries,
  initialSearch,
  initialRole,
  initialAvailability,
  initialCountry,
  initialSkill,
  resultCount,
  totalCount,
}: {
  roles: string[];
  skills: string[];
  countries: string[];
  initialSearch: string;
  initialRole: string;
  initialAvailability: string;
  initialCountry: string;
  initialSkill: string;
  resultCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState(initialSearch);
  const [role, setRole] = useState(initialRole);
  const [availability, setAvailability] = useState(initialAvailability);
  const [country, setCountry] = useState(initialCountry);
  const [skill, setSkill] = useState(initialSkill);

  // The URL stays the source of truth so a filtered pool can be linked and
  // shared — "here are the four people who could do it" is a message someone
  // sends, not a state they re-create by hand.
  function push(next: Record<string, string>) {
    const params = new URLSearchParams();
    const all = { search, role, availability, country, skill, ...next };
    for (const [k, v] of Object.entries(all)) if (v) params.set(k, v);
    const qs = params.toString();
    startTransition(() => router.replace(`/workers${qs ? `?${qs}` : ""}`));
  }

  // Typing should not fire a request per keystroke, but it also should not
  // wait for a button that no longer exists.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => push({ search }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const active: Array<{ label: string; clear: () => void }> = [];
  if (role) active.push({ label: role, clear: () => { setRole(""); push({ role: "" }); } });
  if (country) active.push({ label: country, clear: () => { setCountry(""); push({ country: "" }); } });
  if (skill) active.push({ label: skill, clear: () => { setSkill(""); push({ skill: "" }); } });
  if (search) active.push({ label: `"${search}"`, clear: () => setSearch("") });

  const selectCls =
    "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400";

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, role, skill…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* The question people actually ask, as one click. */}
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
          {AVAILABILITY.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => {
                setAvailability(a.value);
                push({ availability: a.value });
              }}
              className={`h-9 px-3 text-sm font-medium transition ${
                availability === a.value
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <select
          value={role}
          onChange={(e) => { setRole(e.target.value); push({ role: e.target.value }); }}
          className={selectCls}
        >
          <option value="">All roles</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <select
          value={skill}
          onChange={(e) => { setSkill(e.target.value); push({ skill: e.target.value }); }}
          className={selectCls}
        >
          <option value="">All skills</option>
          {skills.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={country}
          onChange={(e) => { setCountry(e.target.value); push({ country: e.target.value }); }}
          className={selectCls}
        >
          <option value="">All countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
        ) : (
          <span>
            {resultCount === totalCount
              ? `${totalCount} ${totalCount === 1 ? "person" : "people"}`
              : `${resultCount} of ${totalCount}`}
          </span>
        )}

        {active.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.clear}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-200"
          >
            {a.label}
            <X className="h-3 w-3" />
          </button>
        ))}

        {(active.length > 0 || availability) && (
          <button
            type="button"
            onClick={() => {
              setSearch(""); setRole(""); setAvailability(""); setCountry(""); setSkill("");
              startTransition(() => router.replace("/workers"));
            }}
            className="font-medium text-slate-500 underline hover:text-slate-800"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
