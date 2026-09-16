import { UserRound } from "lucide-react";
import type { HumanMember } from "@/lib/data/workforce";

// Settings → Members. The people in this organization and their roles. Moved
// here from the Workforce board (DEV-012); invites stay admin-controlled and
// are not issued from this screen.
export function MembersSettings({ members }: { members: HumanMember[] }) {
  if (members.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-[13px] text-slate-500">
        No members found for this organization.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      {members.map((m) => (
        <div
          key={m.userId}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
            <UserRound className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">{m.email}</p>
            <p className="text-xs capitalize text-slate-500">{m.role} · human</p>
          </div>
        </div>
      ))}
    </div>
  );
}
