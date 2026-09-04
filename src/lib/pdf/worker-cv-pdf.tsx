// One person's CV, branded for the active organization.
// Rendered server-side via renderToBuffer. Do NOT add "server-only".

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { WorkerCvDocument } from "@/lib/data/worker-cv";

export type { WorkerCvDocument };

const NAVY = "#1e3a5f";
const TEAL = "#0e7490";
const SLATE = "#64748b";
const LIGHT = "#f1f5f9";
const TEXT = "#1e293b";
const MUTED = "#94a3b8";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: TEXT,
    paddingBottom: 48,
  },
  header: {
    backgroundColor: NAVY,
    paddingHorizontal: 36,
    paddingVertical: 22,
  },
  brand: { color: "#93c5fd", fontSize: 8, letterSpacing: 1.4 },
  name: { color: "#ffffff", fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 6 },
  role: { color: "#bfdbfe", fontSize: 11, marginTop: 3 },
  headMeta: { color: "#93c5fd", fontSize: 8, marginTop: 8 },
  body: { paddingHorizontal: 36, paddingTop: 18 },
  notice: {
    backgroundColor: LIGHT,
    borderLeftWidth: 3,
    borderLeftColor: TEAL,
    padding: 8,
    marginBottom: 14,
    fontSize: 8,
    color: SLATE,
  },
  section: { marginBottom: 13 },
  h2: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: TEAL,
    letterSpacing: 1,
    marginBottom: 5,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: {
    backgroundColor: LIGHT,
    color: TEXT,
    fontSize: 8.5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    marginRight: 4,
    marginBottom: 4,
  },
  line: { fontSize: 9.5, marginBottom: 2 },
  twoCol: { flexDirection: "row", gap: 24 },
  col: { flex: 1 },
  availability: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
  },
  missing: { fontSize: 8, color: MUTED, fontStyle: "italic" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    fontSize: 7.5,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function Chips({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={s.section}>
      <Text style={s.h2}>{title.toUpperCase()}</Text>
      <View style={s.row}>
        {items.map((item) => (
          <Text key={item} style={s.chip}>
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function WorkerCvDoc({ cv }: { cv: WorkerCvDocument }) {
  return (
    <Document
      title={`${cv.orgName} — ${cv.displayName}`}
      author={cv.orgName}
      subject={cv.role}
    >
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.brand}>{cv.orgName.toUpperCase()}</Text>
          <Text style={s.name}>{cv.displayName}</Text>
          <Text style={s.role}>
            {cv.role}
            {cv.workerType ? ` · ${cv.workerType}` : ""}
          </Text>
          <Text style={s.headMeta}>
            Ref {cv.reference}
            {cv.basedIn ? ` · Based in ${cv.basedIn}` : ""}
          </Text>
        </View>

        <View style={s.body}>
          {cv.anonymised && (
            <Text style={s.notice}>
              Candidate profile. Identity and contact details are released by{" "}
              {cv.orgName} once an engagement is agreed. Please refer to this
              person as {cv.reference}.
            </Text>
          )}

          <View style={s.section}>
            <Text style={s.h2}>AVAILABILITY</Text>
            <Text style={s.availability}>{cv.availability}</Text>
            {cv.mobility.length > 0 && (
              <Text style={[s.line, { color: SLATE, marginTop: 3 }]}>
                Will work in: {cv.mobility.join(", ")}
              </Text>
            )}
          </View>

          <Chips title="Skills" items={cv.skills} />
          <Chips title="Certificates" items={cv.certificates} />

          <View style={s.twoCol}>
            <View style={s.col}>
              <Chips title="Languages" items={cv.languages} />
            </View>
            <View style={s.col}>
              <Chips title="Sectors" items={cv.industries} />
            </View>
          </View>

          {cv.practical.length > 0 && (
            <View style={s.section}>
              <Text style={s.h2}>PRACTICAL</Text>
              {cv.practical.map((item) => (
                <Text key={item} style={s.line}>
                  • {item}
                </Text>
              ))}
            </View>
          )}

          {/* Only when there is something under it. An empty CONTACT heading
              on a released, named CV implies details exist and were withheld,
              when in fact Triangle holds none. */}
          {cv.contact && (cv.contact.email || cv.contact.phone) && (
            <View style={s.section}>
              <Text style={s.h2}>CONTACT</Text>
              {cv.contact.email && <Text style={s.line}>{cv.contact.email}</Text>}
              {cv.contact.phone && <Text style={s.line}>{cv.contact.phone}</Text>}
            </View>
          )}

          {/* Stated, not omitted. A CV missing "Certificates" silently reads
              as a person with none, which is a different claim entirely. */}
          {cv.notRecorded.length > 0 && (
            <View style={s.section}>
              <Text style={s.missing}>
                Not recorded on file: {cv.notRecorded.join(", ")}. {cv.orgName}{" "}
                does not state what it has not verified.
              </Text>
            </View>
          )}
        </View>

        <View style={s.footer} fixed>
          <Text>
            {cv.orgName} · {cv.reference}
          </Text>
          <Text>
            Generated {new Date(cv.generatedAt).toLocaleDateString("en-GB")}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
