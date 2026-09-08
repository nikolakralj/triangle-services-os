/**
 * Where a signed-in person lands, and the only safe fallback for `?next=`.
 *
 * Was `/dashboard`, the Overview page. That page has been deleted: it showed
 * the same next move as Today and a second, differently-shaped funnel of the
 * same business, on a page nobody had a reason to open. Landing on the screen
 * that says what needs a human today is what the product is for.
 */
export const HOME_PATH = "/decisions";

export function sanitizeNextPath(value: string | null | undefined) {
  if (!value) return HOME_PATH;
  if (!value.startsWith("/") || value.startsWith("//")) return HOME_PATH;

  try {
    const parsed = new URL(value, "http://triangle.local");
    if (parsed.origin !== "http://triangle.local") return HOME_PATH;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return HOME_PATH;
  }
}
