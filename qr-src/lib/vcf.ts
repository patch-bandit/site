import { buildPayload } from "./payload.ts";
import type { Config } from "./schema.ts";

export function vcardFile(config: Config): { text: string; name: string; mime: string } | null {
  if (config.type !== "vcard") return null;
  return { text: buildPayload(config), name: "bandit-codes-contact.vcf", mime: "text/vcard;charset=utf-8" };
}
