import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// ---------------------------------------------------------------------------
// Mailbox credential encryption.
//
// Mailbox passwords are the one secret this app must be able to replay (IMAP
// has no token exchange — you present the password on every connection), so
// they are encrypted at rest rather than hashed.
//
// AES-256-GCM: authenticated, so tampering with the ciphertext fails loudly
// instead of decrypting to garbage. The key lives only in ENCRYPTION_KEY and
// never touches the database, so a database leak alone yields nothing.
//
// Stored format:  v1:<iv b64>:<authTag b64>:<ciphertext b64>
// ---------------------------------------------------------------------------

const VERSION = "v1";
const IV_BYTES = 12; // GCM standard
const KEY_BYTES = 32; // AES-256

/**
 * Generate a key for ENCRYPTION_KEY. Not called at runtime — run it once
 * from a script/REPL to produce a value for the environment.
 */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" and add it to .env.local.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). It should be 32 random bytes, base64-encoded.`,
    );
  }
  return key;
}

/** True when the app is configured to store credentials at all. */
export function isEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptCredential(plaintext: string): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty credential.");
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    data.toString("base64"),
  ].join(":");
}

export function decryptCredential(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Stored credential is malformed or uses an unknown format.");
  }
  const key = loadKey();
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key, or the ciphertext was tampered with.
    throw new Error(
      "Could not decrypt the mailbox password. ENCRYPTION_KEY may have changed — reconnect the mailbox.",
    );
  }
}

/**
 * Resolve a mailbox password. Prefers the encrypted column; falls back to the
 * legacy env-var reference so accounts set up before this migration keep
 * working.
 */
export function resolveMailboxPassword(account: {
  email_address: string;
  credential_encrypted?: string | null;
  credential_ref?: string | null;
}): string {
  if (account.credential_encrypted) {
    return decryptCredential(account.credential_encrypted);
  }
  if (account.credential_ref) {
    const fromEnv = process.env[account.credential_ref];
    if (fromEnv) return fromEnv;
    throw new Error(
      `Mailbox ${account.email_address} points at env var ${account.credential_ref}, which is not set.`,
    );
  }
  throw new Error(
    `Mailbox ${account.email_address} has no password stored. Reconnect it in Settings.`,
  );
}

/**
 * Constant-time compare, for verifying shared secrets (e.g. the cron token)
 * without leaking length/prefix information through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
