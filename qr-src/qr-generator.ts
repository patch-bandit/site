import {
  CAMPAIGN_PRESETS,
  PRESETS,
  QR_TYPES,
  TYPE_META,
  applyCampaign,
  browserRasterizer,
  canDownload,
  checkBase,
  checkDestination,
  checkSlug,
  contentToForm,
  dataUriToSafeDataUri,
  effectiveEcc,
  emptyValues,
  fileToDataUri,
  formToContent,
  importTooLarge,
  normalizeOwnedBaseOnBlur,
  normalizeRawDomainUrl,
  parseConfig,
  printGuide,
  renderSvg,
  suggestSlug,
  vcardFile,
  vcardImportNotice,
  verify,
  type BatchQrStyle,
  type Config,
  type Field,
  type GuidedPlan,
  type PresetName,
  type QrType,
  type Values,
} from "./lib/index.ts";
import { copyToClipboard, createDisabledReason, downloadBlob, el, focusField, isLocalSaveEnabled, setLocalSaveEnabled } from "./ui-dom.ts";
import { createBatchStyleController } from "./ui-batch-style.ts";
import { createFreedomPanels } from "./ui-freedom.ts";
import { createGuidedStart } from "./ui-guided.ts";
import { createSnippetPanel } from "./ui-snippet.ts";

type StyleState = {
  dotColor: string;
  cornerColor: string;
  backgroundColor: string;
  dotShape: "square" | "rounded" | "dot";
  cornerStyle: "square" | "rounded" | "circle";
  quietZone: number;
  errorCorrection: "L" | "M" | "Q" | "H";
  size: number;
};

type ImageState = { mode: "none" | "logo" | "blend"; src?: string; scale: number; veil: number };

type Status =
  | { state: "invalid"; errors: string[] }
  | { state: "checking" }
  | { state: "scans"; modules: number }
  | { state: "wont"; message: string; modules: number };

type LinkOwnershipMode = "direct" | "owned";
type StudioTab = "make" | "redirects" | "snippet" | "escape";

function stylePreset(name: PresetName): Omit<StyleState, "size"> {
  const { label: _l, ...p } = PRESETS[name];
  return { ...p };
}

