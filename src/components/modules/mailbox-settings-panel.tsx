"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MailAccount {
  id: string;
  emailAddress: string;
  displayName: string | null;
  watchLabel: string | null;
  imapHost: string;
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  credentialSetAt: string | null;
  connected: boolean;
  usesLegacyEnvVar: boolean;
}

const EMPTY_FORM = {
  emailAddress: "",
  displayName: "",
  password: "",
  imapHost: "",
  watchLabel: "",
};

export function MailboxSettingsPanel() {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [encryptionConfigured, setEncryptionConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/job-intake/accounts");
      if (!res.ok) return;
      const data = (await res.json()) as {
        accounts: MailAccount[];
        encryptionConfigured: boolean;
      };
      setAccounts(data.accounts ?? []);
      setEncryptionConfigured(data.encryptionConfigured);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function connect() {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/job-intake/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not connect the mailbox.");
        return;
      }
      setSaved(`${form.emailAddress} connected.`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(id: string, address: string) {
    if (!confirm(`Disconnect ${address}? Stored leads are kept.`)) return;
    setRemovingId(id);
    try {
      const res = await fetch(`/api/job-intake/accounts?id=${id}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setRemovingId(null);
    }
  }

  const isGmail = /@(gmail|googlemail)\.com$/i.test(form.emailAddress.trim());

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Connected mailboxes</h2>
        <p className="mt-1 text-sm text-slate-600">
          Each person connects their own mailbox. Your password is encrypted before
          it is saved and is never shown again — not to your colleagues, and not to
          the AI.
        </p>
      </div>

      {!encryptionConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Encryption key missing</p>
            <p className="mt-1">
              Passwords cannot be stored until <code>ENCRYPTION_KEY</code> is set on
              the server. Generate one with:
            </p>
            <pre className="mt-1 overflow-x-auto rounded bg-amber-100 p-2 text-[11px]">
node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;
            </pre>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
          No mailboxes connected yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {a.emailAddress}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {a.imapHost}
                  {a.watchLabel ? ` · folder: ${a.watchLabel}` : ""}
                  {a.lastSyncedAt
                    ? ` · last read ${new Date(a.lastSyncedAt).toLocaleString()}`
                    : " · never read"}
                </p>
                {a.lastError && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-rose-600">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {a.lastError}
                  </p>
                )}
                {a.usesLegacyEnvVar && (
                  <p className="mt-1 text-xs text-amber-700">
                    Using an environment variable. Reconnect it here to store the
                    password encrypted instead.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {a.connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    <ShieldCheck className="h-3 w-3" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                    <AlertCircle className="h-3 w-3" />
                    No password
                  </span>
                )}
                <Button
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={removingId === a.id}
                  onClick={() => void disconnect(a.id, a.emailAddress)}
                >
                  {removingId === a.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {saved}
        </p>
      )}

      {!showForm ? (
        <Button
          variant="secondary"
          className="h-8 px-3 text-xs"
          disabled={!encryptionConfigured}
          onClick={() => { setShowForm(true); setError(null); setSaved(null); }}
        >
          <Plus className="h-3.5 w-3.5" />
          Connect a mailbox
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <Field
            label="Email address"
            value={form.emailAddress}
            onChange={(v) => setForm((f) => ({ ...f, emailAddress: v }))}
            placeholder="you@triangle-services.com"
            type="email"
          />

          <div>
            <Field
              label={isGmail ? "Google app password" : "Mailbox password"}
              value={form.password}
              onChange={(v) => setForm((f) => ({ ...f, password: v }))}
              placeholder={isGmail ? "16 characters from Google" : "Your mailbox password"}
              type="password"
            />
            <p className="mt-1 text-xs text-slate-500">
              {isGmail ? (
                <>
                  Gmail needs an app password: Google Account → Security →
                  2-Step Verification → App passwords. Not your normal Google
                  password.
                </>
              ) : (
                <>
                  The password for this mailbox from your mail provider — the same
                  one you would use in Outlook or Thunderbird.
                </>
              )}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Mail server (optional)"
              value={form.imapHost}
              onChange={(v) => setForm((f) => ({ ...f, imapHost: v }))}
              placeholder={
                form.emailAddress.includes("@")
                  ? isGmail
                    ? "imap.gmail.com"
                    : `mail.${form.emailAddress.split("@")[1] ?? ""}`
                  : "auto-detected"
              }
            />
            <Field
              label="Folder or label (optional)"
              value={form.watchLabel}
              onChange={(v) => setForm((f) => ({ ...f, watchLabel: v }))}
              placeholder="INBOX"
            />
          </div>

          {error && (
            <p className="flex items-start gap-1.5 text-xs text-rose-600">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              className="h-8 px-3 text-xs"
              disabled={saving || !form.emailAddress || !form.password}
              onClick={() => void connect()}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              {saving ? "Checking sign-in…" : "Connect"}
            </Button>
            <Button
              variant="ghost"
              className="h-8 px-3 text-xs"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(null); }}
            >
              Cancel
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            We sign in once to check it works before saving. Reading only — nothing
            is ever sent, replied to, or deleted.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={type === "password" ? "new-password" : "off"}
        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
    </label>
  );
}
