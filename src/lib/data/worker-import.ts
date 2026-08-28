import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Roster import.
//
// The previous CSV path parked rows in `import_rows` and stopped. It told you
// "Import batch accepted: 240 rows" and created nothing — and what it could
// eventually create was a COMPANY, one row at a time, at the cost of an
// OpenAI call per click. There was never a way to get a worker into Triangle
// in bulk. This is that way.
//
// Two rules shape it:
//
//   Nobody's roster uses our column names. It will say "Nachname", "Verfügbar
//   ab", "Stundensatz". So the importer maps columns, guesses the obvious
//   ones, and lets a human fix the rest.
//
//   No model is involved. Splitting "A1, VCA, SCC" into three certificates is
//   string work, not reasoning, and Grok already costs a flat subscription
//   while the API bills per token.
// ---------------------------------------------------------------------------

export type WorkerFieldKey =
  | "full_name"
  | "role"
  | "worker_type"
  | "email"
  | "phone"
  | "country"
  | "city"
  | "languages"
  | "skills"
  | "certificates"
  | "industries"
  | "availability_status"
  | "available_from"
  | "preferred_countries"
  | "hourly_rate_expectation"
  | "daily_rate_expectation"
  | "currency"
  | "has_passport"
  | "has_a1_possible"
  | "has_own_tools"
  | "has_car"
  | "notes";

type FieldKind = "text" | "list" | "number" | "boolean" | "date" | "availability";

interface FieldSpec {
  key: WorkerFieldKey;
  label: string;
  kind: FieldKind;
  /** Lowercased header fragments that mean this field, in several languages. */
  aliases: string[];
}

// Aliases cover English, German, Polish and Croatian because that is who the
// crews and their paperwork actually come from.
export const WORKER_FIELDS: FieldSpec[] = [
  {
    key: "full_name",
    label: "Full name",
    kind: "text",
    aliases: ["full name", "name", "worker", "employee", "person", "imie", "ime", "nazwisko", "prezime", "nachname", "vorname"],
  },
  { key: "role", label: "Role / trade", kind: "text", aliases: ["role", "trade", "position", "job title", "title", "beruf", "funktion", "stanowisko", "zanimanje"] },
  { key: "worker_type", label: "Worker type", kind: "text", aliases: ["worker type", "type", "contract", "employment", "art"] },
  { key: "email", label: "Email", kind: "text", aliases: ["email", "e-mail", "mail", "e mail"] },
  { key: "phone", label: "Phone", kind: "text", aliases: ["phone", "mobile", "tel", "telefon", "handy", "gsm", "number"] },
  { key: "country", label: "Country", kind: "text", aliases: ["country", "land", "kraj", "drzava", "država", "nationality"] },
  { key: "city", label: "City", kind: "text", aliases: ["city", "town", "stadt", "miasto", "grad", "ort"] },
  { key: "languages", label: "Languages", kind: "list", aliases: ["language", "languages", "sprache", "sprachen", "jezyk", "jezik"] },
  { key: "skills", label: "Skills", kind: "list", aliases: ["skill", "skills", "competenc", "faehigkeit", "fähigkeit", "kenntnisse", "umiejetnosci", "vjestine", "vještine"] },
  { key: "certificates", label: "Certificates", kind: "list", aliases: ["certificate", "certificates", "cert", "certs", "qualification", "zertifikat", "schein", "uprawnienia", "certifikat", "a1", "vca", "scc"] },
  { key: "industries", label: "Industries", kind: "list", aliases: ["industry", "industries", "sector", "branche", "branza", "branša"] },
  {
    key: "availability_status",
    label: "Availability",
    kind: "availability",
    aliases: ["availability", "available", "status", "verfugbar", "verfügbar", "dostepnosc", "dostupnost"],
  },
  {
    key: "available_from",
    label: "Available from",
    kind: "date",
    aliases: ["available from", "from", "start", "free from", "verfugbar ab", "verfügbar ab", "ab", "od", "slobodan od"],
  },
  { key: "preferred_countries", label: "Preferred countries", kind: "list", aliases: ["preferred countr", "preferred", "willing to work", "wunschland"] },
  { key: "hourly_rate_expectation", label: "Hourly rate", kind: "number", aliases: ["hourly", "hour rate", "per hour", "stundensatz", "stundenlohn", "stawka godzinowa", "satnica", "eur/h", "€/h"] },
  { key: "daily_rate_expectation", label: "Daily rate", kind: "number", aliases: ["daily", "day rate", "per day", "tagessatz", "stawka dzienna", "dnevnica"] },
  { key: "currency", label: "Currency", kind: "text", aliases: ["currency", "waehrung", "währung", "waluta", "valuta"] },
  { key: "has_passport", label: "Has passport", kind: "boolean", aliases: ["passport", "reisepass", "pass", "paszport", "putovnica"] },
  { key: "has_a1_possible", label: "A1 possible", kind: "boolean", aliases: ["a1 possible", "a1 certificate", "a1 form", "a1"] },
  { key: "has_own_tools", label: "Own tools", kind: "boolean", aliases: ["tools", "own tools", "werkzeug", "narzedzia", "alat"] },
  { key: "has_car", label: "Has car", kind: "boolean", aliases: ["car", "vehicle", "auto", "driving", "fuehrerschein", "führerschein", "samochod"] },
  { key: "notes", label: "Notes", kind: "text", aliases: ["note", "notes", "comment", "remark", "bemerkung", "notiz", "uwagi", "napomena"] },
];

