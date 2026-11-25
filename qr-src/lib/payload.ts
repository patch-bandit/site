import type { Config } from "./schema.ts";
import { addCampaignTags } from "./campaignCore.ts";

export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function escapeWifi(s: string): string {
  return s.replace(/([\\;,:"])/g, "\\$1");
}

const CRLF = "\r\n";

export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join(CRLF + " ");
}

function stableId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}

function icsDate(v: string): string {
  const [d, t] = v.split("T");
  const day = d.replace(/-/g, "");
  return t ? `${day}T${t.replace(":", "")}00` : day;
}

function nextDay(v: string): string {
  const d = new Date(`${v}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function query(params: Record<string, string | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export function buildPayload(config: Config): string {
  switch (config.type) {
    case "link":
      return addCampaignTags(config.content.url, config.content.campaign);
    case "text":
      return config.content.text;
    case "phone":
      return `tel:${config.content.phone.replace(/[ ()\-.]/g, "")}`;
    case "sms": {
      const c = config.content;
      return `SMSTO:${c.phone.replace(/[ ()\-.]/g, "")}:${c.message ?? ""}`;
    }
    case "email": {
      const c = config.content;
      return `mailto:${c.to}${query({ subject: c.subject, body: c.body })}`;
    }
    case "geo": {
      const c = config.content;
      const q = c.label ? `?q=${encodeURIComponent(`${c.latitude},${c.longitude}(${c.label})`)}` : "";
      return `geo:${c.latitude},${c.longitude}${q}`;
    }
    case "wifi": {
      const c = config.content;
      const parts = [`T:${c.security}`, `S:${escapeWifi(c.ssid)}`];
      if (c.security !== "nopass") parts.push(`P:${escapeWifi(c.password ?? "")}`);
      if (c.hidden) parts.push("H:true");
      return `WIFI:${parts.join(";")};;`;
    }
    case "vcard": {
      const c = config.content;
      const first = c.firstName ?? "";
      const last = c.lastName ?? "";
      const full = [first, last].filter(Boolean).join(" ") || c.organization || "";
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${escapeText(last)};${escapeText(first)};;;`,
        `FN:${escapeText(full)}`,
      ];
      if (c.organization) lines.push(`ORG:${escapeText(c.organization)}`);
      if (c.title) lines.push(`TITLE:${escapeText(c.title)}`);
      for (const p of c.phones ?? []) lines.push(`TEL;TYPE=CELL:${p.replace(/[ ()\-.]/g, "")}`);
      for (const e of c.emails ?? []) lines.push(`EMAIL;TYPE=INTERNET:${e}`);
      if (c.url) lines.push(`URL:${c.url}`);
      if (c.street || c.city || c.region || c.postalCode || c.country) {
        lines.push(
          `ADR;TYPE=WORK:;;${[c.street, c.city, c.region, c.postalCode, c.country]
            .map((v) => escapeText(v ?? ""))
            .join(";")}`,
        );
      }
      if (c.note) lines.push(`NOTE:${escapeText(c.note)}`);
      lines.push("END:VCARD");
      return lines.map(foldLine).join(CRLF);
    }
    case "event": {
      const c = config.content;
      const allDay = !c.start.includes("T");
      const end = allDay ? nextDay(c.end ?? c.start) : (c.end ?? c.start);
      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Bandit Codes//EN",
        "BEGIN:VEVENT",
        `UID:${stableId(c.title + c.start + (c.end ?? ""))}@bandit-codes`,
        `DTSTAMP:${icsDate(c.start).slice(0, 8)}T000000Z`,
        `SUMMARY:${escapeText(c.title)}`,
        allDay ? `DTSTART;VALUE=DATE:${icsDate(c.start)}` : `DTSTART:${icsDate(c.start)}`,
        allDay ? `DTEND;VALUE=DATE:${icsDate(end)}` : `DTEND:${icsDate(end)}`,
      ];
      if (c.location) lines.push(`LOCATION:${escapeText(c.location)}`);
      if (c.description) lines.push(`DESCRIPTION:${escapeText(c.description)}`);
      lines.push("END:VEVENT", "END:VCALENDAR");
      return lines.map(foldLine).join(CRLF);
    }
  }
}
