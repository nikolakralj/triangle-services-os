import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { load } from "cheerio";

export type SourceCheck = {
  status: "matched" | "unchecked" | "refused";
  checkedAt: string;
  reason: string;
  pages: Array<{ url: string; status: "read" | "unreadable"; reason?: string }>;
  matches: Array<{ kind: string; value: string; url: string }>;
};
export type PageRead = { text: string; links: string[] } | { reason: string };
export type PageReader = (url: string) => Promise<PageRead>;
const MAX_BYTES = 1_000_000;
const MAX_PAGES = 5;
const blocked = new BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) blocked.addSubnet(ip, bits, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("3fff::", 20, "ipv6");

export function publicAddress(ip: string): boolean {
  if (isIP(ip) === 4) return !blocked.check(ip, "ipv4");
  return isIP(ip) === 6 && globalV6.check(ip, "ipv6") && !blocked.check(ip, "ipv6");
}

/** Public GET only. DNS is checked and pinned to the connection, including redirects.
 * No cookies, credentials, browser execution, or external extraction service.
 */
export async function readSourcePage(raw: string): Promise<PageRead> {
  const signal = AbortSignal.timeout(6000);
  try {
    let url = new URL(raw);
    for (let hop = 0; hop <= 3; hop++) {
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
          (url.port && !["80", "443"].includes(url.port))) {
        return { reason: "Only public HTTP(S) pages without credentials on standard ports can be read." };
      }
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      if (!hostname.includes(".") && !isIP(hostname)) return { reason: "The source is not a public host." };
      // An address written into the URL is checked as it stands; there is no
      // name to resolve, and a resolver must not be trusted to hand it back.
      const literal = isIP(hostname);
      const addresses = literal
        ? [{ address: hostname, family: literal }]
        : await Promise.race([
            lookup(hostname, { all: true }),
            new Promise<never>((_, reject) => {
              if (signal.aborted) reject(new Error("timeout"));
              else signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
            }),
          ]);
      if (!addresses.length || addresses.some((a) => !publicAddress(a.address))) {
        return { reason: "The source resolves to a non-public address." };
      }
      const pinned = addresses[0];
      const response = await new Promise<{ status: number; location?: string; type: string; body: string }>((resolve, reject) => {
        const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
          signal, agent: false,
          headers: { Accept: "text/html, text/plain", "Accept-Encoding": "identity", "User-Agent": "TriangleSourceCheck/1.0" },
          // Node asks for every address (`all`) when it races IPv4 and IPv6.
          // Answering that with a bare address failed every real page with
          // "Invalid IP address: undefined" — all 38 doors on file read as
          // unreadable — while the mocked request in the checks passed.
          lookup: (_host, options, callback) =>
            options?.all
              ? callback(null, [{ address: pinned.address, family: pinned.family }])
              : callback(null, pinned.address, pinned.family),
        }, (res) => {
          const status = res.statusCode ?? 0;
          const type = String(res.headers["content-type"] ?? "").toLowerCase();
          if (status < 200 || status >= 300 || !/^(text\/html|text\/plain|application\/xhtml\+xml)(;|$)/.test(type)) {
            res.destroy();
            resolve({ status, location: res.headers.location, type, body: "" });
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > MAX_BYTES) res.destroy(new Error("page exceeds the 1 MB reading limit"));
            else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () => resolve({ status, type, body: Buffer.concat(chunks).toString("utf8") }));
        });
        req.on("error", reject);
        req.end();
      });
      if ([301, 302, 303, 307, 308].includes(response.status) && response.location) {
        url = new URL(response.location, url);
        continue;
      }
      if (response.status < 200 || response.status >= 300) return { reason: "Source returned HTTP " + response.status + "." };
      if (response.type.startsWith("text/plain")) {
        return response.body.trim() ? { text: response.body, links: [] } : { reason: "The page has no readable text." };
      }
      if (!/^(text\/html|application\/xhtml\+xml)(;|$)/.test(response.type)) {
        return { reason: "Unsupported page format; Triangle reads HTML and plain text." };
      }
      const $ = load(response.body);
      $("script, style, template, noscript, [hidden], [aria-hidden='true']").remove();
      $("br").replaceWith("\n");
      $("p, div, li, tr, section, footer, header").append("\n");
      const title = $("title").text();
      const text = $("body").text().replace(/[^\S\n]+/g, " ").trim();
      if (!text || /just a moment|access denied|verify (?:you are|you're) human|captcha|sign in|log in/i.test(title) ||
          /enable javascript|checking your browser|verify (?:you are|you're) human/i.test(text)) {
        return { reason: "The page is empty or requires a browser, login, or access check." };
      }
      const links = $("a[href]").toArray().map((a) => $(a).attr("href") ?? "")
        .filter((href) => /^(mailto|tel):/i.test(href));
      return { text, links };
    }
    return { reason: "Too many source redirects." };
  } catch {
    return { reason: signal.aborted ? "Source reading timed out." : "Source could not be read (network, TLS, DNS, or page size)." };
  }
}

