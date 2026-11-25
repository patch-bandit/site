/**
 * Minimal uncompressed (Store method 0) ZIP archive writer for local browser downloads.
 * Used for batch QR SVG packs and per-folder Static HTML redirect packs.
 * Pure TypeScript, no external dependencies, no network calls.
 */

export interface ZipEntry {
  /** Forward-slash relative path inside the archive, e.g. "menu.svg" or "go/menu/index.html". */
  path: string;
  /** UTF-8 string or raw bytes. */
  data: string | Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function sanitizeZipPath(raw: string): string {
  const parts = raw
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((p) => p !== "" && p !== "." && p !== "..");
  return parts.join("/") || "file.txt";
}

function writeU16(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
}

function writeU32(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
  buf[offset + 2] = (val >>> 16) & 0xff;
  buf[offset + 3] = (val >>> 24) & 0xff;
}

export const MAX_ZIP_ENTRIES = 65_535;
export const MAX_ZIP_BYTES = 0xffffffff;

export function validateZipLimits(entryCount: number, totalBytes: number): void {
  if (entryCount > MAX_ZIP_ENTRIES) {
    throw new Error(`Too many files for a standard ZIP archive (limit: ${MAX_ZIP_ENTRIES.toLocaleString()}).`);
  }
  if (totalBytes > MAX_ZIP_BYTES) {
    throw new Error("Archive size exceeds the 4 GB standard ZIP limit.");
  }
}

/** Build a valid standard ZIP archive (method 0 / Store, UTF-8 names) from a list of entries. */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  validateZipLimits(entries.length, 0);
  const enc = new TextEncoder();
  const prepared = entries.map((e) => {
    const nameBytes = enc.encode(sanitizeZipPath(e.path));
    if (nameBytes.length > 0xffff) {
      throw new Error("A file name inside the ZIP archive is too long.");
    }
    const dataBytes = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    if (dataBytes.length > MAX_ZIP_BYTES) {
      throw new Error("A file inside the ZIP archive exceeds the 4 GB standard ZIP limit.");
    }
    return { nameBytes, dataBytes, crc: crc32(dataBytes) };
  });

  let localTotal = 0;
  let centralTotal = 0;
  for (const p of prepared) {
    localTotal += 30 + p.nameBytes.length + p.dataBytes.length;
    centralTotal += 46 + p.nameBytes.length;
  }
  const totalBytes = localTotal + centralTotal + 22;
  validateZipLimits(prepared.length, totalBytes);

  const out = new Uint8Array(totalBytes);
  let pos = 0;
  const offsets: number[] = [];

  // Local file headers + payloads
  for (const p of prepared) {
    offsets.push(pos);
    writeU32(out, pos, 0x04034b50); // local file header signature
    writeU16(out, pos + 4, 20); // version needed to extract (2.0)
    writeU16(out, pos + 6, 0x0800); // UTF-8 filename flag
    writeU16(out, pos + 8, 0); // compression method: Store
    writeU16(out, pos + 10, 0); // mod time
    writeU16(out, pos + 12, 0x5978); // mod date (fixed deterministic DOS date)
    writeU32(out, pos + 14, p.crc);
    writeU32(out, pos + 18, p.dataBytes.length);
    writeU32(out, pos + 22, p.dataBytes.length);
    writeU16(out, pos + 26, p.nameBytes.length);
    writeU16(out, pos + 28, 0); // extra length
    out.set(p.nameBytes, pos + 30);
    out.set(p.dataBytes, pos + 30 + p.nameBytes.length);
    pos += 30 + p.nameBytes.length + p.dataBytes.length;
  }

  const centralStart = pos;

  // Central directory headers
  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i];
    writeU32(out, pos, 0x02014b50); // central directory signature
    writeU16(out, pos + 4, 20); // version made by
    writeU16(out, pos + 6, 20); // version needed
    writeU16(out, pos + 8, 0x0800); // UTF-8 flag
    writeU16(out, pos + 10, 0); // Store
    writeU16(out, pos + 12, 0); // mod time
    writeU16(out, pos + 14, 0x5978); // mod date
    writeU32(out, pos + 16, p.crc);
    writeU32(out, pos + 20, p.dataBytes.length);
    writeU32(out, pos + 24, p.dataBytes.length);
    writeU16(out, pos + 28, p.nameBytes.length);
    writeU16(out, pos + 30, 0); // extra length
    writeU16(out, pos + 32, 0); // comment length
    writeU16(out, pos + 34, 0); // disk start
    writeU16(out, pos + 36, 0); // internal attrs
    writeU32(out, pos + 38, 0); // external attrs
    writeU32(out, pos + 42, offsets[i]);
    out.set(p.nameBytes, pos + 46);
    pos += 46 + p.nameBytes.length;
  }

  // End of central directory record
  writeU32(out, pos, 0x06054b50);
  writeU16(out, pos + 4, 0);
  writeU16(out, pos + 6, 0);
  writeU16(out, pos + 8, prepared.length);
  writeU16(out, pos + 10, prepared.length);
  writeU32(out, pos + 12, centralTotal);
  writeU32(out, pos + 16, centralStart);
  writeU16(out, pos + 20, 0);

  return out;
}
