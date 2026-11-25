import { HEADER_BYTES, imageSize, MAX_PIXELS, MAX_SIDE } from "./browserRaster.ts";
import { decodePhotoPixels } from "./decode.ts";

export type ImageDecodeResult =
  | { ok: true; text: string; method: "native" | "zxing" }
  | { ok: false; reason: string };

interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => NativeBarcodeDetector;
  }
}

const UNKNOWN_DIMS_MAX_BYTES = 4_000_000;

function drawBitmapToPixels(bitmap: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot read pixels from a canvas.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const imgData = ctx.getImageData(0, 0, width, height);
  return { data: imgData.data, width, height };
}

/**
 * Decodes a QR code from an uploaded or pasted image file, strictly in the browser.
 * Checks image header dimensions first to block decompression bombs.
 */
export async function decodeQrFromImageFile(file: File): Promise<ImageDecodeResult> {
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) {
    return { ok: false, reason: "Use a PNG, JPEG, WebP, or GIF image of the QR code." };
  }
  if (file.size > 20_000_000) {
    return { ok: false, reason: "That image is over 20 MB. Try a smaller photo or a tighter crop." };
  }
  const head = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const dims = imageSize(head);
  if (!dims && file.size > UNKNOWN_DIMS_MAX_BYTES) {
    return {
      ok: false,
      reason: "Could not read this image's pixel size before opening it. Save a smaller PNG or JPEG (under 4 MB) and try again.",
    };
  }
  if (dims && (dims.width > MAX_SIDE || dims.height > MAX_SIDE || dims.width * dims.height > MAX_PIXELS)) {
    return { ok: false, reason: "That image is too large to decode safely here. Try one under 8,000 pixels per side." };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: "Could not open that image file. Try saving it as a PNG or JPEG." };
  }

  try {
    if (bitmap.width > MAX_SIDE || bitmap.height > MAX_SIDE || bitmap.width * bitmap.height > MAX_PIXELS) {
      return { ok: false, reason: "That image is too large to decode safely here. Try one under 8,000 pixels per side." };
    }

    // Progressive enhancement: use browser's built-in BarcodeDetector when present
    if (typeof window !== "undefined" && typeof window.BarcodeDetector === "function") {
      try {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const hits = await detector.detect(bitmap);
        const first = hits.find((h) => typeof h.rawValue === "string" && h.rawValue.trim().length > 0);
        if (first?.rawValue) return { ok: true, text: first.rawValue, method: "native" };
      } catch {
        /* fall through to @zxing/library */
      }
    }

    // Multi-pass @zxing/library decode across scales
    for (const maxSide of [1600, 900, 500]) {
      const px = drawBitmapToPixels(bitmap, maxSide);
      const hit = decodePhotoPixels(px);
      if (hit) return { ok: true, text: hit, method: "zxing" };
      if (Math.max(bitmap.width, bitmap.height) <= maxSide) break;
    }

    return {
      ok: false,
      reason: "Could not find a readable QR code in that image. Try cropping closer to the code, brightening the photo, or pasting the scanned web address below.",
    };
  } finally {
    bitmap.close();
  }
}
