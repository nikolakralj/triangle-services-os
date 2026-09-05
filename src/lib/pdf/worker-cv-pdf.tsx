// One person's CV, in Triangle's own house style.
// Rendered server-side via renderToBuffer. Do NOT add "server-only".
//
// Modelled on the CV Triangle already sends — the one for Nikola Kralj, nine
// pages of it. That document is serif, black on white, with the company name
// as a plain letterhead over the Sofia address, a centred "Curriculum Vitae",
// and label/value rows down the left margin. Its only colours are a dark red
// and a blue used sparingly on headings.
//
// The previous version of this file was a navy banner in Helvetica with teal
// section bars and grey chips. It was invented here and looked like software
// output. A candidate CV that does not match the company's own paper tells a
// buyer that it was produced by a different outfit.
//
// Two versions, and the difference is not only the name:
//
//   Client version — initials, no contact details, and short. A buyer deciding
//   whether to take a call does not read nine pages, and every extra fact is
//   another way to identify the person and go direct.
//
//   Named version  — full name and contact, released deliberately.
//
// Neither carries a rate. That is Triangle's cost, not the buyer's business.

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { WorkerCvDocument } from "@/lib/data/worker-cv";

export type { WorkerCvDocument };

// Read off the company's own CV: black body, a dark red and a blue used on
// headings, and a grey for secondary lines.
const INK = "#000000";
const RED = "#c00000";
const BLUE = "#0070c0";
const GREY = "#757171";
const RULE = "#d9d9d9";

// The letterhead as it appears on the paper Triangle already sends.
//
// The legal name is spelled out rather than taken from the organisation
// record: the registration number and VAT id below it belong to Triangle
// Services OOD specifically, and a header that says one entity over a footer
// that identifies another is the kind of detail a procurement desk notices.
const LETTERHEAD = {
  legalName: "Triangle Services OOD",
  addressLine1: "53A, Nikola Vaptzarov Blvd.",
  addressLine2: "1407 Sofia, Bulgaria",
  registration: "Commercial Register : 2071 39321",
  vat: "VAT # : BG 2071 39321",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 10,
    color: INK,
    paddingTop: 40,
    paddingHorizontal: 56,
    paddingBottom: 64,
  },

  // Letterhead: company name left, address right, a rule under both.
  head: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderBottomWidth: 0.75,
    borderBottomColor: RULE,
    paddingBottom: 8,
    marginBottom: 22,
  },
  orgName: { fontFamily: "Times-Bold", fontSize: 20 },
  address: { fontSize: 8, color: GREY, textAlign: "right", lineHeight: 1.4 },

  title: { fontFamily: "Times-Bold", fontSize: 16, textAlign: "center" },
  subject: { fontSize: 10, textAlign: "center", marginTop: 4, marginBottom: 18 },

  // Label on the left, value beside it — the shape of the original.
  row: { flexDirection: "row", marginBottom: 7 },
  label: { fontFamily: "Times-Bold", fontSize: 10, width: 132 },
  value: { fontSize: 10, flex: 1, lineHeight: 1.35 },

  h2: {
    fontFamily: "Times-Bold",
    fontSize: 11,
    color: RED,
    marginTop: 14,
    marginBottom: 6,
  },
  bullet: { fontSize: 10, marginBottom: 2.5, lineHeight: 1.35 },
  note: {
    fontSize: 9,
    color: GREY,
    lineHeight: 1.4,
    borderLeftWidth: 2,
    borderLeftColor: BLUE,
    paddingLeft: 8,
    marginBottom: 16,
  },
  missing: { fontSize: 8.5, color: GREY, fontStyle: "italic", marginTop: 14 },

  footer: {
    position: "absolute",
    bottom: 26,
    left: 56,
    right: 56,
    borderTopWidth: 0.75,
    borderTopColor: RULE,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: GREY,
  },
});

/** A label/value row, skipped entirely when there is no value. */
function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={s.row} wrap={false}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View wrap={false}>
      <Text style={s.h2}>{title}</Text>
      {items.map((item) => (
        <Text key={item} style={s.bullet}>
          {"•  "}
          {item}
        </Text>
      ))}
    </View>
  );
}

export function WorkerCvDoc({ cv }: { cv: WorkerCvDocument }) {
  // The client version stays short on purpose: a buyer deciding whether to
  // take a call reads a page, and each further detail narrows the field of
  // people it could be until the anonymity is decorative.
  const shortlist = <T,>(items: T[], keep: number) =>
    cv.anonymised ? items.slice(0, keep) : items;

  const skills = shortlist(cv.skills, 10);
  const certificates = shortlist(cv.certificates, 8);

  return (
    <Document
      title={`${cv.orgName} — ${cv.displayName}`}
      author={cv.orgName}
      subject={cv.role}
    >
      <Page size="A4" style={s.page}>
        <View style={s.head} fixed>
          <Text style={s.orgName}>{LETTERHEAD.legalName}</Text>
          <Text style={s.address}>
            {LETTERHEAD.addressLine1}
            {"\n"}
            {LETTERHEAD.addressLine2}
          </Text>
        </View>

        <Text style={s.title}>Curriculum Vitae</Text>
        <Text style={s.subject}>{cv.displayName}</Text>

        {cv.anonymised && (
          <Text style={s.note}>
            Candidate profile. {cv.orgName} releases the name and contact
            details once an engagement is agreed. Please refer to this person as{" "}
            {cv.reference}.
          </Text>
        )}

        <Row label="Reference" value={cv.reference} />
        <Row label="Position" value={cv.role} />
        <Row label="Engagement" value={cv.workerType} />
        <Row label="Based in" value={cv.basedIn} />
        <Row label="Experience" value={cv.yearsNote} />
        <Row label="Availability" value={cv.availability} />
        <Row
          label="Will work in"
          value={cv.mobility.length > 0 ? cv.mobility.join(", ") : null}
        />
        <Row
          label="Languages"
          value={cv.languages.length > 0 ? cv.languages.join(", ") : null}
        />
        <Row
          label="Sectors"
          value={cv.industries.length > 0 ? cv.industries.join(", ") : null}
        />

        {/* Named version only, and only when something is actually held. An
            empty "Contact" heading implies details exist and were withheld. */}
        {cv.contact && (cv.contact.email || cv.contact.phone) && (
          <Row
            label="Contact"
            value={[cv.contact.email, cv.contact.phone].filter(Boolean).join(" · ")}
          />
        )}

        <Bullets title="Technical Skills" items={skills} />
        {cv.anonymised && cv.skills.length > skills.length && (
          <Text style={[s.bullet, { color: GREY }]}>
            {"•  "}
            and {cv.skills.length - skills.length} more, on request
          </Text>
        )}

        <Bullets title="Certificates" items={certificates} />

        {/* The practical facts a site manager asks about before anything else:
            passport, A1, own tools, own transport. */}
        {!cv.anonymised && <Bullets title="Practical" items={cv.practical} />}

        {/* Stated, not omitted. A CV missing "Certificates" silently reads as a
            person with none, which is a different claim entirely. */}
        {cv.notRecorded.length > 0 && (
          <Text style={s.missing}>
            Not recorded on file: {cv.notRecorded.join(", ")}. {cv.orgName} does
            not state what it has not verified.
          </Text>
        )}

        <View style={s.footer} fixed>
          <Text>{LETTERHEAD.registration}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${cv.reference} · ${pageNumber} / ${totalPages}`
            }
          />
          <Text>{LETTERHEAD.vat}</Text>
        </View>
      </Page>
    </Document>
  );
}
