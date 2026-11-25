// Cryptographically random UUID v4, RFC 9562 UUID v7, and unbiased short IDs.
// Uses Web Crypto (crypto.randomUUID / crypto.getRandomValues) exclusively.

export type IdMode = 'uuid-v4' | 'uuid-v7' | 'short';

export interface AlphabetPreset {
  id: string;
  label: string;
  chars: string;
  note: string;
}

export const ALPHABET_PRESETS: AlphabetPreset[] = [
  {
    id: 'url-safe',
    label: 'URL-safe (64)',
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-',
    note: 'Letters, digits, _, and -',
  },
  {
    id: 'alphanumeric',
    label: 'Alphanumeric (62)',
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    note: 'Upper, lower, and digits',
  },
  {
    id: 'readable',
    label: 'No lookalikes (57)',
    chars: '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
    note: 'Drops 0, O, 1, I, and l',
  },
  {
    id: 'lower-alnum',
    label: 'Lowercase + digits (36)',
    chars: 'abcdefghijklmnopqrstuvwxyz0123456789',
    note: 'Easy to type and case-safe',
  },
  {
    id: 'hex',
    label: 'Hexadecimal (16)',
    chars: '0123456789abcdef',
    note: 'Lowercase base-16',
  },
  {
    id: 'digits',
    label: 'Digits only (10)',
    chars: '0123456789',
    note: 'Numeric codes',
  },
];

export const MIN_BATCH_COUNT = 1;
export const MAX_BATCH_COUNT = 100;
export const MIN_SHORT_LENGTH = 4;
export const MAX_SHORT_LENGTH = 64;

export interface UuidFormatOptions {
  uppercase?: boolean;
  hyphens?: boolean;
}

export interface UuidV7State {
  lastMs: number;
  seq: number;
}

export interface UuidV7Options extends UuidFormatOptions {
  timestampMs?: number;
  state?: UuidV7State;
}

export interface BatchRequest {
  mode: IdMode;
  count: number;
  uppercase?: boolean;
  hyphens?: boolean;
  length?: number;
  alphabet?: string;
  timestampMs?: number;
  state?: UuidV7State;
}

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Web Crypto API (crypto.getRandomValues) is unavailable in this environment.');
  }
  return c;
}

function randomBytes(size: number): Uint8Array {
  const out = new Uint8Array(size);
  getCrypto().getRandomValues(out);
  return out;
}

function formatUuidBytes(bytes: Uint8Array, options: UuidFormatOptions = {}): string {
  const { uppercase = false, hyphens = true } = options;
  const raw =
    HEX[bytes[0]] +
    HEX[bytes[1]] +
    HEX[bytes[2]] +
    HEX[bytes[3]] +
    (hyphens ? '-' : '') +
    HEX[bytes[4]] +
    HEX[bytes[5]] +
    (hyphens ? '-' : '') +
    HEX[bytes[6]] +
    HEX[bytes[7]] +
    (hyphens ? '-' : '') +
    HEX[bytes[8]] +
    HEX[bytes[9]] +
    (hyphens ? '-' : '') +
    HEX[bytes[10]] +
    HEX[bytes[11]] +
    HEX[bytes[12]] +
    HEX[bytes[13]] +
    HEX[bytes[14]] +
    HEX[bytes[15]];
  return uppercase ? raw.toUpperCase() : raw;
}

export function makeUuidV4(options: UuidFormatOptions = {}): string {
  const c = getCrypto();
  let uuid: string;
  if (typeof c.randomUUID === 'function') {
    uuid = c.randomUUID();
    if (options.hyphens === false) uuid = uuid.replace(/-/g, '');
    if (options.uppercase) uuid = uuid.toUpperCase();
    return uuid;
  }
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant 10xx
  return formatUuidBytes(bytes, options);
}

export function createUuidV7State(): UuidV7State {
  return { lastMs: -1, seq: 0 };
}

