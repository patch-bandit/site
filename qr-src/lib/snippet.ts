import { parseCsv } from "./csv.ts";
import { checkDestination, MAX_FILE_BYTES, MAX_LINKS, normalizeRawDomainUrl, suggestSlug } from "./redirects.ts";
import {
  buildCodesJsonLoaderSource,
  INLINE_LOADER_SOURCE,
  isSafeFallback,
  isSafeTargetUrl,
  isSamePageUrl,
  normalizePathname,
  normalizeSameOriginJsonPath,
  type BanditCodeEntry,
  type BanditCodesConfig,
} from "./snippetLoader.ts";

/**
 * Bandit Codes v1 snippet maker and guided updater.
 * Parses an existing Bandit Codes HTML snippet or codes.json, validates rows, computes diffs
 * against the pasted baseline, and outputs the shared Bandit Codes v1 HTML snippet and codes.json.
 */

export const SNIPPET_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
export const SNIPPET_PARAM_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,15}$/;

const PLACEHOLDER_PAGE_HOSTS = new Set([
  "yoursite.com",
  "www.yoursite.com",
  "theirsite.com",
  "www.theirsite.com",
]);

export interface SnippetRow {
  /** Stable editor row ID (kept across renames so the diff tracks renames accurately). */
  uid: string;
  /** Original code name from the pasted baseline, or null for newly added rows. */
  originalId: string | null;
  id: string;
  to: string;
  note: string;
  retired: boolean;
}

export interface SnippetBaseline {
  param: string;
  fallback: string;
  rows: SnippetRow[];
}

export interface SnippetRowIssue {
  uid: string;
  errors: string[];
  warnings: string[];
}

export interface SnippetValidation {
  ok: boolean;
  /** True only when the snippet is valid AND a real, non-placeholder https:// page address is set for QR generation. */
  qrReady: boolean;
  pageUrlError: string | null;
  pageUrlWarning: string | null;
  fallbackError: string | null;
  fallbackWarning: string | null;
  paramError: string | null;
  rowIssues: Map<string, SnippetRowIssue>;
  errors: string[];
  warnings: string[];
  activeCount: number;
}

export interface SnippetDiff {
  hasChanges: boolean;
  added: { id: string; to: string; note: string }[];
  updated: { id: string; oldTo: string; newTo: string; oldNote: string; newNote: string }[];
  renamed: { oldId: string; newId: string; oldTo: string; newTo: string; oldNote: string; newNote: string }[];
  retired: { id: string; oldTo: string; note: string }[];
  metaChanges: string[];
}

