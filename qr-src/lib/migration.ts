import { parseCsv, unescapeCsvFormula, writeCsv } from "./csv.ts";
import {
  checkBase,
  checkDestination,
  makeUniqueSlug,
  MAX_FILE_BYTES,
  MAX_LINKS,
  normalizeOwnedBaseOnBlur,
  normalizeRawDomainUrl,
  suggestSlug,
  type LinkRow,
  type LinksFile,
} from "./redirects.ts";

/**
 * Guided Escape Plan for migrating already-printed subscription QR codes to owned addresses.
 * Full CSV and JSON round-trip so nothing is ever locked inside Bandit Codes either.
 */

export type EscapePriority = "high" | "medium" | "low";
export type EscapeStatus = "found" | "mapped" | "live" | "repointed" | "reprinted" | "retire";

export interface EscapeItem {
  id: string;
  piece: string;
  currentUrl: string;
  landingUrl: string;
  newSlug: string;
  priority: EscapePriority;
  status: EscapeStatus;
  /** Optional: true when a replacement QR sticker can cover the old code instead of a full reprint. */
  stickerOver: boolean;
  notes: string;
}

export interface EscapePlan {
  format: "bandit-codes-escape-plan";
  version: 1;
  ownedBase: string;
  ownedDomains: string;
  items: EscapeItem[];
}

export interface EscapeSummary {
  total: number;
  mapped: number;
  live: number;
  repointed: number;
  reprinted: number;
  retired: number;
  resolved: number;
  highRemaining: number;
  readyToCancel: boolean;
}

const VALID_PRIORITIES = new Set<EscapePriority>(["high", "medium", "low"]);
const VALID_STATUSES = new Set<EscapeStatus>(["found", "mapped", "live", "repointed", "reprinted", "retire"]);

const PRIORITY_RANK: Record<EscapePriority, number> = { high: 0, medium: 1, low: 2 };

const ESCAPE_CSV_HEADER = [
  "piece",
  "current_url",
  "landing_url",
  "new_slug",
  "new_owned_url",
  "priority",
  "status",
  "sticker_over",
  "notes",
];

function cleanStr(v: unknown, maxLen: number): string {
  if (typeof v !== "string") return "";
  return v.slice(0, maxLen);
}

function parseBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /^(yes|true|1|y|sticker)$/i.test(v.trim());
  return false;
}

export function makeItemId(index: number): string {
  return `esc-${index + 1}-${Math.random().toString(36).slice(2, 7)}`;
}

export function escapeSummary(plan: EscapePlan): EscapeSummary {
  const total = plan.items.length;
  let mapped = 0;
  let live = 0;
  let repointed = 0;
  let reprinted = 0;
  let retired = 0;
  let highRemaining = 0;
  for (const item of plan.items) {
    const isResolved = item.status === "reprinted" || item.status === "retire";
    const hasMapping = Boolean(item.landingUrl.trim() && item.newSlug.trim());
    if (
      hasMapping ||
      item.status === "mapped" ||
      item.status === "live" ||
      item.status === "repointed" ||
      item.status === "reprinted"
    ) {
      mapped += 1;
    }
    if (item.status === "live" || item.status === "repointed" || item.status === "reprinted") live += 1;
    if (item.status === "repointed" || item.status === "reprinted") repointed += 1;
    if (item.status === "reprinted") reprinted += 1;
    if (item.status === "retire") retired += 1;
    if (item.priority === "high" && !isResolved) highRemaining += 1;
  }
  const resolved = reprinted + retired;
  return {
    total,
    mapped,
    live,
    repointed,
    reprinted,
    retired,
    resolved,
    highRemaining,
    readyToCancel: total > 0 && resolved === total,
  };
}

