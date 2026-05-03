import type { ResearchSuggestionRow } from "@/lib/data/research";

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function buildSuggestionGroupKey(suggestion: ResearchSuggestionRow) {
  const payload = suggestion.payload_json;
  if (suggestion.suggestion_type === "chain_node") {
    return `chain:${normalize(payload.company)}:${normalize(payload.role)}`;
  }
  if (suggestion.suggestion_type === "buyer_contact") {
    return `buyer:${normalize(payload.name)}:${normalize(payload.company)}:${normalize(payload.title)}`;
  }
  if (suggestion.suggestion_type === "package_opportunity") {
    return `package:${normalize(payload.package_type)}:${normalize(payload.likely_buyer)}`;
  }
  return `note:${normalize(payload.content)}`;
}

export function buildSuggestionTitle(suggestion: ResearchSuggestionRow) {
  const payload = suggestion.payload_json;
  if (suggestion.suggestion_type === "chain_node") {
    return `${String(payload.company ?? "Unknown")} - ${String(payload.role ?? "unknown").toUpperCase()}`;
  }
  if (suggestion.suggestion_type === "buyer_contact") {
    return `${String(payload.name ?? "Unknown")} @ ${String(payload.company ?? "Unknown")}`;
  }
  if (suggestion.suggestion_type === "package_opportunity") {
    return `${String(payload.package_type ?? "package")} -> ${String(payload.likely_buyer ?? "?")}`;
  }
  return String(payload.content ?? "Note");
}

export function getSuggestionStrength(confidence: number | null) {
  if (confidence === null) return "weak";
  if (confidence >= 75) return "strong";
  if (confidence >= 50) return "medium";
  return "weak";
}

