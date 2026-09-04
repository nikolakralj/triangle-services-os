"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { parseScoutCaseReport } from "@/lib/ai/scout-case-report";

// ---------------------------------------------------------------------------
// An employee's report, readable.
//
// Scout's Data Centers report was genuinely good work — three ranked
// candidates, the real labour buyer for each, quoted evidence, source URLs,
// separate confidence for the GC and the electrical package. It arrived as
// one four-hundred-word paragraph. Nobody hands their boss that.
//
// So this splits a report into the candidates the agent actually numbered,
// pulls the sources out as links instead of raw URLs mid-sentence, and lifts
// confidence into a chip. It reads plain text, because that is what the
// reports already in the database look like — no re-run required, and no
// markdown library rendering agent output as HTML.
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s)>\]]+/g;

/** Shorten a URL for display without hiding where it goes. */
function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    if (!path || path === "/") return host;
    const tail = path.length > 28 ? `${path.slice(0, 28)}…` : path;
    return `${host}${tail}`;
  } catch {
    return url;
  }
}

interface Block {
  /** "1", "2", "3" for numbered candidates; null for surrounding prose. */
  index: string | null;
  /** A lead-in like "BEST FIT" the agent wrote before the em dash. */
  label: string | null;
  text: string;
  sources: string[];
  confidence: string[];
}

function parseReport(raw: string): Block[] {
  const text = raw.trim();
  if (!text) return [];

  // Agents number their candidates "(1) … (2) …". Split there — but only on a
  // real marker. Scout's report ends "Weaker than (1) and (2). Not chased: …",
  // and treating those as new candidates invented a fourth entry numbered 1.
  // A marker starts the text or follows a sentence end, and the numbers must
  // climb 1, 2, 3 — a back-reference does neither.
  const parts: Array<{ index: string | null; body: string }> = [];
  const re = /\((\d{1,2})\)\s/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let currentIndex: string | null = null;
  let expected = 1;

  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    const before = text.slice(Math.max(0, m.index - 2), m.index);
    const atBoundary = m.index === 0 || /[.:;!?\n]\s*$/.test(before);
    if (n !== expected || !atBoundary) continue;

    const chunk = text.slice(last, m.index).trim();
    if (chunk) parts.push({ index: currentIndex, body: chunk });
    currentIndex = m[1];
    expected = n + 1;
    last = m.index + m[0].length;
  }
  const tail = text.slice(last).trim();
  if (tail) parts.push({ index: currentIndex, body: tail });
  if (parts.length === 0) parts.push({ index: null, body: text });

  return parts.map(({ index, body }) => {
    const sources = Array.from(new Set(body.match(URL_RE) ?? [])).map((u) =>
      u.replace(/[.,;]+$/, ""),
    );

    const confidence = Array.from(
      new Set(
        (body.match(/confidence[^.;]{0,40}?\b\d{1,3}\b/gi) ?? []).map((c) =>
          c.replace(/\s+/g, " ").trim(),
        ),
      ),
    );

    // Strip the raw URLs and the "Source:" scaffolding out of the prose —
    // they become links below instead of noise inside a sentence.
    let prose = body
      .replace(/Sources?\s*(\([^)]*\))?\s*:?\s*/gi, " ")
      .replace(URL_RE, " ")
      // A URL that wrapped in the original text leaves its tail behind as a
      // naked path. Block 3 read "…not early pulling. /press-releases/cyrusone
      // -breaks-ground-on-…", which is worse than no link at all.
      .replace(/(^|\s)\/[a-z0-9][a-z0-9._~-]*(\/[^\s]{4,})+/gi, " ")
      .replace(/\s+([.,;:])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();

    // A lead-in the agent wrote, e.g. "BEST FIT — maincubes Nauen".
    let label: string | null = null;
    const lead = prose.match(/^([A-Z][A-Z\s]{2,20}?)\s+[—-]\s+/);
    if (lead) {
      label = lead[1].trim();
      prose = prose.slice(lead[0].length).trim();
    }

    return { index, label, text: prose, sources, confidence };
  });
}

