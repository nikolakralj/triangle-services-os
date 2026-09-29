import { z } from "zod";

// ---------------------------------------------------------------------------
// The workspace: an answer a person can read, in the shape the question needs.
//
// A question about rates is not a list of companies, and "how do we employ
// Serbian citizens in the EU" is not a table of rates. So the employee picks
// the shape of the answer and fills a fixed vocabulary of blocks; Triangle
// draws them. No employee writes UI code, and a block Triangle does not know
// is refused, not rendered ("The workspace is the answer", 29 September).
//
// Two rules run through everything here:
//
//   Simple enough for a person. The CEO has two minutes, not an afternoon:
//   the short answer first, at most five blocks, six columns, plain words,
//   no ids, numbers with units. The caps are in the schema, so "just one more
//   panel" is a validation error rather than an argument.
//
//   Every fact carries its basis. A dated source, Triangle's own record, or
//   "not established" — nothing else renders as fact. A tidy table of invented
//   numbers is the one thing worse than no table at all.
//
// How far along a workspace is comes from its own tests (`doneWhen`), counted
// here from what it holds. The employee never claims a percentage, and no
// question is scored against a company counter it never asked for.
// ---------------------------------------------------------------------------

/** What a person can take in at once. Hard limits, not guidance. */
export const WORKSPACE_CAPS = {
  blocks: 5,
  tableColumns: 6,
  tableRows: 50,
  listItems: 10,
  routeSteps: 12,
  decisionOptions: 4,
  gapItems: 6,
  sources: 20,
  doneTests: 6,
  verdict: 240,
  title: 80,
  question: 240,
  label: 40,
  cell: 120,
  sentence: 200,
} as const;

export const WORKSPACE_SHAPES = ["answer", "comparison", "shortlist", "route", "decision"] as const;
export type WorkspaceShape = (typeof WORKSPACE_SHAPES)[number];

const SHAPE_LABEL: Record<WorkspaceShape, string> = {
  answer: "a short answer with its evidence",
  comparison: "a comparison with dated evidence",
  shortlist: "a shortlist with reasons and gaps",
  route: "a route with steps, owners and costs",
  decision: "a decision with its options and consequences",
};

