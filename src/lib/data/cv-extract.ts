import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

// ---------------------------------------------------------------------------
// Reading a CV.
//
// Two passes, deliberately separated by cost:
//
//   Pass 1 (here, free): pull the text out of the PDF and take the things a
//   regex is genuinely better at than a model — email addresses, phone
//   numbers, and certificates from a known vocabulary. No tokens.
//
//   Pass 2 (the HR agent): read that text and judge the rest — that "PCS7"
//   and "TIA Portal" mean PLC commissioning, what someone's real role is,
//   how strong their German is. That is reasoning, and it belongs to Grok on
//   a flat subscription rather than a per-token API.
//
// Nothing here creates a worker. The output is a proposal that lands in
// Approvals, because a CV is a claim about a person, not a fact.
// ---------------------------------------------------------------------------

export interface CvExtraction {
  text: string;
  pages: number;
  /** What pass 1 could read with confidence. Everything is optional. */
  guess: {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    certificates: string[];
    languages: string[];
    country: string | null;
  };
}

/**
 * Certificates worth recognising by name. These are the tickets that decide
 * whether someone can be put on a European industrial site at all, so a false
 * negative costs a manual edit while a false positive could put an uncertified
 * person in front of a client — the list stays specific for that reason.
 */
/**
 * Distinctive acronyms. These words appear on a CV for one reason, so a bare
 * match is safe.
 */
const CERT_ACRONYMS: Array<[RegExp, string]> = [
  [/\bVCA\b/, "VCA"],
  [/\bSCC\s?1?7?\b/, "SCC"],
  [/\bIPAF\b/, "IPAF"],
  [/\bPASMA\b/, "PASMA"],
  [/\bCSCS\b/, "CSCS"],
  [/\bECS\b/, "ECS"],
  [/\bATEX\b/, "ATEX"],
  [/\bBOSIET\b/, "BOSIET"],
  [/\bEUSR\b/, "EUSR"],
  [/\bNVQ\b/, "NVQ"],
  [/\bA1[\s-]?(form|certificate|bescheinigung)\b/i, "A1"],
  [/\bEx[\s-]?(zone|schein)\b/i, "Ex certification"],
];

/**
 * Ordinary equipment and activity words. "Crane" on its own means nothing —
 * this CV says "Aluminium Handling Systems, Ageing Oven and Baskets Cranes",
 * which is a project he commissioned, not a licence he holds. These only
 * count when a certificate word is standing next to them.
 */
const CERT_CONTEXTUAL: Array<[RegExp, string]> = [
  [/\b(forklift|stapler)\b/i, "Forklift"],
  [/\b(crane|kranschein)\b/i, "Crane"],
  [/\bwelding\b/i, "Welding certificate"],
  [/\bfirst[\s-]?aid\b/i, "First aid"],
  [/\bconfined[\s-]?space\b/i, "Confined space"],
  [/\bworking[\s-]?at[\s-]?heigh?t\b/i, "Working at height"],
];

const CERT_WORD =
  /(certificat|cert\b|licen[cs]e|ticket|qualification|schein|zeugnis|uprawnien|training|course|card|permit|passport|pass\b)/i;

const LANGUAGE_NAMES = [
  "English", "German", "Deutsch", "Croatian", "Hrvatski", "Polish", "Polski",
  "Italian", "French", "Spanish", "Portuguese", "Dutch", "Czech", "Slovak",
  "Slovenian", "Serbian", "Bosnian", "Hungarian", "Romanian", "Bulgarian",
  "Russian", "Ukrainian", "Turkish", "Swedish", "Norwegian", "Danish", "Finnish",
];

const LANGUAGE_CANONICAL: Record<string, string> = {
  deutsch: "German",
  hrvatski: "Croatian",
  polski: "Polish",
};

// A CV usually states a level right after the language. Keeping it turns
// "German" into "German B2", which is the difference between someone who can
// take instructions on a German site and someone who cannot.
const LEVEL = /\b(A1|A2|B1|B2|C1|C2|native|mother\s?tongue|fluent|proficient|advanced|intermediate|basic|beginner|conversational|muttersprache|verhandlungssicher)\b/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// Deliberately loose: European numbers arrive with +, spaces, dots and dashes.
const PHONE = /(?:\+|00)\d[\d\s().-]{7,17}\d/;

