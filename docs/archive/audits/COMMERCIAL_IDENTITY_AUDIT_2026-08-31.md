# Commercial Identity Audit — 31 August 2026

## Result

Customer-facing and AI-assisted commercial runtime paths no longer use a
hardcoded Triangle, Nikola, or Ralph identity. The product brand is `Triangle
OS`; the seller identity comes from the active organization's human-approved
operating profile.

## Classification and disposition

| Area | Previous state | Classification | Current control |
|---|---|---|---|
| Login, metadata, top bar | Triangle identity in product chrome | Unsafe customer-visible runtime | Generic product brand; top bar reads tenant name |
| General AI generation | Triangle prompt plus invented sample records | Unsafe commercial output | Tenant profile plus organization-filtered live records; missing profile returns `409` |
| Job intake and reply drafting | Triangle positioning/sign-off | Unsafe commercial output | Tenant profile injected; incomplete profile blocks drafting |
| Research run/chat | Triangle seller instructions and Zagreb search location | Unsafe commercial instruction | Tenant name/profile injected; search is not pinned to tenant-zero location |
| Import evaluation | Triangle target-market prompt | Unsafe commercial scoring | Fit is scored against the active tenant's approved profile |
| Submission packet/PDF | Triangle author, header, next step, footer | Unsafe buyer-facing artifact | Organization name is required and passed into both formats |
| Individual worker CV/PDF | Later feature added a Triangle fallback and `TS-` reference | Unsafe buyer-facing artifact | Active organization name is required; the reference prefix is derived from it |
| Document center | Static Triangle sample records and fake signed link | Unsafe operational record | Static sample module removed; tenant database and private storage are authoritative |
| MCP description | Triangle-specific server description | Product metadata leakage | Generic project-to-placement workbench description |
| Tenant-zero defaults | Triangle company facts and sign-off | Legitimate tenant data | Restricted to the demo/tenant-zero organization profile and migration seed |
| Operator documentation and git history | Named founders/operators | Internal repository context | Not supplied to generated commercial output |

## Runtime gates

- Organization name, approved company profile, and reply sign-off are required
  before commercial drafting.
- AI record lookups include `organization_id`; a foreign or missing selected
  record returns `404`.
- Outreach generation is blocked when the company/contact has do-not-contact or
  opt-out status.
- Research suggestions remain pending until human acceptance.
- Submission packets require the active organization profile.
- Individual worker CVs require the active organization name and derive their
  brand/reference from it; anonymised output remains the default.
- Documents are filtered by tenant role and opened through short-lived signed
  URLs.

## Regression evidence

Run:

```text
npm run check:tenant-identity
```

The check scans runtime TypeScript/TSX files and fails if tenant-zero identity
appears outside the explicitly allowed tenant-zero profile. On 31 August 2026,
the check, TypeScript, and focused ESLint passed.

## Deliberate repository-only identity

`supabase/seed.sql`, migration `027`, internal strategy documents, and the demo
organization profile contain Triangle tenant-zero facts. They are seed or
operator data, not generic commercial instructions. A new organization starts
with an empty approved profile and cannot draft commercially until a human
completes it.
