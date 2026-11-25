/**
 * Owned vs. third-party domain detection for QR code lock-in checks.
 * Pure TypeScript, no network calls, no vendor claims we cannot verify.
 */

export type LockinStatus = "owned" | "static" | "deprecated" | "trapped" | "unknown";

export interface LockinVerdict {
  status: LockinStatus;
  /** Raw decoded or pasted payload. */
  payload: string;
  /** Extracted lowercase hostname for web links, or null for non-web payloads. */
  host: string | null;
  /** Extracted pathname for web links, or null. */
  path: string | null;
  /** Detected static payload kind when status is 'static' (e.g. Wi-Fi, Contact card, Plain text). */
  payloadKind: string;
  /** True when the third-party web address matches common short-link patterns. */
  likelyShortLink: boolean;
  /** Short verdict title. */
  headline: string;
  /** Honest plain-language explanation. */
  detail: string;
  /** Concrete next step. */
  nextStep: string;
}

/**
 * Services known to have stopped creating new short links.
 * Stated strictly as stopping new links, with no unverified shutdown dates or current-vendor claims.
 */
const RETIRED_SHORTENERS: Record<string, string> = {
  "goo.gl": "goo.gl stopped creating new short links. Older shorteners can stop forwarding without warning, and no outside tool can keep them alive.",
  "git.io": "git.io stopped creating new short links. Older shorteners can stop forwarding without warning, and no outside tool can keep them alive.",
};

/** Common multi-part public suffixes that cannot be owned as a single business domain. */
const PUBLIC_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "me.uk",
  "ltd.uk",
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "gov.au",
  "co.nz",
  "net.nz",
  "org.nz",
  "co.jp",
  "ne.jp",
  "or.jp",
  "com.br",
  "net.br",
  "org.br",
  "com.mx",
  "com.in",
  "co.in",
  "co.za",
  "com.sg",
  "com.hk",
  "co.kr",
  "com.tw",
  "com.cn",
  "com.ar",
  "com.tr",
  "com.ua",
  "co.il",
  "com.my",
  "com.ph",
]);

/**
 * Normalize a domain or web address into a lowercase ASCII/punycode hostname without leading 'www.' or trailing '.'.
 * Rejects bare public suffixes (such as co.uk) and invalid names.
 */
