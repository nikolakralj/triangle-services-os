import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getClientTab } from "@/lib/data/client-tabs";
import { formatReportDate } from "@/lib/data/employee-report-policy";
import {
  POSTING_QUESTION,
  postingLabel,
  type TabLineView,
} from "@/lib/data/client-tab-policy";
import { AskPageContext } from "@/components/missions/ask-context";
import { CloseClientTab } from "@/components/modules/client-tab-controls";

// ---------------------------------------------------------------------------
// A pinned client tab (exception approved 2026-10-12). Every line on it is
// written by a bot from what already reached Triangle; the owner reads it.
// No form, no status, no score. Top to bottom:
//   next step and what's open · needs · agreed · timeline · Croatian firms
// ---------------------------------------------------------------------------

function when(iso: string | null): string {
  return iso ? formatReportDate(iso) : "date not known";
}

function Source({ line }: { line: Pick<TabLineView, "sourceLabel" | "sourceHref"> }) {
  if (!line.sourceLabel) return null;
  return line.sourceHref ? (
    <a href={line.sourceHref} className="text-sky-800 underline" target={line.sourceHref.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
      {line.sourceLabel}
    </a>
  ) : (
    <span>{line.sourceLabel}</span>
  );
}

function Said({ line }: { line: TabLineView }) {
  return (
    <span className="text-slate-500">
      {" "}
      — {line.who ?? "someone"}, {when(line.when)}
      {line.sourceLabel ? " · " : ""}
      <Source line={line} />
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5" aria-label={title}>
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <div className="mt-3 text-sm leading-6 text-slate-700">{children}</div>
    </section>
  );
}

export default async function ClientTabPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId: key } = await params;
  const session = await requireSession();
  const result = await getClientTab(session.organizationId, key);
  if (!result.found) notFound();
  const { tab, view, companyId, companyName } = result;

  return (
    <div className="space-y-4">
      {companyId ? <AskPageContext kind="record" type="company" id={companyId} label={companyName} /> : null}
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-950">{companyName}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {tab ? <CloseClientTab tabId={tab.id} /> : <span className="text-xs text-slate-500">Tab closed. This is the company record the bots read.</span>}
          {companyId ? (
            <Link href={`/companies/${companyId}`} className="text-xs text-sky-800 underline">
              Company research
            </Link>
          ) : null}
        </div>
      </header>

      <Section title="Next step and what's open">
        {view.nextStep ? (
          <p className="font-medium text-slate-900">
            {formatReportDate(view.nextStep.dueOn)}: {view.nextStep.text}
            <Said line={view.nextStep} />
          </p>
        ) : (
          <p className="text-slate-500">No next step yet. Hanna writes it after the next email, message or call note.</p>
        )}
        {view.open.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {view.open.map((line) => (
              <li key={line.id}>
                {line.text}
                <Said line={line} />
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="What the client needs">
        <ul className="space-y-1">
          {view.needs.map((need) => (
            <li key={need.topic}>
              <span className="font-medium text-slate-900">{need.label}: </span>
              {need.notKnownYet ? (
                <span className="text-slate-500">not known yet</span>
              ) : (
                need.lines.map((line, i) => (
                  <span key={line.id}>
                    {i > 0 ? "; " : ""}
                    {line.text}
                    <Said line={line} />
                  </span>
                ))
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What's agreed">
        {view.agreed.length === 0 ? (
          <p className="text-slate-500">Nothing agreed yet.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            {view.agreed.map((line) => (
              <li key={line.id}>
                {line.text}
                <Said line={line} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What was said">
        {view.timeline.length === 0 ? (
          <p className="text-slate-500">Nothing yet. Forward an email or send Hanna a voice note after a call.</p>
        ) : (
          <ul className="space-y-1">
            {view.timeline.map((line) => (
              <li key={line.id}>
                <span className="text-slate-500">{when(line.when)}</span> · {line.sourceLabel ?? "Note"} ·{" "}
                {line.who ? `${line.who}: ` : ""}
                {line.text}{" "}
                {line.sourceHref ? <Source line={{ sourceLabel: "open", sourceHref: line.sourceHref }} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Croatian firms we could delegate this to">
        {view.firms.length === 0 ? (
          <p className="text-slate-500">Scout has not proposed firms for this need yet.</p>
        ) : (
          <ul className="space-y-2">
            {view.firms.map((firm) => (
              <li key={firm.id}>
                <span className="font-medium text-slate-900">{firm.name}</span>
                <span className="text-slate-600">
                  {" "}
                  · {POSTING_QUESTION}: <strong>{postingLabel(firm.posting)}</strong>
                </span>
                <div>
                  {firm.reason}{" "}
                  <span className="text-slate-500">
                    ({formatReportDate(firm.when)}
                    {firm.answered ? ", answered, kept on file" : ""}
                    {firm.sourceLabel ? " · " : ""}
                    <Source line={firm} />)
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
