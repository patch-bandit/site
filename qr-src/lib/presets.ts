export type StylePreset = {
  dotColor: string;
  cornerColor: string;
  backgroundColor: string;
  dotShape: "square" | "rounded" | "dot";
  cornerStyle: "square" | "rounded" | "circle";
  quietZone: number;
  errorCorrection: "L" | "M" | "Q" | "H";
};

export const PRESETS = {
  classic: {
    label: "Classic",
    dotColor: "#000000",
    cornerColor: "#000000",
    backgroundColor: "#FFFFFF",
    dotShape: "square",
    cornerStyle: "square",
    quietZone: 4,
    errorCorrection: "M",
  },
  alley: {
    label: "Night Alley",
    dotColor: "#1E1033",
    cornerColor: "#4B2D6E",
    backgroundColor: "#FFF2DE",
    dotShape: "rounded",
    cornerStyle: "rounded",
    quietZone: 4,
    errorCorrection: "Q",
  },
  mint: {
    label: "Mint",
    dotColor: "#0B4A35",
    cornerColor: "#0F6B4C",
    backgroundColor: "#F2FFF9",
    dotShape: "rounded",
    cornerStyle: "rounded",
    quietZone: 4,
    errorCorrection: "Q",
  },
  coral: {
    label: "Coral",
    dotColor: "#140A22",
    cornerColor: "#A8321F",
    backgroundColor: "#FBF4EA",
    dotShape: "dot",
    cornerStyle: "circle",
    quietZone: 4,
    errorCorrection: "Q",
  },
  dusk: {
    label: "Dusk",
    dotColor: "#2B1A42",
    cornerColor: "#7A2B8F",
    backgroundColor: "#F3E8F4",
    dotShape: "dot",
    cornerStyle: "circle",
    quietZone: 4,
    errorCorrection: "Q",
  },
  ink: {
    label: "Ink",
    dotColor: "#140A22",
    cornerColor: "#140A22",
    backgroundColor: "#FFFFFF",
    dotShape: "rounded",
    cornerStyle: "square",
    quietZone: 4,
    errorCorrection: "M",
  },
} as const satisfies Record<string, StylePreset & { label: string }>;

export type PresetName = keyof typeof PRESETS;
export const PRESET_NAMES = Object.keys(PRESETS) as [PresetName, ...PresetName[]];
