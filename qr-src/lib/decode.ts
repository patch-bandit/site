import {
  BinaryBitmap,
  DecodeHintType,
  GlobalHistogramBinarizer,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

function tryDecodeLum(lum: Uint8ClampedArray, width: number, height: number, useGlobal: boolean): string | null {
  const source = new RGBLuminanceSource(lum, width, height);
  const binarizer = useGlobal ? new GlobalHistogramBinarizer(source) : new HybridBinarizer(source);
  const bitmap = new BinaryBitmap(binarizer);
  try {
    return new QRCodeReader().decode(bitmap, new Map([[DecodeHintType.TRY_HARDER, true]])).getText();
  } catch {
    return null;
  }
}

/** Reads a QR code out of RGBA pixels. Returns the text, or null when nothing reads. */
export function decodePixels(px: Pixels): string | null {
  const lum = new Uint8ClampedArray(px.width * px.height);
  for (let i = 0; i < lum.length; i++) {
    const o = i * 4;
    lum[i] = (px.data[o] * 299 + px.data[o + 1] * 587 + px.data[o + 2] * 114) / 1000;
  }
  return tryDecodeLum(lum, px.width, px.height, false);
}

/**
 * Multi-pass decoder for photographed or screenshot QR codes:
 * tries HybridBinarizer, GlobalHistogramBinarizer (uneven lighting), and inverted luminance (light-on-dark codes).
 */
export function decodePhotoPixels(px: Pixels): string | null {
  const lum = new Uint8ClampedArray(px.width * px.height);
  for (let i = 0; i < lum.length; i++) {
    const o = i * 4;
    lum[i] = (px.data[o] * 299 + px.data[o + 1] * 587 + px.data[o + 2] * 114) / 1000;
  }
  const hit1 = tryDecodeLum(lum, px.width, px.height, false);
  if (hit1) return hit1;
  const hit2 = tryDecodeLum(lum, px.width, px.height, true);
  if (hit2) return hit2;

  const inv = new Uint8ClampedArray(lum.length);
  for (let i = 0; i < lum.length; i++) inv[i] = 255 - lum[i];
  const hit3 = tryDecodeLum(inv, px.width, px.height, false);
  if (hit3) return hit3;
  return tryDecodeLum(inv, px.width, px.height, true);
}
