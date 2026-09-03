import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { MagicLinkHandler } from "@/components/auth/magic-link-handler";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-500">Loading login...</div>
      }
    >
      {/* An admin-issued link lands here carrying the session in the URL
          fragment. Handled before the form, so the person never sees a login
          screen they do not need. */}
      <MagicLinkHandler />
      <LoginForm />
    </Suspense>
  );
}