export function AgentReport({
  text,
  authorName,
  authorEmoji,
}: {
  text: string;
  authorName?: string;
  authorEmoji?: string;
}) {
  // Hooks first, unconditionally — the structured branch below is an early
  // return and React requires the same hook order on every render.
  const [showRaw, setShowRaw] = useState(false);

  // A company qualification is stored as JSON. Rendered as text it became a
  // three-hundred-word wall of braces and escaped quotes on the Workforce page
  // — the CEO's own words were that anyone who handed him that would be fired,
  // and he was right. The parser already existed; nothing here was calling it.
  const structured = parseScoutCaseReport(text);
  if (structured) {
    return (
      <StructuredReport
        report={structured}
        authorName={authorName}
        authorEmoji={authorEmoji}
      />
    );
  }

  const blocks = parseReport(text);

  const candidates = blocks.filter((b) => b.index);
  const prose = blocks.filter((b) => !b.index);

  return (
    <div className="mt-2 space-y-2">
      {prose.map((b, i) => (
        <div key={`p${i}`} className="rounded-lg bg-slate-50 px-3 py-2">
          {i === 0 && authorName && (
            <p className="mb-0.5 text-[11px] font-medium text-slate-500">
              {authorEmoji ? `${authorEmoji} ` : ""}
              {authorName}
            </p>
          )}
          <p className="text-xs leading-relaxed text-slate-700">{b.text}</p>
          <Sources urls={b.sources} />
        </div>
      ))}

      {candidates.map((b, i) => (
        <div
          key={`c${i}-${b.index}`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2"
        >
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
              {b.index}
            </span>
            {b.label && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                {b.label}
              </span>
            )}
            {b.confidence.map((c, ci) => (
              <span
                key={`${ci}-${c}`}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
              >
                {c}
              </span>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-slate-700">{b.text}</p>
          <Sources urls={b.sources} />
        </div>
      ))}

      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-700"
      >
        {showRaw ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {showRaw ? "Hide" : "Show"} what they actually wrote
      </button>
      {showRaw && (
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          {text}
        </p>
      )}
    </div>
  );
}

function Sources({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {urls.map((u, i) => (
        <a
          key={`${i}-${u}`}
          href={u}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:text-sky-900"
          title={u}
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          {prettyUrl(u)}
        </a>
      ))}
    </div>
  );
}


// ---------------------------------------------------------------------------
// The manager view of a qualification.
//
// One recommendation, the named project, who actually buys, what to offer, and
// the next human action. Sources stay clickable — the point of a source is
// that someone can go and look at it.
// ---------------------------------------------------------------------------

type Structured = NonNullable<ReturnType<typeof parseScoutCaseReport>>;

const VERDICT: Record<string, { label: string; cls: string }> = {
  pursue: { label: "Pursue", cls: "bg-emerald-100 text-emerald-800" },
  hold: { label: "Hold", cls: "bg-amber-100 text-amber-800" },
  no_go: { label: "No go", cls: "bg-rose-100 text-rose-800" },
};

function StructuredReport({
  report,
  authorName,
  authorEmoji,
}: {
  report: Structured;
  authorName?: string;
  authorEmoji?: string;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const verdict = VERDICT[report.verdict] ?? VERDICT.hold;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${verdict.cls}`}>
          {verdict.label}
        </span>
        {typeof report.confidence === "number" && (
          <span className="text-xs text-slate-500">{report.confidence}% sure</span>
        )}
        {authorName && (
          <span className="text-xs text-slate-500">
            {authorEmoji ?? "🤖"} {authorName}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">
        {report.headline}
      </p>
      {report.executiveSummary && (
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {report.executiveSummary}
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {report.namedProject && (
          <Fact label="The work">
            {report.namedProject.name}
            {report.namedProject.location ? ` · ${report.namedProject.location}` : ""}
            {report.namedProject.timing ? ` · ${report.namedProject.timing}` : ""}
          </Fact>
        )}
        {report.buyerPath && (
          <Fact label="Who buys">
            {report.buyerPath.laborBuyer}
            {report.buyerPath.decisionMaker
              ? ` · ${report.buyerPath.decisionMaker}`
              : ""}
          </Fact>
        )}
        {report.crewPackage && (
          <Fact label="What we offer">{report.crewPackage.title}</Fact>
        )}
        {report.nextCommercialAction && (
          <Fact label="Next action">
            {report.nextCommercialAction.action}
          </Fact>
        )}
      </div>

      {/* The door, as a link — a URL a person cannot click is a URL they will
          not open. */}
      {report.buyerPath?.publicDoor &&
        /^https?:\/\//.test(report.buyerPath.publicDoor) && (
          <a
            href={report.buyerPath.publicDoor}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Open the supplier door
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

      {(report.unknowns.length > 0 || report.risks.length > 0) && (
        <div className="mt-3 space-y-1">
          {[...report.unknowns, ...report.risks].slice(0, 4).map((item) => (
            <p key={item} className="text-xs leading-5 text-amber-800">
              • {item}
            </p>
          ))}
        </div>
      )}

      {report.sources.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            {showDetail ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {report.sources.length} source
            {report.sources.length === 1 ? "" : "s"}
          </button>
          {showDetail && (
            <div className="mt-2 space-y-2 border-l-2 border-slate-200 pl-3">
              {report.sources.map((src) => (
                <div key={src.url}>
                  {src.quote && (
                    <p className="text-xs leading-relaxed text-slate-500">
                      &ldquo;{src.quote}&rdquo;
                    </p>
                  )}
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 break-all text-xs font-medium text-sky-700 hover:text-sky-900"
                  >
                    {src.url.replace(/^https?:\/\//, "").slice(0, 70)}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm leading-6 text-slate-800">{children}</p>
    </div>
  );
}
