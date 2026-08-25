// React PDF component for Crew Submission Packet
// Uses @react-pdf/renderer — runs server-side via renderToBuffer in the API route.
// Do NOT add "server-only" — this file is imported by the API route directly.

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { PdfPacketData, PdfPacketWorker, PdfCertDoc } from "@/lib/data/submission-packet";
import type { DocumentReadinessItem } from "@/lib/required-documents";

// Re-export types so the API route can import from here
export type { PdfPacketData, PdfPacketWorker };

// ─────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────
const NAVY = "#1e3a5f";
const TEAL = "#0e7490";
const SLATE = "#64748b";
const LIGHT = "#f1f5f9";
const WHITE = "#ffffff";
const TEXT = "#1e293b";
const MUTED = "#94a3b8";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: TEXT,
    backgroundColor: WHITE,
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 0,
  },
  // Header bar
  header: {
    backgroundColor: NAVY,
    paddingHorizontal: 36,
    paddingVertical: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    letterSpacing: 2,
  },
  headerSub: {
    fontSize: 8,
    color: "#93c5fd",
    marginTop: 3,
  },
  headerBrand: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textAlign: "right",
    flexShrink: 0,
  },
  headerBrandSub: {
    fontSize: 8,
    color: "#93c5fd",
    textAlign: "right",
    marginTop: 2,
  },
  // Body
  body: {
    paddingHorizontal: 36,
    paddingTop: 24,
  },
  // Meta grid
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: LIGHT,
    borderRadius: 4,
    padding: 12,
    marginBottom: 14,
    gap: 4,
  },
  metaItem: {
    width: "48%",
    marginBottom: 6,
  },
  metaLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  metaValue: {
    fontSize: 9,
    color: TEXT,
    fontFamily: "Helvetica-Bold",
  },
  // Summary
  summary: {
    fontSize: 9,
    color: SLATE,
    lineHeight: 1.5,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: TEAL,
    paddingLeft: 10,
  },
  // Section heading
  sectionHeading: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT,
  },
  sectionCount: {
    fontSize: 9,
    fontFamily: "Helvetica",
    color: SLATE,
  },
  // Worker card
  workerCard: {
    backgroundColor: LIGHT,
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
  },
  workerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  workerName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
  },
  workerRole: {
    fontSize: 9,
    color: TEAL,
    marginTop: 1,
  },
  workerMeta: {
    fontSize: 8,
    color: SLATE,
    marginTop: 1,
  },
  matchBadge: {
    backgroundColor: NAVY,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignItems: "center",
  },
  matchBadgeText: {
    color: WHITE,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  // Tags row
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
    marginTop: 5,
  },
  tag: {
    backgroundColor: WHITE,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 7,
    color: TEXT,
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
  },
  tagA1: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    color: "#166534",
  },
  // Cert checklist
  certRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
  },
  certChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 0.5,
  },
  certChipText: {
    fontSize: 7,
  },
  certDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  certSectionLabel: {
    fontSize: 7,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 6,
    marginBottom: 2,
  },
  // Score row
  scoreRow: {
    flexDirection: "row",
    marginTop: 7,
    gap: 10,
  },
  scoreItem: {
    alignItems: "center",
  },
  scoreLabel: {
    fontSize: 7,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  scoreValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: SLATE,
    marginTop: 1,
  },
  // Rate row
  rateRow: {
    marginTop: 5,
    fontSize: 8,
    color: SLATE,
  },
  note: {
    marginTop: 5,
    fontSize: 8,
    color: SLATE,
    fontFamily: "Helvetica-Oblique",
  },
  // Divider
  divider: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    marginVertical: 14,
  },
  // Next steps
  nextStepsHeading: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 7,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  bullet: {
    fontSize: 9,
    color: TEAL,
    marginRight: 6,
    fontFamily: "Helvetica-Bold",
  },
  bulletText: {
    fontSize: 9,
    color: TEXT,
    flex: 1,
    lineHeight: 1.4,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 16,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: MUTED,
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function MetaItem({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={s.metaItem}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

const CERT_STATUS_STYLES: Record<PdfCertDoc["status"], { bg: string; border: string; text: string; dot: string }> = {
  valid:          { bg: "#f0fdf4", border: "#86efac", text: "#166534", dot: "#22c55e" },
  expiring_soon:  { bg: "#fffbeb", border: "#fcd34d", text: "#92400e", dot: "#f59e0b" },
  expired:        { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", dot: "#ef4444" },
  no_expiry:      { bg: "#f8fafc", border: "#cbd5e1", text: "#475569", dot: "#94a3b8" },
};

const CERT_STATUS_LABEL: Record<PdfCertDoc["status"], string> = {
  valid: "valid",
  expiring_soon: "expiring",
  expired: "EXPIRED",
  no_expiry: "on file",
};

function CertChecklist({ docs }: { docs: PdfCertDoc[] }) {
  if (docs.length === 0) return null;
  return (
    <View>
      <Text style={s.certSectionLabel}>Documents on file</Text>
      <View style={s.certRow}>
        {docs.map((doc, i) => {
          const st = CERT_STATUS_STYLES[doc.status];
          return (
            <View
              key={i}
              style={[s.certChip, { backgroundColor: st.bg, borderColor: st.border }]}
            >
              <View style={[s.certDot, { backgroundColor: st.dot }]} />
              <Text style={[s.certChipText, { color: st.text }]}>
                {doc.label} · {CERT_STATUS_LABEL[doc.status]}
                {doc.expiryDate ? ` ${doc.expiryDate}` : ""}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const READINESS_STYLES: Record<DocumentReadinessItem["status"], { bg: string; border: string; text: string; dot: string }> = {
  complete: { bg: "#f0fdf4", border: "#86efac", text: "#166534", dot: "#22c55e" },
  partial:  { bg: "#fffbeb", border: "#fcd34d", text: "#92400e", dot: "#f59e0b" },
  missing:  { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", dot: "#ef4444" },
};

function DocumentReadinessSection({
  items,
  source,
}: {
  items: DocumentReadinessItem[];
  source: PdfPacketData["requiredDocsSource"];
}) {
  if (items.length === 0) return null;
  return (
    <View>
      <Text style={s.sectionHeading}>DOCUMENT READINESS</Text>
      <Text style={{ ...s.workerMeta, marginBottom: 8 }}>
        {source === "template"
          ? "Required documents inferred from project country and roles."
          : "Required documents defined for this package."}
      </Text>
      <View style={s.certRow}>
        {items.map((item, i) => {
          const st = READINESS_STYLES[item.status];
          return (
            <View
              key={i}
              style={[s.certChip, { backgroundColor: st.bg, borderColor: st.border }]}
            >
              <View style={[s.certDot, { backgroundColor: st.dot }]} />
              <Text style={[s.certChipText, { color: st.text }]}>
                {item.label} · {item.onFile}/{item.total} on file
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function WorkerCard({ worker }: { worker: PdfPacketWorker }) {
  const metaParts: string[] = [];
  if (worker.country) metaParts.push(worker.country);
  if (worker.languages.length > 0) metaParts.push(worker.languages.join(", "));
  if (worker.availability) metaParts.push(worker.availability.replace("_", " "));
  if (worker.availableFrom) metaParts.push(`from ${worker.availableFrom}`);

  const rateParts: string[] = [];
  if (worker.dailyRate) rateParts.push(`${worker.dailyRate} ${worker.currency ?? ""}/day`);
  if (worker.hourlyRate) rateParts.push(`${worker.hourlyRate} ${worker.currency ?? ""}/hr`);

  const avgQuality = Math.round((worker.reliability + worker.quality + worker.safety) / 3);

  return (
    <View style={s.workerCard} wrap={false}>
      <View style={s.workerHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.workerName}>{worker.name}</Text>
          {worker.role && <Text style={s.workerRole}>{worker.role}</Text>}
          {metaParts.length > 0 && (
            <Text style={s.workerMeta}>{metaParts.join(" · ")}</Text>
          )}
        </View>
        <View style={s.matchBadge}>
          <Text style={s.matchBadgeText}>{worker.matchScore}%</Text>
          <Text style={{ ...s.matchBadgeText, fontSize: 6, color: "#93c5fd" }}>match</Text>
        </View>
      </View>

      {/* Skills */}
      {worker.skills.length > 0 && (
        <View style={s.tagsRow}>
          {worker.skills.map((sk, i) => (
            <Text key={i} style={s.tag}>{sk}</Text>
          ))}
        </View>
      )}

      {/* Certs + A1 */}
      {(worker.certificates.length > 0 || worker.hasA1) && (
        <View style={{ ...s.tagsRow, marginTop: 3 }}>
          {worker.hasA1 && <Text style={{ ...s.tag, ...s.tagA1 }}>A1 portable</Text>}
          {worker.certificates.map((c, i) => (
            <Text key={i} style={s.tag}>{c}</Text>
          ))}
        </View>
      )}

      {/* Uploaded cert documents */}
      <CertChecklist docs={worker.certDocs} />

      {/* Rates */}
      {rateParts.length > 0 && (
        <Text style={s.rateRow}>Rate: {rateParts.join(" or ")}</Text>
      )}

      {/* Track record scores */}
      {avgQuality > 0 && (
        <View style={s.scoreRow}>
          <View style={s.scoreItem}>
            <Text style={s.scoreLabel}>Overall</Text>
            <Text style={s.scoreValue}>{avgQuality}/100</Text>
          </View>
          <View style={s.scoreItem}>
            <Text style={s.scoreLabel}>Reliability</Text>
            <Text style={s.scoreValue}>{worker.reliability}</Text>
          </View>
          <View style={s.scoreItem}>
            <Text style={s.scoreLabel}>Quality</Text>
            <Text style={s.scoreValue}>{worker.quality}</Text>
          </View>
          <View style={s.scoreItem}>
            <Text style={s.scoreLabel}>Safety</Text>
            <Text style={s.scoreValue}>{worker.safety}</Text>
          </View>
        </View>
      )}

      {worker.note && <Text style={s.note}>Note: {worker.note}</Text>}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main document
// ─────────────────────────────────────────────────────────────────────────
export default function SubmissionPacketPdf({ data }: { data: PdfPacketData }) {
  const date = new Date(data.generatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Document
      title={`Crew Submission — ${data.packageTitle}`}
      author="Triangle Services"
      subject="Crew Submission Packet"
    >
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.headerTitle}>CREW SUBMISSION</Text>
            <Text style={s.headerSub}>{data.packageTitle}</Text>
          </View>
          <View>
            <Text style={s.headerBrand}>Triangle Services</Text>
            <Text style={s.headerBrandSub}>Project to Placement</Text>
          </View>
        </View>

        <View style={s.body}>
          {/* Project metadata */}
          <View style={s.metaGrid}>
            <MetaItem label="Project" value={data.projectName} />
            <MetaItem label="Submitting to" value={data.buyerCompany} />
            <MetaItem label="Country" value={data.countryCode} />
            <MetaItem label="Phase" value={data.phase} />
            <MetaItem label="Crew size" value={data.crewSize ? String(data.crewSize) : null} />
            <MetaItem label="Roles" value={data.roles.length > 0 ? data.roles.join(", ") : null} />
          </View>

          {/* Summary */}
          {data.summary && <Text style={s.summary}>{data.summary}</Text>}

          {/* Crew section */}
          <Text style={s.sectionHeading}>
            PROPOSED CREW{" "}
            <Text style={s.sectionCount}>({data.workers.length} workers)</Text>
          </Text>

          {data.workers.map((w, i) => (
            <WorkerCard key={i} worker={w} />
          ))}

          {/* Document readiness */}
          {data.documentReadiness.length > 0 && (
            <>
              <View style={s.divider} />
              <DocumentReadinessSection
                items={data.documentReadiness}
                source={data.requiredDocsSource}
              />
            </>
          )}

          {/* Divider + Next steps */}
          <View style={s.divider} />
          <Text style={s.nextStepsHeading}>NEXT STEPS</Text>
          {[
            "Confirm role/headcount fit",
            "Confirm start date and duration",
            "Confirm commercial rate per role",
            "Triangle Services to share certificates and references for shortlisted workers",
          ].map((step, i) => (
            <View key={i} style={s.bulletRow}>
              <Text style={s.bullet}>›</Text>
              <Text style={s.bulletText}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Page footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Triangle Services · Confidential</Text>
          <Text style={s.footerText}>Generated {date}</Text>
        </View>
      </Page>
    </Document>
  );
}
