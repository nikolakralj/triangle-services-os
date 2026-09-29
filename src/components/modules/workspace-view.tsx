"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { ago } from "@/lib/data/mission-shared";
import {
  evaluateCalc,
  shapeSentence,
  workspaceProgress,
  type Workspace,
  type WorkspaceBlock,
  type WorkspaceCalc,
} from "@/lib/data/workspace";

// ---------------------------------------------------------------------------
// The workspace, drawn.
//
// The short answer first, then the blocks the employee chose, then what is
// still open, then the sources behind it — folded, because evidence belongs
// off the reading path ("The workspace is the answer", 29 September).
//
// Every fact says where it comes from: a sourced number carries a small
// numbered link, Triangle's own record says so on hover, and anything nobody
// established reads "not established" rather than sitting empty. The
// calculation is the person's own numbers run through the employee's
// arithmetic — the expression is data, evaluated here, never code.
// ---------------------------------------------------------------------------

const CONFIDENCE: Record<Workspace["answer"]["confidence"], { label: string; cls: string }> = {
  solid: { label: "Solid", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  partial: { label: "Partly established", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  thin: { label: "Thin", cls: "bg-rose-50 text-rose-800 ring-rose-200" },
};

const NOT_ESTABLISHED = "not established";

export function WorkspaceView({
  workspace,
  filedBy,
  filedAt,
}: {
  workspace: Workspace;
  /** The employee who answered, when a person should know who to ask. */
  filedBy?: string | null;
  filedAt?: string | null;
}) {
  const progress = workspaceProgress(workspace);
  const sourceNumber = new Map(workspace.sources.map((s, i) => [s.id, i + 1] as const));

  return (
    <section aria-label="The answer" className="rounded-2xl border border-slate-200 bg-white">
      <div className="px-5 pt-5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          The answer
          <span className="font-normal normal-case tracking-normal text-slate-400">
            {shapeSentence(workspace.shape)}
            {filedBy ? ` From ${filedBy}` : ""}
            {filedBy && filedAt ? (
              <span suppressHydrationWarning> · {ago(filedAt)}</span>
            ) : filedBy ? (
              "."
            ) : null}
          </span>
        </p>
        <h2 className="mt-2 max-w-3xl text-balance text-[19px] font-semibold leading-snug tracking-[-0.015em] text-slate-950">
          {workspace.answer.verdict}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${CONFIDENCE[workspace.answer.confidence].cls}`}
          >
            {CONFIDENCE[workspace.answer.confidence].label}
          </span>
          <span className="text-[12px] text-slate-500">
            {progress.passed} of {progress.total} answered · {progress.percent}%
          </span>
        </div>
        {workspace.answer.notEstablished.length > 0 && (
          <ul className="mt-2.5 space-y-1">
            {workspace.answer.notEstablished.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] leading-snug text-amber-800">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                Not established: {item}
              </li>
            ))}
          </ul>
        )}
        {workspace.caution && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900">
            {workspace.caution}
          </p>
        )}
      </div>

      <div className="space-y-5 px-5 py-5">
        {workspace.blocks.map((block) => (
          <Block key={block.id} block={block} sourceNumber={sourceNumber} workspace={workspace} />
        ))}
      </div>

      {progress.open.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Finished when
          </p>
          <ul className="mt-1.5 space-y-1">
            {progress.open.map((line) => (
              <li key={line} className="flex items-start gap-2 text-[12.5px] leading-snug text-slate-600">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full border border-slate-300" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {workspace.sources.length > 0 && (
        <details className="border-t border-slate-100 px-5 py-3">
          <summary className="cursor-pointer text-[12px] font-medium text-slate-600 transition hover:text-slate-900">
            {workspace.sources.length} {workspace.sources.length === 1 ? "source" : "sources"} behind this
          </summary>
          <ol className="mt-2 space-y-1.5">
            {workspace.sources.map((source, i) => (
              <li key={source.id} className="text-[12px] leading-snug text-slate-600">
                <span className="mr-1.5 font-mono text-[11px] text-slate-400">{i + 1}</span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-sky-700 underline-offset-2 hover:underline"
                >
                  {source.title}
                </a>
                {source.publisher ? ` · ${source.publisher}` : ""}
                {source.date ? ` · ${source.date}` : " · undated"}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function Block({
  block,
  sourceNumber,
  workspace,
}: {
  block: WorkspaceBlock;
  sourceNumber: Map<string, number>;
  workspace: Workspace;
}) {
  // The gaps block has no caption of its own: what is open always reads the
  // same way, so a person learns where to look for it.
  const caption = block.kind === "gaps" ? "Still open" : "caption" in block ? block.caption : undefined;
  return (
    <div>
      {caption && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          {caption}
        </p>
      )}
      {block.kind === "table" && <Table block={block} sourceNumber={sourceNumber} workspace={workspace} />}
      {block.kind === "list" && <List block={block} sourceNumber={sourceNumber} workspace={workspace} />}
      {block.kind === "route" && <Route block={block} sourceNumber={sourceNumber} workspace={workspace} />}
      {block.kind === "calc" && <Calc block={block} />}
      {block.kind === "decision" && <Decision block={block} />}
      {block.kind === "gaps" && <Gaps block={block} />}
    </div>
  );
}

/** A sourced fact's numbered link; Triangle's own record says so quietly. */
function Basis({
  basis,
  source,
  note,
  sourceNumber,
  workspace,
}: {
  basis: "source" | "our_record" | "unknown";
  source?: string;
  note?: string;
  sourceNumber: Map<string, number>;
  workspace: Workspace;
}) {
  if (basis === "source" && source) {
    const n = sourceNumber.get(source);
    const found = workspace.sources.find((s) => s.id === source);
    return (
      <a
        href={found?.url ?? "#"}
        target="_blank"
        rel="noreferrer"
        title={`${found?.title ?? "Source"}${found?.date ? ` · ${found.date}` : " · undated"}`}
        className="ml-1 align-super font-mono text-[10px] text-sky-700 hover:underline"
      >
        {n ?? "?"}
      </a>
    );
  }
  if (basis === "our_record") {
    return (
      <span
        title={note ? `Triangle's own record. ${note}` : "Triangle's own record"}
        className="ml-1 align-super font-mono text-[10px] text-slate-400"
      >
        ours
      </span>
    );
  }
  return null;
}

function Unknown({ note }: { note?: string }) {
  return (
    <span title={note} className="text-amber-700">
      {NOT_ESTABLISHED}
    </span>
  );
}

function Table({
  block,
  sourceNumber,
  workspace,
}: {
  block: Extract<WorkspaceBlock, { kind: "table" }>;
  sourceNumber: Map<string, number>;
  workspace: Workspace;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-slate-50">
            {block.columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"
              >
                {column.label}
                {column.unit ? <span className="ml-1 font-normal normal-case">({column.unit})</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
              {block.columns.map((column) => {
                const cell = row.cells[column.key];
                return (
                  <td
                    key={column.key}
                    className="border-b border-slate-100 px-3 py-2 align-top text-slate-800 tabular-nums"
                  >
                    {cell.basis === "unknown" ? (
                      <Unknown note={cell.note} />
                    ) : (
                      <>
                        {cell.text ?? cell.number}
                        {cell.unit ? ` ${cell.unit}` : ""}
                        <Basis
                          basis={cell.basis}
                          source={cell.source}
                          note={cell.note}
                          sourceNumber={sourceNumber}
                          workspace={workspace}
                        />
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function List({
  block,
  sourceNumber,
  workspace,
}: {
  block: Extract<WorkspaceBlock, { kind: "list" }>;
  sourceNumber: Map<string, number>;
  workspace: Workspace;
}) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
      {block.items.map((item) => (
        <li key={item.title} className="px-3 py-2.5">
          <p className="text-[14px] font-semibold text-slate-900">
            {item.title}
            {item.subtitle ? <span className="ml-2 text-[13px] font-normal text-slate-500">{item.subtitle}</span> : null}
            <Basis
              basis={item.basis}
              source={item.source}
              sourceNumber={sourceNumber}
              workspace={workspace}
            />
          </p>
          {item.why && <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">{item.why}</p>}
          {item.gaps.length > 0 && (
            <p className="mt-0.5 text-[12px] leading-snug text-amber-800">
              Not known: {item.gaps.join(" · ")}
            </p>
          )}
          {item.docHref && (
            <a
              href={item.docHref}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <FileText className="h-3 w-3" />
              Open {item.docLabel ?? "the document"}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function Route({
  block,
  sourceNumber,
  workspace,
}: {
  block: Extract<WorkspaceBlock, { kind: "route" }>;
  sourceNumber: Map<string, number>;
  workspace: Workspace;
}) {
  return (
    <ol className="space-y-2">
      {block.steps.map((step, i) => (
        <li key={step.title} className="flex gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 font-mono text-[11px] text-slate-600">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-slate-900">
              {step.title}
              <Basis
                basis={step.basis}
                source={step.source}
                sourceNumber={sourceNumber}
                workspace={workspace}
              />
            </p>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {[
                step.who ? step.who : "nobody named yet",
                step.duration,
                step.cost ? `${step.cost.amount} ${step.cost.currency}${step.cost.per ? ` ${step.cost.per}` : ""}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {step.blocker && (
              <p className="mt-0.5 text-[12px] leading-snug text-amber-800">Blocked by: {step.blocker}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The person's own numbers. Change one and the answers move with it. */
function Calc({ block }: { block: WorkspaceCalc }) {
  const [values, setValues] = useState<Record<string, number>>({});
  const results = evaluateCalc(block, values);
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {block.inputs.map((input) => (
          <label key={input.key} className="block">
            <span className="text-[11.5px] text-slate-500">
              {input.label}
              {input.unit ? ` (${input.unit})` : ""}
            </span>
            <input
              id={`calc-${block.id}-${input.key}`}
              type="number"
              inputMode="decimal"
              value={values[input.key] ?? input.value}
              min={input.min}
              max={input.max}
              onChange={(e) => {
                const next = Number(e.target.value);
                setValues((prev) => ({ ...prev, [input.key]: Number.isFinite(next) ? next : input.value }));
              }}
              className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 tabular-nums focus:border-slate-400 focus:outline-none"
            />
          </label>
        ))}
      </div>
      <dl className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
        {block.outputs.map((output) => (
          <div key={output.key}>
            <dt className="text-[11.5px] text-slate-500">{output.label}</dt>
            <dd className="text-[16px] font-semibold text-slate-900 tabular-nums">
              {results[output.key] === null ? (
                <Unknown note="The arithmetic did not work out" />
              ) : (
                <>
                  {results[output.key]}
                  {output.unit ? <span className="ml-1 text-[12px] font-normal text-slate-500">{output.unit}</span> : null}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {block.assumptions.length > 0 && (
        <ul className="mt-2.5 space-y-0.5">
          {block.assumptions.map((line) => (
            <li key={line} className="text-[11.5px] leading-snug text-slate-500">
              Taken for granted: {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Decision({ block }: { block: Extract<WorkspaceBlock, { kind: "decision" }> }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[13.5px] font-medium text-slate-900">{block.question}</p>
      <ul className="mt-2 space-y-2">
        {block.options.map((option) => (
          <li key={option.title} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[13px] font-semibold text-slate-900">
              {option.title}
              {option.recommended && (
                <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-medium text-emerald-800 ring-1 ring-emerald-200">
                  Recommended
                </span>
              )}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">{option.consequence}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Gaps({ block }: { block: Extract<WorkspaceBlock, { kind: "gaps" }> }) {
  return (
    <ul className="space-y-1.5">
      {block.items.map((item) => (
        <li key={item.missing} className="flex items-start gap-2 text-[13px] leading-snug text-slate-700">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
          <span>
            <span className="text-amber-800">{item.missing}</span>
            {item.nextStep ? ` — next: ${item.nextStep}` : ""}
            {item.whoCould ? ` (${item.whoCould})` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
