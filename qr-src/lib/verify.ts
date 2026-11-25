import { decodePixels, type Pixels } from "./decode.ts";
import { buildPayload } from "./payload.ts";
import { createMatrix, effectiveEcc, renderSvg } from "./render.ts";
import type { Config } from "./schema.ts";

export type { Pixels };

export interface Rasterizer {
  toPixels(svg: string, size: number): Promise<Pixels>;
  toPng(svg: string, size: number): Promise<Uint8Array>;
}

export type VerifyResult =
  | { ok: true; decoded: string; modules: number }
  | { ok: false; reason: "unreadable" | "different"; message: string; decoded?: string; modules: number };

export const CHECK_PX_PER_MODULE = [6, 8, 10];
export const MIN_PX_PER_MODULE = 4;

export async function verify(config: Config, rasterizer: Rasterizer): Promise<VerifyResult> {
  const payload = buildPayload(config);
  const n = createMatrix(payload, effectiveEcc(config)).size;
  const total = n + 2 * config.style.quietZone;
  if (config.style.quietZone < 2) {
    return {
      ok: false,
      reason: "unreadable",
      message: "The empty margin around the code is too small. Phone cameras need at least 2 modules; 4 is the standard.",
      modules: n,
    };
  }
  if (config.style.size / total < MIN_PX_PER_MODULE) {
    return {
      ok: false,
      reason: "unreadable",
      message: "At this download size each dot is only a few pixels wide, so the file may not scan. Pick a larger size or shorten the content.",
      modules: n,
    };
  }
  for (const per of CHECK_PX_PER_MODULE) {
    const size = total * per;
    const px = await rasterizer.toPixels(renderSvg(config, { size }), size);
    const hit = decodePixels(px);
    if (!hit) {
      return {
        ok: false,
        reason: "unreadable",
        message: "This code did not read back. Try stronger contrast, a larger quiet zone, or a smaller logo.",
        modules: n,
      };
    }
    if (hit !== payload) {
      return {
        ok: false,
        reason: "different",
        message: "The code reads, but not as the content you entered. Try different colors or a simpler style.",
        decoded: hit,
        modules: n,
      };
    }
  }
  return { ok: true, decoded: payload, modules: n };
}