export function normalizeDomain(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  let host = raw;
  try {
    const asUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? new URL(raw) : new URL(`https://${raw}`);
    host = asUrl.hostname;
  } catch {
    return null;
  }
  host = host.toLowerCase().replace(/\.+$/, "").replace(/^www\./, "");
  if (!host || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  const parts = host.split(".");
  const tld = parts[parts.length - 1];
  if (!/^[a-z]{2,63}$|^xn--[a-z0-9-]{2,59}$/.test(tld)) return null;
  if (PUBLIC_SUFFIXES.has(host)) return null;
  return host;
}

/** Parse owned domains and report any entries that could not be recognized (such as public suffixes). */
export function parseOwnedDomainsDetailed(input: string): { domains: string[]; ignored: string[] } {
  const domains: string[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();
  for (const rawPart of input.split(/[\s,;]+/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const d = normalizeDomain(part);
    if (d) {
      if (!seen.has(d)) {
        seen.add(d);
        domains.push(d);
      }
    } else {
      ignored.push(part);
    }
  }
  return { domains, ignored };
}

/** Parse comma, semicolon, or newline-separated owned domains into a deduplicated normalized list. */
export function parseOwnedDomains(input: string): string[] {
  return parseOwnedDomainsDetailed(input).domains;
}

/**
 * True when `host` belongs to `ownedDomain` (exact match or strict subdomain, ignoring leading www.).
 * Rejects suffix tricks such as `evilmybakery.com` against `mybakery.com`.
 */
export function hostMatchesOwned(host: string, ownedDomain: string): boolean {
  const h = host.toLowerCase().replace(/\.+$/, "").replace(/^www\./, "");
  const o = ownedDomain.toLowerCase().replace(/\.+$/, "").replace(/^www\./, "");
  if (!h || !o) return false;
  return h === o || h.endsWith(`.${o}`);
}

/** Detect known non-HTTP static QR payload kinds in plain language. */
export function detectStaticKind(payload: string): string {
  const t = payload.trim();
  if (/^WIFI:/i.test(t)) return "Wi-Fi login";
  if (/^BEGIN:VCARD/i.test(t)) return "Contact card (vCard)";
  if (/^BEGIN:VCALENDAR/i.test(t) || /^BEGIN:VEVENT/i.test(t)) return "Calendar event";
  if (/^mailto:/i.test(t)) return "Email link";
  if (/^tel:/i.test(t)) return "Phone number";
  if (/^(SMSTO|SMS):/i.test(t)) return "Text message";
  if (/^geo:/i.test(t)) return "Map location";
  return "Plain text";
}

/** True when a scheme-less payload looks like a bare domain or domain/path that phone cameras open as a web link. */
function looksLikeBareWebLink(payload: string): boolean {
  if (!payload || /\s/.test(payload)) return false;
  if (/^(WIFI|BEGIN|MECARD|MATMSG):/i.test(payload)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(payload)) return false;
  const firstSeg = payload.split(/[/?#]/)[0];
  if (!firstSeg.includes(".")) return false;
  return normalizeDomain(firstSeg) !== null;
}

/**
 * Heuristic for whether a third-party web address looks like a short redirect link
 * (e.g. a short opaque code like /aB3x9K, a /q/ or /r/ prefix, or a very short host).
 */
export function looksLikeShortLink(host: string, pathname: string): boolean {
  const cleanHost = host.toLowerCase().replace(/^www\./, "");
  const cleanPath = pathname.replace(/\/+$/, "");
  if (!cleanPath || cleanPath === "/") return false;
  const segs = cleanPath.split("/").filter(Boolean);
  if (segs.length === 1) {
    const s = segs[0];
    if (s.length >= 3 && s.length <= 16 && /^[A-Za-z0-9_-]+$/.test(s) && !s.includes(".")) {
      if (/\d/.test(s) || (/[A-Z]/.test(s) && /[a-z]/.test(s)) || cleanHost.length <= 10) {
        return true;
      }
    }
  }
  if (segs.length === 2 && /^(q|qr|r|go|l|s|p|c|t|u|link|scan)$/i.test(segs[0]) && /^[A-Za-z0-9_-]{3,20}$/.test(segs[1])) {
    return true;
  }
  if (/(^|\.)(qr|qrco|qrfy|bit|t|rb|tiny|short|rebrand|cutt|is|v|ow|buff|bl)\./i.test(cleanHost)) {
    return true;
  }
  return false;
}

/** Classify a decoded or pasted QR payload for lock-in risk against the visitor's own domain(s). */
export function classifyQrPayload(rawPayload: string, ownedDomainsInput: string[] | string): LockinVerdict {
  const payload = rawPayload.trim();
  const owned = Array.isArray(ownedDomainsInput)
    ? ownedDomainsInput.map(normalizeDomain).filter((x): x is string => x !== null)
    : parseOwnedDomains(ownedDomainsInput);

  let effectiveUrl = payload;
  let bareLink = false;

  if (!/^https?:\/\//i.test(payload)) {
    const knownStatic = /^(WIFI:|BEGIN:VCARD|BEGIN:VCALENDAR|BEGIN:VEVENT|mailto:|tel:|SMSTO:|SMS:|geo:)/i.test(payload);
    if (!knownStatic && looksLikeBareWebLink(payload)) {
      effectiveUrl = `https://${payload}`;
      bareLink = true;
    } else if (!knownStatic && /^([a-z][a-z0-9+.-]*):/i.test(payload)) {
      const scheme = payload.split(":")[0].toLowerCase();
      return {
        status: "unknown",
        payload,
        host: null,
        path: null,
        payloadKind: `Custom link (${scheme}:)`,
        likelyShortLink: false,
        headline: `App or custom link (${scheme}:)`,
        detail: `This code uses a custom ${scheme}: link rather than a normal web address. Check whether it depends on a specific app or third-party service before trusting it in print.`,
        nextStep: "Test scanning this code on a phone and verify whether an outside service controls where it leads.",
      };
    } else {
      const kind = detectStaticKind(payload);
      return {
        status: "static",
        payload,
        host: null,
        path: null,
        payloadKind: kind,
        likelyShortLink: false,
        headline: `Static code (${kind})`,
        detail: "This code stores its content directly in the pattern rather than pointing at a web redirect. No subscription can turn it off.",
        nextStep: "Keep using this code as long as the details inside it stay current.",
      };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(effectiveUrl);
  } catch {
    return {
      status: "unknown",
      payload,
      host: null,
      path: null,
      payloadKind: "Unreadable web address",
      likelyShortLink: false,
      headline: "Not a usable web address",
      detail: "This text looks like a web link but could not be read cleanly as a web address.",
      nextStep: "Check the text and test scanning the printed code with a phone.",
    };
  }

  const host = parsed.hostname.toLowerCase();
  const bareHost = host.replace(/^www\./, "");
  const path = parsed.pathname || "/";
  const shortLike = looksLikeShortLink(host, path);
  const bareNote = bareLink ? " (printed without https://, which most phone cameras still open as a web link)" : "";

  if (Object.hasOwn(RETIRED_SHORTENERS, bareHost)) {
    return {
      status: "deprecated",
      payload,
      host,
      path,
      payloadKind: "Web link",
      likelyShortLink: true,
      headline: `Retired shortener (${bareHost})`,
      detail: `${RETIRED_SHORTENERS[bareHost]} Replace printed codes on this domain with your own address before forwarding ends.`,
      nextStep: "Add this piece to your Escape Plan and replace it with a code pointing at your own domain.",
    };
  }

  if (owned.length === 0) {
    return {
      status: "unknown",
      payload,
      host,
      path,
      payloadKind: "Web link",
      likelyShortLink: shortLike,
      headline: `Points to ${host}`,
      detail: shortLike
        ? `This code points to ${host}${path}${bareNote}, which looks like a short redirect link. Enter your own domain above to check whether you control it.`
        : `This code points to ${host}${bareNote}. Enter your own domain above to check whether you own it or a third party does.`,
      nextStep: "Add your own domain above to see if this code is portable or tied to another host.",
    };
  }

  if (owned.some((d) => hostMatchesOwned(host, d))) {
    return {
      status: "owned",
      payload,
      host,
      path,
      payloadKind: "Web link",
      likelyShortLink: false,
      headline: `Portable (your domain: ${host})`,
      detail: `This code points at ${host}${bareNote}, which matches your domain. As long as the forwarding rules live on your own web host (not pointed to a QR vendor via DNS) and you keep renewing your domain, no outside QR plan can shut it off.`,
      nextStep: "Confirm your own website host serves this address (not a vendor custom-domain CNAME). Once it runs on your host, manage it with your own forwarding rules or snippet.",
    };
  }

  return {
    status: "trapped",
    payload,
    host,
    path,
    payloadKind: "Web link",
    likelyShortLink: shortLike,
    headline: shortLike ? `Tied to a third-party redirect (${host})` : `Third-party domain (${host})`,
    detail: shortLike
      ? `This code points to ${host}${path}${bareNote}, which is not your domain and looks like a short redirect link. Whoever owns ${host} controls whether it keeps working when a plan ends.`
      : `This code points to ${host}${bareNote}, not your domain. If that service changes addresses or shuts down, printed copies stop working. No tool can take over a domain you do not own.`,
    nextStep: "Add this piece to your Escape Plan below. While you still pay, re-point the vendor code to your own short address, then reprint high-use pieces first.",
  };
}
