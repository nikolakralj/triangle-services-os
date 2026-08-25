// Shared types and constants for worker documents.
// This file has NO server imports — safe to use in both client and server components.

export const CERT_TYPES = [
  { value: "a1",          label: "A1 Certificate" },
  { value: "cscs",        label: "CSCS Card" },
  { value: "ipaf",        label: "IPAF" },
  { value: "pasma",       label: "PASMA" },
  { value: "first_aid",   label: "First Aid" },
  { value: "id_passport", label: "ID / Passport" },
  { value: "work_permit", label: "Work Permit" },
  { value: "cv",          label: "CV / Resume" },
  { value: "reference",   label: "Reference" },
  { value: "other",       label: "Other" },
] as const;

export type CertType = (typeof CERT_TYPES)[number]["value"];

export type WorkerDocument = {
  id: string;
  workerId: string;
  title: string;
  certType: string;
  fileName: string;
  fileSize: number | null;
  storageBucket: string;
  storagePath: string;
  expiryDate: string | null;
  expiryStatus: "valid" | "expiring_soon" | "expired" | "no_expiry";
  createdAt: string;
};