export function makeUuidV7(options: UuidV7Options = {}): string {
  const bytes = randomBytes(16);
  let ms = options.timestampMs ?? Date.now();
  if (!Number.isFinite(ms) || ms < 0 || ms > 0xffff_ffff_ffff) {
    throw new RangeError('Timestamp must be a valid 48-bit Unix millisecond integer.');
  }
  ms = Math.floor(ms);

  // 12-bit monotonic counter in rand_a for same-millisecond ordering (RFC 9562 Section 6.2).
  let randA = ((bytes[6] & 0x0f) << 8) | bytes[7];
  const st = options.state;
  if (st) {
    if (ms > st.lastMs) {
      st.lastMs = ms;
      st.seq = randA;
    } else {
      st.seq = (st.seq + 1) & 0x0fff;
      if (st.seq === 0) {
        st.lastMs += 1;
      }
      ms = st.lastMs;
      randA = st.seq;
    }
  }

  // 48-bit big-endian Unix timestamp in milliseconds.
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = (ms >>> 24) & 0xff;
  bytes[3] = (ms >>> 16) & 0xff;
  bytes[4] = (ms >>> 8) & 0xff;
  bytes[5] = ms & 0xff;

  // Version 7 (0111) + 12-bit rand_a.
  bytes[6] = 0x70 | ((randA >>> 8) & 0x0f);
  bytes[7] = randA & 0xff;

  // RFC 9562 variant (10xx) + 62 bits of cryptographic randomness.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuidBytes(bytes, options);
}

export function dedupeAlphabet(raw: string): string {
  const seen = new Set<string>();
  const chars: string[] = [];
  for (const ch of Array.from(raw)) {
    if (ch === '\r' || ch === '\n') continue;
    if (!seen.has(ch)) {
      seen.add(ch);
      chars.push(ch);
    }
  }
  return chars.join('');
}

export function makeShortId(length: number, rawAlphabet: string): string {
  if (!Number.isInteger(length) || length < 1 || length > 128) {
    throw new RangeError('Short ID length must be an integer between 1 and 128.');
  }
  const unique = dedupeAlphabet(rawAlphabet);
  const chars = Array.from(unique);
  if (chars.length < 2 || chars.length > 256) {
    throw new RangeError('Alphabet must contain between 2 and 256 unique characters.');
  }

  // Bitmask rejection sampling eliminates modulo bias for any alphabet size 2..256.
  const mask = (2 << Math.floor(Math.log2(chars.length - 1))) - 1;
  const step = Math.ceil((1.6 * mask * length) / chars.length);
  const picked: string[] = [];

  while (picked.length < length) {
    const buf = randomBytes(step);
    for (let i = 0; i < buf.length && picked.length < length; i += 1) {
      const idx = buf[i] & mask;
      if (idx < chars.length) {
        picked.push(chars[idx]);
      }
    }
  }
  return picked.join('');
}

export function makeIdBatch(req: BatchRequest): string[] {
  if (!Number.isInteger(req.count) || req.count < MIN_BATCH_COUNT || req.count > MAX_BATCH_COUNT) {
    throw new RangeError(`Count must be an integer between ${MIN_BATCH_COUNT} and ${MAX_BATCH_COUNT}.`);
  }
  const out: string[] = [];
  if (req.mode === 'uuid-v4') {
    for (let i = 0; i < req.count; i += 1) {
      out.push(makeUuidV4({ uppercase: req.uppercase, hyphens: req.hyphens }));
    }
    return out;
  }
  if (req.mode === 'uuid-v7') {
    const state = req.state ?? createUuidV7State();
    for (let i = 0; i < req.count; i += 1) {
      out.push(
        makeUuidV7({
          uppercase: req.uppercase,
          hyphens: req.hyphens,
          timestampMs: req.timestampMs,
          state,
        }),
      );
    }
    return out;
  }
  const length = req.length ?? 12;
  const alphabet = req.alphabet ?? ALPHABET_PRESETS[0].chars;
  for (let i = 0; i < req.count; i += 1) {
    out.push(makeShortId(length, alphabet));
  }
  return out;
}

export function estimateEntropyBits(mode: IdMode, length = 12, alphabetSize = 64): number {
  if (mode === 'uuid-v4') return 122;
  if (mode === 'uuid-v7') return 74;
  if (alphabetSize < 2 || length < 1) return 0;
  return Math.round(length * Math.log2(alphabetSize) * 10) / 10;
}