/** Sort escape items by reprint priority (high -> medium -> low), keeping original order within ties. */
export function sortEscapeItems(items: EscapeItem[]): EscapeItem[] {
  return [...items].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

export function writeEscapeJson(plan: EscapePlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function parseEscapeJson(input: unknown): { ok: true; plan: EscapePlan } | { ok: false; errors: string[] } {
  let data: unknown = input;
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).length > MAX_FILE_BYTES) {
      return { ok: false, errors: ["The escape plan file is over 1 MB."] };
    }
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, errors: ["That file is not valid JSON."] };
    }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, errors: ["This is not a Bandit Codes escape plan file."] };
  }
  const d = data as Record<string, unknown>;
  if (d.format !== "bandit-codes-escape-plan") {
    return { ok: false, errors: ["This is not a Bandit Codes escape plan file."] };
  }
  if (d.version !== 1) {
    return { ok: false, errors: ["This escape plan version is not supported."] };
  }
  if (!Array.isArray(d.items)) {
    return { ok: false, errors: ["The file has no items list."] };
  }
  if (d.items.length > MAX_LINKS) {
    return { ok: false, errors: [`The file has more than ${MAX_LINKS} items.`] };
  }

  const errors: string[] = [];
  const items: EscapeItem[] = [];
  const seenIds = new Set<string>();

  d.items.forEach((raw, i) => {
    const label = `Row ${i + 1}`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      errors.push(`${label}: not a valid item.`);
      return;
    }
    const r = raw as Record<string, unknown>;
    const piece = cleanStr(r.piece, 200).trim() || `Printed piece ${i + 1}`;
    const priority = VALID_PRIORITIES.has(r.priority as EscapePriority) ? (r.priority as EscapePriority) : "medium";
    const status = VALID_STATUSES.has(r.status as EscapeStatus) ? (r.status as EscapeStatus) : "found";
    let id = typeof r.id === "string" && r.id.trim() ? r.id.trim().slice(0, 64) : `esc-${i + 1}`;
    if (seenIds.has(id)) id = `${id.slice(0, 56)}-${i + 1}`;
    seenIds.add(id);

    const rawLanding = cleanStr(r.landingUrl, 2000).trim();
    items.push({
      id,
      piece,
      currentUrl: cleanStr(r.currentUrl, 2000).trim(),
      landingUrl: rawLanding ? normalizeRawDomainUrl(rawLanding).value : "",
      newSlug: cleanStr(r.newSlug, 64).trim(),
      priority,
      status,
      stickerOver: parseBool(r.stickerOver),
      notes: cleanStr(r.notes, 500),
    });
  });

  if (errors.length) return { ok: false, errors };
  const rawBase = cleanStr(d.ownedBase, 500).trim();
  return {
    ok: true,
    plan: {
      format: "bandit-codes-escape-plan",
      version: 1,
      ownedBase: rawBase ? normalizeOwnedBaseOnBlur(rawBase).value : "",
      ownedDomains: cleanStr(d.ownedDomains, 500).trim(),
      items,
    },
  };
}

export interface EscapeCsvOptions {
  onlyRemaining?: boolean;
  sortByPriority?: boolean;
}

export function writeEscapeCsv(plan: EscapePlan, opts: EscapeCsvOptions = {}): string {
  const base = plan.ownedBase.trim();
  const baseClean = base && !base.endsWith("/") ? `${base}/` : base;
  let list = plan.items;
  if (opts.onlyRemaining) {
    list = list.filter((item) => item.status !== "reprinted" && item.status !== "retire");
  }
  if (opts.sortByPriority) {
    list = sortEscapeItems(list);
  }
  const rows: string[][] = [
    ESCAPE_CSV_HEADER,
    ...list.map((item) => [
      item.piece,
      item.currentUrl,
      item.landingUrl,
      item.newSlug,
      baseClean && item.newSlug ? `${baseClean}${item.newSlug}` : "",
      item.priority,
      item.status,
      item.stickerOver ? "yes" : "no",
      item.notes,
    ]),
  ];
  return writeCsv(rows);
}

/** Write a priority-ordered reprint checklist CSV containing only items still waiting for reprint or sticker-over. */
export function writeReprintCsv(plan: EscapePlan): string {
  return writeEscapeCsv(plan, { onlyRemaining: true, sortByPriority: true });
}

function findCol(head: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = head.indexOf(a);
    if (i !== -1) return i;
  }
  return -1;
}

function normalizeStatus(raw: string): EscapeStatus {
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (s === "reprinted" || s === "done" || s === "replaced") return "reprinted";
  if (s === "retire" || s === "retired" || s === "lapse" || s === "letitlapse" || s === "drop") return "retire";
  if (s === "repointed" || s === "vendorrepointed" || s === "pointed") return "repointed";
  if (s === "live" || s === "redirectlive") return "live";
  if (s === "mapped") return "mapped";
  return "found";
}

function normalizePriority(raw: string): EscapePriority {
  const p = raw.trim().toLowerCase();
  if (p === "high" || p === "1" || p === "p1" || p === "urgent") return "high";
  if (p === "low" || p === "3" || p === "p3") return "low";
  return "medium";
}

/**
 * Parse a CSV back into an EscapePlan. Tolerates common vendor export column names
 * (name/title/label, short_url/vendor_url, destination/target/url) and defaults missing piece names.
 */
