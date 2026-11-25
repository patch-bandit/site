import { applyCampaign, validateCampaign, type Campaign } from "./campaignCore.ts";
import { csvCell, parseCsv, unescapeCsvFormula, writeCsv } from "./csv.ts";

/**
 * Forwarding rules for owned QR codes. The visitor keeps a short list (short name, page, tags);
 * these functions check raw input and write the exact config file a web host or plugin expects.
 * Bandit Codes hosts and forwards nothing.
 */

export const MAX_DESTINATION = 2000;
export const MAX_LINKS = 500;
export const MAX_FILE_BYTES = 1_000_000;
export const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export type Check<T> = ({ ok: true } & T) | { ok: false; reason: string };

/** Controls, spaces, line/paragraph separators, zero-width/bidi marks, and lone surrogates are refused. */
const BAD_CHARS =
  /[\u0000-\u001f\u007f-\u00a0\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff\\ "'<>]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function checkHost(host: string): string | null {
  if (host === "") return "The address has no host.";
  if (!/^[A-Za-z0-9.-]+$/.test(host)) {
    return "The host may hold only English letters, digits, dots, and hyphens. Use the plain (xn--) form for other letters.";
  }
  let h = host;
  const dotted = h.endsWith(".");
  if (dotted) h = h.slice(0, -1);
  const labels = h.split(".");
  if (labels.some((l) => l === "")) return "The host has an empty part.";
  if (labels.some((l) => l.length > 63)) return "A part of the host is over 63 characters.";
  const last = labels[labels.length - 1];
  if (/^(\d+|0x[0-9a-f]*)$/i.test(last) || labels.every((l) => /^\d+$/.test(l))) {
    if (dotted) return "An IP address cannot end in a dot.";
    if (labels.length !== 4) return "A number host must be a full four-part IP address.";
    for (const l of labels) {
      if (!/^\d+$/.test(l) || (l.length > 1 && l.startsWith("0")) || Number(l) > 255) {
        return "A number host must be four plain parts from 0 to 255.";
      }
    }
  }
  return null;
}