function guessName(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Many CVs (ours included) label it outright — trust that over position.
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    if (/^(name|full name|vor[- ]?und nachname)\s*:?\s*$/i.test(lines[i])) {
      const next = lines[i + 1];
      if (next && looksLikeName(next)) return next;
    }
    const inline = lines[i].match(/^(?:name|full name)\s*[:\-]\s*(.+)$/i);
    if (inline && looksLikeName(inline[1])) return inline[1].trim();
  }

  // Otherwise the first line near the top that reads like a person's name.
  for (const line of lines.slice(0, 25)) {
    if (looksLikeName(line)) return line;
  }
  return null;
}

function looksLikeName(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 4 || s.length > 60) return false;
  if (/[@\d/|,:;]/.test(s)) return false;
  if (/curriculum|vitae|résumé|resume|lebenslauf|profile|contact/i.test(s)) return false;
  const words = s.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  // Each word starts with a capital — allows Kralj, O'Brien, Zieliński.
  return words.every((w) => /^[A-ZÀ-ÞĆČĐŠŽŁŃÓŚŹŻ][\p{L}'’-]*\.?$/u.test(w));
}

function guessLanguages(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const name of LANGUAGE_NAMES) {
    const re = new RegExp(`\\b${name}\\b([^\\n]{0,40})`, "gi");
    const matches = [...text.matchAll(re)];
    if (matches.length === 0) continue;

    const canonical = LANGUAGE_CANONICAL[name.toLowerCase()] ?? name;
    if (seen.has(canonical.toLowerCase())) continue;
    seen.add(canonical.toLowerCase());

    // A language usually appears more than once — under Nationality with no
    // level, and again under Languages with one. Take the occurrence that
    // states a level, because "Croatian native" and a bare "Croatian" are not
    // the same fact.
    let level: string | undefined;
    for (const m of matches) {
      const hit = m[1]?.match(LEVEL)?.[1];
      if (hit) {
        level = hit;
        break;
      }
    }
    found.push(level ? `${canonical} ${level}` : canonical);
  }

  return found;
}

function guessCertificates(text: string): string[] {
  const out: string[] = [];

  for (const [re, label] of CERT_ACRONYMS) {
    if (re.test(text) && !out.includes(label)) out.push(label);
  }

  // A contextual word only counts when a certificate word sits within about a
  // line of it. Anything looser reads a project history as a list of tickets.
  for (const [re, label] of CERT_CONTEXTUAL) {
    if (out.includes(label)) continue;
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(global)) {
      const at = m.index ?? 0;
      const window = text.slice(Math.max(0, at - 60), at + m[0].length + 60);
      if (CERT_WORD.test(window)) {
        out.push(label);
        break;
      }
    }
  }

  return out;
}

const COUNTRIES = [
  "Croatia", "Poland", "Germany", "Austria", "Netherlands", "Belgium", "France",
  "Italy", "Spain", "Portugal", "Czechia", "Czech Republic", "Slovakia",
  "Slovenia", "Hungary", "Romania", "Bulgaria", "Serbia", "Bosnia",
  "North Macedonia", "Ukraine", "Lithuania", "Latvia", "Estonia", "Sweden",
  "Norway", "Denmark", "Finland", "Ireland", "United Kingdom",
];

function guessCountry(text: string): string | null {
  // "Country of Residence" beats a stray mention of a country in a job history.
  const labelled = text.match(
    /(?:country of residence|residence|wohnsitz|country)\s*[:\n]\s*([A-Za-zÀ-ÿ ]{3,30})/i,
  );
  if (labelled) {
    const candidate = labelled[1].trim();
    const hit = COUNTRIES.find((c) => c.toLowerCase() === candidate.toLowerCase());
    if (hit) return hit;
  }
  for (const c of COUNTRIES) {
    if (new RegExp(`\\b${c}\\b`, "i").test(text)) return c;
  }
  return null;
}

/** Read a PDF and take the parts a regex reads better than a model. */
export async function extractCv(buffer: ArrayBuffer): Promise<CvExtraction> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : text;

  return {
    text: merged,
    pages: totalPages,
    guess: {
      fullName: guessName(merged),
      email: merged.match(EMAIL)?.[0] ?? null,
      phone: merged.match(PHONE)?.[0]?.trim() ?? null,
      certificates: guessCertificates(merged),
      languages: guessLanguages(merged),
      country: guessCountry(merged),
    },
  };
}
