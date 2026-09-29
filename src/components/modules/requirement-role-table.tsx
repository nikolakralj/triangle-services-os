import type { RequirementRoleRow } from "@/lib/job-intake/requirement-case";

// One row per role on a people-request case. Six columns; the rest sits
// under the role name so the row still reads on a phone.

function cell(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text || "not stated";
}

function detail(role: RequirementRoleRow): string | null {
  const parts = [
    role.skills.length > 0 ? role.skills.join(", ") : null,
    role.languages.length > 0 ? role.languages.join(", ") : null,
    role.durationText ? role.durationText : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function RequirementRoleTable({
  roles,
  openQuestions = [],
}: {
  roles: RequirementRoleRow[];
  openQuestions?: string[];
}) {
  if (roles.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Role</th>
            <th className="px-3 py-2 font-semibold">How many</th>
            <th className="px-3 py-2 font-semibold">Level</th>
            <th className="px-3 py-2 font-semibold">Start</th>
            <th className="px-3 py-2 font-semibold">Where</th>
            <th className="px-3 py-2 font-semibold">Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {roles.map((role, index) => {
            const extra = detail(role);
            return (
              <tr key={`${role.title}-${role.level ?? ""}-${index}`}>
                <td className="px-3 py-2.5 align-top text-slate-900">
                  <span className="font-medium">{role.title}</span>
                  {extra && <span className="mt-0.5 block text-[12px] text-slate-500">{extra}</span>}
                </td>
                <td className="px-3 py-2.5 align-top tabular-nums text-slate-800">{role.headcount}</td>
                <td className="px-3 py-2.5 align-top text-slate-700">{cell(role.level)}</td>
                <td className="px-3 py-2.5 align-top text-slate-700">{cell(role.startText)}</td>
                <td className="px-3 py-2.5 align-top text-slate-700">{cell(role.location)}</td>
                <td className="px-3 py-2.5 align-top text-slate-700">{cell(role.rateText)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {openQuestions.length > 0 && (
        <p className="border-t border-slate-100 px-3 py-2.5 text-[12.5px] text-slate-600">
          Still open: {openQuestions.join("; ")}.
        </p>
      )}
    </div>
  );
}
