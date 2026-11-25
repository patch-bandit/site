import {
  MAX_BATCH_QUIET_ZONE,
  MIN_BATCH_QUIET_ZONE,
  PRESETS,
  batchStyleFromPreset,
  batchStyleMissingImageReason,
  batchStyleToConfig,
  browserRasterizer,
  clampBatchQuietZone,
  cloneBatchStyle,
  dataUriToSafeDataUri,
  defaultBatchStyle,
  describeBatchStyle,
  fileToDataUri,
  matchingPresetName,
  renderSvg,
  verify,
  type BatchQrStyle,
  type PresetName,
} from "./lib/index.ts";
import { createDisabledReason, el, focusField } from "./ui-dom.ts";

export interface BatchStyleController {
  dialog: HTMLDialogElement;
  getStyle: () => BatchQrStyle;
  describe: () => string;
  hasConfirmed: () => boolean;
  onChange: (cb: () => void) => void;
  createSummaryBar: (opts?: { idPrefix?: string }) => HTMLElement;
  requestZipDownload: (
    count: number,
    onDownload: (style: BatchQrStyle) => void | Promise<void>,
    sampleUrl?: string,
  ) => void;
  openPicker: (opts?: {
    title?: string;
    confirmLabel?: string;
    sampleUrl?: string;
    onConfirm?: (style: BatchQrStyle) => void | Promise<void>;
  }) => void;
}

const PREVIEW_SAMPLE_URL = "https://yoursite.com/go/menu";

/**
 * Shared batch QR style picker dialog and session memory (in-memory only; writes no storage).
 * Offers the exact same style and picture options as single "Make QR" and applies the chosen
 * look to every code in a ZIP download across Redirect kit, Snippet, and Escape plan.
 */
