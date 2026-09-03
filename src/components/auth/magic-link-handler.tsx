"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { sanitizeNextPath } from "@/lib/security/redirects";

// ---------------------------------------------------------------------------
// Sign in from a link that carries the session in the URL fragment.
//
// Triangle has two ways in and they use different Supabase flows:
//
//   "Send magic link" on this page  -> PKCE  -> ?code=…  -> /auth/callback
//   scripts/login-link.mjs          -> implicit -> #access_token=…
//
// Only the first was handled. An admin-generated link landed on
// /login?next=%2F#access_token=… and simply showed the login form again —
// signed out, with a token sitting in the address bar. That script exists
// precisely because this project has no SMTP yet, so the emailed route cannot
// be relied on; the link a human sends by hand was the one that had to work,
// and it was the one that did not.
//
// The fragment never reaches the server, so this has to happen in the browser.
// ---------------------------------------------------------------------------

export function MagicLinkHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    const parsed = new URLSearchParams(hash.slice(1));
    const access_token = parsed.get("access_token");
    const refresh_token = parsed.get("refresh_token");
    if (!access_token || !refresh_token) return;

    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    // Deferred: setting state synchronously inside an effect cascades renders.
    queueMicrotask(() => setState("working"));

    // Strip the tokens from the address bar before anything else, so they are
    // not left in history, or copied into a screenshot or a support message.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    void supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          console.error("magic link sign-in:", error.message);
          setState("failed");
          return;
        }
        const next = sanitizeNextPath(params.get("next"));
        router.replace(next);
        router.refresh();
      })
      .catch(() => setState("failed"));
  }, [params, router]);

  if (state === "idle") return null;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      {state === "working" ? (
        <span className="inline-flex items-center gap-2 text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Signing you in…
        </span>
      ) : (
        <span className="text-rose-700">
          That sign-in link has expired or was already used. Ask for a new one.
        </span>
      )}
    </div>
  );
}
