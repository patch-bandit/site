import type { QrType } from "./schema.ts";

export type Values = Record<string, string | boolean>;

export type Field = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "url" | "email" | "tel" | "password" | "number" | "select" | "checkbox" | "date" | "datetime";
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  group?: "campaign";
  showIf?: (v: Values) => boolean;
};

export type TypeMeta = {
  label: string;
  blurb: string;
  fields: Field[];
  defaults: Values;
};

const str = (v: Values, k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");

export const TYPE_META: Record<QrType, TypeMeta> = {
  link: {
    label: "Link",
    blurb: "Opens a web page.",
    fields: [
      {
        key: "url",
        label: "Web address",
        kind: "url",
        placeholder: "https://example.com",
        help: "Bare domains like yoursite.com/menu get https:// added automatically when you leave this field.",
      },
      { key: "utmSource", label: "Source", kind: "text", placeholder: "flyer", group: "campaign", help: "Where the code will be seen." },
      { key: "utmMedium", label: "Medium", kind: "text", placeholder: "print", group: "campaign", help: "The kind of thing it is on." },
      { key: "utmCampaign", label: "Campaign name", kind: "text", placeholder: "spring-sale", group: "campaign", help: "A name you choose." },
      { key: "utmContent", label: "Content (optional)", kind: "text", placeholder: "version-a", group: "campaign", help: "Tells two versions apart." },
    ],
    defaults: { url: "https://example.com", utmSource: "", utmMedium: "", utmCampaign: "", utmContent: "" },
  },
  text: {
    label: "Text",
    blurb: "Shows a short note.",
    fields: [{ key: "text", label: "Your text", kind: "textarea", placeholder: "Anything you like" }],
    defaults: { text: "" },
  },
  vcard: {
    label: "Contact card",
    blurb: "Adds a contact to a phone.",
    fields: [
      { key: "firstName", label: "First name", kind: "text" },
      { key: "lastName", label: "Last name", kind: "text" },
      { key: "organization", label: "Organization", kind: "text" },
      { key: "title", label: "Job title", kind: "text" },
      { key: "phone", label: "Phone", kind: "tel", placeholder: "+1 555 0100" },
      { key: "phone2", label: "Second phone", kind: "tel" },
      { key: "email", label: "Email", kind: "email", placeholder: "name@example.com" },
      { key: "email2", label: "Second email", kind: "email" },
      {
        key: "url",
        label: "Website",
        kind: "url",
        placeholder: "https://example.com",
        help: "Bare domains like yoursite.com get https:// added when you leave this field.",
      },
      { key: "street", label: "Street", kind: "text" },
      { key: "city", label: "City", kind: "text" },
      { key: "region", label: "State or region", kind: "text" },
      { key: "postalCode", label: "Postal code", kind: "text" },
      { key: "country", label: "Country", kind: "text" },
      { key: "note", label: "Note", kind: "textarea" },
    ],
    defaults: {},
  },
  wifi: {
    label: "Wi-Fi",
    blurb: "Joins a Wi-Fi network.",
    fields: [
      { key: "ssid", label: "Network name", kind: "text" },
      {
        key: "security",
        label: "Security",
        kind: "select",
        options: [
          { value: "WPA", label: "WPA or WPA2" },
          { value: "WEP", label: "WEP" },
          { value: "nopass", label: "Open, no password" },
        ],
      },
      { key: "password", label: "Password", kind: "text", showIf: (v) => v.security !== "nopass" },
      { key: "hidden", label: "Hidden network", kind: "checkbox" },
    ],
    defaults: { security: "WPA", hidden: false },
  },
  email: {
    label: "Email",
    blurb: "Starts a new email.",
    fields: [
      { key: "to", label: "To", kind: "email", placeholder: "name@example.com" },
      { key: "subject", label: "Subject", kind: "text" },
      { key: "body", label: "Message", kind: "textarea" },
    ],
    defaults: {},
  },
  sms: {
    label: "Text message",
    blurb: "Starts a text message.",
    fields: [
      { key: "phone", label: "Phone", kind: "tel", placeholder: "+1 555 0100" },
      { key: "message", label: "Message", kind: "textarea" },
    ],
    defaults: {},
  },
  phone: {
    label: "Phone call",
    blurb: "Dials a number.",
    fields: [{ key: "phone", label: "Phone", kind: "tel", placeholder: "+1 555 0100" }],
    defaults: {},
  },
  geo: {
    label: "Map location",
    blurb: "Opens a place in maps.",
    fields: [
      { key: "latitude", label: "Latitude", kind: "text", placeholder: "47.6205", help: "Between -90 and 90" },
      { key: "longitude", label: "Longitude", kind: "text", placeholder: "-122.3493", help: "Between -180 and 180" },
      { key: "label", label: "Place name", kind: "text" },
    ],
    defaults: {},
  },
  event: {
    label: "Calendar event",
    blurb: "Adds an event to a calendar.",
    fields: [
      { key: "title", label: "Title", kind: "text" },
      { key: "allDay", label: "All-day event", kind: "checkbox" },
      { key: "start", label: "Starts", kind: "datetime", showIf: (v) => v.allDay !== true },
      { key: "end", label: "Ends (optional)", kind: "datetime", showIf: (v) => v.allDay !== true },
      { key: "startDay", label: "First day", kind: "date", showIf: (v) => v.allDay === true },
      { key: "endDay", label: "Last day (optional)", kind: "date", showIf: (v) => v.allDay === true },
      { key: "location", label: "Location", kind: "text" },
      { key: "description", label: "Description", kind: "textarea" },
    ],
    defaults: { allDay: false },
  },
};

export function emptyValues(type: QrType): Values {
  return { ...TYPE_META[type].defaults };
}

const drop = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined)) as Partial<T>;