const FIELD_BY_KEY = new Map(WORKER_FIELDS.map((f) => [f.key, f]));

/** header (as written in the CSV) -> field key, or "" to ignore the column. */
export type ColumnMapping = Record<string, WorkerFieldKey | "">;

const normalizeHeader = (h: string) =>
  h.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Best guess at what each column means.
 *
 * Exact alias matches are taken first across ALL columns before any fuzzy
 * match is considered: otherwise a column called "Name" can swallow the
 * `full_name` slot before the column actually called "Full Name" is reached,
 * and the good mapping loses to the merely adjacent one.
 */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<WorkerFieldKey>();
  for (const h of headers) mapping[h] = "";

  const match = (exact: boolean) => {
    for (const h of headers) {
      if (mapping[h]) continue;
      const n = normalizeHeader(h);
      for (const f of WORKER_FIELDS) {
        if (taken.has(f.key)) continue;
        const hit = exact
          ? f.aliases.some((a) => n === a)
          : f.aliases.some((a) => n.includes(a));
        if (hit) {
          mapping[h] = f.key;
          taken.add(f.key);
          break;
        }
      }
    }
  };

  match(true);
  match(false);
  return mapping;
}

// ── Value parsing ───────────────────────────────────────────────────────────

const TRUE_WORDS = new Set(["yes", "y", "true", "1", "x", "ja", "tak", "da", "si", "oui", "✓", "✔"]);
const FALSE_WORDS = new Set(["no", "n", "false", "0", "nein", "nie", "ne", "-"]);

function parseBoolean(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (TRUE_WORDS.has(v)) return true;
  if (FALSE_WORDS.has(v)) return false;
  return null;
}

/** Split a multi-value cell. Handles "A1, VCA; SCC / IPAF" and newlines. */
function parseList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,;/|\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s !== "-"),
    ),
  );
}

