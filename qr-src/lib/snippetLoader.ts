/**
 * Bandit Codes v1 loader module.
 * Single source of truth for the inline snippet loader, the same-origin codes.json loader,
 * and the pure resolution logic used by unit tests.
 *
 * Format contract:
 *   {"v":1,"param":"c","fallback":"/","codes":{"menu":{"to":"https://example.com/menu.pdf","note":"Table tent"}}}
 *
 * Security and parity rules:
 * - Plain visits with no ?c= (or an empty ?c=) do nothing at all so the page loads normally with no redirect or injected list.
 * - Code IDs match exact typed case /^[A-Za-z0-9-]{1,64}$/ (so ?c=MENU goes to fallback when the code is 'menu', while 'SpringMenu' matches ?c=SpringMenu, matching the Bandit Codes plugin).
 * - Only https: and http: destinations are followed; javascript:, data:, vbscript:, and protocol-relative URLs are refused.
 * - Fallback applies only to present codes that are unknown, retired, or refused; it may be empty ("" = show plain list), a same-origin path starting with "/" (never "//"), or an https:/http: URL.
 * - If the fallback resolves to the current page pathname on the same origin, the loader shows the link list instead of looping.
 * - Uses location.replace so the back button does not loop on the redirect page.
 * - The inline loader makes no network calls. The codes.json variant fetches same-origin only with redirect: "error" and checks response origin.
 */

export interface BanditCodeEntry {
  to: string;
  note?: string;
  retired?: boolean;
}

export interface BanditCodesConfig {
  v: 1;
  param: string;
  fallback: string;
  codes: Record<string, BanditCodeEntry>;
}

export type ResolveOutcome =
  | { action: "noop"; reason: "missing" }
  | { action: "redirect"; target: string; matchedId: string }
  | { action: "fallback"; target: string; reason: "unknown" | "refused" }
  | { action: "list"; items: { id: string; to: string; note: string }[]; reason: "unknown" | "refused" };

export const LOADER_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const BAD_URL_CHARS = /[\u0000-\u0020\u007f"'<>\\]/;

/** Normalize a URL pathname for loop comparison (drops trailing slashes except root "/"). */
export function normalizePathname(pathname: string): string {
  const clean = pathname.replace(/\/+$/, "");
  return clean || "/";
}

/** Returns true when target resolves to the same origin and pathname as currentHref (would reload in a loop). */
export function isSamePageUrl(target: string, currentHref: string): boolean {
  try {
    const a = new URL(target, currentHref);
    const b = new URL(currentHref);
    return a.origin === b.origin && normalizePathname(a.pathname) === normalizePathname(b.pathname);
  } catch {
    return false;
  }
}

/** Returns normalized https:/http: URL string, or null for any refused or invalid scheme. */
export function isSafeTargetUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || BAD_URL_CHARS.test(trimmed) || !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Returns safe fallback target (same-origin path starting with single "/" or https:/http: URL), or null if empty/refused. */
export function isSafeFallback(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//") || trimmed.startsWith("/\\") || BAD_URL_CHARS.test(trimmed)) return null;
    return trimmed;
  }
  return isSafeTargetUrl(trimmed);
}

