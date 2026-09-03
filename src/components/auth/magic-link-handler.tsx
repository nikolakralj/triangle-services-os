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
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.length < 2) return;

    const parsed = new URLSearchParams(hash.slice(1));

    // Supabase reports a dead link in the SAME fragment, not as an error page:
    //   #error=access_denied&error_code=otp_expired&error_description=…
    // Ignoring that branch is what made a used link look like a broken app —
    // the person landed on a bare login form, typed their email, and got
    // "Invalid login credentials" from the password field instead of being
    // told the link had expired.
    const err = parsed.get("error") ?? parsed.get("error_code");
    if (err) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      queueMicrotask(() => {
        setReason(
          (parsed.get("error_description") ?? "").replace(/\+/g, " ") || null,
        );
        setState("failed");
      });
      return;
    }

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
        <span className="block text-rose-700">
          <strong>That sign-in link no longer works.</strong>{" "}
          {reason ?? "It has expired or was already used."} Sign-in links are
          single use and last about an hour — and a chat or mail app that
          previews links can spend one before you click it. Ask for a fresh
          link, or sign in below with your password.
        </span>
      )}
    </div>
  );
}