export function createBatchStyleController(getSingleStyle?: () => BatchQrStyle): BatchStyleController {
  let savedStyle: BatchQrStyle = defaultBatchStyle();
  let draftStyle: BatchQrStyle = cloneBatchStyle(savedStyle);
  let confirmed = false;
  let pendingConfirm: ((style: BatchQrStyle) => void | Promise<void>) | null = null;
  let activePreviewUrl = PREVIEW_SAMPLE_URL;
  let scanState: "checking" | "scans" | "wont" | "error" = "checking";
  let scanMessage = "";
  let verifyRunId = 0;
  let verifyTimer: ReturnType<typeof setTimeout> | null = null;

  const listeners = new Set<() => void>();
  const notify = () => {
    for (const fn of listeners) fn();
  };

  // ---------------- Dialog DOM ----------------
  const dlg = el("dialog", {
    id: "qr-batch-style-dialog",
    class: "qr-style-dialog",
    "aria-labelledby": "qr-batch-dlg-h",
  });

  const dlgTitle = el("h3", { id: "qr-batch-dlg-h", class: "qr-dlg-title" }, "Choose a style for your QR codes");
  const dlgLead = el(
    "p",
    { class: "qr-fine", style: "margin-top:0" },
    "Set the look once and it applies to every QR code in your ZIP download. Your choice stays active for this session and you can change it anytime.",
  );
  const btnCloseX = el("button", { type: "button", class: "qr-mini-btn", "aria-label": "Close style picker" }, "Close");
  const dlgHead = el("div", { class: "qr-dlg-head" }, dlgTitle, btnCloseX);

  // Live preview column
  const previewImg = el("img", { alt: "Sample preview of your batch QR style", class: "qr-dlg-img" });
  const previewBox = el("div", { class: "qr-preview-box qr-dlg-preview-box" }, previewImg);
  const previewBadge = el("div", { class: "qr-dlg-badge checking", role: "status", "aria-live": "polite" }, "Checking that it scans...");
  const previewDesc = el("p", { class: "qr-help", style: "margin:0" }, describeBatchStyle(draftStyle));
  const btnCopyFromMake = el("button", { type: "button", class: "qr-chip" }, "Use current Make a code look");
  const previewCol = el("div", { class: "qr-dlg-preview" }, previewBox, previewBadge, previewDesc, btnCopyFromMake);

  // Presets row
  const presetsRow = el("div", { class: "qr-presets", role: "group", "aria-label": "Batch style presets" });
  const presetButtons = new Map<PresetName, HTMLButtonElement>();
  for (const n of Object.keys(PRESETS) as PresetName[]) {
    const p = PRESETS[n];
    const swatch = el("span", { class: "qr-swatch", "aria-hidden": "true" });
    swatch.style.background = p.backgroundColor;
    swatch.style.borderColor = p.dotColor;
    const d1 = el("i");
    d1.style.background = p.dotColor;
    const d2 = el("i");
    d2.style.background = p.cornerColor;
    swatch.append(d1, d2);
    const btn = el("button", { type: "button", class: "qr-dlg-preset", "aria-pressed": "false", "data-batch-preset": n }, swatch, p.label);
    btn.addEventListener("click", () => {
      draftStyle = batchStyleFromPreset(n, draftStyle.image);
      syncControls();
      refreshPreview();
    });
    presetButtons.set(n, btn);
    presetsRow.append(btn);
  }

  function makeColorField(id: string, labelText: string, key: "dotColor" | "cornerColor" | "backgroundColor") {
    const input = el("input", { id, type: "color", value: draftStyle[key] });
    const code = el("code", {}, draftStyle[key]);
    input.addEventListener("input", () => {
      const v = input.value.toUpperCase();
      draftStyle = { ...draftStyle, [key]: v };
      code.textContent = v;
      syncPresetButtons();
      refreshPreview();
    });
    const wrap = el("div", { class: "qr-field" }, el("label", { for: id }, labelText), el("div", { class: "qr-color-row" }, input, code));
    return { wrap, input, code };
  }
  const cDot = makeColorField("qr-b-dot", "Dot color", "dotColor");
  const cCorner = makeColorField("qr-b-corner", "Corner color", "cornerColor");
  const cBg = makeColorField("qr-b-bg", "Background", "backgroundColor");
  const colorGrid = el("div", { class: "qr-grid2" }, cDot.wrap, cCorner.wrap, cBg.wrap);

  function makeSeg<T extends string>(
    name: string,
    legendText: string,
    options: { value: T; label: string }[],
    getVal: () => T,
    onPick: (v: T) => void,
  ) {
    const fs = el("fieldset", { class: "qr-seg" }, el("legend", {}, legendText));
    const row = el("div", { class: "qr-seg-row" });
    const items = new Map<T, { label: HTMLLabelElement; input: HTMLInputElement }>();
    for (const o of options) {
      const inp = el("input", { type: "radio", name, value: o.value });
      if (o.value === getVal()) inp.checked = true;
      const lbl = el("label", { class: `qr-seg-opt${o.value === getVal() ? " on" : ""}` }, inp, el("span", {}, o.label));
      inp.addEventListener("change", () => {
        if (!inp.checked) return;
        onPick(o.value);
        sync();
      });
      items.set(o.value, { label: lbl, input: inp });
      row.append(lbl);
    }
    fs.append(row);
    function sync() {
      const cur = getVal();
      for (const [v, item] of items) {
        item.input.checked = v === cur;
        item.label.classList.toggle("on", v === cur);
      }
    }
    return { fs, sync };
  }

  const segDot = makeSeg<"square" | "rounded" | "dot">(
    "qr-batch-dot-shape",
    "Dot shape",
    [
      { value: "square", label: "Square" },
      { value: "rounded", label: "Rounded" },
      { value: "dot", label: "Dots" },
    ],
    () => draftStyle.dotShape,
    (v) => {
      draftStyle = { ...draftStyle, dotShape: v };
      syncPresetButtons();
      refreshPreview();
    },
  );
  const segCorner = makeSeg<"square" | "rounded" | "circle">(
    "qr-batch-corner-style",
    "Corner style",
    [
      { value: "square", label: "Square" },
      { value: "rounded", label: "Rounded" },
      { value: "circle", label: "Circle" },
    ],
    () => draftStyle.cornerStyle,
    (v) => {
      draftStyle = { ...draftStyle, cornerStyle: v };
      syncPresetButtons();
      refreshPreview();
    },
  );

  const quietLabel = el("label", { for: "qr-b-quiet" }, `Quiet zone: ${draftStyle.quietZone} modules`);
  const quietInput = el("input", {
    id: "qr-b-quiet",
    type: "range",
    min: String(MIN_BATCH_QUIET_ZONE),
    max: String(MAX_BATCH_QUIET_ZONE),
    value: String(clampBatchQuietZone(draftStyle.quietZone)),
  });
  quietInput.addEventListener("input", () => {
    draftStyle = { ...draftStyle, quietZone: clampBatchQuietZone(Number(quietInput.value)) };
    quietLabel.textContent = `Quiet zone: ${draftStyle.quietZone} modules`;
    syncPresetButtons();
    refreshPreview();
  });
  const quietField = el(
    "div",
    { class: "qr-field" },
    quietLabel,
    quietInput,
    el("span", { class: "qr-help" }, `Empty margin (${MIN_BATCH_QUIET_ZONE} to ${MAX_BATCH_QUIET_ZONE}). Four is standard.`),
  );

  const eccSelect = el(
    "select",
    { id: "qr-b-ecc" },
    el("option", { value: "L" }, "Low (7%): smallest code"),
    el("option", { value: "M" }, "Medium (15%)"),
    el("option", { value: "Q" }, "Quartile (25%)"),
    el("option", { value: "H" }, "High (30%): survives wear"),
  );
  eccSelect.value = draftStyle.errorCorrection;
  eccSelect.addEventListener("change", () => {
    draftStyle = { ...draftStyle, errorCorrection: eccSelect.value as BatchQrStyle["errorCorrection"] };
    syncPresetButtons();
    refreshPreview();
  });
  const eccField = el("div", { class: "qr-field" }, el("label", { for: "qr-b-ecc" }, "Error correction"), eccSelect);
  const tuneGrid = el("div", { class: "qr-grid2" }, quietField, eccField);

  // Optional Picture controls (matching single Make QR)
  const segImage = makeSeg<"none" | "logo" | "blend">(
    "qr-batch-pic-mode",
    "Picture (optional)",
    [
      { value: "none", label: "None" },
      { value: "logo", label: "Logo in center" },
      { value: "blend", label: "Photo behind" },
    ],
    () => draftStyle.image.mode,
    (v) => {
      draftStyle = {
        ...draftStyle,
        image: { ...draftStyle.image, mode: v, src: v === draftStyle.image.mode ? draftStyle.image.src : undefined },
      };
      syncImageControls();
      refreshPreview();
    },
  );
  const imgFields = el("div", { class: "qr-fields qr-image-fields", hidden: "" });
  const imgFileLabel = el("label", { for: "qr-b-img" }, "Logo image");
  const imgFileInput = el("input", { id: "qr-b-img", type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" });
  const imgFileHelp = el("span", { class: "qr-help" }, "Resized in your browser and never uploaded.");
  imgFileInput.addEventListener("change", async () => {
    const file = imgFileInput.files?.[0];
    if (!file) return;
    try {
      const blend = draftStyle.image.mode === "blend";
      const src = await fileToDataUri(file, blend ? 600 : 256, blend ? "jpeg" : "png", blend ? 0.8 : 0.88);
      draftStyle = { ...draftStyle, image: { ...draftStyle.image, src } };
      syncImageControls();
      refreshPreview();
    } catch (e) {
      imgFileHelp.textContent = e instanceof Error ? e.message : "Could not read that image.";
    }
  });
  const imgFileField = el("div", { class: "qr-field" }, imgFileLabel, imgFileInput, imgFileHelp);

  const scaleLabel = el("label", { for: "qr-b-scale" }, `Logo size: ${Math.round(draftStyle.image.scale * 100)}%`);
  const scaleInput = el("input", { id: "qr-b-scale", type: "range", min: "10", max: "30", value: String(Math.round(draftStyle.image.scale * 100)) });
  scaleInput.addEventListener("input", () => {
    draftStyle = { ...draftStyle, image: { ...draftStyle.image, scale: Number(scaleInput.value) / 100 } };
    scaleLabel.textContent = `Logo size: ${Math.round(draftStyle.image.scale * 100)}%`;
    refreshPreview();
  });
  const scaleField = el("div", { class: "qr-field" }, scaleLabel, scaleInput);

  const veilLabel = el("label", { for: "qr-b-veil" }, `Lighten photo: ${Math.round(draftStyle.image.veil * 100)}%`);
  const veilInput = el("input", { id: "qr-b-veil", type: "range", min: "0", max: "90", value: String(Math.round(draftStyle.image.veil * 100)) });
  veilInput.addEventListener("input", () => {
    draftStyle = { ...draftStyle, image: { ...draftStyle.image, veil: Number(veilInput.value) / 100 } };
    veilLabel.textContent = `Lighten photo: ${Math.round(draftStyle.image.veil * 100)}%`;
    refreshPreview();
  });
  const veilField = el("div", { class: "qr-field" }, veilLabel, veilInput);
  imgFields.append(imgFileField, scaleField, veilField);

  const controlsCol = el("div", { class: "qr-dlg-controls" }, presetsRow, colorGrid, segDot.fs, segCorner.fs, tuneGrid, segImage.fs, imgFields);
  const dlgBody = el("div", { class: "qr-dlg-body" }, controlsCol, previewCol);

  const btnConfirm = el("button", { id: "qr-batch-style-apply", type: "button", class: "btn" }, "Apply style and download ZIP");
  const btnCancel = el("button", { type: "button", class: "btn ghost" }, "Cancel");
  const dlgDisabledReason = createDisabledReason("qr-batch-style-why-disabled");
  const dlgFoot = el("div", { class: "qr-dlg-foot" }, btnConfirm, btnCancel);

  dlg.append(dlgHead, dlgLead, dlgBody, dlgDisabledReason.el, dlgFoot);

  function syncPresetButtons() {
    const active = matchingPresetName(draftStyle);
    for (const [n, btn] of presetButtons) {
      const on = active === n;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", String(on));
    }
  }

  function syncImageControls() {
    segImage.sync();
    imgFields.hidden = draftStyle.image.mode === "none";
    imgFileLabel.textContent = draftStyle.image.mode === "logo" ? "Logo image" : "Photo";
    imgFileHelp.textContent = `Resized in your browser and never uploaded.${draftStyle.image.src ? " Picture loaded." : ""}`;
    scaleField.hidden = draftStyle.image.mode !== "logo";
    veilField.hidden = draftStyle.image.mode !== "blend";
    scaleInput.value = String(Math.round(draftStyle.image.scale * 100));
    scaleLabel.textContent = `Logo size: ${Math.round(draftStyle.image.scale * 100)}%`;
    veilInput.value = String(Math.round(draftStyle.image.veil * 100));
    veilLabel.textContent = `Lighten photo: ${Math.round(draftStyle.image.veil * 100)}%`;
  }

  function syncControls() {
    cDot.input.value = draftStyle.dotColor;
    cDot.code.textContent = draftStyle.dotColor;
    cCorner.input.value = draftStyle.cornerColor;
    cCorner.code.textContent = draftStyle.cornerColor;
    cBg.input.value = draftStyle.backgroundColor;
    cBg.code.textContent = draftStyle.backgroundColor;
    segDot.sync();
    segCorner.sync();
    quietInput.value = String(draftStyle.quietZone);
    quietLabel.textContent = `Quiet zone: ${draftStyle.quietZone} modules`;
    eccSelect.value = draftStyle.errorCorrection;
    syncPresetButtons();
    syncImageControls();
  }

  function updateConfirmState() {
    const missingImg = batchStyleMissingImageReason(draftStyle);
    if (missingImg) {
      btnConfirm.disabled = true;
      dlgDisabledReason.set(missingImg, "Choose image", () => focusField(imgFileInput));
      return;
    }
    if (scanState === "checking") {
      btnConfirm.disabled = true;
      dlgDisabledReason.set("Checking that this style scans...");
      return;
    }
    if (scanState === "wont") {
      btnConfirm.disabled = true;
      dlgDisabledReason.set("This style does not scan. Pick another preset or darken the dots.", "Go to dot color", () => focusField(cDot.input));
      return;
    }
    if (scanState === "error") {
      btnConfirm.disabled = true;
      dlgDisabledReason.set(scanMessage || "This style could not be checked.", "Go to dot color", () => focusField(cDot.input));
      return;
    }
    btnConfirm.disabled = false;
    dlgDisabledReason.clear();
  }

  function refreshPreview() {
    previewDesc.textContent = describeBatchStyle(draftStyle);
    const run = ++verifyRunId;
    if (verifyTimer) clearTimeout(verifyTimer);

    const missingImg = batchStyleMissingImageReason(draftStyle);
    if (missingImg) {
      try {
        const previewCfg = batchStyleToConfig(activePreviewUrl, draftStyle, { allowMissingImage: true });
        const svg = renderSvg(previewCfg);
        previewImg.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      } catch {
        previewImg.removeAttribute("src");
      }
      scanState = "error";
      scanMessage = missingImg;
      previewBadge.className = "qr-dlg-badge wont";
      previewBadge.replaceChildren(el("b", {}, "Picture needed."), ` ${missingImg}`);
      updateConfirmState();
      return;
    }

    let cfg;
    try {
      cfg = batchStyleToConfig(activePreviewUrl, draftStyle);
      const svg = renderSvg(cfg);
      previewImg.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch (e) {
      scanState = "error";
      scanMessage = e instanceof Error ? e.message : "Could not render this style.";
      previewBadge.className = "qr-dlg-badge wont";
      previewBadge.replaceChildren(el("b", {}, "Invalid style."), ` ${scanMessage}`);
      updateConfirmState();
      return;
    }

    scanState = "checking";
    scanMessage = "";
    previewBadge.className = "qr-dlg-badge checking";
    previewBadge.textContent = "Checking that it scans...";
    updateConfirmState();
    verifyTimer = setTimeout(async () => {
      try {
        const res = await verify(cfg, browserRasterizer);
        if (run !== verifyRunId) return;
        if (res.ok) {
          scanState = "scans";
          scanMessage = "";
          previewBadge.className = "qr-dlg-badge scans";
          previewBadge.replaceChildren(el("b", {}, "Scans."), " Preview reads cleanly.");
        } else {
          scanState = "wont";
          scanMessage = res.message;
          previewBadge.className = "qr-dlg-badge wont";
          previewBadge.replaceChildren(el("b", {}, "Won't scan."), ` ${res.message}`);
        }
      } catch {
        if (run !== verifyRunId) return;
        scanState = "error";
        scanMessage = "Could not verify that this style scans.";
        previewBadge.className = "qr-dlg-badge wont";
        previewBadge.textContent = scanMessage;
      }
      updateConfirmState();
    }, 120);
  }

  btnCopyFromMake.hidden = !getSingleStyle;
  btnCopyFromMake.addEventListener("click", async () => {
    if (!getSingleStyle) return;
    const copied = cloneBatchStyle(getSingleStyle());
    copied.quietZone = clampBatchQuietZone(copied.quietZone);
    if (copied.image.mode !== "none" && copied.image.src) {
      try {
        const blend = copied.image.mode === "blend";
        copied.image = {
          ...copied.image,
          src: await dataUriToSafeDataUri(copied.image.src, blend ? 600 : 256, blend ? "jpeg" : "png", blend ? 0.8 : 0.88),
        };
      } catch (e) {
        copied.image = { ...copied.image, src: undefined };
        imgFileHelp.textContent = e instanceof Error ? e.message : "Could not copy that picture safely.";
      }
    }
    draftStyle = copied;
    syncControls();
    refreshPreview();
  });

  function closeDialog() {
    pendingConfirm = null;
    if (dlg.open) dlg.close();
  }

  btnCloseX.addEventListener("click", closeDialog);
  btnCancel.addEventListener("click", closeDialog);
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) closeDialog();
  });

  btnConfirm.addEventListener("click", () => {
    if (btnConfirm.disabled || scanState !== "scans" || batchStyleMissingImageReason(draftStyle)) return;
    savedStyle = cloneBatchStyle(draftStyle);
    confirmed = true;
    const cb = pendingConfirm;
    closeDialog();
    notify();
    if (cb) void cb(cloneBatchStyle(savedStyle));
  });

  function openPicker(
    opts: {
      title?: string;
      confirmLabel?: string;
      sampleUrl?: string;
      onConfirm?: (style: BatchQrStyle) => void | Promise<void>;
    } = {},
  ) {
    draftStyle = cloneBatchStyle(savedStyle);
    draftStyle.quietZone = clampBatchQuietZone(draftStyle.quietZone);
    activePreviewUrl = opts.sampleUrl || PREVIEW_SAMPLE_URL;
    dlgTitle.textContent = opts.title || "Choose a style for your QR codes";
    btnConfirm.textContent = opts.confirmLabel || "Save style";
    pendingConfirm = opts.onConfirm ?? null;
    syncControls();
    refreshPreview();
    if (!dlg.open) dlg.showModal();
  }

  function requestZipDownload(
    count: number,
    onDownload: (style: BatchQrStyle) => void | Promise<void>,
    sampleUrl?: string,
  ) {
    if (confirmed) {
      void onDownload(cloneBatchStyle(savedStyle));
      return;
    }
    const label = count === 1 ? "1 QR code" : `all ${count} QR codes`;
    openPicker({
      title: `Set QR style for ${label}`,
      confirmLabel: "Apply style and download ZIP",
      sampleUrl,
      onConfirm: onDownload,
    });
  }

  function createSummaryBar(opts?: { idPrefix?: string }): HTMLElement {
    const descEl = el("span", { class: "qr-style-summary-text", ...(opts?.idPrefix ? { id: `${opts.idPrefix}-style-summary` } : {}) }, describeBatchStyle(savedStyle));
    const btnChange = el(
      "button",
      {
        type: "button",
        class: "qr-link-btn qr-change-style-btn",
        ...(opts?.idPrefix ? { id: `${opts.idPrefix}-change-style` } : {}),
      },
      "Change style",
    );
    btnChange.addEventListener("click", () => {
      openPicker({
        title: "Change style for ZIP QR codes",
        confirmLabel: "Save style",
      });
    });
    const update = () => {
      descEl.textContent = describeBatchStyle(savedStyle);
    };
    listeners.add(update);
    return el("div", { class: "qr-style-bar" }, descEl, btnChange);
  }

  return {
    dialog: dlg,
    getStyle: () => cloneBatchStyle(savedStyle),
    describe: () => describeBatchStyle(savedStyle),
    hasConfirmed: () => confirmed,
    onChange(cb) {
      listeners.add(cb);
    },
    createSummaryBar,
    requestZipDownload,
    openPicker,
  };
}
