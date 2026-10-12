// ---------------------------------------------------------------------------
// WhatsApp voice notes from the owner and the field (2026-10-12).
//
// Calls do not reach the bots on their own, so a voice note to Hanna after a
// call is how a call lands on the client's page or case. An inbound `audio`
// message from an owner or field number is downloaded through the Graph media
// endpoint, transcribed (German, English and Croatian mixed, so the language
// is auto-detected), and then treated exactly like an inbound text: same
// routing, typing indicator and 24-hour logic. The transcript is stored on the
// whatsapp_messages row; the audio never is.
//
// Pure rules here, so the check script runs them without a network.
// ---------------------------------------------------------------------------

import { graphVersion, normalizeE164, numberAllowed } from "@/lib/whatsapp/pilot";
import type { SenderPermission } from "@/lib/whatsapp/routing";

/**
 * Size cap before anything is downloaded or sent for transcription. WhatsApp
 * voice notes are Opus at roughly 16–32 kbit/s, so 8 MB is well over 15
 * minutes of talk. The transcription endpoint itself refuses above 25 MB.
 */
export const VOICE_MAX_BYTES = 8 * 1024 * 1024;
export const VOICE_MAX_MINUTES_SAID = 15;
/** Transcripts are long; WhatsApp text bodies are not. Keep the row sane. */
export const VOICE_TRANSCRIPT_MAX_CHARS = 12_000;

export const VOICE_ATTACHMENT_KIND = "voice_note";
export const VOICE_TRANSCRIBE_MODEL_DEFAULT = "whisper-1";

export const VOICE_NO_KEY_REPLY = "I got your voice note but can't transcribe yet.";
export const VOICE_TOO_LONG_REPLY = `I got your voice note, but it's too long for me to transcribe. Please send it in parts of under about ${VOICE_MAX_MINUTES_SAID} minutes.`;
export const VOICE_FAILED_REPLY =
  "I got your voice note, but the transcription failed. Please send it again, or type the main points.";

export const VOICE_REPLY_REASON = "Voice note notice.";

export type { ParsedAudio as ParsedVoice } from "@/lib/whatsapp/pilot";

export interface VoiceEnv {
  apiKey: string | null;
  model: string;
}

/**
 * The repo already talks to OpenAI with OPENAI_API_KEY, so transcription
 * reuses it. WHATSAPP_TRANSCRIBE_MODEL is optional.
 */
export function readVoiceEnv(env: Record<string, string | undefined>): VoiceEnv {
  const key = env.OPENAI_API_KEY?.trim() || null;
  const model = env.WHATSAPP_TRANSCRIBE_MODEL?.trim() || VOICE_TRANSCRIBE_MODEL_DEFAULT;
  return { apiKey: key, model };
}

export function voiceSenderRole(input: {
  from: string;
  senders: readonly SenderPermission[];
  unmatched: "unlisted" | "field";
  allowlist: string[] | null;
}): "owner" | "field" | null {
  const from = normalizeE164(input.from);
  if (!from || !numberAllowed(from, input.allowlist)) return null;
  const listed = input.senders.find((sender) => normalizeE164(sender.e164) === from);
  if (listed?.id === "owner") return "owner";
  if (listed?.id === "field") return "field";
  if (!listed && input.unmatched === "field") return "field";
  return null;
}

export type VoicePlan =
  | { action: "ignore"; reason: string }
  | { action: "reply"; text: string; reason: string }
  | { action: "transcribe" };

/** Before download: who sent it and whether we can transcribe at all. */
export function planVoiceNote(input: {
  role: "owner" | "field" | null;
  keyPresent: boolean;
}): VoicePlan {
  if (!input.role) {
    return { action: "ignore", reason: "Voice notes are read only from owner and field numbers." };
  }
  if (!input.keyPresent) {
    return { action: "reply", text: VOICE_NO_KEY_REPLY, reason: "No transcription key is configured." };
  }
  return { action: "transcribe" };
}

/** After the Graph media lookup, before the bytes are fetched. */
export function planVoiceSize(fileSize: number | null): VoicePlan {
  if (fileSize !== null && Number.isFinite(fileSize) && fileSize > VOICE_MAX_BYTES) {
    return { action: "reply", text: VOICE_TOO_LONG_REPLY, reason: `Voice note is ${fileSize} bytes, over the cap.` };
  }
  return { action: "transcribe" };
}

export function cleanTranscript(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > VOICE_TRANSCRIPT_MAX_CHARS ? `${text.slice(0, VOICE_TRANSCRIPT_MAX_CHARS)}…` : text;
}

export function graphMediaInfoUrl(version: string, mediaId: string): string {
  return `https://graph.facebook.com/${graphVersion(version)}/${encodeURIComponent(mediaId)}`;
}

export function voiceReplyKey(wamid: string): string {
  return `voice|${wamid.trim()}`;
}

export function audioFilename(mime: string | null): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("ogg") || m.includes("opus")) return "voice.ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "voice.mp3";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "voice.m4a";
  if (m.includes("amr")) return "voice.amr";
  if (m.includes("wav")) return "voice.wav";
  return "voice.ogg";
}