export function makeSnippetUid(index: number): string {
  return `snip-${index + 1}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Remove tabs and line breaks from text written to tab-separated ZIP manifest rows. */
export function cleanManifestCell(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, " ").trim();
}

/** Returns true for example placeholder domains that must not be printed into real QR codes. */
export function isPlaceholderPageHost(hostname: string): boolean {
  return PLACEHOLDER_PAGE_HOSTS.has(hostname.trim().toLowerCase());
}

/** Suggest a valid Bandit Codes v1 code name from a freeform label. */
export function suggestSnippetId(label: string): string {
  return suggestSlug(label).replace(/_/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

/** Validate and sanitize rows restored from opt-in browser storage. */
export function sanitizeSavedSnippetRows(raw: unknown): SnippetRow[] {
  if (!Array.isArray(raw)) return [];
  const clean: SnippetRow[] = [];
  for (let i = 0; i < raw.length && clean.length < MAX_LINKS; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || typeof rec.to !== "string") continue;
    const uid = typeof rec.uid === "string" && rec.uid.trim() ? rec.uid.trim().slice(0, 80) : makeSnippetUid(clean.length);
    const note = typeof rec.note === "string" ? rec.note.trim().slice(0, 200) : "";
    clean.push({
      uid,
      originalId: null,
      id: rec.id.trim(),
      to: rec.to.trim(),
      note,
      retired: Boolean(rec.retired),
    });
  }
  return clean;
}

/** Check the owner's snippet page address (for printing QR codes like https://myshop.com/qr-codes?c=menu). */
export function checkSnippetPageUrl(raw: string): { ok: true; cleanUrl: string } | { ok: false; reason: string } {
  const s = raw.trim();
  if (!s) {
    return {
      ok: false,
      reason: "Add the web address of the page on your site where you will paste this snippet (for example https://myshop.com/qr-codes).",
    };
  }
  if (/[\u0000-\u001f\u007f\s"'<>\\]/.test(s)) {
    return { ok: false, reason: "The page address cannot contain spaces, quotes, angle brackets, or control characters." };
  }
  if (!/^https:\/\//i.test(s)) {
    return { ok: false, reason: "Your printed snippet page address must start with https:// so scans stay encrypted." };
  }
  try {
    const u = new URL(s);
    if (!u.hostname || !u.hostname.includes(".")) {
      return { ok: false, reason: "Enter a full domain name such as https://myshop.com/qr-codes." };
    }
    if (isPlaceholderPageHost(u.hostname)) {
      return { ok: false, reason: "Replace the example address with your own site's https:// page address." };
    }
    if (u.username || u.password) return { ok: false, reason: "The page address cannot include a login before @." };
    if (u.search || u.hash) {
      return { ok: false, reason: "Leave off any ?query or #section here; Bandit Codes adds ?c=<code-name> automatically." };
    }
    return { ok: true, cleanUrl: `${u.origin}${u.pathname}` };
  } catch {
    return { ok: false, reason: "Enter a valid https:// page address on your own site." };
  }
}

/** Build the printed QR address for one snippet code: https://myshop.com/qr-codes?c=menu. */
export function snippetQrUrl(pageUrl: string, param: string, codeId: string): string {
  const cleanPage = pageUrl.trim().replace(/[?#].*$/, "");
  const cleanParam = SNIPPET_PARAM_PATTERN.test(param.trim()) ? param.trim() : "c";
  return `${cleanPage}?${cleanParam}=${encodeURIComponent(codeId.trim())}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape JSON safely for embedding inside <script type="application/json">. */
function safeInlineJson(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildNoscriptList(config: BanditCodesConfig): string {
  const items: string[] = [];
  for (const id of Object.keys(config.codes)) {
    const entry = config.codes[id];
    const safe = isSafeTargetUrl(entry?.to);
    if (!safe) continue;
    const label = entry.note && entry.note.trim() ? `${entry.note.trim()} (${id})` : id;
    items.push(`<li><a href="${escapeHtml(safe)}">${escapeHtml(label)}</a></li>`);
  }
  if (items.length === 0) {
    return `<noscript><p>No active links are configured yet.</p></noscript>`;
  }
  return `<noscript><ul>${items.join("")}</ul></noscript>`;
}

/** Convert active (non-retired) editor rows into the canonical Bandit Codes v1 JSON object. */
export function rowsToBanditConfig(
  rows: SnippetRow[],
  param = "c",
  fallback = "/",
): BanditCodesConfig {
  const codes: Record<string, BanditCodeEntry> = {};
  for (const r of rows) {
    if (r.retired) continue;
    const id = r.id.trim();
    const to = r.to.trim();
    const note = r.note.trim();
    if (!id || !to) continue;
    codes[id] = note ? { to, note } : { to };
  }
  return {
    v: 1,
    param: param.trim() || "c",
    fallback: fallback.trim(),
    codes,
  };
}

/** Serialize pretty-printed codes.json for file download / self-hosting. */
export function writeCodesJson(config: BanditCodesConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** Serialize the exact shared Bandit Codes v1 inline HTML snippet. */
export function writeInlineSnippet(config: BanditCodesConfig): string {
  return [
    `<!-- Bandit Codes v1: start -->`,
    `<script type="application/json" id="bandit-codes">${safeInlineJson(config)}</script>`,
    `<script>`,
    INLINE_LOADER_SOURCE,
    `</script>`,
    buildNoscriptList(config),
    `<!-- Bandit Codes v1: end -->`,
  ].join("\n") + "\n";
}

/** Serialize the Bandit Codes v1 HTML loader for an owner-hosted same-origin /codes.json file. */
export function writeCodesJsonSnippet(config: BanditCodesConfig, jsonPath = "/codes.json"): string {
  const safePath = normalizeSameOriginJsonPath(jsonPath);
  if (!safePath) throw new Error("The codes.json path must start with / on your own site.");
  const loader = buildCodesJsonLoaderSource(safePath);
  return [
    `<!-- Bandit Codes v1 (codes.json): start -->`,
    `<script>`,
    loader,
    `</script>`,
    buildNoscriptList(config),
    `<!-- Bandit Codes v1 (codes.json): end -->`,
  ].join("\n") + "\n";
}

/**
 * Extract the JSON text from a pasted Bandit Codes HTML snippet or raw codes.json.
 * Linear-time case-insensitive scan directly on trimmed so pathological unclosed <script tags
 * cannot trigger quadratic backtracking and Unicode characters whose lowercase
 * changes length (such as U+0130 "İ") never shift slice indexes.
 */
function extractJsonFromInput(raw: string): { kind: "snippet" | "json"; jsonText: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Paste your existing Bandit Codes snippet or codes.json file first." };
  if (trimmed.startsWith("{")) {
    return { kind: "json", jsonText: trimmed };
  }
  const openRe = /<script(?=[\s>/])/gi;
  const closeRe = /<\/script>/gi;
  let pos = 0;
  while (pos < trimmed.length) {
    openRe.lastIndex = pos;
    const openMatch = openRe.exec(trimmed);
    if (!openMatch) break;
    const start = openMatch.index;
    const openEnd = trimmed.indexOf(">", start + 7);
    if (openEnd === -1) break;
    closeRe.lastIndex = openEnd + 1;
    const closeMatch = closeRe.exec(trimmed);
    if (!closeMatch) break;
    const closeStart = closeMatch.index;
    const attrs = trimmed.slice(start + 7, openEnd);
    const hasId = /\bid\s*=\s*(?:"bandit-codes"|'bandit-codes'|bandit-codes\b)/i.test(attrs);
    const hasType = /\btype\s*=\s*(?:"application\/json"|'application\/json'|application\/json\b)/i.test(attrs);
    if (hasId && (hasType || !/\btype\s*=/i.test(attrs))) {
      return { kind: "snippet", jsonText: trimmed.slice(openEnd + 1, closeStart).trim() };
    }
    pos = closeStart + 9;
  }
  return {
    error: "Could not find a Bandit Codes JSON block (<script type=\"application/json\" id=\"bandit-codes\">) or a codes.json object.",
  };
}

/**
 * Parse an existing Bandit Codes v1 HTML snippet or codes.json into editable rows.
 * Keeps malformed entries as rows with blank destinations and reports warnings so nothing is silently dropped.
 */
export function parseSnippetOrJson(raw: string):
  | { ok: true; sourceKind: "snippet" | "json"; param: string; fallback: string; rows: SnippetRow[]; warnings: string[] }
  | { ok: false; errors: string[] } {
  if (new TextEncoder().encode(raw).length > MAX_FILE_BYTES) {
    return { ok: false, errors: ["That snippet or JSON file is over 1 MB."] };
  }
  const extracted = extractJsonFromInput(raw);
  if ("error" in extracted) {
    return { ok: false, errors: [extracted.error] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted.jsonText);
  } catch {
    return { ok: false, errors: ["The JSON inside that snippet or file is broken and could not be read."] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, errors: ["Expected a Bandit Codes object with v, param, fallback, and codes."] };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.v !== 1) {
    return { ok: false, errors: ["Unsupported Bandit Codes format version (expected v: 1)."] };
  }
  if (typeof obj.codes !== "object" || obj.codes === null || Array.isArray(obj.codes)) {
    return { ok: false, errors: ["The Bandit Codes data is missing its codes map."] };
  }
  const entries = Object.entries(obj.codes as Record<string, unknown>);
  if (entries.length > MAX_LINKS) {
    return { ok: false, errors: [`Bandit Codes supports up to ${MAX_LINKS} codes per snippet.`] };
  }

  const param = typeof obj.param === "string" && obj.param.trim() ? obj.param.trim() : "c";
  const rawFallback = typeof obj.fallback === "string" ? obj.fallback.trim() : "/";
  const fallback = rawFallback && !rawFallback.startsWith("/") ? normalizeRawDomainUrl(rawFallback).value : rawFallback;

  const rows: SnippetRow[] = [];
  const warnings: string[] = [];
  entries.forEach(([id, val], idx) => {
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const rec = val as Record<string, unknown>;
      const rawTo = typeof rec.to === "string" ? rec.to.trim() : "";
      rows.push({
        uid: `base-${idx + 1}-${id}`,
        originalId: id,
        id,
        to: rawTo ? normalizeRawDomainUrl(rawTo).value : "",
        note: typeof rec.note === "string" ? rec.note.trim().slice(0, 200) : "",
        retired: Boolean(rec.retired),
      });
    } else if (typeof val === "string") {
      const rawTo = val.trim();
      rows.push({
        uid: `base-${idx + 1}-${id}`,
        originalId: id,
        id,
        to: rawTo ? normalizeRawDomainUrl(rawTo).value : "",
        note: "",
        retired: false,
      });
    } else {
      warnings.push(`Entry '${id}' had an unreadable value and needs a destination address or retirement.`);
      rows.push({
        uid: `base-${idx + 1}-${id}`,
        originalId: id,
        id,
        to: "",
        note: "",
        retired: false,
      });
    }
  });

  return { ok: true, sourceKind: extracted.kind, param, fallback, rows, warnings };
}

/** Validate snippet settings and every active row, flagging bad addresses, fallback loops, duplicate names, and http:// warnings. */
export function validateSnippetState(
  rows: SnippetRow[],
  opts: { pageUrl?: string; param?: string; fallback?: string } = {},
): SnippetValidation {
  const rowIssues = new Map<string, SnippetRowIssue>();
  const errors: string[] = [];
  const warnings: string[] = [];

  let pageUrlError: string | null = null;
  let pageUrlWarning: string | null = null;
  let cleanPageUrl: string | null = null;
  const rawPageUrl = (opts.pageUrl ?? "").trim();
  if (!rawPageUrl) {
    pageUrlWarning =
      "Paste this snippet on the one page your printed code points to (such as /qr-codes), not on your home page or in site-wide code.";
    warnings.push(pageUrlWarning);
  } else {
    const pChk = checkSnippetPageUrl(rawPageUrl);
    if (!pChk.ok) {
      pageUrlError = pChk.reason;
      errors.push(pChk.reason);
    } else {
      cleanPageUrl = pChk.cleanUrl;
      try {
        const parsedPage = new URL(cleanPageUrl);
        if (normalizePathname(parsedPage.pathname) === "/") {
          pageUrlWarning =
            "This points to your home page (/). Paste this snippet on the one page your printed code points to (such as /qr-codes), not on your home page or in site-wide code.";
          warnings.push(pageUrlWarning);
        }
      } catch {
        // Already validated by checkSnippetPageUrl
      }
    }
  }

  const param = (opts.param ?? "c").trim();
  let paramError: string | null = null;
  if (!SNIPPET_PARAM_PATTERN.test(param)) {
    paramError = "The query name must start with a letter and use only letters, digits, hyphens, or underscores (default: c).";
    errors.push(paramError);
  }

  const fallback = (opts.fallback ?? "/").trim();
  let fallbackError: string | null = null;
  let fallbackWarning: string | null = null;
  if (fallback !== "") {
    const fb = isSafeFallback(fallback);
    if (!fb) {
      fallbackError = "Backup address must be blank (show a link list), a path on your site like /, or an https:// web address.";
      errors.push(fallbackError);
    } else {
      if (cleanPageUrl && isSamePageUrl(fb, cleanPageUrl)) {
        fallbackError =
          "This backup address points to the same page as your snippet, which would reload in a loop. Pick another page (such as /menu), or leave it blank to show a link list.";
        errors.push(fallbackError);
      } else if (/^http:\/\//i.test(fb)) {
        fallbackWarning = "Backup address uses http:// (not encrypted). Switch to https:// or a path like / if possible.";
        warnings.push(fallbackWarning);
      }
    }
  }

  const idCounts = new Map<string, number>();
  let activeCount = 0;
  for (const r of rows) {
    if (r.retired) continue;
    activeCount += 1;
    const id = r.id.trim();
    if (id) {
      const key = id.toLowerCase();
      idCounts.set(key, (idCounts.get(key) ?? 0) + 1);
    }
  }

  for (const r of rows) {
    const issue: SnippetRowIssue = { uid: r.uid, errors: [], warnings: [] };
    if (r.retired) {
      rowIssues.set(r.uid, issue);
      continue;
    }
    const id = r.id.trim();
    if (!SNIPPET_ID_PATTERN.test(id)) {
      issue.errors.push("Code name must be 1 to 64 characters using only letters (A-Z, a-z), digits, and hyphens.");
    } else if ((idCounts.get(id.toLowerCase()) ?? 0) > 1) {
      issue.errors.push(`Duplicate code name '${id}'. Every active code needs its own unique name (ignoring capitalization).`);
    }

    const to = r.to.trim();
    if (!to) {
      issue.errors.push("Add the destination web address.");
    } else if (!/^https?:\/\//i.test(to)) {
      issue.errors.push("Refused address: destinations must start with https:// or http:// (scripts and data links are blocked).");
    } else {
      const destChk = checkDestination(to);
      if (!destChk.ok) {
        issue.errors.push(destChk.reason);
      } else if (/^http:\/\//i.test(to)) {
        issue.warnings.push("Uses http:// instead of https://. Switch to https:// if the destination supports it.");
      }
    }

    if (r.note.length > 200) {
      issue.errors.push("Keep notes under 200 characters.");
    }

    for (const e of issue.errors) errors.push(`${id || "Unnamed row"}: ${e}`);
    for (const w of issue.warnings) warnings.push(`${id || "Unnamed row"}: ${w}`);
    rowIssues.set(r.uid, issue);
  }

  const ok = errors.length === 0 && activeCount > 0;
  const qrReady = ok && Boolean(cleanPageUrl) && !pageUrlError;

  return {
    ok,
    qrReady,
    pageUrlError,
    pageUrlWarning,
    fallbackError,
    fallbackWarning,
    paramError,
    rowIssues,
    errors,
    warnings,
    activeCount,
  };
}

/** Compare current editor rows and metadata against the pasted baseline. */
export function diffSnippetBaseline(
  baseline: SnippetBaseline | null,
  currentRows: SnippetRow[],
  currentParam: string,
  currentFallback: string,
): SnippetDiff {
  if (!baseline) {
    return { hasChanges: false, added: [], updated: [], renamed: [], retired: [], metaChanges: [] };
  }

  const baseById = new Map(baseline.rows.map((r) => [r.id, r]));
  const accountedBaseIds = new Set<string>();

  const added: SnippetDiff["added"] = [];
  const updated: SnippetDiff["updated"] = [];
  const renamed: SnippetDiff["renamed"] = [];
  const retired: SnippetDiff["retired"] = [];
  const metaChanges: string[] = [];

  if (baseline.fallback.trim() !== currentFallback.trim()) {
    metaChanges.push(
      `Backup address changed from ${baseline.fallback.trim() || "(show link list)"} to ${currentFallback.trim() || "(show link list)"}.`,
    );
  }
  if (baseline.param.trim() !== currentParam.trim()) {
    metaChanges.push(`Address parameter changed from ?${baseline.param.trim()}= to ?${currentParam.trim()}=.`);
  }

  for (const r of currentRows) {
    const id = r.id.trim();
    const to = r.to.trim();
    const note = r.note.trim();

    if (r.originalId && baseById.has(r.originalId)) {
      const orig = baseById.get(r.originalId)!;
      const origTo = orig.to.trim();
      const origNote = orig.note.trim();
      accountedBaseIds.add(r.originalId);
      if (r.retired) {
        retired.push({ id: orig.id, oldTo: origTo, note: origNote });
      } else if (id !== orig.id) {
        renamed.push({ oldId: orig.id, newId: id, oldTo: origTo, newTo: to, oldNote: origNote, newNote: note });
      } else if (to !== origTo || note !== origNote) {
        updated.push({ id, oldTo: origTo, newTo: to, oldNote: origNote, newNote: note });
      }
    } else if (!r.retired && (id || to)) {
      added.push({ id, to, note });
    }
  }

  // Any baseline code deleted outright from the table also shows as retired
  for (const orig of baseline.rows) {
    if (!accountedBaseIds.has(orig.id)) {
      retired.push({ id: orig.id, oldTo: orig.to.trim(), note: orig.note.trim() });
    }
  }

  const hasChanges =
    added.length > 0 ||
    updated.length > 0 ||
    renamed.length > 0 ||
    retired.length > 0 ||
    metaChanges.length > 0;

  return { hasChanges, added, updated, renamed, retired, metaChanges };
}

/** Bulk two- or three-column paste for Snippet Maker: `name, https://... [, note]` (tab or comma separated). */
export function parseSnippetBulkPaste(
  text: string,
  existingIds: Iterable<string> = [],
): { ok: true; rows: SnippetRow[] } | { ok: false; reason: string } {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) {
    return { ok: false, reason: "The pasted list is over 1 MB." };
  }
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, reason: "Paste at least one line with a code name and destination address." };
  if (lines.length > MAX_LINKS) return { ok: false, reason: `Keep pastes to ${MAX_LINKS} codes or fewer.` };

  const seen = new Set<string>([...existingIds].map((x) => x.toLowerCase()));
  const rows: SnippetRow[] = [];

  lines.forEach((line, idx) => {
    const parts = line.includes("\t") ? line.split("\t") : parseCsv(line)[0] ?? [line];
    const c0 = (parts[0] ?? "").trim();
    const c1 = (parts[1] ?? "").trim();
    const c2 = (parts[2] ?? "").trim();
    if (idx === 0 && /^(id|code|slug|name|short.?name|code.?name)$/i.test(c0) && /^(to|url|destination|target)/i.test(c1)) {
      return;
    }
    if (!c1) return;
    let id = SNIPPET_ID_PATTERN.test(c0) ? c0 : suggestSnippetId(c0) || `code-${idx + 1}`;
    if (seen.has(id.toLowerCase())) {
      for (let n = 2; n < 9999; n++) {
        const suffix = `-${n}`;
        const cand = `${id.slice(0, 64 - suffix.length)}${suffix}`;
        if (!seen.has(cand.toLowerCase())) {
          id = cand;
          break;
        }
      }
    }
    seen.add(id.toLowerCase());
    rows.push({
      uid: makeSnippetUid(idx),
      originalId: null,
      id,
      to: normalizeRawDomainUrl(c1).value,
      note: (c2 || (c0 !== id ? c0 : "")).trim().slice(0, 200),
      retired: false,
    });
  });

  if (rows.length === 0) return { ok: false, reason: "Could not read any rows. Use two columns: code name, destination address." };
  return { ok: true, rows };
}
