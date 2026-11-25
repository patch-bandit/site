/**
 * Rule-of-thumb print-size guidance for QR codes based on module count and the common 10:1 scan-distance rule of thumb.
 * Pure math, no external dependencies.
 */

export interface PrintGuide {
  modules: number;
  totalModules: number;
  minCloseupMm: number;
  minCloseupIn: number;
  sign3ftMm: number;
  sign3ftIn: number;
  densityLabel: "Simple" | "Medium" | "Dense";
}

/**
 * Estimates rule-of-thumb print width from the QR module count and quiet zone.
 * Keeps each printed module around 0.65 mm wide for standard office/commercial print,
 * with a 20 mm (0.8 in) floor for phone cameras. Always test a printed proof before ordering a full run.
 */
export function printGuide(modules: number, quietZone: number): PrintGuide {
  const totalModules = modules + quietZone * 2;
  const minCloseupMm = Math.max(20, Math.ceil(totalModules * 0.65));
  const minCloseupIn = Math.round((minCloseupMm / 25.4) * 10) / 10;
  // Common 10:1 distance-to-code rule of thumb at 3 ft (~914 mm), scaled up if the code is dense
  const sign3ftMm = Math.max(92, Math.ceil(totalModules * 2.2));
  const sign3ftIn = Math.round((sign3ftMm / 25.4) * 10) / 10;
  const densityLabel = modules <= 29 ? "Simple" : modules <= 45 ? "Medium" : "Dense";
  return { modules, totalModules, minCloseupMm, minCloseupIn, sign3ftMm, sign3ftIn, densityLabel };
}
