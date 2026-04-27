import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-500">Loading login...</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