// ── what a person may be shown ──────────────────────────────────────────────

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** 20+ characters with a digit in them: a Drive id, not a German compound noun. */
const IDISH = /\b(?=[A-Za-z0-9_-]{20,})(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/;
const HEX_ID = /\b[0-9a-f]{12,}\b/i;
const MARKUP = /[<>]|\*\*|`|^#{1,6}\s/m;

/** Text a person reads: plain words, no markup, no machinery. */
function plain(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !UUID.test(v) && !IDISH.test(v) && !HEX_ID.test(v), {
      message: "ids belong in the thread, not in what a person reads",
    })
    .refine((v) => !MARKUP.test(v), {
      message: "plain words only — no markup, no code marks",
    });
}

const slug = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "lower-case name, letters, numbers, - or _");

const yearMonthDay = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, "a date as 2026-09 or 2026-09-24");

/** Where a claim comes from. Referenced by id so the reading path stays clean. */
export const sourceSchema = z.object({
  id: slug,
  title: plain(120),
  url: z.string().trim().url().max(500),
  publisher: plain(60).optional(),
  /** When the source itself says it was published. Undated is shown as undated. */
  date: yearMonthDay.optional(),
});

/** Every fact says where it comes from — or says nobody established it. */
export const BASES = ["source", "our_record", "unknown"] as const;
export type Basis = (typeof BASES)[number];

const basisFields = {
  basis: z.enum(BASES),
  source: slug.optional(),
};

function requireBasis(
  value: { basis: Basis; source?: string },
  ctx: z.RefinementCtx,
  what: string,
) {
  if (value.basis === "source" && !value.source) {
    ctx.addIssue({ code: "custom", message: `${what}: a sourced fact must name its source` });
  }
  if (value.basis !== "source" && value.source) {
    ctx.addIssue({ code: "custom", message: `${what}: only a sourced fact names a source` });
  }
}

export const cellSchema = z
  .object({
    text: plain(WORKSPACE_CAPS.cell).optional(),
    number: z.number().finite().optional(),
    unit: plain(16).optional(),
    note: plain(WORKSPACE_CAPS.sentence).optional(),
    ...basisFields,
  })
  .superRefine((cell, ctx) => {
    requireBasis(cell, ctx, "cell");
    const hasValue = cell.text !== undefined || cell.number !== undefined;
    if (cell.basis === "unknown" && hasValue) {
      ctx.addIssue({
        code: "custom",
        message: "an unknown cell carries no value — it reads as not established",
      });
    }
    if (cell.basis !== "unknown" && !hasValue) {
      ctx.addIssue({ code: "custom", message: "a cell with no value must be marked unknown" });
    }
  });

// ── the blocks ──────────────────────────────────────────────────────────────

const tableBlock = z
  .object({
    kind: z.literal("table"),
    id: slug,
    caption: plain(WORKSPACE_CAPS.title).optional(),
    columns: z
      .array(z.object({ key: slug, label: plain(WORKSPACE_CAPS.label), unit: plain(16).optional() }))
      .min(2)
      .max(WORKSPACE_CAPS.tableColumns),
    rows: z
      .array(z.object({ cells: z.record(slug, cellSchema) }))
      .min(1)
      .max(WORKSPACE_CAPS.tableRows),
  })
  .superRefine((block, ctx) => {
    const keys = block.columns.map((c) => c.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: "custom", message: "two columns share a name" });
    }
    block.rows.forEach((row, i) => {
      for (const key of keys) {
        if (!row.cells[key]) {
          ctx.addIssue({ code: "custom", message: `row ${i + 1} has no ${key}` });
        }
      }
      for (const key of Object.keys(row.cells)) {
        if (!keys.includes(key)) {
          ctx.addIssue({ code: "custom", message: `row ${i + 1} has ${key}, which is not a column` });
        }
      }
    });
  });

const listBlock = z.object({
  kind: z.literal("list"),
  id: slug,
  caption: plain(WORKSPACE_CAPS.title).optional(),
  items: z
    .array(
      z
        .object({
          title: plain(WORKSPACE_CAPS.title),
          subtitle: plain(WORKSPACE_CAPS.title).optional(),
          /** Why this one, in the words the question used. */
          why: plain(WORKSPACE_CAPS.sentence).optional(),
          gaps: z.array(plain(WORKSPACE_CAPS.cell)).max(4).default([]),
          /** A document Triangle itself renders. Never an outside link. */
          docHref: z
            .string()
            .trim()
            .max(400)
            .refine((v) => v.startsWith("/"), "a document of ours, not an outside link")
            .optional(),
          docLabel: plain(60).optional(),
          ...basisFields,
        })
        .superRefine((item, ctx) => requireBasis(item, ctx, "list item")),
    )
    .min(1)
    .max(WORKSPACE_CAPS.listItems),
});

const routeBlock = z.object({
  kind: z.literal("route"),
  id: slug,
  caption: plain(WORKSPACE_CAPS.title).optional(),
  steps: z
    .array(
      z
        .object({
          title: plain(WORKSPACE_CAPS.title),
          /** Who does it — a role or a person, never an id. */
          who: plain(WORKSPACE_CAPS.label).optional(),
          duration: plain(WORKSPACE_CAPS.label).optional(),
          cost: z
            .object({
              amount: z.number().finite().nonnegative(),
              currency: plain(8),
              per: plain(20).optional(),
            })
            .optional(),
          blocker: plain(WORKSPACE_CAPS.sentence).optional(),
          ...basisFields,
        })
        .superRefine((step, ctx) => requireBasis(step, ctx, "step")),
    )
    .min(1)
    .max(WORKSPACE_CAPS.routeSteps),
});

/** Arithmetic over the inputs above it. No functions, no code. */
const expression = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_+\-*/(). ]+$/, "arithmetic over the inputs only");

const calcBlock = z
  .object({
    kind: z.literal("calc"),
    id: slug,
    caption: plain(WORKSPACE_CAPS.title).optional(),
    inputs: z
      .array(
        z.object({
          key: slug,
          label: plain(WORKSPACE_CAPS.label),
          value: z.number().finite(),
          unit: plain(16).optional(),
          min: z.number().finite().optional(),
          max: z.number().finite().optional(),
        }),
      )
      .min(1)
      .max(8),
    outputs: z
      .array(
        z.object({
          key: slug,
          label: plain(WORKSPACE_CAPS.label),
          expr: expression,
          unit: plain(16).optional(),
        }),
      )
      .min(1)
      .max(6),
    /** What the sum takes for granted, said out loud. */
    assumptions: z.array(plain(WORKSPACE_CAPS.sentence)).max(5).default([]),
  })
  .superRefine((block, ctx) => {
    const known = new Set(block.inputs.map((i) => i.key));
    if (known.size !== block.inputs.length) {
      ctx.addIssue({ code: "custom", message: "two inputs share a name" });
    }
    for (const out of block.outputs) {
      for (const name of block.inputs.length ? namesIn(out.expr) : []) {
        if (!known.has(name)) {
          ctx.addIssue({
            code: "custom",
            message: `${out.key} uses ${name}, which is not an input above it`,
          });
        }
      }
      if (known.has(out.key)) {
        ctx.addIssue({ code: "custom", message: `${out.key} is already an input` });
      }
      known.add(out.key);
    }
  });

const decisionBlock = z
  .object({
    kind: z.literal("decision"),
    id: slug,
    question: plain(WORKSPACE_CAPS.sentence),
    options: z
      .array(
        z.object({
          title: plain(WORKSPACE_CAPS.title),
          consequence: plain(WORKSPACE_CAPS.sentence),
          recommended: z.boolean().optional(),
        }),
      )
      .min(2)
      .max(WORKSPACE_CAPS.decisionOptions),
  })
  .refine((b) => b.options.filter((o) => o.recommended).length <= 1, {
    message: "recommend one option, not several",
  });

const gapsBlock = z.object({
  kind: z.literal("gaps"),
  id: slug,
  items: z
    .array(
      z.object({
        missing: plain(WORKSPACE_CAPS.cell),
        /** What the employee proposes to do about it. */
        nextStep: plain(WORKSPACE_CAPS.sentence).optional(),
        whoCould: plain(WORKSPACE_CAPS.label).optional(),
      }),
    )
    .min(1)
    .max(WORKSPACE_CAPS.gapItems),
});

export const blockSchema = z.discriminatedUnion("kind", [
  tableBlock,
  listBlock,
  routeBlock,
  calcBlock,
  decisionBlock,
  gapsBlock,
]);

export type WorkspaceBlock = z.infer<typeof blockSchema>;
export type WorkspaceTable = z.infer<typeof tableBlock>;
export type WorkspaceCalc = z.infer<typeof calcBlock>;

// ── when it is finished, counted from what it holds ─────────────────────────

export const doneTestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rows_at_least"), block: slug, count: z.number().int().min(1).max(50) }),
  z.object({ kind: z.literal("every_row_has"), block: slug, column: slug }),
  z.object({ kind: z.literal("every_row_dated"), block: slug }),
  z.object({ kind: z.literal("items_at_least"), block: slug, count: z.number().int().min(1).max(20) }),
  z.object({ kind: z.literal("steps_have_owner"), block: slug }),
  z.object({ kind: z.literal("no_open_gaps"), block: slug }),
  z.object({ kind: z.literal("sources_at_least"), count: z.number().int().min(1).max(20) }),
]);

export type DoneTest = z.infer<typeof doneTestSchema>;

export const workspaceSchema = z
  .object({
    shape: z.enum(WORKSPACE_SHAPES),
    title: plain(WORKSPACE_CAPS.title),
    /** The words the person asked, kept so the answer can be judged against them. */
    question: plain(WORKSPACE_CAPS.question),
    answer: z.object({
      verdict: plain(WORKSPACE_CAPS.verdict),
      confidence: z.enum(["solid", "partial", "thin"]),
      notEstablished: z.array(plain(WORKSPACE_CAPS.sentence)).max(5).default([]),
    }),
    blocks: z.array(blockSchema).min(1).max(WORKSPACE_CAPS.blocks),
    doneWhen: z.array(doneTestSchema).min(1).max(WORKSPACE_CAPS.doneTests),
    sources: z.array(sourceSchema).max(WORKSPACE_CAPS.sources).default([]),
    /** Immigration, tax, employment law: official sources or nothing, and a caution. */
    sensitive: z.boolean().default(false),
    caution: plain(WORKSPACE_CAPS.verdict).optional(),
    version: z.number().int().min(1).default(1),
  })
  .superRefine((w, ctx) => {
    const ids = w.blocks.map((b) => b.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "two blocks share a name" });
    }
    const sourceIds = new Set(w.sources.map((s) => s.id));
    for (const ref of sourceRefs(w.blocks)) {
      if (!sourceIds.has(ref)) {
        ctx.addIssue({ code: "custom", message: `${ref} is cited but not in the sources` });
      }
    }
    const byId = new Map(w.blocks.map((b) => [b.id, b] as const));
    for (const test of w.doneWhen) {
      if (test.kind === "sources_at_least") continue;
      const block = byId.get(test.block);
      if (!block) {
        ctx.addIssue({ code: "custom", message: `${test.kind} names ${test.block}, which is not a block` });
        continue;
      }
      const wants: Record<string, WorkspaceBlock["kind"]> = {
        rows_at_least: "table",
        every_row_has: "table",
        every_row_dated: "table",
        items_at_least: "list",
        steps_have_owner: "route",
        no_open_gaps: "gaps",
      };
      if (block.kind !== wants[test.kind]) {
        ctx.addIssue({
          code: "custom",
          message: `${test.kind} needs a ${wants[test.kind]}, and ${test.block} is a ${block.kind}`,
        });
      }
      if (test.kind === "every_row_has" && block.kind === "table") {
        if (!block.columns.some((c) => c.key === test.column)) {
          ctx.addIssue({ code: "custom", message: `${test.column} is not a column of ${test.block}` });
        }
      }
    }
    if (w.sensitive) {
      if (!w.caution) {
        ctx.addIssue({
          code: "custom",
          message: "a sensitive answer carries a caution: this is not legal advice",
        });
      }
      if (bases(w.blocks).includes("our_record")) {
        ctx.addIssue({
          code: "custom",
          message: "on a sensitive answer our own record is not authority — cite the official source or say unknown",
        });
      }
    }
  });

export type Workspace = z.infer<typeof workspaceSchema>;

/** Parse what an employee sent. An unknown block is refused, not rendered. */
export function parseWorkspace(
  input: unknown,
): { ok: true; workspace: Workspace } | { ok: false; errors: string[] } {
  const parsed = workspaceSchema.safeParse(input);
  if (parsed.success) return { ok: true, workspace: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.slice(0, 12).map((issue) => {
      const where = issue.path.join(".");
      return where ? `${where}: ${issue.message}` : issue.message;
    }),
  };
}

/** "Answered as a comparison with dated evidence." */
export function shapeSentence(shape: WorkspaceShape): string {
  return `Answered as ${SHAPE_LABEL[shape]}.`;
}

/** What a test asks for, in words, for the "finished when" list. */
export function describeTest(test: DoneTest, w: Workspace): string {
  const caption = (id: string) => {
    const block = w.blocks.find((b) => b.id === id);
    if (!block) return id;
    return ("caption" in block && block.caption) || block.id.replace(/[_-]/g, " ");
  };
  switch (test.kind) {
    case "rows_at_least":
      return `${test.count} rows in ${caption(test.block)}`;
    case "every_row_has": {
      const block = w.blocks.find((b) => b.id === test.block);
      const label =
        block?.kind === "table"
          ? (block.columns.find((c) => c.key === test.column)?.label ?? test.column)
          : test.column;
      return `every row in ${caption(test.block)} has ${label.toLowerCase()}, or says it is not established`;
    }
    case "every_row_dated":
      return `every row in ${caption(test.block)} rests on a dated source`;
    case "items_at_least":
      return `${test.count} in ${caption(test.block)}`;
    case "steps_have_owner":
      return `every step in ${caption(test.block)} says who does it`;
    case "no_open_gaps":
      return `nothing left open in ${caption(test.block)}`;
    case "sources_at_least":
      return `${test.count} sources behind the answer`;
  }
}

/** How far along, counted from the artifact. Never claimed by an employee. */
export function workspaceProgress(w: Workspace): {
  passed: number;
  total: number;
  percent: number;
  open: string[];
} {
  const open: string[] = [];
  let passed = 0;
  const dated = new Set(w.sources.filter((s) => s.date).map((s) => s.id));
  for (const test of w.doneWhen) {
    if (testPasses(test, w, dated)) passed += 1;
    else open.push(describeTest(test, w));
  }
  const total = w.doneWhen.length;
  return { passed, total, percent: total === 0 ? 0 : Math.round((passed / total) * 100), open };
}

function testPasses(test: DoneTest, w: Workspace, dated: Set<string>): boolean {
  if (test.kind === "sources_at_least") return w.sources.length >= test.count;
  const block = w.blocks.find((b) => b.id === test.block);
  if (!block) return false;
  switch (test.kind) {
    case "rows_at_least":
      return block.kind === "table" && block.rows.length >= test.count;
    case "every_row_has":
      return (
        block.kind === "table" &&
        block.rows.every((row) => row.cells[test.column]?.basis !== "unknown")
      );
    case "every_row_dated":
      return (
        block.kind === "table" &&
        block.rows.every((row) =>
          Object.values(row.cells).some((cell) => cell.source && dated.has(cell.source)),
        )
      );
    case "items_at_least":
      return block.kind === "list" && block.items.length >= test.count;
    case "steps_have_owner":
      return block.kind === "route" && block.steps.every((step) => Boolean(step.who));
    case "no_open_gaps":
      return block.kind === "gaps" && block.items.length === 0;
  }
}

// ── the calculation, evaluated without running code ────────────────────────

/** Identifiers used in an expression. */
function namesIn(expr: string): string[] {
  return [...new Set(expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])];
}

function sourceRefs(blocks: WorkspaceBlock[]): string[] {
  const refs: string[] = [];
  for (const block of blocks) {
    if (block.kind === "table") {
      for (const row of block.rows) {
        for (const cell of Object.values(row.cells)) if (cell.source) refs.push(cell.source);
      }
    }
    if (block.kind === "list") for (const item of block.items) if (item.source) refs.push(item.source);
    if (block.kind === "route") for (const step of block.steps) if (step.source) refs.push(step.source);
  }
  return [...new Set(refs)];
}

function bases(blocks: WorkspaceBlock[]): Basis[] {
  const found: Basis[] = [];
  for (const block of blocks) {
    if (block.kind === "table") {
      for (const row of block.rows) for (const cell of Object.values(row.cells)) found.push(cell.basis);
    }
    if (block.kind === "list") for (const item of block.items) found.push(item.basis);
    if (block.kind === "route") for (const step of block.steps) found.push(step.basis);
  }
  return found;
}

/**
 * The person's own numbers, run through the employee's arithmetic.
 *
 * A tiny shunting-yard evaluator over + - * / and brackets: the expression is
 * data, and no code from an employee ever runs in a person's browser.
 */
export function evaluateCalc(
  block: WorkspaceCalc,
  overrides: Record<string, number> = {},
): Record<string, number | null> {
  const values = new Map<string, number>();
  for (const input of block.inputs) {
    const given = overrides[input.key];
    const value = Number.isFinite(given) ? given : input.value;
    values.set(input.key, clamp(value, input.min, input.max));
  }
  const out: Record<string, number | null> = {};
  for (const output of block.outputs) {
    const result = evaluate(output.expr, values);
    out[output.key] = result;
    if (result !== null) values.set(output.key, result);
  }
  return out;
}

function clamp(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

type Token = { t: "n"; v: number } | { t: "o"; v: string } | { t: "("; v: "(" } | { t: ")"; v: ")" };

function tokenise(expr: string, values: Map<string, number>): Token[] | null {
  const tokens: Token[] = [];
  const parts = expr.match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[+\-*/()]/g);
  if (!parts) return null;
  for (const part of parts) {
    if (/^\d/.test(part)) tokens.push({ t: "n", v: Number(part) });
    else if (/^[A-Za-z_]/.test(part)) {
      const known = values.get(part);
      if (known === undefined) return null;
      tokens.push({ t: "n", v: known });
    } else if (part === "(") tokens.push({ t: "(", v: "(" });
    else if (part === ")") tokens.push({ t: ")", v: ")" });
    else tokens.push({ t: "o", v: part });
  }
  return tokens;
}

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

function evaluate(expr: string, values: Map<string, number>): number | null {
  const tokens = tokenise(expr, values);
  if (!tokens) return null;
  const numbers: number[] = [];
  const operators: string[] = [];
  const apply = () => {
    const op = operators.pop();
    const b = numbers.pop();
    const a = numbers.pop();
    if (op === undefined || a === undefined || b === undefined) return false;
    if (op === "+") numbers.push(a + b);
    else if (op === "-") numbers.push(a - b);
    else if (op === "*") numbers.push(a * b);
    else if (op === "/") numbers.push(b === 0 ? NaN : a / b);
    else return false;
    return true;
  };
  for (const token of tokens) {
    if (token.t === "n") numbers.push(token.v);
    else if (token.t === "(") operators.push("(");
    else if (token.t === ")") {
      while (operators.length && operators[operators.length - 1] !== "(") {
        if (!apply()) return null;
      }
      if (operators.pop() !== "(") return null;
    } else {
      while (
        operators.length &&
        operators[operators.length - 1] !== "(" &&
        PRECEDENCE[operators[operators.length - 1]] >= PRECEDENCE[token.v]
      ) {
        if (!apply()) return null;
      }
      operators.push(token.v);
    }
  }
  while (operators.length) {
    if (operators[operators.length - 1] === "(") return null;
    if (!apply()) return null;
  }
  if (numbers.length !== 1) return null;
  const answer = numbers[0];
  return Number.isFinite(answer) ? Math.round(answer * 100) / 100 : null;
}
