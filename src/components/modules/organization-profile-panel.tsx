"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  OfferMode,
  OperatingModel,
  OrganizationOperatingProfile,
} from "@/lib/data/organization-profile";

const MODEL_OPTIONS: Array<{ value: OperatingModel; label: string }> = [
  { value: "crew_supplier", label: "Crew / subcontractor supplier" },
  { value: "contract_staffing_agency", label: "Contract staffing agency" },
  { value: "recruitment_agency", label: "Recruitment agency" },
  { value: "independent_recruiter", label: "Independent recruiter" },
];

const OFFER_OPTIONS: Array<{ value: OfferMode; label: string }> = [
  { value: "teams", label: "Teams and crews" },
  { value: "individuals", label: "Individual specialists" },
  { value: "both", label: "Both teams and individuals" },
];

type EditableProfile = Pick<
  OrganizationOperatingProfile,
  | "name"
  | "operatingModel"
  | "offerMode"
  | "companyProfile"
  | "replySignoff"
  | "defaultCurrency"
  | "timezone"
>;

const EMPTY_PROFILE: EditableProfile = {
  name: "",
  operatingModel: "crew_supplier",
  offerMode: "both",
  companyProfile: "",
  replySignoff: "",
  defaultCurrency: "EUR",
  timezone: "UTC",
};

function editable(profile: OrganizationOperatingProfile): EditableProfile {
  return {
    name: profile.name,
    operatingModel: profile.operatingModel,
    offerMode: profile.offerMode,
    companyProfile: profile.companyProfile,
    replySignoff: profile.replySignoff,
    defaultCurrency: profile.defaultCurrency,
    timezone: profile.timezone,
  };
}

export function OrganizationProfilePanel() {
  const [profile, setProfile] = useState<EditableProfile>(EMPTY_PROFILE);
  const [savedProfile, setSavedProfile] =
    useState<EditableProfile>(EMPTY_PROFILE);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = JSON.stringify(profile) !== JSON.stringify(savedProfile);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/settings/organization-profile");
        const data = (await response.json().catch(() => ({}))) as {
          profile?: OrganizationOperatingProfile;
          readOnly?: boolean;
          error?: string;
        };
        if (!response.ok || !data.profile) {
          setError(data.error ?? "Could not load organization settings.");
          return;
        }
        const nextProfile = editable(data.profile);
        setProfile(nextProfile);
        setSavedProfile(nextProfile);
        setReadOnly(Boolean(data.readOnly));
      } catch {
        setError("Network error while loading organization settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function update<K extends keyof EditableProfile>(
    field: K,
    value: EditableProfile[K],
  ) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const response = await fetch("/api/settings/organization-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = (await response.json().catch(() => ({}))) as {
        profile?: OrganizationOperatingProfile;
        error?: string;
      };
      if (!response.ok || !data.profile) {
        setError(data.error ?? "Could not save organization settings.");
        return;
      }
      const nextProfile = editable(data.profile);
      setProfile(nextProfile);
      setSavedProfile(nextProfile);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2_500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const inputClass =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        AI intake and reply drafts use this profile. Keep it factual: it is the
        tenant boundary that prevents one organization from speaking as another.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          Organization name
          <input
            className={inputClass}
            value={profile.name}
            maxLength={160}
            disabled={readOnly}
            onChange={(event) => update("name", event.target.value)}
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          Business model
          <select
            className={inputClass}
            value={profile.operatingModel}
            disabled={readOnly}
            onChange={(event) =>
              update("operatingModel", event.target.value as OperatingModel)
            }
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          What you supply
          <select
            className={inputClass}
            value={profile.offerMode}
            disabled={readOnly}
            onChange={(event) =>
              update("offerMode", event.target.value as OfferMode)
            }
          >
            {OFFER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Currency
            <input
              className={inputClass}
              value={profile.defaultCurrency}
              maxLength={3}
              disabled={readOnly}
              onChange={(event) =>
                update("defaultCurrency", event.target.value.toUpperCase())
              }
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Timezone
            <input
              className={inputClass}
              value={profile.timezone}
              disabled={readOnly}
              onChange={(event) => update("timezone", event.target.value)}
            />
          </label>
        </div>
      </div>

      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Approved company positioning
        <textarea
          className={`${inputClass} resize-y leading-relaxed`}
          rows={6}
          value={profile.companyProfile}
          maxLength={4_000}
          disabled={readOnly}
          onChange={(event) => update("companyProfile", event.target.value)}
          placeholder="What the company does, who it serves, what it can truthfully supply, and where it can operate."
        />
        <span className="block text-xs font-normal text-slate-500">
          Do not include claims, countries, certifications, or capacity that the
          organization cannot prove.
        </span>
      </label>

      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Reply sign-off
        <textarea
          className={`${inputClass} resize-y leading-relaxed`}
          rows={3}
          value={profile.replySignoff}
          maxLength={500}
          disabled={readOnly}
          onChange={(event) => update("replySignoff", event.target.value)}
          placeholder={"Person name\nOrganization name"}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Drafting stays human-approved. Saving this never sends a message.
        </p>
        <div className="flex items-center gap-2">
          {error && (
            <span
              role="alert"
              className="inline-flex items-center gap-1 text-xs text-rose-600"
            >
              <AlertCircle className="h-3 w-3 shrink-0" />
              {error}
            </span>
          )}
          {justSaved && !dirty && (
            <span
              role="status"
              className="inline-flex items-center gap-1 text-xs text-emerald-700"
            >
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              Saved
            </span>
          )}
          <Button
            variant="primary"
            className="h-8 px-3 text-xs"
            disabled={readOnly || saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save organization
          </Button>
        </div>
      </div>
    </div>
  );
}
