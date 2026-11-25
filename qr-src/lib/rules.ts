import type { Config } from "./schema.ts";

export const MAX_IMPORT_BYTES = 12_000_000;

export const importTooLarge = (bytes: number) => bytes > MAX_IMPORT_BYTES;

export function vcardImportNotice(c: Config): string {
  if (c.type !== "vcard") return "";
  const many = (c.content.phones?.length ?? 0) > 2 || (c.content.emails?.length ?? 0) > 2;
  return many
    ? "This form shows two phone numbers and two emails. Extra ones in the file were left out, so check the code before you download it."
    : "";
}

export function canDownload(svg: string | null, busy: boolean, state: string): boolean {
  return !!svg && !busy && state !== "checking";
}