export function parseEscapeCsv(
  csvText: string,
  fallbackBase = "",
  fallbackDomains = "",
): { ok: true; plan: EscapePlan } | { ok: false; errors: string[] } {
  if (new TextEncoder().encode(csvText).length > MAX_FILE_BYTES) {
    return { ok: false, errors: ["The CSV file is over 1 MB."] };
  }
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { ok: false, errors: ["The CSV file needs a header row and at least one item row."] };
  }
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const iPiece = findCol(head, ["piece", "name", "title", "label", "qr_name", "qr", "item", "description", "code"]);
  const iCur = findCol(head, ["current_url", "short_url", "vendor_url", "qr_url", "source", "source_url", "old_url", "short_link", "link"]);
  const iLand = findCol(head, ["landing_url", "destination", "destination_url", "target", "target_url", "redirect_url", "final_url", "to", "url"]);
  if (iPiece === -1 && iCur === -1 && iLand === -1) {
    return {
      ok: false,
      errors: ["Could not recognize the CSV columns. Include headers such as piece (or name), current_url (or short_url), and landing_url (or destination)."],
    };
  }
  const iSlug = findCol(head, ["new_slug", "slug", "short_name", "code_id", "id"]);
  const iOwnedUrl = findCol(head, ["new_owned_url", "owned_url", "new_url"]);
  const iPri = findCol(head, ["priority", "rank"]);
  const iStat = findCol(head, ["status", "state"]);
  const iSticker = findCol(head, ["sticker_over", "sticker", "can_sticker"]);
  const iNotes = findCol(head, ["notes", "note", "comment", "comments"]);

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_LINKS) {
    return { ok: false, errors: [`The CSV has more than ${MAX_LINKS} rows.`] };
  }

  let detectedBase = fallbackBase.trim();
  const items: EscapeItem[] = [];
  const seenSlugs = new Set<string>();

  dataRows.forEach((r, idx) => {
    const rawPiece = iPiece !== -1 ? unescapeCsvFormula(cleanStr(r[iPiece], 200)).trim() : "";
    const cur = iCur !== -1 ? unescapeCsvFormula(cleanStr(r[iCur], 2000)).trim() : "";
    const rawLand = iLand !== -1 ? unescapeCsvFormula(cleanStr(r[iLand], 2000)).trim() : "";
    const land = rawLand ? normalizeRawDomainUrl(rawLand).value : "";
    if (!rawPiece && !cur && !land) return;

    const piece = rawPiece || `Printed piece ${idx + 1}`;
    const rawSlug = iSlug !== -1 ? unescapeCsvFormula(cleanStr(r[iSlug], 64)).trim() : "";
    const slug = rawSlug ? rawSlug : makeUniqueSlug(suggestSlug(piece), seenSlugs, idx + 1);
    if (rawSlug) seenSlugs.add(rawSlug);

    const ownedFull = iOwnedUrl !== -1 ? unescapeCsvFormula(cleanStr(r[iOwnedUrl], 2000)).trim() : "";
    if (!detectedBase && ownedFull && slug && ownedFull.endsWith(`/${slug}`)) {
      detectedBase = ownedFull.slice(0, ownedFull.length - slug.length);
    }
    const rawPri = iPri !== -1 ? unescapeCsvFormula(r[iPri] ?? "") : "medium";
    const rawStat = iStat !== -1 ? unescapeCsvFormula(r[iStat] ?? "") : land ? "mapped" : "found";
    const stickerOver = iSticker !== -1 ? parseBool(unescapeCsvFormula(r[iSticker] ?? "")) : false;

    items.push({
      id: `esc-${idx + 1}`,
      piece,
      currentUrl: cur,
      landingUrl: land,
      newSlug: slug,
      priority: normalizePriority(rawPri),
      status: normalizeStatus(rawStat),
      stickerOver,
      notes: iNotes !== -1 ? unescapeCsvFormula(cleanStr(r[iNotes], 500)) : "",
    });
  });

  if (items.length === 0) {
    return { ok: false, errors: ["No usable rows were found in that CSV."] };
  }
  return {
    ok: true,
    plan: {
      format: "bandit-codes-escape-plan",
      version: 1,
      ownedBase: detectedBase ? normalizeOwnedBaseOnBlur(detectedBase).value : "",
      ownedDomains: fallbackDomains.trim(),
      items,
    },
  };
}

/**
 * Bulk two- or three-column paste for Escape Plan:
 * Accepts lines of `piece, landing_url` OR `piece, current_url, landing_url` (tab or comma separated).
 */
