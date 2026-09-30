import type { ReactNode } from "react";
import { WorkspaceView } from "@/components/modules/workspace-view";
import type { CasePageModel } from "@/lib/data/case-page";

// ---------------------------------------------------------------------------
// The case. One screen: what was asked, the roles, the drafts, the questions,
// and activity folded. The reading half is the workspace Triangle already
// draws. Send and the one Ask are the existing controls, passed in beside it.
// ---------------------------------------------------------------------------

export function CasePageScreen({
  model,
  drafts,
  ask,
}: {
  model: CasePageModel;
  /** The letters, with Send. Omitted, the words are still on the page. */
  drafts?: ReactNode;
  /** The one Ask. */
  ask?: ReactNode;
}) {
  return (
    <div className="space-y-5" aria-label="The case">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          The case
        </p>
        <h1 className="max-w-3xl text-balance text-[22px] font-semibold leading-snug tracking-[-0.02em] text-slate-950">
          {model.title}
        </h1>
        <p className="text-[14px] text-slate-700">
          Asked by {model.askedBy}
          {model.place ? ` · ${model.place}` : ""}
        </p>
        <p className="max-w-3xl text-[15px] leading-relaxed text-slate-800">{model.asked}</p>
        {model.email ? (
          <p className="text-[13px]">
            <a href="#source-email" className="font-medium text-sky-800 underline-offset-2 hover:underline">
              Source email
            </a>
            {model.email.when ? <span className="text-slate-500"> · {model.email.when}</span> : null}
          </p>
        ) : (
          <p className="text-[13px] text-slate-600">Source email: not established.</p>
        )}
        {model.email ? (
          <details id="source-email" className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-medium text-slate-800">
              {model.email.subject}
            </summary>
            {model.email.body ? (
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-700">
                {model.email.body}
              </pre>
            ) : (
              <p className="mt-2 text-[13px] text-slate-600">The message text is not on the case.</p>
            )}
          </details>
        ) : null}
      </header>

      <WorkspaceView workspace={model.workspace} />

      <section aria-label="Drafts to approve" className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Drafts to approve
        </h2>
        {model.drafts.length === 0 ? (
          <p className="text-[14px] text-slate-600">The reply is not drafted yet.</p>
        ) : (
          drafts ??
          model.drafts.map((letter) => (
            <article
              key={letter.subject}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              <h3 className="text-[14px] font-semibold text-slate-950">{letter.subject}</h3>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed text-slate-800">
                {letter.body}
              </pre>
            </article>
          ))
        )}
      </section>

      {ask}

      <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <summary className="cursor-pointer text-[13px] font-medium text-slate-700">Activity</summary>
        {model.activity.length === 0 ? (
          <p className="mt-2 text-[13px] text-slate-600">Nothing reported on this case yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {model.activity.map((line, index) => (
              <li key={`${line.when}-${line.who}-${index}`} className="text-[13px] leading-snug text-slate-700">
                <span className="text-slate-500">{line.when}</span>
                {" · "}
                {line.who}
                {" · "}
                {line.sentence}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
