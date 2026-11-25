import { z } from "zod";
import { PRESETS, PRESET_NAMES } from "./presets.ts";
import { addCampaignTags } from "./campaignCore.ts";
import { campaignSchema } from "./tracking.ts";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color such as #1E1033");
const phone = z
  .string()
  .regex(/^\+?[0-9 ()\-.]{3,25}$/, "Use digits, spaces, dashes, dots, or parentheses, with an optional leading +");
const httpUrl = z
  .string()
  .min(1)
  .max(2000)
  .refine((v) => {
    try {
      if (/[\s\u0000-\u001f\u007f]/.test(v) || !/^https?:\/\/[^/]/i.test(v)) return false;
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Use a full web address that starts with http:// or https://");

export const linkContent = z
  .object({ url: httpUrl, campaign: campaignSchema.optional() })
  .strict()
  .refine((c) => {
    try {
      return addCampaignTags(c.url, c.campaign).length <= 2500;
    } catch {
      return true;
    }
  }, "The address with its tags is too long for a code. Shorten the address or the tags.");
export const textContent = z.object({ text: z.string().min(1).max(2000) }).strict();

export const vcardContent = z
  .object({
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    organization: z.string().max(150).optional(),
    title: z.string().max(150).optional(),
    phones: z.array(phone).max(4).optional(),
    emails: z.array(z.email()).max(4).optional(),
    url: httpUrl.optional(),
    street: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    region: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    country: z.string().max(100).optional(),
    note: z.string().max(500).optional(),
  })
  .strict()
  .refine((c) => Boolean(c.firstName || c.lastName || c.organization), {
    message: "Add at least a first name, last name, or organization",
  });

export const wifiContent = z
  .object({
    ssid: z.string().min(1).max(32),
    password: z.string().max(63).optional(),
    security: z.enum(["WPA", "WEP", "nopass"]).default("WPA"),
    hidden: z.boolean().default(false),
  })
  .strict()
  .refine((c) => c.security === "nopass" || Boolean(c.password), {
    message: "A password is needed unless security is nopass",
    path: ["password"],
  });

export const emailContent = z
  .object({
    to: z.email(),
    subject: z.string().max(200).optional(),
    body: z.string().max(1000).optional(),
  })
  .strict();

export const smsContent = z.object({ phone, message: z.string().max(500).optional() }).strict();
export const phoneContent = z.object({ phone }).strict();

export const geoContent = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    label: z.string().max(100).optional(),
  })
  .strict();

const dateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "Use YYYY-MM-DD or YYYY-MM-DDTHH:MM")
  .refine((v) => {
    const [y, m, d] = v.slice(0, 10).split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
    if (v.length > 10) return Number(v.slice(11, 13)) <= 23 && Number(v.slice(14, 16)) <= 59;
    return true;
  }, "That date or time does not exist");

export const eventContent = z
  .object({
    title: z.string().min(1).max(200),
    start: dateTime,
    end: dateTime.optional(),
    location: z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
  })
  .strict()
  .refine((c) => !c.end || c.end >= c.start, { message: "End must not be before start", path: ["end"] })
  .refine((c) => !c.end || c.start.includes("T") === c.end.includes("T"), {
    message: "Start and end must both have a time or both be all-day dates",
    path: ["end"],
  });

export const styleSchema = z
  .object({
    preset: z.enum(PRESET_NAMES).optional(),
    dotColor: hex.default("#000000"),
    cornerColor: hex.optional(),
    backgroundColor: hex.default("#FFFFFF"),
    dotShape: z.enum(["square", "rounded", "dot"]).default("square"),
    cornerStyle: z.enum(["square", "rounded", "circle"]).default("square"),
    quietZone: z.number().int().min(0).max(16).default(4),
    errorCorrection: z.enum(["L", "M", "Q", "H"]).default("M"),
    size: z.number().int().min(128).max(4096).default(1024),
  })
  .strict();

export const IMAGE_DATA_URI = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
export const MAX_IMAGE_CHARS = 8_000_000;

export function looksLikeMarkup(src: string): boolean {
  const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]*)$/.exec(src);
  if (!m) return false;
  let head = "";
  try {
    head = atob(m[2].slice(0, 32));
  } catch {
    return false;
  }
  return head.replace(/^(\xEF\xBB\xBF|\s)+/, "").startsWith("<");
}

export const imageSchema = z
  .object({
    mode: z.enum(["none", "logo", "blend"]).default("none"),
    src: z
      .string()
      .max(MAX_IMAGE_CHARS)
      .regex(IMAGE_DATA_URI, "Use a PNG, JPEG, WebP, or GIF image (SVG images are not allowed).")
      .optional(),
    scale: z.number().min(0.1).max(0.3).default(0.22),
    veil: z.number().min(0).max(0.9).default(0.3),
  })
  .strict()
  .refine((i) => i.mode === "none" || Boolean(i.src), { message: "Add an image for this mode", path: ["src"] });

export const outputSchema = z
  .object({
    format: z.enum(["png", "svg"]).default("png"),
    file: z.string().max(260).optional(),
  })
  .strict();

const common = {
  $schema: z.string().optional(),
  version: z.literal(1).default(1),
  style: styleSchema.prefault({}),
  image: imageSchema.prefault({}),
  output: outputSchema.prefault({}),
};

function variant<T extends string, C extends z.ZodType>(type: T, content: C) {
  return z.object({ type: z.literal(type), content, ...common }).strict();
}

export const configSchema = z.discriminatedUnion("type", [
  variant("link", linkContent),
  variant("text", textContent),
  variant("vcard", vcardContent),
  variant("wifi", wifiContent),
  variant("email", emailContent),
  variant("sms", smsContent),
  variant("phone", phoneContent),
  variant("geo", geoContent),
  variant("event", eventContent),
]);

export type Config = z.infer<typeof configSchema>;
export type ConfigInput = z.input<typeof configSchema>;
export type QrType = Config["type"];
export const QR_TYPES = ["link", "text", "vcard", "wifi", "email", "sms", "phone", "geo", "event"] as const;

export type ParseResult = { ok: true; config: Config } | { ok: false; errors: string[] };

export function parseConfig(input: unknown): ParseResult {
  let raw = input;
  if (raw && typeof raw === "object" && "style" in raw) {
    const style = (raw as { style?: unknown }).style;
    if (style && typeof style === "object" && "preset" in style) {
      const name = (style as { preset?: unknown }).preset;
      if (typeof name === "string" && Object.hasOwn(PRESETS, name)) {
        const { label: _label, ...base } = PRESETS[name as keyof typeof PRESETS];
        raw = { ...(raw as object), style: { ...base, ...(style as object) } };
      }
    }
  }
  const r = configSchema.safeParse(raw);
  if (r.success) {
    const src = r.data.image.src;
    if (src && looksLikeMarkup(src)) {
      return {
        ok: false,
        errors: ["image.src: This image says it is a bitmap, but its content is markup (such as SVG). Use a real PNG, JPEG, WebP, or GIF."],
      };
    }
    return { ok: true, config: r.data };
  }
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "config"}: ${i.message}`),
  };
}
