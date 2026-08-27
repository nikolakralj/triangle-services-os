import { AuthGate } from "@/components/auth/auth-gate";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getSession } from "@/lib/auth/session";
import { countPendingApprovals } from "@/lib/data/approvals";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getSession() is safe to call here — returns null in demo mode (no Supabase).
  const session = await getSession();

  // Carried in the chrome so proposals waiting on a human are visible from
  // every page, not only from the one project they were filed against.
  const approvalsCount = session?.organizationId
    ? await countPendingApprovals(session.organizationId)
    : 0;

  return (
    <AuthGate>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar approvalsCount={approvalsCount} />
        <div className="min-w-0 flex-1">
          <Topbar
            displayName={session?.email ?? ""}
            role={session?.role ?? ""}
          />
          <main className="mx-auto max-w-[1760px] px-4 py-4 xl:px-5">
            {children}
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
