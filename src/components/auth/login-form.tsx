"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Supabase is not configured. Use demo mode locally or add env vars.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.href = next;
  }

  async function sendMagicLink() {
    if (!supabase) {
      setMessage("Supabase is not configured. Use demo mode locally or add env vars.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });
    setLoading(false);
    setMessage(error ? error.message : "Magic link sent. Check the invited email inbox.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            Triangle Services
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">
            Business Development OS
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Private invite-only workspace for Nikola and Ralph.
          </p>
        </div>

        <form className="space-y-3" onSubmit={signInWithPassword}>
          <label className="block text-sm font-medium text-slate-700">
            Email
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nikola@triangle.example"
              />
            </div>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <div className="relative mt-1">
              <LockKeyhole className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Invite-controlled password"
              />
            </div>
          </label>
          <Button className="w-full" variant="primary" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          <Button
            className="w-full"
            type="button"
            onClick={sendMagicLink}
            disabled={loading || !email}
          >
            Send magic link
          </Button>
        </form>

        {!supabase ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Supabase env vars are missing, so local demo mode is enabled.
            <Link className="ml-1 font-semibold underline" href={next}>
              Open demo workspace
            </Link>
          </div>
        ) : null}

        {message ? (
          <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {message}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