/** Validates a same-origin path for codes.json (must start with single "/", no "..", no whitespace/controls). */
export function normalizeSameOriginJsonPath(raw: string): string | null {
  const p = raw.trim();
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  if (/[\u0000-\u001f\u007f\s"'<>\\]/.test(p)) return null;
  if (p.split("/").some((seg) => seg === "." || seg === "..")) return null;
  return p;
}

/** Pure resolver matching the inline loader and codes.json loader behavior. */
export function resolveBanditCode(
  config: BanditCodesConfig,
  search: string,
  currentHref?: string,
): ResolveOutcome {
  const paramName = typeof config.param === "string" && config.param ? config.param : "c";
  const params = new URLSearchParams(search);
  const rawId = params.get(paramName);
  if (!rawId || !rawId.trim()) {
    return { action: "noop", reason: "missing" };
  }
  const codes = config && typeof config.codes === "object" && config.codes !== null ? config.codes : {};

  let reason: "unknown" | "refused" = "unknown";
  const exactMatch = LOADER_ID_PATTERN.test(rawId) && Object.prototype.hasOwnProperty.call(codes, rawId);
  if (exactMatch) {
    const entry = codes[rawId];
    if (entry && typeof entry === "object" && !entry.retired) {
      const safe = isSafeTargetUrl(entry.to);
      if (safe) return { action: "redirect", target: safe, matchedId: rawId };
      reason = "refused";
    }
  }

  const fb = isSafeFallback(config.fallback);
  if (fb && !(currentHref && isSamePageUrl(fb, currentHref))) {
    return { action: "fallback", target: fb, reason };
  }

  const items: { id: string; to: string; note: string }[] = [];
  for (const k of Object.keys(codes)) {
    if (!LOADER_ID_PATTERN.test(k)) continue;
    const entry = codes[k];
    if (!entry || typeof entry !== "object" || entry.retired) continue;
    const safe = isSafeTargetUrl(entry.to);
    if (safe) items.push({ id: k, to: safe, note: typeof entry.note === "string" ? entry.note : "" });
  }
  return { action: "list", items, reason };
}

/**
 * The inline loader pasted inside the Bandit Codes v1 HTML block (no network calls).
 * Kept in this single module and executed directly in unit tests.
 */
export const INLINE_LOADER_SOURCE = `(function(){
  if(!location.search||location.search==="?")return;
  var scriptEl=document.currentScript;
  var el=document.getElementById("bandit-codes");
  if(!el)return;
  var cfg;
  try{cfg=JSON.parse(el.textContent||"");}catch(e){return;}
  if(!cfg||cfg.v!==1||typeof cfg.codes!=="object"||!cfg.codes)return;
  var raw=new URLSearchParams(location.search).get(cfg.param||"c");
  if(!raw||!raw.trim())return;
  var idRe=/^[A-Za-z0-9-]{1,64}$/;
  var badRe=/[\\u0000-\\u0020\\u007f"'<>\\\\]/;
  var curHref=location.href||(location.origin+(location.pathname||"/")+(location.search||""));
  function normPath(p){return p.replace(/\\/+$/,"")||"/";}
  function okUrl(u){
    if(typeof u!=="string"||!u||badRe.test(u)||!/^https?:\\/\\//i.test(u))return null;
    try{var p=new URL(u);return(p.protocol==="https:"||p.protocol==="http:")?p.href:null;}catch(e){return null;}
  }
  function okFb(f){
    if(typeof f!=="string")return null;
    var s=f.trim();
    if(!s)return null;
    if(s.charAt(0)==="/"&&s.charAt(1)!=="/"&&s.charAt(1)!=="\\\\"&&!badRe.test(s)){
      try{var r=new URL(s,location.origin);return r.origin===location.origin?s:null;}catch(e){return null;}
    }
    return okUrl(s);
  }
  function samePage(u){
    try{
      var a=new URL(u,curHref),b=new URL(curHref);
      return a.origin===b.origin&&normPath(a.pathname)===normPath(b.pathname);
    }catch(e){return false;}
  }
  var own=Object.prototype.hasOwnProperty;
  if(idRe.test(raw)&&own.call(cfg.codes,raw)){
    var item=cfg.codes[raw];
    var dest=item&&typeof item==="object"&&!item.retired?okUrl(item.to):null;
    if(dest){location.replace(dest);return;}
  }
  var fb=okFb(cfg.fallback);
  if(fb&&!samePage(fb)){location.replace(fb);return;}
  var nav=document.createElement("nav");
  if(nav.setAttribute)nav.setAttribute("aria-label","QR code links");
  var ul=document.createElement("ul");
  Object.keys(cfg.codes).forEach(function(k){
    var item=cfg.codes[k];
    if(!idRe.test(k)||!item||typeof item!=="object"||item.retired)return;
    var u=okUrl(item.to);
    if(!u)return;
    var li=document.createElement("li"),a=document.createElement("a");
    a.href=u;a.target="_blank";a.rel="noopener";
    a.textContent=(typeof item.note==="string"&&item.note)?(item.note+" ("+k+")"):k;
    li.appendChild(a);ul.appendChild(li);
  });
  if(ul.children&&ul.children.length||ul.childNodes&&ul.childNodes.length){
    nav.appendChild(ul);
    var host=scriptEl&&scriptEl.parentNode;
    if(host&&host.tagName!=="HEAD")host.appendChild(nav);
    else if(document.body)document.body.appendChild(nav);
  }
})();`;

/**
 * Output template string for the owner's own site when hosting /codes.json on the same origin.
 * Never executed by Bandit Codes itself; reads only from location.origin with redirect: "error".
 */
export function buildCodesJsonLoaderSource(jsonPath = "/codes.json"): string {
  const safePath = normalizeSameOriginJsonPath(jsonPath);
  if (!safePath) throw new Error("The codes.json path must start with / on your own site (for example /codes.json).");
  const pathLit = JSON.stringify(safePath).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  // Owner-site template, shipped as text and never run on this site.
  return `(function(){
  if(!location.search||location.search==="?")return;
  var scriptEl=document.currentScript;
  var host=scriptEl&&scriptEl.parentNode&&scriptEl.parentNode.tagName!=="HEAD"?scriptEl.parentNode:document.body;
  var src;
  try{src=new URL(${pathLit},location.origin);}catch(e){return;}
  if(src.origin!==location.origin)return;
  if(src.protocol!=="https:"&&src.protocol!=="http:")return;
  var idRe=/^[A-Za-z0-9-]{1,64}$/;
  var badRe=/[\\u0000-\\u0020\\u007f"'<>\\\\]/;
  var curHref=location.href||(location.origin+(location.pathname||"/")+(location.search||""));
  function normPath(p){return p.replace(/\\/+$/,"")||"/";}
  function okUrl(u){
    if(typeof u!=="string"||!u||badRe.test(u)||!/^https?:\\/\\//i.test(u))return null;
    try{var p=new URL(u);return(p.protocol==="https:"||p.protocol==="http:")?p.href:null;}catch(e){return null;}
  }
  function okFb(f){
    if(typeof f!=="string")return null;
    var s=f.trim();
    if(!s)return null;
    if(s.charAt(0)==="/"&&s.charAt(1)!=="/"&&s.charAt(1)!=="\\\\"&&!badRe.test(s)){
      try{var r=new URL(s,location.origin);return r.origin===location.origin?s:null;}catch(e){return null;}
    }
    return okUrl(s);
  }
  function samePage(u){
    try{
      var a=new URL(u,curHref),b=new URL(curHref);
      return a.origin===b.origin&&normPath(a.pathname)===normPath(b.pathname);
    }catch(e){return false;}
  }
  fetch(src.href,{credentials:"same-origin",redirect:"error"}).then(function(r){
    if(!r||!r.ok||r.redirected)return null;
    if(r.url){try{if(new URL(r.url).origin!==location.origin)return null;}catch(e){return null;}}
    return r.json();
  }).then(function(cfg){
    if(!cfg||cfg.v!==1||typeof cfg.codes!=="object"||!cfg.codes)return;
    var raw=new URLSearchParams(location.search).get(cfg.param||"c");
    if(!raw||!raw.trim())return;
    var own=Object.prototype.hasOwnProperty;
    if(idRe.test(raw)&&own.call(cfg.codes,raw)){
      var item=cfg.codes[raw];
      var dest=item&&typeof item==="object"&&!item.retired?okUrl(item.to):null;
      if(dest){location.replace(dest);return;}
    }
    var fb=okFb(cfg.fallback);
    if(fb&&!samePage(fb)){location.replace(fb);return;}
    var nav=document.createElement("nav");
    if(nav.setAttribute)nav.setAttribute("aria-label","QR code links");
    var ul=document.createElement("ul");
    Object.keys(cfg.codes).forEach(function(k){
      var item=cfg.codes[k];
      if(!idRe.test(k)||!item||typeof item!=="object"||item.retired)return;
      var u=okUrl(item.to);
      if(!u)return;
      var li=document.createElement("li"),a=document.createElement("a");
      a.href=u;a.target="_blank";a.rel="noopener";
      a.textContent=(typeof item.note==="string"&&item.note)?(item.note+" ("+k+")"):k;
      li.appendChild(a);ul.appendChild(li);
    });
    if((ul.children&&ul.children.length||ul.childNodes&&ul.childNodes.length)&&host){
      nav.appendChild(ul);
      host.appendChild(nav);
    }
  }).catch(function(){});
})();`;
}