function splitAddress(raw: string): { scheme: string; authority: string; rest: string } | null {
  const m = /^(https?):\/\/([^/?#]*)([\s\S]*)$/i.exec(raw);
  return m ? { scheme: m[1].toLowerCase(), authority: m[2], rest: m[3] } : null;
}

function checkAuthority(authority: string, allowPort: boolean): string | null {
  if (authority.includes("@")) return "The address has a name before the @ sign.";
  if (authority.startsWith("[")) return "An IPv6 address is not accepted.";
  const colon = authority.indexOf(":");
  let host = authority;
  if (colon !== -1) {
    host = authority.slice(0, colon);
    const port = authority.slice(colon + 1);
    if (!allowPort) return "The address cannot hold a port.";
    if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
      return "The port must be a number from 1 to 65535.";
    }
  }
  return checkHost(host);
}

/**
 * Checks a destination page address. With a campaign, tags are merged first and the 2,000-character
 * limit counts the tagged address. An existing utm_ key wins.
 */
export function checkDestination(input: unknown, campaign?: Campaign): Check<{ url: string; kept: string[] }> {
  if (typeof input !== "string" || input === "") return { ok: false, reason: "Add the page address." };
  if (BAD_CHARS.test(input)) {
    return { ok: false, reason: "The address holds a space, quote, backslash, angle bracket, or control character." };
  }
  const parts = splitAddress(input);
  if (!parts) return { ok: false, reason: "The address must start with https:// or http://." };
  const why = checkAuthority(parts.authority, true);
  if (why) return { ok: false, reason: why };
  try {
    const u = new URL(input);
    const converted = checkHost(u.hostname);
    if (converted) return { ok: false, reason: converted };
  } catch {
    return { ok: false, reason: "That is not a usable web address." };
  }
  let tags: Campaign | undefined;
  if (campaign) {
    const parsed = validateCampaign(campaign);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    tags = parsed.data;
  }
  const merged = applyCampaign(input, tags);
  if (merged.url.includes("'")) {
    return { ok: false, reason: "A campaign tag cannot contain an apostrophe. Use letters, numbers, hyphens, or underscores." };
  }
  if (merged.url.length > MAX_DESTINATION) {
    return { ok: false, reason: `The address with its tags is over ${MAX_DESTINATION} characters.` };
  }
  return { ok: true, url: merged.url, kept: merged.kept };
}

/**
 * Checks the owned base address printed in the code: must be https://, valid host, and folder path ending in a slash.
 * Refuses http:// so printed codes never send their first hop unencrypted.
 */
export function checkBase(input: unknown): Check<{ origin: string; path: string }> {
  if (typeof input !== "string" || input === "") return { ok: false, reason: "Add your owned base address, such as https://yoursite.com/go/." };
  if (BAD_CHARS.test(input)) {
    return { ok: false, reason: "The base address holds a space, quote, backslash, angle bracket, or control character." };
  }
  const parts = splitAddress(input);
  if (!parts) return { ok: false, reason: "The base address must start with https://." };
  if (parts.scheme !== "https") {
    return { ok: false, reason: "Your printed base address must start with https:// so scans stay encrypted." };
  }
  const why = checkAuthority(parts.authority, false);
  if (why) return { ok: false, reason: why };
  const rest = parts.rest;
  if (/[?#]/.test(rest)) return { ok: false, reason: "The base address cannot hold a query or a #section." };
  if (!rest.startsWith("/")) return { ok: false, reason: "The base address must end in a folder path such as /go/." };
  if (!rest.endsWith("/")) return { ok: false, reason: "The base address must end in a slash." };
  if (rest === "/") return { ok: false, reason: "The base needs a folder in its path, such as /go/, so one rule cannot take over the whole site." };
  if (!/^[A-Za-z0-9._~/-]+$/.test(rest)) return { ok: false, reason: "The base path may hold only letters, digits, and . _ ~ - /" };
  if (rest.includes("//")) return { ok: false, reason: "The base path cannot hold two slashes in a row." };
  if (rest.split("/").some((s) => s === "." || s === "..")) return { ok: false, reason: "The base path cannot hold a . or .. part." };
  const origin = input.slice(0, input.length - rest.length);
  return { ok: true, origin, path: rest };
}

const FILE_EXT_LABELS = new Set([
  "pdf",
  "html",
  "htm",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "csv",
  "json",
  "txt",
  "xml",
  "js",
  "mjs",
  "ts",
  "css",
  "zip",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

/**
 * Adds https:// to a bare domain or IPv4 address (such as yoursite.com/menu or 127.0.0.1/qr-codes).
 * Never modifies addresses that already start with http:// or https://, relative paths (/...),
 * protocol-relative URLs (//...), or other schemes (javascript:, data:, ftp:, mailto:, etc.).
 */
export function normalizeRawDomainUrl(raw: string): { value: string; addedHttps: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: "", addedHttps: false };
  if (/^https?:\/\//i.test(trimmed)) return { value: trimmed, addedHttps: false };
  if (trimmed.startsWith("/") || trimmed.startsWith(".") || trimmed.startsWith("?") || trimmed.startsWith("#")) {
    return { value: trimmed, addedHttps: false };
  }
  if (BAD_CHARS.test(trimmed)) return { value: trimmed, addedHttps: false };

  const cutIdx = trimmed.search(/[/?#]/);
  const authority = cutIdx === -1 ? trimmed : trimmed.slice(0, cutIdx);
  if (!authority || authority.includes("@") || authority.startsWith("[")) {
    return { value: trimmed, addedHttps: false };
  }

  let host = authority;
  const colonIdx = authority.indexOf(":");
  if (colonIdx !== -1) {
    host = authority.slice(0, colonIdx);
    const port = authority.slice(colonIdx + 1);
    // Any non-port scheme (javascript:, data:, vbscript:, file:, ftp:, mailto:, etc.) is left untouched so validators refuse it.
    if (!host.includes(".") || !/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
      return { value: trimmed, addedHttps: false };
    }
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return { value: trimmed, addedHttps: false };
  }

  if (!host.includes(".")) return { value: trimmed, addedHttps: false };
  if (checkHost(host) !== null) return { value: trimmed, addedHttps: false };

  const labels = host.replace(/\.$/, "").split(".");
  const last = labels[labels.length - 1].toLowerCase();
  const isIpv4 = labels.length === 4 && labels.every((l) => /^\d+$/.test(l));
  if (!isIpv4) {
    const validTld = /^[a-z]{2,63}$/.test(last) || /^xn--[a-z0-9-]{2,59}$/.test(last);
    if (!validTld) return { value: trimmed, addedHttps: false };
    // Avoid mistaking bare filenames like menu.pdf (or report.pdf/) for a web host.
    if ((cutIdx === -1 || trimmed.slice(cutIdx) === "/") && labels.length === 2 && FILE_EXT_LABELS.has(last)) {
      return { value: trimmed, addedHttps: false };
    }
  }

  const candidate = `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname) return { value: trimmed, addedHttps: false };
    return { value: candidate, addedHttps: true };
  } catch {
    return { value: trimmed, addedHttps: false };
  }
}

/**
 * Adds https:// to a bare domain and adds a trailing slash when an owned base address is otherwise valid
 * (for example 127.0.0.1/qr-codes -> https://127.0.0.1/qr-codes/).
 */
export function normalizeOwnedBaseOnBlur(raw: string): { value: string; addedHttps: boolean; addedSlash: boolean } {
  const dom = normalizeRawDomainUrl(raw);
  const current = dom.value;
  if (!current) return { value: "", addedHttps: false, addedSlash: false };
  if (checkBase(current).ok) return { value: current, addedHttps: dom.addedHttps, addedSlash: false };
  if (!current.endsWith("/") && checkBase(`${current}/`).ok) {
    return { value: `${current}/`, addedHttps: dom.addedHttps, addedSlash: true };
  }
  return { value: current, addedHttps: dom.addedHttps, addedSlash: false };
}

export function checkSlug(input: unknown): Check<{ slug: string }> {
  if (typeof input !== "string" || !SLUG_PATTERN.test(input)) {
    return {
      ok: false,
      reason: "A short name uses letters (A-Z, a-z), digits, hyphens, and underscores, starts with a letter or digit, and is at most 64 characters.",
    };
  }
  return { ok: true, slug: input };
}

/** Suggests a clean short name from a label: lowercase, hyphens, at most 64 characters. */
export function suggestSlug(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

export interface LinkRow {
  slug: string;
  label: string;
  destination: string;
  campaign: { source: string; medium: string; campaign: string; content: string };
}

export interface LinksFile {
  format: "bandit-codes-links";
  version: 1;
  base: string;
  links: LinkRow[];
}

const CAMPAIGN_KEYS = ["source", "medium", "campaign", "content"] as const;

export function parseLinksFile(input: unknown): { ok: true; file: LinksFile } | { ok: false; errors: string[] } {
  let data: unknown = input;
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).length > MAX_FILE_BYTES) return { ok: false, errors: ["The file is over 1 MB."] };
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, errors: ["This is not a valid JSON file."] };
    }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, errors: ["This is not a Bandit Codes links file."] };
  }
  const d = data as Record<string, unknown>;
  if (d.format !== "bandit-codes-links") return { ok: false, errors: ["This is not a Bandit Codes links file."] };
  if (d.version !== 1) return { ok: false, errors: ["This links file has a version Bandit Codes does not read."] };
  const errors: string[] = [];
  const normBase = typeof d.base === "string" ? normalizeOwnedBaseOnBlur(d.base).value : d.base;
  const base = checkBase(normBase);
  if (!base.ok) errors.push(`Base address: ${base.reason}`);
  if (!Array.isArray(d.links)) return { ok: false, errors: [...errors, "The file has no list of links."] };
  if (d.links.length > MAX_LINKS) return { ok: false, errors: [...errors, `The file has more than ${MAX_LINKS} links.`] };
  const seen = new Map<string, string>();
  const links: LinkRow[] = [];
  d.links.forEach((raw, i) => {
    const n = `Link ${i + 1}`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      errors.push(`${n}: not a link.`);
      return;
    }
    const r = raw as Record<string, unknown>;
    const slug = checkSlug(r.slug);
    if (!slug.ok) errors.push(`${n}: ${slug.reason}`);
    else {
      const key = slug.slug.toLowerCase();
      const prev = seen.get(key);
      if (prev !== undefined) {
        errors.push(
          prev === slug.slug
            ? `${n}: the short name ${slug.slug} is used twice.`
            : `${n}: the short name ${slug.slug} conflicts with ${prev} (names cannot differ only by capitalization).`,
        );
      } else {
        seen.set(key, slug.slug);
      }
    }
    const label = typeof r.label === "string" ? r.label : "";
    if (typeof r.label !== "string" && r.label !== undefined) errors.push(`${n}: the label must be text.`);
    if (label.length > 200) errors.push(`${n}: the label is over 200 characters.`);
    const c = (typeof r.campaign === "object" && r.campaign !== null ? r.campaign : {}) as Record<string, unknown>;
    const campaign = { source: "", medium: "", campaign: "", content: "" };
    for (const k of CAMPAIGN_KEYS) {
      if (c[k] === undefined) continue;
      if (typeof c[k] !== "string") errors.push(`${n}: the ${k} tag must be text.`);
      else campaign[k] = c[k] as string;
    }
    const normDest = typeof r.destination === "string" ? normalizeRawDomainUrl(r.destination).value : r.destination;
    const dest = checkDestination(normDest, campaign);
    if (!dest.ok) errors.push(`${n}: ${dest.reason}`);
    if (slug.ok && dest.ok) links.push({ slug: slug.slug, label, destination: normDest as string, campaign });
  });
  if (errors.length || !base.ok) return { ok: false, errors };
  return { ok: true, file: { format: "bandit-codes-links", version: 1, base: normBase as string, links } };
}

export function writeLinksJson(file: LinksFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

const LINKS_CSV_HEADER = ["base", "slug", "label", "destination", "utm_source", "utm_medium", "utm_campaign", "utm_content"];

/** Export a LinksFile as a portable CSV (formula-safe, round-trips through parseLinksCsv). */
export function writeLinksCsv(file: LinksFile): string {
  const rows: string[][] = [
    LINKS_CSV_HEADER,
    ...file.links.map((l) => [
      file.base,
      l.slug,
      l.label,
      l.destination,
      l.campaign.source,
      l.campaign.medium,
      l.campaign.campaign,
      l.campaign.content,
    ]),
  ];
  return writeCsv(rows);
}

function findCol(head: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = head.indexOf(a);
    if (i !== -1) return i;
  }
  return -1;
}

function hasSlugInSet(seen: Set<string>, cand: string): boolean {
  const lower = cand.toLowerCase();
  for (const s of seen) {
    if (s.toLowerCase() === lower) return true;
  }
  return false;
}

/** Generate a unique valid slug, keeping typed case when valid and appending -2, -3, ... when needed. */
export function makeUniqueSlug(baseSlug: string, seen: Set<string>, fallbackIdx: number): string {
  const clean = checkSlug(baseSlug).ok ? baseSlug : suggestSlug(baseSlug) || `link-${fallbackIdx}`;
  if (!hasSlugInSet(seen, clean)) {
    seen.add(clean);
    return clean;
  }
  for (let n = 2; n < 9999; n++) {
    const suffix = `-${n}`;
    const candidate = `${clean.slice(0, 64 - suffix.length)}${suffix}`;
    if (!hasSlugInSet(seen, candidate)) {
      seen.add(candidate);
      return candidate;
    }
  }
  const fallback = `link-${fallbackIdx}`;
  seen.add(fallback);
  return fallback;
}

/** Import a portable Bandit Codes links CSV (or flexible two-column spreadsheet CSV) into a checked LinksFile. */
export function parseLinksCsv(csvText: string, fallbackBase = ""): { ok: true; file: LinksFile } | { ok: false; errors: string[] } {
  if (new TextEncoder().encode(csvText).length > MAX_FILE_BYTES) {
    return { ok: false, errors: ["The CSV file is over 1 MB."] };
  }
  const rows = parseCsv(csvText);
  if (rows.length < 2) return { ok: false, errors: ["The CSV file needs a header row and at least one link row."] };
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const iSlug = findCol(head, ["slug", "short_name", "id", "code_id", "code", "name"]);
  const iDest = findCol(head, ["destination", "destination_url", "target", "target_url", "to", "url", "landing_url", "page"]);
  if (iDest === -1 || (iSlug === -1 && findCol(head, ["label", "piece", "title"]) === -1)) {
    return {
      ok: false,
      errors: ["The CSV header must include a destination column (such as 'destination' or 'url') and a name column (such as 'slug' or 'label')."],
    };
  }
  const iBase = findCol(head, ["base", "base_url", "prefix"]);
  const iLabel = findCol(head, ["label", "piece", "title", "note", "notes"]);
  const iSrc = findCol(head, ["utm_source", "source"]);
  const iMed = findCol(head, ["utm_medium", "medium"]);
  const iCamp = findCol(head, ["utm_campaign", "campaign"]);
  const iCont = findCol(head, ["utm_content", "content"]);

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_LINKS) {
    return { ok: false, errors: [`The CSV has more than ${MAX_LINKS} links.`] };
  }
  let detectedBase = fallbackBase.trim();
  if (iBase !== -1) {
    const firstBase = dataRows.map((r) => unescapeCsvFormula((r[iBase] ?? "").trim())).find(Boolean);
    if (firstBase) detectedBase = firstBase;
  }

  // If the file uses the exact canonical 'slug' column, preserve strict duplicate checking;
  // for loose vendor/spreadsheet imports without a 'slug' column, auto-number duplicates cleanly.
  const strictSlugs = head.includes("slug");
  const seen = new Set<string>();
  const links = dataRows.map((r, idx) => {
    const label = iLabel !== -1 ? unescapeCsvFormula(r[iLabel] ?? "") : "";
    const rawSlug = iSlug !== -1 ? unescapeCsvFormula((r[iSlug] ?? "").trim()) : "";
    const slug = strictSlugs ? rawSlug : makeUniqueSlug(rawSlug || suggestSlug(label), seen, idx + 1);
    return {
      slug,
      label,
      destination: unescapeCsvFormula((r[iDest] ?? "").trim()),
      campaign: {
        source: iSrc !== -1 ? unescapeCsvFormula((r[iSrc] ?? "").trim()) : "",
        medium: iMed !== -1 ? unescapeCsvFormula((r[iMed] ?? "").trim()) : "",
        campaign: iCamp !== -1 ? unescapeCsvFormula((r[iCamp] ?? "").trim()) : "",
        content: iCont !== -1 ? unescapeCsvFormula((r[iCont] ?? "").trim()) : "",
      },
    };
  });
  return parseLinksFile({ format: "bandit-codes-links", version: 1, base: detectedBase, links });
}

/**
 * Parse a quick two-column paste (tab- or comma-separated lines: "short-name, https://..." or "Label\thttps://...").
 * Auto-numbers duplicate short names so a 200-row spreadsheet paste imports in one click.
 */
export function parseTwoColumnLinks(
  text: string,
  base: string,
  existingSlugs: Iterable<string> = [],
): { ok: true; links: LinkRow[]; skipped: string[] } | { ok: false; reason: string } {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) {
    return { ok: false, reason: "The pasted list is over 1 MB." };
  }
  const baseChk = checkBase(normalizeOwnedBaseOnBlur(base).value);
  if (!baseChk.ok) return { ok: false, reason: baseChk.reason };

  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, reason: "Paste at least one line with a short name and a web address." };
  if (lines.length > MAX_LINKS) return { ok: false, reason: `Keep bulk pastes to ${MAX_LINKS} lines or fewer at a time.` };

  const seen = new Set<string>(existingSlugs);
  const links: LinkRow[] = [];
  const skipped: string[] = [];

  lines.forEach((line, idx) => {
    const parts = line.includes("\t") ? line.split("\t") : parseCsv(line)[0] ?? [line];
    const col1 = (parts[0] ?? "").trim();
    const col2 = normalizeRawDomainUrl(parts[1] ?? "").value;
    const col3 = (parts[2] ?? "").trim();
    // Skip an obvious header row
    if (idx === 0 && /^(slug|name|short.?name|id|piece|label)$/i.test(col1) && /^(destination|url|target|to|landing)/i.test(col2)) {
      return;
    }
    if (!col2) {
      skipped.push(`Line ${idx + 1}: needs two columns (name and destination address).`);
      return;
    }
    const destChk = checkDestination(col2);
    if (!destChk.ok) {
      skipped.push(`Line ${idx + 1} (${col1 || "unnamed"}): ${destChk.reason}`);
      return;
    }
    const slug = makeUniqueSlug(col1, seen, idx + 1);
    const label = col3 || col1 || slug;
    links.push({
      slug,
      label: label.slice(0, 200),
      destination: col2,
      campaign: { source: "", medium: "", campaign: "", content: "" },
    });
  });

  if (links.length === 0) {
    return { ok: false, reason: skipped[0] || "Could not read any valid link rows." };
  }
  return { ok: true, links, skipped };
}

/* ------------------------------------------------------------------ writers */

export type RuleFormat = "netlify" | "cloudflare" | "vercel" | "apache" | "nginx" | "redirection" | "html" | "json";

export interface FormatInfo {
  id: RuleFormat;
  label: string;
  file: string;
  where: string;
  steps: string[];
  devNote: string;
}

export const RULE_FORMATS: FormatInfo[] = [
  {
    id: "netlify",
    label: "Netlify / Cloudflare Pages (_redirects)",
    file: "_redirects",
    where: "Static sites on Netlify or Cloudflare Pages",
    steps: [
      "Download or copy the _redirects rules below.",
      "If you already have a _redirects file on your site, add these lines to it; do not replace it.",
      "Place the file in your site's public/ or published output folder and deploy. Edit one line whenever a printed code needs to point somewhere new.",
    ],
    devNote:
      "Uses 302 (temporary) redirects so browsers re-check the target instead of caching a 301 permanently. Writes your typed capitalization; web hosts normally treat URL paths as case-sensitive, so printed codes must match the exact case. Literal * and : characters after the host are percent-encoded so they are not treated as route placeholders. To keep forwarding paths out of search indexes, add a _headers rule in your publish folder for your prefix (for example /go/* with X-Robots-Tag: noindex).",
  },
  {
    id: "cloudflare",
    label: "Cloudflare Bulk Redirects (CSV)",
    file: "bandit-codes-cloudflare.csv",
    where: "Any domain whose DNS runs through Cloudflare",
    steps: [
      "Open Cloudflare Dashboard > Manage Account > Configurations > Lists > Create Bulk Redirect List.",
      "Check your Cloudflare plan's Bulk Redirect List item limit before uploading a large list. If you already have a list, add these rows to it; do not replace it.",
      "Upload this CSV (no header row), then attach the list to a Bulk Redirect Rule and save.",
    ],
    devNote:
      "Outputs Cloudflare's documented headerless CSV format with scheme-less source URLs and 302 status codes. Writes your typed capitalization; Cloudflare Bulk Redirects match paths case-insensitively by default unless configured otherwise. Works even when your origin host cannot edit redirect rules. Bulk Redirects CSV does not set response headers on its own; to send X-Robots-Tag: noindex on your forwarding prefix, add a Cloudflare Response Header Transform Rule matching that path.",
  },
  {
    id: "vercel",
    label: "Vercel (vercel.json)",
    file: "vercel.json",
    where: "Sites deployed on Vercel",
    steps: [
      "If you already have a vercel.json file, add these entries to its redirects list; do not replace the whole file (replacing it can remove security headers).",
      "Commit and deploy to Vercel.",
      "Update any destination line later without reprinting a single code.",
    ],
    devNote:
      "Sets permanent: false so Vercel serves temporary redirects (HTTP 307) rather than browser-cached permanent redirects. Writes your typed capitalization; Vercel redirect sources are case-sensitive by default. Literal : and $ characters after the host are percent-encoded so Vercel does not parse them as route parameters. To keep forwarding paths out of search indexes, add a matching headers rule in vercel.json (for example source \"/go/:path*\") with key \"X-Robots-Tag\" and value \"noindex\".",
  },
  {
    id: "apache",
    label: "Apache (.htaccess)",
    file: "bandit-codes-apache.htaccess",
    where: "Shared hosts, cPanel, and Apache WordPress servers",
    steps: [
      "Open the .htaccess file in your website's public_html (or web root) folder. If you already have this file, add these lines to it; do not replace it.",
      "Paste these RedirectMatch lines near the top, above any rewrite rules.",
      "Save the file and test one short address in your browser.",
    ],
    devNote:
      "Uses RedirectMatch 302 (case-sensitive) with escaped dots in the base path and trailing-slash tolerance (/?$). Active characters ($, ;, {, }) in targets are percent-encoded. When mod_headers is enabled, add Header always set X-Robots-Tag \"noindex\" scoped to your prefix (for example inside <If \"%{REQUEST_URI} =~ m#^/go/#\"> on Apache 2.4+ or a server <LocationMatch> block) so forwarding paths are not indexed.",
  },
  {
    id: "nginx",
    label: "nginx (site config)",
    file: "bandit-codes-nginx.conf",
    where: "VPS, Docker, and self-hosted nginx servers",
    steps: [
      "If you already have a site config or snippet file, add these lines to it; do not replace it.",
      "Place the lines inside your server {} block (or include them from /etc/nginx/snippets/) above broader regex locations.",
      "Run nginx -t to verify syntax, then reload nginx.",
    ],
    devNote:
      "Uses case-sensitive regex locations (location ~ ^/prefix/slug/?$) with return 302 and percent-encoded $, ;, {, } so targets cannot break out of a directive. To keep forwarding paths out of search indexes, add add_header X-Robots-Tag \"noindex\" always; inside each redirect location block (the always flag is required for 302 responses).",
  },
  {
    id: "redirection",
    label: "WordPress Redirection plugin (CSV)",
    file: "bandit-codes-redirection.csv",
    where: "WordPress sites using the free Redirection plugin",
    steps: [
      "In WordPress Admin, open Tools > Redirection > Import/Export.",
      "Choose this CSV file under Import and click Upload. Importing adds rows alongside your existing redirects.",
      "All short links appear in your Redirection list, editable from the dashboard while you keep your site and domain.",
    ],
    devNote:
      "Columns match Redirection's CSV importer: source, target, regex (0), code (302). Writes your typed capitalization; whether matching ignores case depends on your Redirection plugin settings. Spreadsheet formula prefixes are neutralized. The Redirection CSV format does not set response headers on its own; to send X-Robots-Tag: noindex on your forwarding prefix, add a header rule in your host config (Apache or nginx) or a WordPress header filter for that path.",
  },
  {
    id: "html",
    label: "Static HTML page (one index.html per link)",
    file: "index.html",
    where: "GitHub Pages, S3, or any host with no redirect config",
    steps: [
      "Create one folder per short link on your site (for example /go/menu/).",
      "Save each link's own index.html file inside its matching folder. If a folder already has an index.html, check it before replacing it.",
      "For several links at once, download the folder ZIP below (or use the Bandit Codes snippet tab for one single paste).",
    ],
    devNote:
      "Produces strictly one standalone HTML document per link (never concatenated), using your typed folder name (case-sensitive on Linux hosts, usually case-insensitive on Windows and macOS). Every generated index.html includes <meta name=\"robots\" content=\"noindex\" />, meta refresh, location.replace, and a visible fallback link with strict HTML escaping, and preserves #fragment anchors such as #page=3 on a PDF. On hosts that also support custom response headers (such as Netlify, Cloudflare Pages, Apache, or nginx), you can add X-Robots-Tag: noindex for your prefix too.",
  },
  {
    id: "json",
    label: "Bandit Codes backup (JSON)",
    file: "bandit-codes-links.json",
    where: "Portable backup you can import back later",
    steps: [
      "Save this JSON file alongside your print artwork or in your project folder.",
      "Import it back into Bandit Codes (or any script of your own) whenever you need to change a link.",
    ],
    devNote: "Plain, documented JSON schema (format: bandit-codes-links, version: 1). No vendor lock-in.",
  },
];

export interface Rule {
  /** The full address printed in the QR code, without a trailing slash. */
  full: string;
  /** The path on the owned host, e.g. /go/menu. */
  path: string;
  /** Short name. */
  slug: string;
  /** Target address with UTM tags applied and #fragment removed (browsers never send fragments to servers). */
  target: string;
  /** Full target address including any #fragment (used for HTML fallback where browsers preserve fragments). */
  targetWithFragment: string;
  /** True when a #fragment was removed for server rules. */
  cutFragment: boolean;
}

export function rulesOf(file: LinksFile): Rule[] {
  const base = checkBase(file.base);
  if (!base.ok) throw new Error(base.reason);
  return file.links.map((l) => {
    const dest = checkDestination(l.destination, l.campaign);
    if (!dest.ok) throw new Error(`${l.slug}: ${dest.reason}`);
    const hash = dest.url.indexOf("#");
    const target = hash === -1 ? dest.url : dest.url.slice(0, hash);
    return {
      full: `${base.origin}${base.path}${l.slug}`,
      path: `${base.path}${l.slug}`,
      slug: l.slug,
      target,
      targetWithFragment: dest.url,
      cutFragment: hash !== -1,
    };
  });
}

function splitAfterAuthority(url: string): { head: string; tail: string } {
  const schemeEnd = url.indexOf("://");
  if (schemeEnd === -1) return { head: "", tail: url };
  const pathStart = url.indexOf("/", schemeEnd + 3);
  const queryStart = url.indexOf("?", schemeEnd + 3);
  let cut = -1;
  if (pathStart !== -1 && queryStart !== -1) cut = Math.min(pathStart, queryStart);
  else cut = pathStart !== -1 ? pathStart : queryStart;
  if (cut === -1) return { head: url, tail: "" };
  return { head: url.slice(0, cut), tail: url.slice(cut) };
}

export function serverSafe(s: string): string {
  return s
    .replace(/%(?![0-9A-Fa-f]{2})/g, "%25")
    .replace(/\$/g, "%24")
    .replace(/;/g, "%3B")
    .replace(/\{/g, "%7B")
    .replace(/\}/g, "%7D");
}

export function netlifySafe(s: string): string {
  const { head, tail } = splitAfterAuthority(s);
  return head + tail.replace(/\*/g, "%2A").replace(/:/g, "%3A");
}

export function vercelSafe(s: string): string {
  const { head, tail } = splitAfterAuthority(s);
  return head + tail.replace(/:/g, "%3A").replace(/\$/g, "%24");
}

function cfCell(v: string): string {
  const q = csvCell(v);
  return /[",]/.test(v) || q !== `"${v}"` ? q : v;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function comment(file: LinksFile, now: Date): string {
  return `# Bandit Codes forwarding rules for ${file.base}, made ${now.toISOString().slice(0, 10)}. 302 (temporary) redirects.`;
}

const escDot = (s: string) => s.replace(/\./g, "\\.");

function htmlRedirectPage(rule: Rule): string {
  const safeHref = escapeHtml(rule.targetWithFragment);
  const safeJs = JSON.stringify(rule.targetWithFragment).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `  <meta charset="utf-8" />`,
    `  <title>Forwarding...</title>`,
    `  <meta http-equiv="refresh" content="0; url=${safeHref}" />`,
    `  <link rel="canonical" href="${safeHref}" />`,
    `  <meta name="robots" content="noindex" />`,
    `  <script>location.replace(${safeJs});</script>`,
    `</head>`,
    `<body>`,
    `  <p>Forwarding to <a href="${safeHref}">${safeHref}</a>.</p>`,
    `</body>`,
    `</html>`,
  ].join("\n");
}

export interface HtmlRedirectFile {
  slug: string;
  path: string;
  /** Relative folder path inside a site or ZIP, e.g. "go/menu/index.html". */
  filePath: string;
  /** Strictly one standalone HTML document. */
  html: string;
}

/** Generate strictly one standalone HTML file per link so multi-link exports never concatenate documents. */
export function writeHtmlFiles(file: LinksFile): HtmlRedirectFile[] {
  const rules = rulesOf(file);
  return rules.map((r) => ({
    slug: r.slug,
    path: r.path,
    filePath: `${r.path.replace(/^\/+/, "")}/index.html`,
    html: `${htmlRedirectPage(r)}\n`,
  }));
}

export function writeRules(file: LinksFile, format: RuleFormat, now: Date = new Date()): string {
  if (format === "json") return writeLinksJson(file);
  const rules = rulesOf(file);
  switch (format) {
    case "cloudflare":
      return `${rules.map((r) => [r.full.replace(/^https?:\/\//i, ""), r.target, "302"].map(cfCell).join(",")).join("\n")}\n`;
    case "redirection":
      return `${["source", "target", "regex", "code"].map(csvCell).join(",")}\n${rules.map((r) => [r.path, r.target, "0", "302"].map(csvCell).join(",")).join("\n")}\n`;
    case "netlify":
      return `${comment(file, now)}\n${rules.map((r) => `${r.path}  ${netlifySafe(r.target)}  302`).join("\n")}\n`;
    case "vercel": {
      const payload = {
        redirects: rules.map((r) => ({
          source: r.path,
          destination: vercelSafe(r.target),
          permanent: false,
        })),
      };
      return `${JSON.stringify(payload, null, 2)}\n`;
    }
    case "apache":
      return `${comment(file, now)}\n${rules.map((r) => `RedirectMatch 302 "^${escDot(r.path)}/?$" "${serverSafe(r.target)}"`).join("\n")}\n`;
    case "nginx":
      return `${comment(file, now)}\n${rules.map((r) => `location ~ ^${escDot(r.path)}/?$ { return 302 "${serverSafe(r.target)}"; }`).join("\n")}\n`;
    case "html":
      if (rules.length === 0) return "";
      if (rules.length === 1) return `${htmlRedirectPage(rules[0])}\n`;
      throw new Error(
        "Static HTML needs one separate index.html file inside each link's folder. Download each link's file individually, export the folder ZIP, or use the Bandit Codes snippet tab for a single paste.",
      );
  }
}

function isPrivateOrLoopbackHost(origin: string): boolean {
  try {
    const h = new URL(origin).hostname;
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || h === "0.0.0.0") return true;
    const m = /^172\.(\d+)\./.exec(h);
    if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
    return false;
  } catch {
    return false;
  }
}

export function ruleNotes(file: LinksFile): string[] {
  const notes: string[] = [];
  const base = checkBase(file.base);
  if (base.ok && isPrivateOrLoopbackHost(base.origin)) {
    notes.push(
      `Base address (${file.base}): uses a local or private IP address. Phones outside your local network will not be able to open printed codes pointing here.`,
    );
  }
  const rules = rulesOf(file);
  let notedUppercase = false;
  for (const r of rules) {
    if (!notedUppercase && /[A-Z]/.test(r.slug)) {
      notedUppercase = true;
      notes.push(
        `Capital letters in short names (such as ${r.path}): rules keep the exact capitalization you typed. Apache, nginx, Vercel, and Linux static hosts treat paths as case-sensitive (so printed codes must match exact case), while Cloudflare Bulk Redirects and some plugins may ignore case.`,
      );
    }
    if (r.cutFragment) {
      notes.push(
        `${r.path}: the #section part at the end (for example #page=3 on a PDF) is not sent to a web server, so server rules drop it. To keep a #section anchor, use the Bandit Codes snippet or Static HTML page.`,
      );
    }
    if (/^http:\/\//i.test(r.target)) {
      notes.push(`${r.path}: this destination starts with http:// (not encrypted). Switch it to https:// if the destination supports it.`);
    }
    const { tail } = splitAfterAuthority(r.target);
    if (/[$;{}]|%(?![0-9A-Fa-f]{2})/.test(r.target) || /[:*$]/.test(tail)) {
      notes.push(`${r.path}: special characters in the destination address were safely encoded so your host does not misread them.`);
    }
  }
  return notes;
}

export { csvCell };