/** Money and hours, tolerating "€ 28,50", "28.50 EUR", "1 200". */
function parseNumber(raw: string): number | null {
  let v = raw.replace(/[^\d.,-]/g, "").trim();
  if (!v) return null;
  const lastComma = v.lastIndexOf(",");
  const lastDot = v.lastIndexOf(".");
  if (lastComma > -1 && lastComma > lastDot) {
    // European decimal comma: 1.234,56
    v = v.replace(/\./g, "").replace(",", ".");
  } else {
    v = v.replace(/,/g, "");
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** ISO out. Accepts ISO, D/M/Y and D.M.Y — the formats these rosters use. */
function parseDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Day-first, because every locale in this business writes it that way.
  const dmy = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const month = Number(m);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/**
 * Availability has to land on one of four values or the matching engine and
 * the filters silently ignore the worker. Anything unrecognised becomes
 * "unknown", which is honest, rather than "available", which is a guess that
 * would put someone in front of a client.
 */
function parseAvailability(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return "unknown";
  if (/(^|\W)(busy|occupied|engaged|besetzt|zajety|zauzet|on project|working)/.test(v)) return "busy";
  if (/(soon|shortly|bald|wkrotce|uskoro|from|ab \d|next month)/.test(v)) return "available_soon";
  if (/(available|free|frei|verfugbar|verfügbar|dostepny|slobodan|ready|yes|ja|tak|da)/.test(v)) return "available";
  if (/(unknown|unclear|\?|n\/a|na)/.test(v)) return "unknown";
  return "unknown";
}

export interface PreviewRow {
  rowNumber: number;
  /** create | update | skip */
  action: "create" | "update" | "skip";
  fullName: string;
  matchedWorkerId: string | null;
  /** Reason the row cannot be imported, when action is skip. */
  skipReason: string | null;
  /** Things worth telling the human that are not fatal. */
  warnings: string[];
  values: Record<string, unknown>;
}

export interface ImportPreview {
  rows: PreviewRow[];
  counts: { create: number; update: number; skip: number };
  unmappedHeaders: string[];
}

function buildValues(
  raw: Record<string, string>,
  mapping: ColumnMapping,
): { values: Record<string, unknown>; warnings: string[] } {
  const values: Record<string, unknown> = {};
  const warnings: string[] = [];

  for (const [header, key] of Object.entries(mapping)) {
    if (!key) continue;
    const spec = FIELD_BY_KEY.get(key);
    if (!spec) continue;

    const cell = String(raw[header] ?? "").trim();
    if (!cell) continue;

    switch (spec.kind) {
      case "list": {
        const list = parseList(cell);
        if (list.length > 0) {
          // Two columns can feed one list field (e.g. "Cert 1", "Cert 2").
          const existing = (values[key] as string[]) ?? [];
          values[key] = Array.from(new Set([...existing, ...list]));
        }
        break;
      }
      case "number": {
        const n = parseNumber(cell);
        if (n === null) warnings.push(`${spec.label}: could not read "${cell}"`);
        else values[key] = n;
        break;
      }
      case "boolean": {
        const b = parseBoolean(cell);
        if (b === null) warnings.push(`${spec.label}: could not read "${cell}"`);
        else values[key] = b;
        break;
      }
      case "date": {
        const d = parseDate(cell);
        if (d === null) warnings.push(`${spec.label}: could not read the date "${cell}"`);
        else values[key] = d;
        break;
      }
      case "availability": {
        const a = parseAvailability(cell);
        values[key] = a;
        if (a === "unknown" && cell.length > 0) {
          warnings.push(`Availability: "${cell}" not recognised, set to unknown`);
        }
        break;
      }
      default: {
        const existing = values[key];
        // Two name columns ("Vorname", "Nachname") join into one full name
        // rather than one overwriting the other.
        values[key] = existing ? `${existing} ${cell}`.trim() : cell;
      }
    }
  }

  // If availability was never given but a start date was, say what the date
  // implies instead of leaving everyone "unknown" and unmatchable.
  if (!values.availability_status && typeof values.available_from === "string") {
    const from = new Date(values.available_from as string);
    values.availability_status = from <= new Date() ? "available" : "available_soon";
  }

  return { values, warnings };
}

/** Fields where an update should add to what is on record, not replace it. */
const LIST_FIELDS: WorkerFieldKey[] = [
  "languages",
  "skills",
  "certificates",
  "industries",
  "preferred_countries",
];

export async function previewWorkerImport(params: {
  orgId: string;
  rows: Array<Record<string, string>>;
  mapping: ColumnMapping;
}): Promise<ImportPreview> {
  const svc = createServiceSupabaseClient();
  const { rows, mapping } = params;

  // Existing roster, so the preview can say create or update honestly.
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  const existingLists = new Map<string, Record<string, string[]>>();
  if (svc) {
    const { data } = await svc
      .from("workers")
      .select(
        "id, full_name, email, languages, skills, certificates, industries, preferred_countries",
      )
      .eq("organization_id", params.orgId);
    for (const w of data ?? []) {
      const id = w.id as string;
      if (w.email) byEmail.set(String(w.email).toLowerCase(), id);
      byName.set(String(w.full_name).toLowerCase().trim(), id);
      const lists: Record<string, string[]> = {};
      for (const f of LIST_FIELDS) {
        lists[f] = ((w as Record<string, unknown>)[f] as string[]) ?? [];
      }
      existingLists.set(id, lists);
    }
  }

  // Duplicates inside the file itself are as likely as duplicates against the
  // database — a roster that lists someone twice should not create them twice.
  const seenInFile = new Set<string>();
  const out: PreviewRow[] = [];

  rows.forEach((raw, i) => {
    const { values, warnings } = buildValues(raw, mapping);
    const fullName = String(values.full_name ?? "").trim();
    const email = String(values.email ?? "").trim().toLowerCase();

    if (!fullName) {
      out.push({
        rowNumber: i + 1,
        action: "skip",
        fullName: "",
        matchedWorkerId: null,
        skipReason: "No name — every worker needs one.",
        warnings,
        values,
      });
      return;
    }

    const fingerprint = email || fullName.toLowerCase();
    if (seenInFile.has(fingerprint)) {
      out.push({
        rowNumber: i + 1,
        action: "skip",
        fullName,
        matchedWorkerId: null,
        skipReason: "Appears earlier in this file.",
        warnings,
        values,
      });
      return;
    }
    seenInFile.add(fingerprint);

    // Email is the reliable identity; name is the fallback and is why
    // re-importing a roster updates people instead of cloning them.
    const matched =
      (email ? byEmail.get(email) : undefined) ??
      byName.get(fullName.toLowerCase()) ??
      null;

    if (matched && !email) {
      warnings.push("Matched by name only — check this is the same person.");
    }

    if (matched) {
      // Add to what is on record rather than replacing it. A roster listing
      // one skill per person must not erase the four already known about
      // them — losing data silently is worse than carrying a stale entry,
      // and a wrong one can still be removed by hand.
      const have = existingLists.get(matched) ?? {};
      for (const f of LIST_FIELDS) {
        const incoming = (values[f] as string[]) ?? [];
        const current = have[f] ?? [];
        if (incoming.length === 0) continue;
        const lower = new Set(current.map((v) => v.toLowerCase()));
        const added = incoming.filter((v) => !lower.has(v.toLowerCase()));
        values[f] = [...current, ...added];
        if (added.length > 0 && current.length > 0) {
          const spec = FIELD_BY_KEY.get(f);
          warnings.push(`${spec?.label ?? f}: adding ${added.join(", ")} to what is on record`);
        }
      }
    } else if (!values.availability_status) {
      // An explicit "unknown" beats null: the filters and the matching engine
      // both query this column, and a null quietly drops the person out of
      // every list they should appear in.
      values.availability_status = "unknown";
    }

    out.push({
      rowNumber: i + 1,
      action: matched ? "update" : "create",
      fullName,
      matchedWorkerId: matched,
      skipReason: null,
      warnings,
      values,
    });
  });

  const counts = { create: 0, update: 0, skip: 0 };
  for (const r of out) counts[r.action] += 1;

  const unmappedHeaders = Object.entries(mapping)
    .filter(([, key]) => !key)
    .map(([header]) => header);

  return { rows: out, counts, unmappedHeaders };
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: Array<{ rowNumber: number; fullName: string; error: string }>;
}

export async function commitWorkerImport(params: {
  orgId: string;
  userId: string | null;
  rows: Array<Record<string, string>>;
  mapping: ColumnMapping;
}): Promise<ImportResult> {
  const svc = createServiceSupabaseClient();
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: [] };
  if (!svc) {
    result.failed.push({ rowNumber: 0, fullName: "", error: "Database unavailable" });
    return result;
  }

  const preview = await previewWorkerImport({
    orgId: params.orgId,
    rows: params.rows,
    mapping: params.mapping,
  });

  const now = new Date().toISOString();
  const toCreate: Array<{ row: PreviewRow; payload: Record<string, unknown> }> = [];

  for (const row of preview.rows) {
    if (row.action === "skip") {
      result.skipped += 1;
      continue;
    }

    if (row.action === "update" && row.matchedWorkerId) {
      // Only overwrite what the file actually says. A roster listing name and
      // phone must not blank out the skills and certificates already on
      // record — an import is new information, not a replacement of the person.
      const { error } = await svc
        .from("workers")
        .update({ ...row.values, updated_at: now, updated_by: params.userId })
        .eq("id", row.matchedWorkerId)
        .eq("organization_id", params.orgId);
      if (error) {
        result.failed.push({
          rowNumber: row.rowNumber,
          fullName: row.fullName,
          error: error.message,
        });
      } else {
        result.updated += 1;
      }
      continue;
    }

    toCreate.push({
      row,
      payload: {
        ...row.values,
        organization_id: params.orgId,
        status: "active",
        created_by: params.userId,
        updated_by: params.userId,
      },
    });
  }

  // Insert in batches, but fall back to one-by-one when a batch fails so a
  // single bad row cannot cost you the other ninety-nine.
  const BATCH = 100;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const chunk = toCreate.slice(i, i + BATCH);
    const { error } = await svc.from("workers").insert(chunk.map((c) => c.payload));
    if (!error) {
      result.created += chunk.length;
      continue;
    }
    for (const c of chunk) {
      const { error: rowErr } = await svc.from("workers").insert(c.payload);
      if (rowErr) {
        result.failed.push({
          rowNumber: c.row.rowNumber,
          fullName: c.row.fullName,
          error: rowErr.message,
        });
      } else {
        result.created += 1;
      }
    }
  }

  return result;
}
