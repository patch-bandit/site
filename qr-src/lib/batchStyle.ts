import { PRESETS, type PresetName } from "./presets.ts";
import { renderSvg } from "./render.ts";
import { parseConfig, type Config } from "./schema.ts";
import { verify, type Rasterizer } from "./verify.ts";

export const MIN_BATCH_QUIET_ZONE = 2;
export const MAX_BATCH_QUIET_ZONE = 8;
export const MAX_BATCH_ZIP_BYTES = 50 * 1024 * 1024;
const BASE_SVG_BYTES_ESTIMATE = 8_000;

export interface BatchQrImage {
  mode: "none" | "logo" | "blend";
  src?: string;
  scale: number;
  veil: number;
}

export interface BatchQrStyle {
  dotColor: string;
  cornerColor: string;
  backgroundColor: string;
  dotShape: "square" | "rounded" | "dot";
  cornerStyle: "square" | "rounded" | "circle";
  quietZone: number;
  errorCorrection: "L" | "M" | "Q" | "H";
  image: BatchQrImage;
}

export interface BatchQrItem {
  id: string;
  url: string;
}

export type BatchVerifyResult =
  | { ok: true; checkedCount: number }
  | { ok: false; failedId: string; failedUrl: string; message: string };

export function clampBatchQuietZone(q: number): number {
  if (!Number.isFinite(q)) return 4;
  return Math.min(MAX_BATCH_QUIET_ZONE, Math.max(MIN_BATCH_QUIET_ZONE, Math.round(q)));
}

export function batchStyleMissingImageReason(s: BatchQrStyle): string | null {
  if (s.image.mode === "logo" && !s.image.src) return "Add a logo image or pick None.";
  if (s.image.mode === "blend" && !s.image.src) return "Add a background photo or pick None.";
  return null;
}

export function estimateBatchZipBytes(count: number, s: BatchQrStyle): number {
  const safeCount = Math.max(0, Math.floor(count));
  const imageChars = s.image.mode !== "none" && s.image.src ? s.image.src.length : 0;
  return safeCount * (BASE_SVG_BYTES_ESTIMATE + imageChars);
}

export function checkBatchZipSize(
  count: number,
  s: BatchQrStyle,
): { ok: true; estimatedBytes: number } | { ok: false; estimatedBytes: number; reason: string } {
  const estimatedBytes = estimateBatchZipBytes(count, s);
  if (estimatedBytes > MAX_BATCH_ZIP_BYTES) {
    const mb = Math.ceil(estimatedBytes / (1024 * 1024));
    const capMb = Math.round(MAX_BATCH_ZIP_BYTES / (1024 * 1024));
    return {
      ok: false,
      estimatedBytes,
      reason: `This batch ZIP would be about ${mb} MB because the picture is embedded in every SVG (limit: ${capMb} MB). Click Change style to pick None for Picture or use a smaller image.`,
    };
  }
  return { ok: true, estimatedBytes };
}

export function defaultBatchStyle(): BatchQrStyle {
  const c = PRESETS.classic;
  return {
    dotColor: c.dotColor,
    cornerColor: c.cornerColor,
    backgroundColor: c.backgroundColor,
    dotShape: c.dotShape,
    cornerStyle: c.cornerStyle,
    quietZone: c.quietZone,
    errorCorrection: c.errorCorrection,
    image: { mode: "none", scale: 0.22, veil: 0.3 },
  };
}

export function batchStyleFromPreset(name: PresetName, currentImage?: BatchQrImage): BatchQrStyle {
  const p = PRESETS[name];
  return {
    dotColor: p.dotColor,
    cornerColor: p.cornerColor,
    backgroundColor: p.backgroundColor,
    dotShape: p.dotShape,
    cornerStyle: p.cornerStyle,
    quietZone: p.quietZone,
    errorCorrection: p.errorCorrection,
    image: currentImage ? { ...currentImage } : { mode: "none", scale: 0.22, veil: 0.3 },
  };
}

export function cloneBatchStyle(s: BatchQrStyle): BatchQrStyle {
  return {
    dotColor: s.dotColor,
    cornerColor: s.cornerColor,
    backgroundColor: s.backgroundColor,
    dotShape: s.dotShape,
    cornerStyle: s.cornerStyle,
    quietZone: s.quietZone,
    errorCorrection: s.errorCorrection,
    image: { ...s.image },
  };
}

function hexLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorWord(hex: string, role: "fg" | "bg"): string {
  const h = hex.trim().toUpperCase();
  if (h === "#000000") return "black";
  if (h === "#FFFFFF") return "white";
  if (h === "#FFF2DE" || h === "#FBF4EA") return "cream";
  if (h === "#F2FFF9") return "pale mint";
  if (h === "#F3E8F4") return "pale lavender";
  const lum = hexLuminance(h);
  if (role === "fg") {
    if (lum < 0.22) return "dark";
    if (lum > 0.78) return "light";
    return "custom color";
  }
  if (lum > 0.85) return "light";
  if (lum < 0.22) return "dark";
  return "tinted";
}

function shapeWord(shape: BatchQrStyle["dotShape"]): string {
  if (shape === "rounded") return "rounded";
  if (shape === "dot") return "dots";
  return "square";
}

export function matchingPresetName(s: BatchQrStyle): PresetName | undefined {
  return (Object.keys(PRESETS) as PresetName[]).find((n) => {
    const p = PRESETS[n];
    return (
      p.dotColor.toUpperCase() === s.dotColor.toUpperCase() &&
      p.cornerColor.toUpperCase() === s.cornerColor.toUpperCase() &&
      p.backgroundColor.toUpperCase() === s.backgroundColor.toUpperCase() &&
      p.dotShape === s.dotShape &&
      p.cornerStyle === s.cornerStyle &&
      p.quietZone === s.quietZone &&
      p.errorCorrection === s.errorCorrection
    );
  });
}

/** Plain-language one-line summary of the active batch QR style (for example "Style: dark on white, rounded"). */
export function describeBatchStyle(s: BatchQrStyle): string {
  const fg = colorWord(s.dotColor, "fg");
  const bg = colorWord(s.backgroundColor, "bg");
  const parts = [`${fg} on ${bg}`, shapeWord(s.dotShape)];
  if (s.image.mode === "logo" && s.image.src) parts.push("with center logo");
  else if (s.image.mode === "blend" && s.image.src) parts.push("with background photo");
  return `Style: ${parts.join(", ")}`;
}

export function batchStyleToConfig(
  url: string,
  s: BatchQrStyle,
  opts: { allowMissingImage?: boolean } = {},
): Config {
  const imageInput =
    s.image.mode === "none"
      ? { mode: "none" as const, scale: s.image.scale, veil: s.image.veil }
      : s.image.src
        ? { mode: s.image.mode, src: s.image.src, scale: s.image.scale, veil: s.image.veil }
        : opts.allowMissingImage
          ? { mode: "none" as const, scale: s.image.scale, veil: s.image.veil }
          : { mode: s.image.mode, scale: s.image.scale, veil: s.image.veil };

  const parsed = parseConfig({
    version: 1,
    type: "link",
    content: { url },
    style: {
      dotColor: s.dotColor,
      cornerColor: s.cornerColor,
      backgroundColor: s.backgroundColor,
      dotShape: s.dotShape,
      cornerStyle: s.cornerStyle,
      quietZone: s.quietZone,
      errorCorrection: s.errorCorrection,
      size: 1024,
    },
    image: imageInput,
    output: { format: "svg" },
  });
  if (!parsed.ok) {
    throw new Error(parsed.errors.join(" "));
  }
  return parsed.config;
}

export function renderBatchQrSvg(url: string, s: BatchQrStyle): string {
  return renderSvg(batchStyleToConfig(url, s));
}

/**
 * Verifies every real URL in a batch with the chosen style before building a ZIP.
 * Checks the longest URL first so dense codes fail fast, and stops on the first unreadable code.
 */
export async function verifyBatchQrCodes(
  items: BatchQrItem[],
  s: BatchQrStyle,
  rasterizer: Rasterizer,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchVerifyResult> {
  const missingImg = batchStyleMissingImageReason(s);
  if (missingImg) {
    const first = items[0] ?? { id: "batch", url: "" };
    return { ok: false, failedId: first.id, failedUrl: first.url, message: missingImg };
  }
  const ordered = [...items].sort((a, b) => b.url.length - a.url.length);
  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const cfg = batchStyleToConfig(item.url, s);
    const res = await verify(cfg, rasterizer);
    if (!res.ok) {
      return { ok: false, failedId: item.id, failedUrl: item.url, message: res.message };
    }
    if (onProgress && ((i + 1) % 5 === 0 || i + 1 === ordered.length)) {
      onProgress(i + 1, ordered.length);
    }
  }
  return { ok: true, checkedCount: ordered.length };
}