export function mountQrGenerator(root: HTMLElement) {
  if (root.dataset.qrMounted === "1") return;
  root.dataset.qrMounted = "1";

  let activeTab: StudioTab = "make";
  let type: QrType = "link";
  let linkMode: LinkOwnershipMode = "direct";
  let ownedBase = "https://yoursite.com/go/";
  let ownedSlug = "menu";
  let ownedLabel = "";
  let ownedDest = "https://yoursite.com/spring-menu";

  const valuesByType = Object.fromEntries(QR_TYPES.map((t) => [t, emptyValues(t)])) as Record<QrType, Values>;
  let style: StyleState = { ...stylePreset("classic"), size: 1024 };
  let image: ImageState = { mode: "none", scale: 0.22, veil: 0.3 };
  let svg: string | null = null;
  let status: Status = { state: "checking" };
  let notice = "";
  let busy = false;
  let config: Config | null = null;
  let runId = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  root.replaceChildren();

  // ---------------- Top Studio Switcher + Opt-in Local Save Bar ----------------
  const tabMake = el(
    "button",
    {
      id: "qr-tab-make",
      type: "button",
      role: "tab",
      "aria-selected": "true",
      "aria-controls": "qr-panel-make",
      class: "qr-tab on",
    },
    "Make a code",
  );
  const tabRedirectsCount = el("span", { class: "qr-tab-count", hidden: "" });
  const tabRedirects = el(
    "button",
    {
      id: "qr-tab-redirects",
      type: "button",
      role: "tab",
      "aria-selected": "false",
      "aria-controls": "qr-panel-redirects",
      class: "qr-tab",
    },
    "Redirect kit",
    tabRedirectsCount,
  );
  const tabSnippetCount = el("span", { class: "qr-tab-count", hidden: "" });
  const tabSnippet = el(
    "button",
    {
      id: "qr-tab-snippet",
      type: "button",
      role: "tab",
      "aria-selected": "false",
      "aria-controls": "qr-panel-snippet",
      class: "qr-tab",
    },
    "Bandit Codes snippet",
    tabSnippetCount,
  );
  const tabEscapeCount = el("span", { class: "qr-tab-count", hidden: "" });
  const tabEscape = el(
    "button",
    {
      id: "qr-tab-escape",
      type: "button",
      role: "tab",
      "aria-selected": "false",
      "aria-controls": "qr-panel-escape",
      class: "qr-tab",
    },
    "Lock-in check & escape plan",
    tabEscapeCount,
  );
  const tabBar = el(
    "div",
    { class: "qr-tabs", role: "tablist", "aria-label": "Bandit Codes studio modes" },
    tabMake,
    tabRedirects,
    tabSnippet,
    tabEscape,
  );

  // Opt-in browser storage control (STRICTLY OFF by default; writes no keys until checked)
  const saveCheck = el("input", { id: "qr-local-save", type: "checkbox" });
  saveCheck.checked = isLocalSaveEnabled();
  const btnForget = el("button", { type: "button", class: "qr-mini-btn", hidden: "" }, "Forget saved data");
  btnForget.hidden = !saveCheck.checked;
  const saveBar = el(
    "div",
    { class: "qr-save-bar" },
    el(
      "label",
      { class: "qr-save-toggle", for: "qr-local-save" },
      saveCheck,
      el("span", {}, "Remember my links, snippet, and escape plan in this browser (optional, off by default)"),
    ),
    btnForget,
  );

  // ---------------- Panel 1: Make a code (100% compatible with existing generator) ----------------
  const makePanel = el("div", {
    id: "qr-panel-make",
    role: "tabpanel",
    "aria-labelledby": "qr-tab-make",
    class: "qr-panel",
  });

  const layout = el("div", { class: "qr-layout" });

  // Step 1: Type & content
  const secType = el("section", { class: "card qr-area-type", "aria-labelledby": "qr-h-type" });
  secType.append(
    el("h3", { id: "qr-h-type", class: "qr-step-head" }, el("span", { class: "qr-step" }, "1"), " What should the code do?"),
  );
  const typeGroup = el("div", { class: "qr-types", role: "radiogroup", "aria-label": "Type of QR code" });
  const typeButtons = new Map<QrType, HTMLButtonElement>();
  for (const t of QR_TYPES) {
    const btn = el(
      "button",
      { type: "button", role: "radio", "aria-checked": String(t === type), class: `qr-type-btn${t === type ? " on" : ""}` },
      el("span", { class: "qr-type-name" }, TYPE_META[t].label),
      el("span", { class: "qr-type-blurb" }, TYPE_META[t].blurb),
    );
    btn.addEventListener("click", () => {
      if (type === t) return;
      type = t;
      syncTypeButtons();
      rebuildFields();
      scheduleVerify();
    });
    typeButtons.set(t, btn);
    typeGroup.append(btn);
  }

  // Ownership switch (Link type only)
  const linkModeBar = el("div", { class: "qr-own-switch" });
  const btnModeDirect = el("button", { type: "button", class: "qr-own-btn on", "aria-pressed": "true" }, "Direct link (static)");
  const btnModeOwned = el("button", { type: "button", class: "qr-own-btn", "aria-pressed": "false" }, "Owned short link (update later)");
  const linkModeNote = el("p", { class: "qr-help qr-own-note" });
  linkModeBar.append(el("div", { class: "qr-own-row", role: "group", "aria-label": "Link ownership mode" }, btnModeDirect, btnModeOwned), linkModeNote);

  const fieldsHost = el("div", { class: "qr-fields" });

  // Owned short link helper fields (shown only when type === 'link' && linkMode === 'owned')
  const ownedBox = el("div", { class: "qr-owned-box", hidden: "" });
  const ownBaseIn = el("input", { id: "qr-own-base", type: "url", value: ownedBase, placeholder: "https://yoursite.com/go/", autocomplete: "off" });
  const ownBaseHelp = el(
    "span",
    { class: "qr-help" },
    "Include a folder like /go/. Bare domains get https:// and a trailing slash added automatically when you leave this field.",
  );
  const ownSlugIn = el("input", { id: "qr-own-slug", type: "text", value: ownedSlug, placeholder: "menu", autocomplete: "off" });
  const ownDestIn = el("input", { id: "qr-own-dest", type: "url", value: ownedDest, placeholder: "https://yoursite.com/spring-menu", autocomplete: "off" });
  const ownDestHelp = el(
    "span",
    { class: "qr-help" },
    "Bare domains like yoursite.com/menu get https:// added automatically when you leave this field.",
  );
  const ownLabelIn = el("input", { id: "qr-own-label", type: "text", value: ownedLabel, placeholder: "e.g. Table tent", autocomplete: "off" });
  const ownSummaryEl = el("p", { class: "qr-final-url" });
  const btnSendToKit = el("button", { type: "button", class: "btn" }, "Add to Redirect kit & get rules");
  const ownSendMsg = el("span", { class: "qr-help", role: "status", "aria-live": "polite" });

  ownedBox.append(
    el(
      "div",
      { class: "qr-fields" },
      el("div", { class: "qr-field" }, el("label", { for: "qr-own-base" }, "Your domain prefix"), ownBaseIn, ownBaseHelp),
      el("div", { class: "qr-field" }, el("label", { for: "qr-own-slug" }, "Short name"), ownSlugIn, el("span", { class: "qr-help" }, "Letters, digits, hyphens, and underscores. Case is kept as typed.")),
      el("div", { class: "qr-field qr-span-full" }, el("label", { for: "qr-own-dest" }, "Destination page (update as long as you keep your domain)"), ownDestIn, ownDestHelp),
      el("div", { class: "qr-field qr-span-full" }, el("label", { for: "qr-own-label" }, "Printed piece label (optional)"), ownLabelIn),
    ),
    ownSummaryEl,
    el("div", { class: "qr-actions", style: "margin-top:0.85rem" }, btnSendToKit),
    ownSendMsg,
  );

  // Campaign tags details (link only)
  const campaignDetails = el("details", { class: "qr-campaign" });
  campaignDetails.append(
    el("summary", {}, "Add a label to tell your codes apart (optional)"),
    el("p", { class: "qr-fine" }, "Tags add standard labels to your destination address so your own visitor report can tell printed pieces apart. Bandit Codes counts nothing itself."),
  );
  const chipsRow = el("div", { class: "qr-chips", role: "group", "aria-label": "Where will this code go?" });
  for (const p of CAMPAIGN_PRESETS) {
    const chip = el("button", { type: "button", class: "qr-chip" }, p.label);
    chip.addEventListener("click", () => {
      valuesByType.link = { ...valuesByType.link, utmSource: p.source, utmMedium: p.medium };
      syncCampaignInputs();
      scheduleVerify();
    });
    chipsRow.append(chip);
  }
  const campaignFieldsHost = el("div", { class: "qr-fields" });
  const finalUrlEl = el("p", { class: "qr-final-url", hidden: "" });
  campaignDetails.append(chipsRow, campaignFieldsHost, finalUrlEl);
  secType.append(typeGroup, linkModeBar, fieldsHost, ownedBox, campaignDetails);

  // Step 4: Preview & download
  const secPreview = el("section", { class: "card qr-area-preview", "aria-labelledby": "qr-h-preview" });
  secPreview.append(
    el("h3", { id: "qr-h-preview", class: "qr-step-head" }, el("span", { class: "qr-step" }, "4"), " Check and download"),
  );
  const previewBox = el("div", { class: "qr-preview-box" });
  const previewImg = el("img", { alt: "Preview of your QR code", class: "qr-img", hidden: "" });
  const previewEmpty = el("p", { class: "qr-empty" }, "Drawing your code...");
  previewBox.append(previewImg, previewEmpty);

  const badgeEl = el("div", { role: "status", "aria-live": "polite", class: "qr-badge checking" }, "Checking that it scans...");
  const errorsList = el("ul", { class: "qr-errors", hidden: "" });
  const printMetaEl = el("p", { class: "qr-print-meta", hidden: "" });

  const btnPng = el("button", { type: "button", class: "btn qr-btn", disabled: "", "data-guide-target": "make-download-png" }, "Download PNG");
  const btnSvg = el("button", { type: "button", class: "btn alt qr-btn", disabled: "", "data-guide-target": "make-download-svg" }, "Download SVG");
  const btnVcf = el("button", { type: "button", class: "btn ghost qr-btn", hidden: "" }, "Download contact file (.vcf)");
  const actionsPrimary = el("div", { class: "qr-actions" }, btnPng, btnSvg, btnVcf);
  const makeDisabledReason = createDisabledReason("qr-make-why-disabled");

  const btnCopySvg = el("button", { type: "button", class: "qr-link-btn", disabled: "" }, "Copy SVG");
  const btnExport = el("button", { type: "button", class: "qr-link-btn", disabled: "" }, "Save settings (JSON)");
  const importInput = el("input", { type: "file", accept: "application/json,.json", class: "sr" });
  const importLabel = el("label", { class: "qr-link-btn" }, "Load settings", importInput);
  const actionsSmall = el("div", { class: "qr-actions small" }, btnCopySvg, btnExport, importLabel);

  const noticeEl = el("p", { class: "qr-notice", role: "alert", hidden: "" });
  const scanNote = el(
    "p",
    { class: "qr-fine" },
    "The check reads your code the way a phone camera app would, at a few sizes. Always test one printed copy with your phone before ordering a full run.",
  );
  secPreview.append(previewBox, badgeEl, errorsList, printMetaEl, actionsPrimary, makeDisabledReason.el, actionsSmall, noticeEl, scanNote);

  // Step 2: Design
  const secDesign = el("section", { class: "card qr-area-design", "aria-labelledby": "qr-h-design" });
  secDesign.append(
    el("h3", { id: "qr-h-design", class: "qr-step-head" }, el("span", { class: "qr-step" }, "2"), " Choose a look"),
  );
  const presetsRow = el("div", { class: "qr-presets", role: "group", "aria-label": "Style presets" });
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
    const btn = el("button", { type: "button", class: "qr-preset", "aria-pressed": "false" }, swatch, p.label);
    btn.addEventListener("click", () => {
      style = { ...style, ...stylePreset(n) };
      syncStyleControls();
      scheduleVerify();
    });
    presetButtons.set(n, btn);
    presetsRow.append(btn);
  }

  function makeColorField(id: string, labelText: string, key: "dotColor" | "cornerColor" | "backgroundColor") {
    const input = el("input", { id, type: "color", value: style[key] });
    const code = el("code", {}, style[key]);
    input.addEventListener("input", () => {
      const v = input.value.toUpperCase();
      style = { ...style, [key]: v };
      code.textContent = v;
      syncPresetButtons();
      scheduleVerify();
    });
    const wrap = el("div", { class: "qr-field" }, el("label", { for: id }, labelText), el("div", { class: "qr-color-row" }, input, code));
    return { wrap, input, code };
  }
  const cDot = makeColorField("qr-c-dot", "Dot color", "dotColor");
  const cCorner = makeColorField("qr-c-corner", "Corner color", "cornerColor");
  const cBg = makeColorField("qr-c-bg", "Background", "backgroundColor");
  const colorGrid = el("div", { class: "qr-grid2" }, cDot.wrap, cCorner.wrap, cBg.wrap);

  function makeSegmented<T extends string>(
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

  const segDot = makeSegmented<"square" | "rounded" | "dot">(
    "qr-dot-shape",
    "Dot shape",
    [
      { value: "square", label: "Square" },
      { value: "rounded", label: "Rounded" },
      { value: "dot", label: "Dots" },
    ],
    () => style.dotShape,
    (v) => {
      style = { ...style, dotShape: v };
      syncPresetButtons();
      scheduleVerify();
    },
  );
  const segCorner = makeSegmented<"square" | "rounded" | "circle">(
    "qr-corner-style",
    "Corner style",
    [
      { value: "square", label: "Square" },
      { value: "rounded", label: "Rounded" },
      { value: "circle", label: "Circle" },
    ],
    () => style.cornerStyle,
    (v) => {
      style = { ...style, cornerStyle: v };
      syncPresetButtons();
      scheduleVerify();
    },
  );

  const quietLabel = el("label", { for: "qr-quiet" }, `Quiet zone: ${style.quietZone} modules`);
  const quietInput = el("input", { id: "qr-quiet", type: "range", min: "0", max: "16", value: String(style.quietZone) });
  quietInput.addEventListener("input", () => {
    style = { ...style, quietZone: Number(quietInput.value) };
    quietLabel.textContent = `Quiet zone: ${style.quietZone} modules`;
    syncPresetButtons();
    scheduleVerify();
  });
  const quietField = el("div", { class: "qr-field" }, quietLabel, quietInput, el("span", { class: "qr-help" }, "The empty margin. Four is the standard."));

  const eccSelect = el(
    "select",
    { id: "qr-ecc" },
    el("option", { value: "L" }, "Low (7%): smallest code"),
    el("option", { value: "M" }, "Medium (15%)"),
    el("option", { value: "Q" }, "Quartile (25%)"),
    el("option", { value: "H" }, "High (30%): survives wear"),
  );
  eccSelect.value = style.errorCorrection;
  const eccHelp = el("span", { class: "qr-help" }, "More correction means a denser code.");
  eccSelect.addEventListener("change", () => {
    style = { ...style, errorCorrection: eccSelect.value as StyleState["errorCorrection"] };
    syncPresetButtons();
    scheduleVerify();
  });
  const eccField = el("div", { class: "qr-field" }, el("label", { for: "qr-ecc" }, "Error correction"), eccSelect, eccHelp);

  const sizeSelect = el("select", { id: "qr-size" });
  function rebuildSizeOptions() {
    sizeSelect.replaceChildren();
    const sizes = [...new Set([256, 512, 1024, 2048, 4096, style.size])].sort((a, b) => a - b);
    for (const s of sizes) sizeSelect.append(el("option", { value: String(s) }, `${s} x ${s} px`));
    sizeSelect.value = String(style.size);
  }
  rebuildSizeOptions();
  sizeSelect.addEventListener("change", () => {
    style = { ...style, size: Number(sizeSelect.value) };
    scheduleVerify();
  });
  const sizeField = el("div", { class: "qr-field" }, el("label", { for: "qr-size" }, "Download size"), sizeSelect, el("span", { class: "qr-help" }, "PNG only. SVG scales to any size."));

  const tuneGrid = el("div", { class: "qr-grid2" }, quietField, eccField, sizeField);
  secDesign.append(presetsRow, colorGrid, segDot.fs, segCorner.fs, tuneGrid);

  // Step 3: Picture
  const secImage = el("section", { class: "card qr-area-image", "aria-labelledby": "qr-h-image" });
  secImage.append(
    el("h3", { id: "qr-h-image", class: "qr-step-head" }, el("span", { class: "qr-step" }, "3"), " Add a picture ", el("span", { class: "qr-opt" }, "optional")),
  );
  const segImage = makeSegmented<"none" | "logo" | "blend">(
    "qr-pic-mode",
    "Picture",
    [
      { value: "none", label: "None" },
      { value: "logo", label: "Logo in the center" },
      { value: "blend", label: "Photo behind the code" },
    ],
    () => image.mode,
    (v) => {
      image = { ...image, mode: v, src: v === image.mode ? image.src : undefined };
      syncImageControls();
      scheduleVerify();
    },
  );
  const imageFieldsHost = el("div", { class: "qr-fields qr-image-fields", hidden: "" });
  const imgFileLabel = el("label", { for: "qr-img" }, "Logo image");
  const imgFileInput = el("input", { id: "qr-img", type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" });
  const imgFileHelp = el("span", { class: "qr-help" }, "The picture is resized and used right here. It is never uploaded.");
  imgFileInput.addEventListener("change", async () => {
    const file = imgFileInput.files?.[0];
    if (!file) return;
    setNotice("");
    try {
      const blend = image.mode === "blend";
      const src = await fileToDataUri(file, blend ? 1000 : 256, blend ? "jpeg" : "png");
      image = { ...image, src };
      syncImageControls();
      scheduleVerify();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not read that image.");
    }
  });
  const imgFileField = el("div", { class: "qr-field" }, imgFileLabel, imgFileInput, imgFileHelp);

  const scaleLabel = el("label", { for: "qr-scale" }, `Logo size: ${Math.round(image.scale * 100)}% of the code`);
  const scaleInput = el("input", { id: "qr-scale", type: "range", min: "10", max: "30", value: String(Math.round(image.scale * 100)) });
  scaleInput.addEventListener("input", () => {
    image = { ...image, scale: Number(scaleInput.value) / 100 };
    scaleLabel.textContent = `Logo size: ${Math.round(image.scale * 100)}% of the code`;
    scheduleVerify();
  });
  const scaleField = el("div", { class: "qr-field" }, scaleLabel, scaleInput);

  const veilLabel = el("label", { for: "qr-veil" }, `Lighten the photo: ${Math.round(image.veil * 100)}%`);
  const veilInput = el("input", { id: "qr-veil", type: "range", min: "0", max: "90", value: String(Math.round(image.veil * 100)) });
  veilInput.addEventListener("input", () => {
    image = { ...image, veil: Number(veilInput.value) / 100 };
    veilLabel.textContent = `Lighten the photo: ${Math.round(image.veil * 100)}%`;
    scheduleVerify();
  });
  const veilField = el(
    "div",
    { class: "qr-field" },
    veilLabel,
    veilInput,
    el("span", { class: "qr-help" }, "Light, even photos work best. A lighter wash and darker dots help it scan."),
  );

  imageFieldsHost.append(imgFileField, scaleField, veilField);
  secImage.append(segImage.fs, imageFieldsHost);

  layout.append(secType, secPreview, secDesign, secImage);
  makePanel.append(layout);

  // ---------------- Wire Freedom & Snippet Panels ----------------
  function openInGenerator(ownedUrl: string) {
    type = "link";
    linkMode = "direct";
    valuesByType.link = { ...valuesByType.link, url: ownedUrl };
    syncTypeButtons();
    rebuildFields();
    scheduleVerify();
    switchTab("make");
    root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const batchStyle = createBatchStyleController((): BatchQrStyle => ({
    dotColor: style.dotColor,
    cornerColor: style.cornerColor,
    backgroundColor: style.backgroundColor,
    dotShape: style.dotShape,
    cornerStyle: style.cornerStyle,
    quietZone: style.quietZone,
    errorCorrection: style.errorCorrection,
    image: { ...image },
  }));

  function applyGuidedHighlights(targets: string[]) {
    const wanted = new Set(targets);
    root.querySelectorAll<HTMLElement>("[data-guide-target]").forEach((node) => {
      const id = node.getAttribute("data-guide-target") ?? "";
      node.classList.toggle("qr-guided-focus", wanted.has(id));
    });
  }

  function switchTab(next: StudioTab) {
    activeTab = next;
    const tabs: [StudioTab, HTMLButtonElement, HTMLElement][] = [
      ["make", tabMake, makePanel],
      ["redirects", tabRedirects, freedom.redirectsPanel],
      ["snippet", tabSnippet, snippet.panel],
      ["escape", tabEscape, freedom.escapePanel],
    ];
    for (const [id, btn, panel] of tabs) {
      const on = id === next;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-selected", String(on));
      panel.hidden = !on;
    }
    guided.syncActiveTab(next);
  }

  const freedom = createFreedomPanels({
    openInGenerator,
    switchTab,
    batchStyle,
  });

  const snippet = createSnippetPanel({
    openInGenerator,
    getRedirectKitLinks: () => freedom.getKitLinks(),
    batchStyle,
  });

  const guided = createGuidedStart({
    onApplyPlan(plan: GuidedPlan) {
      freedom.setRuleFormat(plan.ruleFormat);
      snippet.setPageUrlPlaceholder(plan.snippetPlaceholder);
      switchTab(plan.initialTab);
      applyGuidedHighlights(plan.highlightTargets);
    },
    onResetPlan() {
      applyGuidedHighlights([]);
      snippet.setPageUrlPlaceholder("https://yoursite.com/qr-codes");
    },
    onSelectTab(tab) {
      switchTab(tab);
    },
  });

  function syncTabCounts() {
    const kc = freedom.getKitCount();
    tabRedirectsCount.textContent = String(kc);
    tabRedirectsCount.hidden = kc === 0;
    const sc = snippet.getActiveCount();
    tabSnippetCount.textContent = String(sc);
    tabSnippetCount.hidden = sc === 0;
    const ec = freedom.getEscapeCount();
    tabEscapeCount.textContent = String(ec);
    tabEscapeCount.hidden = ec === 0;
  }
  freedom.onCountsChange(syncTabCounts);
  snippet.onCountChange(syncTabCounts);
  syncTabCounts();

  tabMake.addEventListener("click", () => switchTab("make"));
  tabRedirects.addEventListener("click", () => switchTab("redirects"));
  tabSnippet.addEventListener("click", () => switchTab("snippet"));
  tabEscape.addEventListener("click", () => switchTab("escape"));

  saveCheck.addEventListener("change", () => {
    setLocalSaveEnabled(saveCheck.checked);
    btnForget.hidden = !saveCheck.checked;
    if (saveCheck.checked) {
      freedom.persistIfOptedIn();
      snippet.persistIfOptedIn();
    }
  });
  btnForget.addEventListener("click", () => {
    saveCheck.checked = false;
    setLocalSaveEnabled(false);
    btnForget.hidden = true;
  });

  root.append(guided.el, tabBar, makePanel, freedom.redirectsPanel, snippet.panel, freedom.escapePanel, saveBar, batchStyle.dialog);

  // ---------------- Campaign inputs ----------------
  const campaignInputs = new Map<string, HTMLInputElement>();
  for (const f of TYPE_META.link.fields.filter((x) => x.group === "campaign")) {
    const id = `qr-f-${f.key}`;
    const inp = el("input", { id, type: "text", placeholder: f.placeholder ?? "", autocomplete: "off" });
    inp.value = String(valuesByType.link[f.key] ?? "");
    inp.addEventListener("input", () => {
      valuesByType.link = { ...valuesByType.link, [f.key]: inp.value };
      scheduleVerify();
    });
    campaignInputs.set(f.key, inp);
    campaignFieldsHost.append(
      el("div", { class: "qr-field" }, el("label", { for: id }, f.label), inp, f.help ? el("span", { class: "qr-help" }, f.help) : null),
    );
  }

  function syncCampaignInputs() {
    for (const [k, inp] of campaignInputs) inp.value = String(valuesByType.link[k] ?? "");
  }

  // ---------------- Owned short link mode wiring ----------------
  function syncOwnedModeUi() {
    const isLink = type === "link";
    linkModeBar.hidden = !isLink;
    const isOwned = isLink && linkMode === "owned";
    btnModeDirect.classList.toggle("on", !isOwned);
    btnModeDirect.setAttribute("aria-pressed", String(!isOwned));
    btnModeOwned.classList.toggle("on", isOwned);
    btnModeOwned.setAttribute("aria-pressed", String(isOwned));
    fieldsHost.hidden = isOwned;
    ownedBox.hidden = !isOwned;
    linkModeNote.textContent = isOwned
      ? "The QR code prints your own short path (for example yoursite.com/go/menu). Update where it points on your host as long as you keep your domain."
      : "Direct static link: puts your final address straight into the code. Needs no server setup and stays valid while the target page exists; reprint to change the link.";

    if (isOwned) {
      const b = ownedBase.trim().endsWith("/") ? ownedBase.trim() : `${ownedBase.trim()}/`;
      const s = ownedSlug.trim();
      const shortUrl = `${b}${s}`;
      ownSummaryEl.replaceChildren(
        el("strong", {}, "Printed in QR code: "),
        el("span", { class: "mono" }, shortUrl),
      );
    }
  }

  btnModeDirect.addEventListener("click", () => {
    linkMode = "direct";
    syncOwnedModeUi();
    scheduleVerify();
  });
  btnModeOwned.addEventListener("click", () => {
    linkMode = "owned";
    syncOwnedModeUi();
    scheduleVerify();
  });

  ownBaseIn.addEventListener("input", () => {
    ownedBase = ownBaseIn.value.trim();
    ownBaseHelp.textContent =
      "Include a folder like /go/. Bare domains get https:// and a trailing slash added automatically when you leave this field.";
    syncOwnedModeUi();
    scheduleVerify();
  });
  ownBaseIn.addEventListener("blur", () => {
    const norm = normalizeOwnedBaseOnBlur(ownBaseIn.value);
    if (norm.addedHttps || norm.addedSlash) {
      ownedBase = norm.value;
      ownBaseIn.value = norm.value;
      const added = norm.addedHttps && norm.addedSlash ? "https:// and a trailing slash" : norm.addedHttps ? "https://" : "the trailing slash";
      ownBaseHelp.textContent = `Added ${added}: ${norm.value}`;
      syncOwnedModeUi();
      scheduleVerify();
    }
  });
  ownSlugIn.addEventListener("input", () => {
    ownedSlug = ownSlugIn.value.trim();
    syncOwnedModeUi();
    scheduleVerify();
  });
  ownDestIn.addEventListener("input", () => {
    ownedDest = ownDestIn.value.trim();
    ownDestHelp.textContent = "Bare domains like yoursite.com/menu get https:// added automatically when you leave this field.";
    scheduleVerify();
  });
  ownDestIn.addEventListener("blur", () => {
    const norm = normalizeRawDomainUrl(ownDestIn.value);
    if (norm.addedHttps) {
      ownedDest = norm.value;
      ownDestIn.value = norm.value;
      ownDestHelp.textContent = `Added https://: ${norm.value}`;
      scheduleVerify();
    }
  });
  ownLabelIn.addEventListener("input", () => {
    ownedLabel = ownLabelIn.value;
    if (!ownedSlug) {
      ownedSlug = suggestSlug(ownedLabel);
      ownSlugIn.value = ownedSlug;
    }
  });

  btnSendToKit.addEventListener("click", () => {
    ownSendMsg.textContent = "";
    const baseNorm = normalizeOwnedBaseOnBlur(ownedBase);
    if (baseNorm.addedHttps || baseNorm.addedSlash) {
      ownedBase = baseNorm.value;
      ownBaseIn.value = baseNorm.value;
      syncOwnedModeUi();
    }
    const baseChk = checkBase(ownedBase);
    if (!baseChk.ok) {
      ownSendMsg.textContent = baseChk.reason;
      return;
    }
    const slugChk = checkSlug(ownedSlug);
    if (!slugChk.ok) {
      ownSendMsg.textContent = slugChk.reason;
      return;
    }
    const destNorm = normalizeRawDomainUrl(ownedDest);
    if (destNorm.addedHttps) {
      ownedDest = destNorm.value;
      ownDestIn.value = destNorm.value;
    }
    const camp = {
      source: String(valuesByType.link.utmSource ?? "").trim(),
      medium: String(valuesByType.link.utmMedium ?? "").trim(),
      campaign: String(valuesByType.link.utmCampaign ?? "").trim(),
      content: String(valuesByType.link.utmContent ?? "").trim(),
    };
    const destChk = checkDestination(ownedDest, camp);
    if (!destChk.ok) {
      ownSendMsg.textContent = destChk.reason;
      return;
    }
    freedom.upsertRedirectLink(ownedBase, {
      slug: slugChk.slug,
      label: ownedLabel.trim() || slugChk.slug,
      destination: ownedDest,
      campaign: camp,
    });
    ownSendMsg.textContent = `Added /${slugChk.slug} to Redirect kit.`;
    switchTab("redirects");
  });

  // ---------------- Standard Type Fields ----------------
  function buildFieldNode(f: Field): HTMLElement {
    const id = `qr-f-${type}-${f.key}`;
    const cur = valuesByType[type][f.key];
    if (f.kind === "checkbox") {
      const inp = el("input", { id, type: "checkbox" });
      inp.checked = cur === true;
      inp.addEventListener("change", () => {
        valuesByType[type] = { ...valuesByType[type], [f.key]: inp.checked };
        updateFieldVisibility();
        scheduleVerify();
      });
      return el("div", { class: "qr-field check", "data-field-key": f.key }, inp, el("label", { for: id }, f.label));
    }
    const v = typeof cur === "string" ? cur : "";
    let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (f.kind === "textarea") {
      const ta = el("textarea", { id, rows: "3", placeholder: f.placeholder ?? "" });
      ta.value = v;
      ta.addEventListener("input", () => {
        valuesByType[type] = { ...valuesByType[type], [f.key]: ta.value };
        scheduleVerify();
      });
      control = ta;
    } else if (f.kind === "select") {
      const sel = el("select", { id });
      for (const o of f.options ?? []) sel.append(el("option", { value: o.value }, o.label));
      sel.value = v;
      sel.addEventListener("change", () => {
        valuesByType[type] = { ...valuesByType[type], [f.key]: sel.value };
        updateFieldVisibility();
        scheduleVerify();
      });
      control = sel;
    } else {
      const inputType = f.kind === "datetime" ? "datetime-local" : f.kind === "date" ? "date" : f.kind === "text" ? "text" : f.kind;
      const inp = el("input", { id, type: inputType, placeholder: f.placeholder ?? "", autocomplete: "off" });
      if (f.key === "latitude" || f.key === "longitude") inp.setAttribute("inputmode", "decimal");
      inp.value = v;
      inp.addEventListener("input", () => {
        valuesByType[type] = { ...valuesByType[type], [f.key]: inp.value };
        scheduleVerify();
      });
      if (f.kind === "url") {
        inp.addEventListener("blur", () => {
          const norm = normalizeRawDomainUrl(inp.value);
          if (norm.addedHttps) {
            inp.value = norm.value;
            valuesByType[type] = { ...valuesByType[type], [f.key]: norm.value };
            scheduleVerify();
          }
        });
      }
      control = inp;
    }
    return el(
      "div",
      { class: "qr-field", "data-field-key": f.key },
      el("label", { for: id }, f.label),
      control,
      f.help ? el("span", { class: "qr-help" }, f.help) : null,
    );
  }

  function rebuildFields() {
    fieldsHost.replaceChildren();
    const meta = TYPE_META[type];
    for (const f of meta.fields.filter((x) => x.group !== "campaign")) {
      fieldsHost.append(buildFieldNode(f));
    }
    campaignDetails.hidden = type !== "link";
    btnVcf.hidden = type !== "vcard";
    syncOwnedModeUi();
    updateFieldVisibility();
  }

  function updateFieldVisibility() {
    const vals = valuesByType[type];
    const meta = TYPE_META[type];
    for (const f of meta.fields.filter((x) => x.group !== "campaign")) {
      const node = fieldsHost.querySelector<HTMLElement>(`[data-field-key="${f.key}"]`);
      if (node) node.hidden = Boolean(f.showIf && !f.showIf(vals));
    }
  }

  function syncTypeButtons() {
    for (const [t, btn] of typeButtons) {
      btn.classList.toggle("on", t === type);
      btn.setAttribute("aria-checked", String(t === type));
    }
  }

  function syncPresetButtons() {
    const active = (Object.keys(PRESETS) as PresetName[]).find((n) => {
      const p = stylePreset(n);
      return (Object.keys(p) as (keyof typeof p)[]).every((k) => p[k] === style[k]);
    });
    for (const [n, btn] of presetButtons) {
      const on = active === n;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", String(on));
    }
  }

  function syncStyleControls() {
    cDot.input.value = style.dotColor;
    cDot.code.textContent = style.dotColor;
    cCorner.input.value = style.cornerColor;
    cCorner.code.textContent = style.cornerColor;
    cBg.input.value = style.backgroundColor;
    cBg.code.textContent = style.backgroundColor;
    segDot.sync();
    segCorner.sync();
    quietInput.value = String(style.quietZone);
    quietLabel.textContent = `Quiet zone: ${style.quietZone} modules`;
    eccSelect.value = style.errorCorrection;
    rebuildSizeOptions();
    syncPresetButtons();
  }

  function syncImageControls() {
    segImage.sync();
    imageFieldsHost.hidden = image.mode === "none";
    imgFileLabel.textContent = image.mode === "logo" ? "Logo image" : "Photo";
    imgFileHelp.textContent = `The picture is resized and used right here. It is never uploaded.${image.src ? " Picture loaded." : ""}`;
    scaleField.hidden = image.mode !== "logo";
    veilField.hidden = image.mode !== "blend";
    scaleInput.value = String(Math.round(image.scale * 100));
    scaleLabel.textContent = `Logo size: ${Math.round(image.scale * 100)}% of the code`;
    veilInput.value = String(Math.round(image.veil * 100));
    veilLabel.textContent = `Lighten the photo: ${Math.round(image.veil * 100)}%`;
    eccHelp.textContent =
      image.mode === "blend"
        ? "Image mode uses High."
        : image.mode === "logo"
          ? "A logo needs at least Quartile, so it is raised if needed."
          : "More correction means a denser code.";
  }

  function setNotice(msg: string) {
    notice = msg;
    noticeEl.textContent = notice;
    noticeEl.hidden = !notice;
  }

  function renderStatusUi() {
    if (svg) {
      previewImg.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      previewImg.hidden = false;
      previewEmpty.hidden = true;
    } else {
      previewImg.hidden = true;
      previewEmpty.hidden = false;
      previewEmpty.textContent = status.state === "invalid" ? "Fill in the form to see your code." : "Drawing your code...";
    }

    badgeEl.className = `qr-badge ${status.state}`;
    badgeEl.replaceChildren();
    errorsList.replaceChildren();
    errorsList.hidden = true;

    if (status.state === "scans") {
      badgeEl.append(el("b", {}, "Scans."), " We read it back here and got your content.");
      const guide = printGuide(status.modules, style.quietZone);
      const ecc = config ? effectiveEcc(config) : style.errorCorrection;
      printMetaEl.textContent = `${guide.modules} x ${guide.modules} grid (${guide.densityLabel}, ECC ${ecc}). Rule-of-thumb print width: ${guide.minCloseupIn} in (${guide.minCloseupMm} mm) close-up, ${guide.sign3ftIn} in (${guide.sign3ftMm} mm) at 3 ft.`;
      printMetaEl.hidden = false;
    } else if (status.state === "checking") {
      badgeEl.append("Checking that it scans...");
      printMetaEl.hidden = true;
    } else if (status.state === "wont") {
      badgeEl.append(el("b", {}, "Won't scan."), ` ${status.message}`);
      printMetaEl.hidden = true;
    } else {
      badgeEl.append(el("b", {}, "Almost there."), ` ${status.errors[0] ?? ""}`);
      if (status.errors.length > 1) {
        for (const e of status.errors.slice(1, 4)) errorsList.append(el("li", {}, e));
        errorsList.hidden = false;
      }
      printMetaEl.hidden = true;
    }

    const okDl = canDownload(svg, busy, status.state);
    btnPng.disabled = !okDl;
    btnSvg.disabled = !okDl;
    btnCopySvg.disabled = !okDl;
    btnPng.textContent = `Download PNG${status.state === "wont" ? " anyway" : ""}`;
    btnVcf.disabled = !config;
    btnExport.disabled = !config;

    if (busy) {
      makeDisabledReason.set("Preparing your download...");
    } else if (status.state === "checking") {
      makeDisabledReason.set("Checking that your code scans...");
    } else if (status.state === "invalid") {
      if (type === "link" && linkMode === "owned") {
        const bChk = checkBase(ownedBase);
        if (!bChk.ok) {
          const missingSlash = Boolean(ownedBase.trim()) && !ownedBase.trim().endsWith("/") && checkBase(`${ownedBase.trim()}/`).ok;
          makeDisabledReason.set(
            missingSlash ? "Add a slash at the end of your domain prefix in step 1." : `Fix your domain prefix in step 1: ${bChk.reason}`,
            "Go to step 1",
            () => focusField(ownBaseIn),
          );
        } else {
          makeDisabledReason.set(`Fix your short name in step 1: ${status.errors[0] ?? ""}`, "Go to step 1", () => focusField(ownSlugIn));
        }
      } else {
        const firstInput =
          fieldsHost.querySelector<HTMLElement>(".qr-field:not([hidden]) input, .qr-field:not([hidden]) textarea, .qr-field:not([hidden]) select") ??
          null;
        makeDisabledReason.set(
          status.errors[0] ? `Complete step 1 to unlock downloads: ${status.errors[0]}` : "Complete step 1 to unlock downloads.",
          "Go to step 1",
          () => focusField(firstInput),
        );
      }
    } else {
      makeDisabledReason.clear();
    }

    if (config && config.type === "link" && linkMode === "direct" && config.content.campaign) {
      const res = applyCampaign(config.content.url, config.content.campaign);
      finalUrlEl.replaceChildren(el("strong", {}, "Address in your code: "), el("span", { class: "mono" }, res.url));
      if (res.kept.length > 0) {
        finalUrlEl.append(el("span", { class: "qr-fine" }, ` Your address already had ${res.kept.join(", ")}, so we left those as they were.`));
      }
      finalUrlEl.hidden = false;
    } else if (type === "link" && linkMode === "owned") {
      const res = applyCampaign(ownedDest, {
        source: String(valuesByType.link.utmSource ?? "").trim(),
        medium: String(valuesByType.link.utmMedium ?? "").trim(),
        campaign: String(valuesByType.link.utmCampaign ?? "").trim(),
        content: String(valuesByType.link.utmContent ?? "").trim(),
      });
      finalUrlEl.replaceChildren(el("strong", {}, "Forwarding target (with tags): "), el("span", { class: "mono" }, res.url));
      finalUrlEl.hidden = false;
    } else {
      finalUrlEl.hidden = true;
    }
  }

  function scheduleVerify() {
    const id = ++runId;
    if (timer) clearTimeout(timer);

    let content: unknown;
    if (type === "link" && linkMode === "owned") {
      const baseChk = checkBase(ownedBase);
      const slugChk = checkSlug(ownedSlug);
      if (!baseChk.ok || !slugChk.ok) {
        config = null;
        svg = null;
        const errs: string[] = [];
        if (!baseChk.ok) errs.push(baseChk.reason);
        if (!slugChk.ok) errs.push(slugChk.reason);
        status = { state: "invalid", errors: errs };
        renderStatusUi();
        return;
      }
      content = { url: `${baseChk.origin}${baseChk.path}${slugChk.slug}` };
    } else {
      content = formToContent(type, valuesByType[type]);
    }

    const raw = {
      version: 1,
      type,
      content,
      style,
      image: image.mode === "none" ? { mode: "none" } : image,
      output: { format: "png" },
    };
    const parsed = parseConfig(raw);
    config = parsed.ok ? parsed.config : null;
    if (!parsed.ok) {
      svg = null;
      status = { state: "invalid", errors: parsed.errors };
      renderStatusUi();
      return;
    }
    status = { state: "checking" };
    renderStatusUi();
    timer = setTimeout(async () => {
      try {
        const out = renderSvg(parsed.config);
        const result = await verify(parsed.config, browserRasterizer);
        if (id !== runId) return;
        svg = out;
        status = result.ok
          ? { state: "scans", modules: result.modules }
          : { state: "wont", message: result.message, modules: result.modules };
        renderStatusUi();
      } catch (e) {
        if (id !== runId) return;
        const msg = e instanceof Error ? e.message : "Could not make this code.";
        svg = null;
        status = {
          state: "invalid",
          errors: [/too big|too long|amount of data/i.test(msg) ? "There is too much content for one QR code. Shorten it a little." : msg],
        };
        renderStatusUi();
      }
    }, 180);
  }

  async function download(kind: "png" | "svg") {
    if (!config || !svg) return;
    busy = true;
    renderStatusUi();
    try {
      const suffix = type === "link" && linkMode === "owned" && ownedSlug ? ownedSlug : type;
      const name = `bandit-codes-${suffix}`;
      if (kind === "svg") {
        downloadBlob(new Blob([renderSvg(config)], { type: "image/svg+xml" }), `${name}.svg`);
      } else {
        const png = await browserRasterizer.toPng(renderSvg(config), config.style.size);
        downloadBlob(new Blob([png as BlobPart], { type: "image/png" }), `${name}.png`);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "The download did not work.");
    } finally {
      busy = false;
      renderStatusUi();
    }
  }

  btnPng.addEventListener("click", () => download("png"));
  btnSvg.addEventListener("click", () => download("svg"));
  btnCopySvg.addEventListener("click", async () => {
    if (!config) return;
    const ok = await copyToClipboard(renderSvg(config));
    setNotice(ok ? "SVG copied to your clipboard." : "Copy was blocked by the browser. Use Download SVG instead.");
  });
  btnVcf.addEventListener("click", () => {
    const f = config ? vcardFile(config) : null;
    if (f) downloadBlob(new Blob([f.text], { type: f.mime }), f.name);
  });
  btnExport.addEventListener("click", () => {
    if (!config) return;
    const { $schema: _s, ...rest } = config;
    downloadBlob(new Blob([JSON.stringify(rest, null, 2) + "\n"], { type: "application/json" }), "bandit-codes-config.json");
  });
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    setNotice("");
    try {
      if (importTooLarge(file.size)) {
        setNotice("That settings file is too large to be a Bandit Codes config.");
        return;
      }
      const rawImported = JSON.parse(await file.text()) as Record<string, unknown>;
      if (rawImported && typeof rawImported === "object" && !Array.isArray(rawImported) && rawImported.content && typeof rawImported.content === "object") {
        const contentObj = rawImported.content as Record<string, unknown>;
        if ((rawImported.type === "link" || rawImported.type === "vcard") && typeof contentObj.url === "string") {
          contentObj.url = normalizeRawDomainUrl(contentObj.url).value;
        }
      }
      const res = parseConfig(rawImported);
      if (!res.ok) {
        setNotice(`That file is not a Bandit Codes config. ${res.errors.slice(0, 3).join(" ")}`);
        return;
      }
      const c = res.config;
      let safeImageSrc: string | undefined = undefined;
      if (c.image.mode !== "none" && c.image.src) {
        const blend = c.image.mode === "blend";
        try {
          safeImageSrc = await dataUriToSafeDataUri(c.image.src, blend ? 1000 : 256, blend ? "jpeg" : "png");
        } catch (imgErr) {
          setNotice(imgErr instanceof Error ? imgErr.message : "The image inside that settings file could not be safely loaded.");
          return;
        }
      }
      const warn = vcardImportNotice(c);
      if (warn) setNotice(warn);
      type = c.type;
      linkMode = "direct";
      valuesByType[c.type] = contentToForm(c.type, c.content as Record<string, unknown>);
      style = {
        dotColor: c.style.dotColor,
        cornerColor: c.style.cornerColor ?? c.style.dotColor,
        backgroundColor: c.style.backgroundColor,
        dotShape: c.style.dotShape,
        cornerStyle: c.style.cornerStyle,
        quietZone: c.style.quietZone,
        errorCorrection: c.style.errorCorrection,
        size: c.style.size,
      };
      image = { mode: c.image.mode, src: safeImageSrc, scale: c.image.scale, veil: c.image.veil };
      syncTypeButtons();
      rebuildFields();
      syncCampaignInputs();
      syncStyleControls();
      syncImageControls();
      scheduleVerify();
    } catch {
      setNotice("That file could not be read as JSON.");
    } finally {
      importInput.value = "";
    }
  });

  // Initial mount
  syncTypeButtons();
  rebuildFields();
  syncStyleControls();
  syncImageControls();
  scheduleVerify();
}

if (typeof document !== "undefined") {
  const boot = () => {
    document.querySelectorAll<HTMLElement>("[data-qr-app]").forEach((node) => mountQrGenerator(node));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