export function parseBulkEscapePaste(
  text: string,
  existingItems: EscapeItem[] = [],
): { ok: true; items: EscapeItem[] } | { ok: false; reason: string } {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) {
    return { ok: false, reason: "The pasted list is over 1 MB." };
  }
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, reason: "Paste at least one line to add to your escape plan." };
  if (existingItems.length + lines.length > MAX_LINKS) {
    return { ok: false, reason: `Keep the escape plan to ${MAX_LINKS} items or fewer.` };
  }

  const seenSlugs = new Set<string>(existingItems.map((i) => i.newSlug).filter(Boolean));
  const items: EscapeItem[] = [];

  lines.forEach((line, idx) => {
    const parts = line.includes("\t") ? line.split("\t") : parseCsv(line)[0] ?? [line];
    const c0 = (parts[0] ?? "").trim();
    const c1 = (parts[1] ?? "").trim();
    const c2 = (parts[2] ?? "").trim();
    if (idx === 0 && /^(piece|name|title|label|short.?url)$/i.test(c0) && /^(current|vendor|short|landing|destination|url|target)/i.test(c1)) {
      return;
    }

    let piece = "";
    let currentUrl = "";
    let landingUrl = "";

    if (c2) {
      piece = c0 || `Printed piece ${existingItems.length + idx + 1}`;
      currentUrl = c1;
      landingUrl = c2;
    } else if (c1) {
      if (/^https?:\/\//i.test(c0)) {
        piece = `Printed piece ${existingItems.length + idx + 1}`;
        currentUrl = c0;
        landingUrl = c1;
      } else {
        piece = c0;
        landingUrl = c1;
      }
    } else if (c0) {
      if (/^https?:\/\//i.test(c0)) {
        piece = `Printed piece ${existingItems.length + idx + 1}`;
        currentUrl = c0;
      } else {
        piece = c0;
      }
    }
    if (!piece) return;

    const slug = makeUniqueSlug(suggestSlug(piece), seenSlugs, existingItems.length + idx + 1);
    const normLanding = landingUrl ? normalizeRawDomainUrl(landingUrl).value : "";
    items.push({
      id: makeItemId(existingItems.length + idx),
      piece: piece.slice(0, 200),
      currentUrl: currentUrl.slice(0, 2000),
      landingUrl: normLanding.slice(0, 2000),
      newSlug: slug,
      priority: "medium",
      status: normLanding ? "mapped" : "found",
      stickerOver: false,
      notes: "",
    });
  });

  if (items.length === 0) return { ok: false, reason: "Could not read any rows from that paste." };
  return { ok: true, items };
}

/**
 * Convert mapped escape-plan items into a Redirect Kit LinksFile.
 * Items marked "retire" (let it lapse) are skipped cleanly; duplicate short names are auto-suffixed (-2, -3) instead of dropped.
 */
export function escapeToLinks(plan: EscapePlan): {
  ok: true;
  file: LinksFile;
  skipped: string[];
  renamed: string[];
} | {
  ok: false;
  reason: string;
} {
  const baseCheck = checkBase(plan.ownedBase);
  if (!baseCheck.ok) return { ok: false, reason: `Owned base address: ${baseCheck.reason}` };

  const links: LinkRow[] = [];
  const skipped: string[] = [];
  const renamed: string[] = [];
  const seen = new Set<string>();

  plan.items.forEach((item, idx) => {
    if (item.status === "retire") {
      skipped.push(`${item.piece}: marked 'let it lapse' (skipped)`);
      return;
    }
    const destCheck = checkDestination(item.landingUrl.trim());
    if (!destCheck.ok) {
      skipped.push(`${item.piece}: add where it lands today (${destCheck.reason})`);
      return;
    }
    const rawCandidate = item.newSlug.trim() || suggestSlug(item.piece) || `code-${idx + 1}`;
    const finalSlug = makeUniqueSlug(rawCandidate, seen, idx + 1);
    if (finalSlug !== rawCandidate) {
      renamed.push(`${item.piece}: '${rawCandidate}' -> '${finalSlug}'`);
    }
    links.push({
      slug: finalSlug,
      label: item.piece,
      destination: item.landingUrl.trim(),
      campaign: { source: "", medium: "", campaign: "", content: "" },
    });
  });

  return {
    ok: true,
    file: {
      format: "bandit-codes-links",
      version: 1,
      base: plan.ownedBase,
      links,
    },
    skipped,
    renamed,
  };
}
