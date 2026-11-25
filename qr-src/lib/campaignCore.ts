/** Campaign tags (utm_*) added to a link before the code or redirect rule is made. Bandit Codes counts nothing itself. */

export interface Campaign {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
}

const KEYS: [keyof Campaign, string][] = [
  ["source", "utm_source"],
  ["medium", "utm_medium"],
  ["campaign", "utm_campaign"],
  ["content", "utm_content"],
];

const LONE_SURROGATE = /[\uD800-\uDFFF]/;
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;

export function validateCampaign(c: Campaign | undefined): { ok: true; data: Campaign | undefined } | { ok: false; reason: string } {
  if (!c) return { ok: true, data: undefined };
  const vals: Record<string, string | undefined> = {
    source: c.source,
    medium: c.medium,
    campaign: c.campaign,
    content: c.content,
  };
  for (const [k, v] of Object.entries(vals)) {
    if (v === undefined) continue;
    if (typeof v !== "string") return { ok: false, reason: `The ${k} tag must be text.` };
    if (v.length > 100) return { ok: false, reason: "Keep each tag under 100 characters" };
    if (CONTROL_CHAR.test(v)) return { ok: false, reason: "Tags cannot contain control characters" };
    if (LONE_SURROGATE.test(v.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))) {
      return { ok: false, reason: "Tags cannot contain broken characters" };
    }
  }
  const anySet = Object.values(vals).some((v) => v !== undefined && v.trim() !== "");
  if (anySet) {
    if (!c.source?.trim()) {
      return { ok: false, reason: "Add a source (where the code lives, such as flyer), or clear the other tag fields" };
    }
    if (!c.medium?.trim()) {
      return { ok: false, reason: "Add a medium (the kind of thing, such as print), or clear the other tag fields" };
    }
  }
  return { ok: true, data: c };
}

function queryKeys(query: string): Set<string> {
  const keys = new Set<string>();
  for (const part of query.split("&")) {
    if (!part) continue;
    const raw = part.split("=")[0];
    let k = raw;
    try {
      k = decodeURIComponent(raw.replace(/\+/g, " "));
    } catch {
      /* keep the raw key */
    }
    keys.add(k.toLowerCase());
  }
  return keys;
}

/**
 * Adds campaign tags to a web address. The existing query string and #fragment stay as written.
 * A utm_ key already present in the address wins and is listed in `kept`.
 */
export function applyCampaign(url: string, campaign: Campaign | undefined): { url: string; kept: string[] } {
  const tags = KEYS.map(([k, name]) => [name, (campaign?.[k] ?? "").trim()] as const).filter(([, v]) => v !== "");
  if (!tags.length) return { url, kept: [] };
  const hash = url.indexOf("#");
  const base = hash === -1 ? url : url.slice(0, hash);
  const fragment = hash === -1 ? "" : url.slice(hash);
  const q = base.indexOf("?");
  const path = q === -1 ? base : base.slice(0, q);
  let query = q === -1 ? "" : base.slice(q + 1);
  const present = queryKeys(query);
  const kept: string[] = [];
  const add: string[] = [];
  for (const [name, value] of tags) {
    if (present.has(name)) kept.push(name);
    else add.push(`${name}=${encodeURIComponent(value)}`);
  }
  if (add.length) {
    if (query !== "" && !query.endsWith("&")) query += "&";
    query += add.join("&");
  }
  return { url: `${path}${query ? `?${query}` : ""}${fragment}`, kept };
}

export function addCampaignTags(url: string, campaign: Campaign | undefined): string {
  return applyCampaign(url, campaign).url;
}
