"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      if (!supabase) {
        setChecking(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      if (mounted) setChecking(false);
    }

    checkSession();
    return () => {
      mounted = false;
    };
  }, [pathname, router, supabase]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Checking private workspace access...
        </div>
      </div>
    );
  }

  return (
    <>
      {!supabase ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span className="inline-flex items-center gap-2 font-medium">
            <ShieldCheck className="h-4 w-4" />
            Local demo mode:
          </span>{" "}
          Supabase env vars are not configured yet. The app is previewing with
          seeded demo data.
        </div>
      ) : null}
      {children}
    </>
  );
}
