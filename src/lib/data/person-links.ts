// Drive file ids and LinkedIn profile links shared by the candidate import,
// the accept path, and the person page. No server, no database.

const FOLDER_LINK = /\/folders(?:\/|$|\?)|folderview|\/drive\/folders/i;
const DRIVE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const LINKEDIN =
  /^https?:\/\/(?:[^/?#]*\.)?linkedin\.com\/([^?#]+)/i;

export function parseDriveFileId(
  input: string,
): { id: string } | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: "Send a Drive file id or a file link." };
  if (FOLDER_LINK.test(raw)) {
    return {
      error: "Drive folder links are not accepted. Send the file id or a file link.",
    };
  }

  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return { error: "That Drive link could not be read." };
    }
    if (FOLDER_LINK.test(`${url.pathname}${url.search}`)) {
      return {
        error: "Drive folder links are not accepted. Send the file id or a file link.",
      };
    }
    const fromPath = url.pathname.match(/\/file\/d\/([^/]+)/);
    const fromQuery = url.searchParams.get("id");
    const picked = fromPath?.[1] ?? fromQuery;
    if (!picked) {
      return { error: "Send a Drive file id, a /file/d/ link, or a link with ?id=." };
    }
    return checkedDriveId(safeDecode(picked));
  }

  return checkedDriveId(raw);
}

export function driveFileViewUrl(id: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

/** Canonical https://linkedin.com/… form, or null when it is not a profile link. */
export function canonicalLinkedinUrl(value: string): string | null {
  const match = value.trim().match(LINKEDIN);
  if (!match?.[1]) return null;
  const path = match[1].replace(/\/+$/, "").toLowerCase();
  if (!path) return null;
  return `https://linkedin.com/${path}`;
}

/** A link the person page can open, or null when the stored value is not LinkedIn. */
export function linkedinHref(value: string | null | undefined): string | null {
  if (!value) return null;
  return canonicalLinkedinUrl(value);
}

function checkedDriveId(id: string): { id: string } | { error: string } {
  const trimmed = id.trim();
  if (!DRIVE_ID.test(trimmed)) {
    return { error: "That does not look like a Drive file id." };
  }
  return { id: trimmed };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