export function formToContent(type: QrType, v: Values): unknown {
  switch (type) {
    case "link":
      return drop({
        url: str(v, "url"),
        campaign: ["utmSource", "utmMedium", "utmCampaign", "utmContent"].some((k) => str(v, k) !== "")
          ? drop({
              source: str(v, "utmSource"),
              medium: str(v, "utmMedium"),
              campaign: str(v, "utmCampaign"),
              content: str(v, "utmContent"),
            })
          : undefined,
      } as Record<string, unknown>);
    case "text":
      return { text: typeof v.text === "string" ? v.text : "" };
    case "vcard":
      return cleanArrays(
        drop({
          firstName: str(v, "firstName"),
          lastName: str(v, "lastName"),
          organization: str(v, "organization"),
          title: str(v, "title"),
          phones: [str(v, "phone"), str(v, "phone2")].filter(Boolean),
          emails: [str(v, "email"), str(v, "email2")].filter(Boolean),
          url: str(v, "url"),
          street: str(v, "street"),
          city: str(v, "city"),
          region: str(v, "region"),
          postalCode: str(v, "postalCode"),
          country: str(v, "country"),
          note: typeof v.note === "string" ? v.note : "",
        } as Record<string, unknown>),
      );
    case "wifi":
      return drop({
        ssid: str(v, "ssid"),
        password: typeof v.password === "string" ? v.password : "",
        security: str(v, "security") || "WPA",
        hidden: v.hidden === true,
      } as Record<string, unknown>);
    case "email":
      return drop({ to: str(v, "to"), subject: str(v, "subject"), body: typeof v.body === "string" ? v.body : "" });
    case "sms":
      return drop({ phone: str(v, "phone"), message: typeof v.message === "string" ? v.message : "" });
    case "phone":
      return { phone: str(v, "phone") };
    case "geo": {
      const num = (k: string) => (str(v, k) === "" ? undefined : Number(str(v, k)));
      return drop({ latitude: num("latitude"), longitude: num("longitude"), label: str(v, "label") } as Record<string, unknown>);
    }
    case "event": {
      const allDay = v.allDay === true;
      return drop({
        title: str(v, "title"),
        start: str(v, allDay ? "startDay" : "start"),
        end: str(v, allDay ? "endDay" : "end"),
        location: str(v, "location"),
        description: typeof v.description === "string" ? v.description : "",
      });
    }
  }
}

function cleanArrays(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => !(Array.isArray(v) && v.length === 0)));
}

export function contentToForm(type: QrType, c: Record<string, unknown>): Values {
  const s = (k: string) => (c[k] === undefined || c[k] === null ? "" : String(c[k]));
  switch (type) {
    case "vcard": {
      const phones = (c.phones as string[] | undefined) ?? [];
      const emails = (c.emails as string[] | undefined) ?? [];
      return {
        firstName: s("firstName"),
        lastName: s("lastName"),
        organization: s("organization"),
        title: s("title"),
        phone: phones[0] ?? "",
        phone2: phones[1] ?? "",
        email: emails[0] ?? "",
        email2: emails[1] ?? "",
        url: s("url"),
        street: s("street"),
        city: s("city"),
        region: s("region"),
        postalCode: s("postalCode"),
        country: s("country"),
        note: s("note"),
      };
    }
    case "wifi":
      return { ssid: s("ssid"), password: s("password"), security: s("security") || "WPA", hidden: c.hidden === true };
    case "event": {
      const start = s("start");
      const end = s("end");
      const allDay = start !== "" && !start.includes("T");
      return {
        title: s("title"),
        allDay,
        start: allDay ? "" : start,
        end: allDay ? "" : end,
        startDay: allDay ? start : "",
        endDay: allDay ? end : "",
        location: s("location"),
        description: s("description"),
      };
    }
    case "link": {
      const camp = (c.campaign ?? {}) as Record<string, unknown>;
      const t = (k: string) => (camp[k] === undefined || camp[k] === null ? "" : String(camp[k]));
      return { url: s("url"), utmSource: t("source"), utmMedium: t("medium"), utmCampaign: t("campaign"), utmContent: t("content") };
    }
    default: {
      const out: Values = {};
      for (const f of TYPE_META[type].fields) out[f.key] = f.kind === "checkbox" ? c[f.key] === true : s(f.key);
      return out;
    }
  }
}

export const CAMPAIGN_PRESETS: { label: string; source: string; medium: string }[] = [
  { label: "Flyer", source: "flyer", medium: "print" },
  { label: "Menu", source: "menu", medium: "print" },
  { label: "Business card", source: "business-card", medium: "print" },
  { label: "Vehicle", source: "vehicle", medium: "print" },
  { label: "Mailer", source: "mailer", medium: "print" },
  { label: "Packaging", source: "packaging", medium: "print" },
];