/** A bounded, request-local cache. A twelve-target filing cannot wait twelve timeouts. */
export function sourceReader(): PageReader {
  const cache = new Map<string, Promise<PageRead>>();
  const deadline = Date.now() + 20_000;
  return (url) => {
    if (!cache.has(url)) cache.set(url, Date.now() >= deadline
      ? Promise.resolve({ reason: "Filing source-reading budget reached; refile with the supporting page." })
      : readSourcePage(url));
    return cache.get(url)!;
  };
}

function phoneDigits(value: string): string {
  return value.replace(/\(0\)/g, "").replace(/\D/g, "").replace(/^00/, "");
}

export function pageContains(page: { text: string; links: string[] }, kind: string, value: string): boolean {
  if (kind === "email") {
    const emails: string[] = page.text.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
    for (const href of page.links.filter((h) => /^mailto:/i.test(h))) {
      try { emails.push(...decodeURIComponent(href.slice(7).split("?")[0]).split(/[,;]/)); } catch { /* unreadable link */ }
    }
    return emails.some((email) => email.toLowerCase() === value.toLowerCase());
  }
  const expected = phoneDigits(value);
  if (expected.length < 7 || expected.length > 16) return false;
  const numbers: string[] = page.text.match(/(?<![\w+])(?:\+|00)?\d[\d \t()./–-]{5,}\d(?!\w)/g) ?? [];
  for (const href of page.links.filter((h) => /^tel:/i.test(h))) {
    try { numbers.push(decodeURIComponent(href.slice(4).split(/[;?]/)[0])); } catch { /* unreadable link */ }
  }
  return numbers.some((number) => phoneDigits(number) === expected);
}

export async function checkFindingSource(
  payload: Record<string, unknown>, urls: string[], read: PageReader = sourceReader(),
): Promise<SourceCheck> {
  const result: SourceCheck = { status: "refused", checkedAt: new Date().toISOString(), reason: "", pages: [], matches: [] };
  const channels: Array<{ kind: string; value: string }> = [];
  for (const kind of ["phone", "email"]) {
    const value = payload[kind];
    if (typeof value === "string" && value.trim()) channels.push({ kind, value: value.trim() });
  }
  if (typeof payload.value === "string" && payload.value.trim()) {
    const value = payload.value.trim();
    const kind = typeof payload.kind === "string" ? payload.kind.toLowerCase() : value.includes("@") ? "email" : "phone";
    if (!["phone", "email"].includes(kind)) {
      result.reason = "Reachable requires a published phone or email; a portal or profile alone is not source-checked reachability.";
      return result;
    }
    channels.push({ kind, value });
  }
  if (!channels.length || channels.some((c) => c.kind === "email"
    ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value)
    : !/^[+()\d][\d\s()./-]+$/.test(c.value) || phoneDigits(c.value).length < 7)) {
    result.reason = "Reachable needs a valid phone number or email address to check on a cited page.";
    return result;
  }
  const sources = [...new Set(urls.filter(Boolean))];
  if (!sources.length) {
    result.reason = "Reachable needs a cited page showing the phone or email.";
    return result;
  }
  const pages = await Promise.all(sources.slice(0, MAX_PAGES).map(async (url) => {
    try { return { url, page: await read(url) }; }
    catch { return { url, page: { reason: "Source reader failed." } }; }
  }));
  for (const { url, page } of pages) result.pages.push("reason" in page
    ? { url, status: "unreadable", reason: page.reason } : { url, status: "read" });
  for (const channel of channels) {
    const match = pages.find(({ page }) => !("reason" in page) && pageContains(page, channel.kind, channel.value));
    if (match) result.matches.push({ ...channel, url: match.url });
  }
  if (result.matches.length === channels.length) {
    result.status = "matched";
    result.reason = "The supplied phone/email appears on a cited page Triangle read. Identity and buying authority still need human review.";
  } else if (result.pages.some((p) => p.status === "unreadable") || sources.length > MAX_PAGES) {
    result.status = "unchecked";
    result.reason = "Source unchecked: Triangle could not read all supporting pages to confirm the supplied phone/email. " +
      (result.pages.filter((p) => p.reason).map((p) => p.reason).join(" ") || "At most five cited pages are read per finding.");
  } else {
    result.reason = "Reachable refused: the supplied phone/email does not appear on any cited page Triangle could read. Cite the page that publishes it or file the missing channel.";
  }
  return result;
}

export function citedUrls(payload: Record<string, unknown>, sourceUrl?: string | null): string[] {
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  return [sourceUrl, ...sources.map((s: unknown) => typeof s === "string" ? s :
    s && typeof s === "object" ? (s as Record<string, unknown>).url ?? (s as Record<string, unknown>).source_url : null)]
    .filter((s): s is string => typeof s === "string" && Boolean(s.trim()));
}
