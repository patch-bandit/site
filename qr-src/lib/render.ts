import QRCode from "qrcode";
import { decodePixels } from "./decode.ts";
import { buildPayload } from "./payload.ts";
import { IMAGE_DATA_URI, type Config } from "./schema.ts";

export type Ecc = "L" | "M" | "Q" | "H";

export function effectiveEcc(config: Config): Ecc {
  if (config.image.mode === "blend") return "H";
  if (config.image.mode === "logo" && (config.style.errorCorrection === "L" || config.style.errorCorrection === "M")) {
    return "Q";
  }
  return config.style.errorCorrection;
}

function matrixDecodes(modules: ReturnType<typeof QRCode.create>["modules"], payload: string): boolean {
  const n = modules.size;
  const q = 4;
  const s = 4;
  const w = (n + 2 * q) * s;
  const data = new Uint8ClampedArray(w * w * 4);
  data.fill(255);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules.get(r, c) !== 1) continue;
      for (let dy = 0; dy < s; dy++) {
        const row = ((r + q) * s + dy) * w;
        for (let dx = 0; dx < s; dx++) {
          const o = (row + (c + q) * s + dx) * 4;
          data[o] = 0;
          data[o + 1] = 0;
          data[o + 2] = 0;
        }
      }
    }
  }
  return decodePixels({ data, width: w, height: w }) === payload;
}

export function createMatrix(payload: string, ecc: Ecc) {
  const segs = [{ data: new TextEncoder().encode(payload), mode: "byte" as const }];
  const first = QRCode.create(segs, { errorCorrectionLevel: ecc });
  if (matrixDecodes(first.modules, payload)) return first.modules;
  for (let mp = 0; mp < 8; mp++) {
    if (mp === first.maskPattern) continue;
    const alt = QRCode.create(segs, { errorCorrectionLevel: ecc, maskPattern: mp as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 });
    if (matrixDecodes(alt.modules, payload)) return alt.modules;
  }
  return first.modules;
}

export function matrixSize(config: Config): number {
  return createMatrix(buildPayload(config), effectiveEcc(config)).size;
}

const f = (n: number) => String(Math.round(n * 1000) / 1000);

function rr(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  return (
    `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}` +
    `a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}` +
    `v${f(-(h - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}z`
  );
}

function circle(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`;
}

function finder(ox: number, oy: number, style: Config["style"]["cornerStyle"]): { ring: string; eye: string } {
  if (style === "circle") {
    return {
      ring: circle(ox + 3.5, oy + 3.5, 3.5) + circle(ox + 3.5, oy + 3.5, 2.5),
      eye: circle(ox + 3.5, oy + 3.5, 1.5),
    };
  }
  if (style === "rounded") {
    return {
      ring: rr(ox, oy, 7, 7, 2) + rr(ox + 1, oy + 1, 5, 5, 1.1),
      eye: rr(ox + 2, oy + 2, 3, 3, 0.9),
    };
  }
  return {
    ring: `M${ox} ${oy}h7v7h-7zM${ox + 1} ${oy + 1}v5h5v-5z`,
    eye: `M${ox + 2} ${oy + 2}h3v3h-3z`,
  };
}

export type RenderOptions = { size?: number };

const BLEND_DOT_SCALE = 0.85;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function renderSvg(config: Config, options: RenderOptions = {}): string {
  const payload = buildPayload(config);
  const ecc = effectiveEcc(config);
  const modules = createMatrix(payload, ecc);
  const n = modules.size;
  const { style, image } = config;
  const q = style.quietZone;
  const total = n + 2 * q;
  const size = options.size ?? style.size;
  const cornerColor = style.cornerColor ?? style.dotColor;
  if (!HEX_COLOR.test(style.backgroundColor) || !HEX_COLOR.test(style.dotColor) || !HEX_COLOR.test(cornerColor)) {
    throw new Error("QR colors must be 6-digit hex values such as #000000.");
  }
  const blend = image.mode === "blend" && Boolean(image.src);
  const logo = image.mode === "logo" && Boolean(image.src);
  if (image.src && !IMAGE_DATA_URI.test(image.src)) {
    throw new Error("The image must be a base64 data: URI (png, jpeg, webp, or gif).");
  }

  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  const scale = blend ? BLEND_DOT_SCALE : 1;
  let dots = "";
  for (let r = 0; r < n; r++) {
    let runStart = -1;
    for (let c = 0; c <= n; c++) {
      const on = c < n && modules.get(r, c) === 1 && !inFinder(r, c);
      if (style.dotShape === "square" && !blend) {
        if (on && runStart < 0) runStart = c;
        if (!on && runStart >= 0) {
          dots += `M${q + runStart} ${q + r}h${c - runStart}v1h${-(c - runStart)}z`;
          runStart = -1;
        }
        continue;
      }
      if (!on) continue;
      const x = q + c + (1 - scale) / 2;
      const y = q + r + (1 - scale) / 2;
      if (style.dotShape === "dot") dots += circle(q + c + 0.5, q + r + 0.5, 0.46 * scale);
      else if (style.dotShape === "rounded") dots += rr(x, y, scale, scale, 0.3 * scale);
      else dots += `M${f(x)} ${f(y)}h${f(scale)}v${f(scale)}h${f(-scale)}z`;
    }
  }

  const origins = [
    [q, q],
    [q + n - 7, q],
    [q, q + n - 7],
  ];
  let rings = "";
  let eyes = "";
  let pads = "";
  for (const [ox, oy] of origins) {
    const p = finder(ox, oy, style.cornerStyle);
    rings += p.ring;
    eyes += p.eye;
    pads += `M${ox - 1} ${oy - 1}h9v9h-9z`;
  }

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${size}" height="${size}" viewBox="0 0 ${total} ${total}">`,
  );
  parts.push(`<rect width="${total}" height="${total}" fill="${style.backgroundColor}"/>`);
  if (blend) {
    parts.push(`<image href="${image.src}" x="${q}" y="${q}" width="${n}" height="${n}" preserveAspectRatio="xMidYMid slice"/>`);
    if (image.veil > 0) {
      parts.push(`<rect x="${q}" y="${q}" width="${n}" height="${n}" fill="${style.backgroundColor}" fill-opacity="${image.veil}"/>`);
    }
    parts.push(
      `<path d="${dots}" fill="${style.backgroundColor}" stroke="${style.backgroundColor}" stroke-width="0.22" stroke-linejoin="round" fill-opacity="0.9" stroke-opacity="0.9"/>`,
    );
    parts.push(`<path d="${pads}" fill="${style.backgroundColor}"/>`);
  }
  const crisp = style.dotShape === "square" && !blend ? ` shape-rendering="crispEdges"` : "";
  if (dots) parts.push(`<path d="${dots}" fill="${style.dotColor}"${crisp}/>`);
  parts.push(`<path d="${rings}" fill="${cornerColor}" fill-rule="evenodd"/>`);
  parts.push(`<path d="${eyes}" fill="${cornerColor}"/>`);

  if (logo) {
    const side = Math.max(1, Math.round(n * image.scale));
    const lx = q + (n - side) / 2;
    const ly = q + (n - side) / 2;
    const padSize = side + 1;
    parts.push(`<rect x="${f(lx - 0.5)}" y="${f(ly - 0.5)}" width="${padSize}" height="${padSize}" rx="0.8" fill="${style.backgroundColor}"/>`);
    parts.push(`<image href="${image.src}" x="${f(lx)}" y="${f(ly)}" width="${side}" height="${side}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  parts.push("</svg>");
  return parts.join("");
}
