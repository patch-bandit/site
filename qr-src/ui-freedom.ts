import {
  MAX_FILE_BYTES,
  RULE_FORMATS,
  browserRasterizer,
  buildZip,
  checkBase,
  checkBatchZipSize,
  checkDestination,
  checkSlug,
  classifyQrPayload,
  cleanManifestCell,
  decodeQrFromImageFile,
  escapeSummary,
  escapeToLinks,
  makeItemId,
  normalizeOwnedBaseOnBlur,
  normalizeRawDomainUrl,
  parseBulkEscapePaste,
  parseEscapeCsv,
  parseEscapeJson,
  parseLinksCsv,
  parseLinksFile,
  parseOwnedDomainsDetailed,
  parseTwoColumnLinks,
  renderBatchQrSvg,
  ruleNotes,
  sortEscapeItems,
  suggestSlug,
  verifyBatchQrCodes,
  writeEscapeCsv,
  writeEscapeJson,
  writeHtmlFiles,
  writeLinksCsv,
  writeLinksJson,
  writeReprintCsv,
  writeRules,
  type BatchQrStyle,
  type EscapeItem,
  type EscapePlan,
  type EscapePriority,
  type EscapeStatus,
  type LinkRow,
  type LinksFile,
  type RuleFormat,
} from "./lib/index.ts";
import {
  STORAGE_ESCAPE_KEY,
  STORAGE_KIT_KEY,
  copyToClipboard,
  createDisabledReason,
  downloadBlob,
  el,
  focusField,
  readOptInJson,
  writeOptInJson,
} from "./ui-dom.ts";
import type { BatchStyleController } from "./ui-batch-style.ts";

export interface FreedomBridge {
  openInGenerator: (ownedUrl: string, label?: string) => void;
  switchTab: (tab: "make" | "redirects" | "snippet" | "escape") => void;
  batchStyle: BatchStyleController;
}

export interface FreedomController {
  redirectsPanel: HTMLElement;
  escapePanel: HTMLElement;
  upsertRedirectLink: (base: string, row: LinkRow) => void;
  setRuleFormat: (fmt: RuleFormat) => void;
  getKitLinks: () => LinkRow[];
  persistIfOptedIn: () => void;
  getKitCount: () => number;
  getEscapeCount: () => number;
  onCountsChange: (cb: () => void) => void;
}

const SAMPLE_LINKS: LinksFile = {
  format: "bandit-codes-links",
  version: 1,
  base: "https://yoursite.com/go/",
  links: [
    {
      slug: "menu",
      label: "Table tent menu",
      destination: "https://yoursite.com/spring-menu",
      campaign: { source: "table-tent", medium: "print", campaign: "spring", content: "" },
    },
    {
      slug: "pamphlet",
      label: "Third-party PDF pamphlet",
      destination: "https://partner.example/files/pamphlet-a1.pdf",
      campaign: { source: "", medium: "", campaign: "", content: "" },
    },
    {
      slug: "reviews",
      label: "Counter review card",
      destination: "https://yoursite.com/reviews",
      campaign: { source: "counter-card", medium: "print", campaign: "", content: "" },
    },
  ],
};

const SAMPLE_ESCAPE: EscapePlan = {
  format: "bandit-codes-escape-plan",
  version: 1,
  ownedBase: "https://yoursite.com/go/",
  ownedDomains: "yoursite.com",
  items: [
    {
      id: "sample-1",
      piece: "Laminated table menus (200 copies)",
      currentUrl: "https://vendor-qr.example/q/a8k2m",
      landingUrl: "https://yoursite.com/menu",
      newSlug: "menu",
      priority: "high",
      status: "repointed",
      stickerOver: false,
      notes: "Vendor link re-pointed to owned link. Reprint before canceling your old plan.",
    },
    {
      id: "sample-2",
      piece: "Delivery van side magnet",
      currentUrl: "https://vendor-qr.example/q/v92xp",
      landingUrl: "https://yoursite.com/book",
      newSlug: "van",
      priority: "medium",
      status: "mapped",
      stickerOver: true,
      notes: "Can cover with a weatherproof QR sticker.",
    },
    {
      id: "sample-3",
      piece: "Old seasonal flyer",
      currentUrl: "https://vendor-qr.example/q/b14tz",
      landingUrl: "https://yoursite.com/spring-offer",
      newSlug: "spring-offer",
      priority: "low",
      status: "retire",
      stickerOver: false,
      notes: "Low-value piece; let it lapse when the old plan ends.",
    },
  ],
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function isMissingTrailingSlash(raw: string): boolean {
  const t = raw.trim();
  return Boolean(t) && !t.endsWith("/") && checkBase(`${t}/`).ok;
}

export function createFreedomPanels(bridge: FreedomBridge): FreedomController {
  let countCb: (() => void) | null = null;
  const notifyCounts = () => countCb?.();

  // ---------------- State (reads opt-in storage only if visitor already enabled it) ----------------
  const savedKit = readOptInJson<LinksFile>(STORAGE_KIT_KEY);
  const parsedSavedKit = savedKit ? parseLinksFile(savedKit) : null;
  let kitBase = parsedSavedKit?.ok ? parsedSavedKit.file.base : "https://yoursite.com/go/";
  let kitLinks: LinkRow[] = parsedSavedKit?.ok ? parsedSavedKit.file.links : [];
  let activeFormat: RuleFormat = "netlify";
  let editingSlug: string | null = null;
  let kitZipBusy = false;
  let escZipBusy = false;

  const savedEsc = readOptInJson<EscapePlan>(STORAGE_ESCAPE_KEY);
  const parsedSavedEsc = savedEsc ? parseEscapeJson(savedEsc) : null;
  let escapePlan: EscapePlan = parsedSavedEsc?.ok
    ? parsedSavedEsc.plan
    : {
        format: "bandit-codes-escape-plan",
        version: 1,
        ownedBase: kitBase,
        ownedDomains: "",
        items: [],
      };

  let escSortByPriority = false;
  let escOnlyRemaining = false;

  function persistIfOptedIn() {
    writeOptInJson(STORAGE_KIT_KEY, {
      format: "bandit-codes-links",
      version: 1,
      base: kitBase,
      links: kitLinks,
    } satisfies LinksFile);
    writeOptInJson(STORAGE_ESCAPE_KEY, escapePlan);
  }

  // =========================================================================
  // PANEL 2: REDIRECT KIT ("Never again")
  // =========================================================================
  const redirectsPanel = el("div", {
    id: "qr-panel-redirects",
    role: "tabpanel",
    "aria-labelledby": "qr-tab-redirects",
    class: "qr-panel",
    hidden: "",
  });

  const kitIntroCard = el("section", { class: "card qr-kit-card", "aria-labelledby": "kit-base-h" });
  kitIntroCard.append(
    el("h3", { id: "kit-base-h", class: "qr-step-head" }, el("span", { class: "qr-step" }, "1"), " Your own domain prefix"),
    el(
      "p",
      { class: "qr-fine" },
      "Every code prints a short path on a domain you own, such as /go/menu. Pointing at a PDF someone else updates? Your address forwards visitors straight to the current file with no extra page in between; edit one line when the file changes and every printed copy follows. Have a long list of codes? Import a spreadsheet (CSV) or paste two columns below.",
    ),
  );

  const kitBaseInput = el("input", {
    id: "kit-base-input",
    type: "url",
    value: kitBase,
    placeholder: "https://yoursite.com/go/",
    autocomplete: "off",
  });
  const kitBaseStatus = el(
    "span",
    { class: "qr-help" },
    "Include a folder like /go/. Bare domains get https:// and a trailing slash added automatically when you leave this field.",
  );
  let kitBaseAutoNote = "";
  const btnLoadKitSample = el("button", { id: "kit-load-sample", type: "button", class: "qr-chip" }, "Load 3 sample links");
  const kitBaseRow = el(
    "div",
    { class: "qr-inline-bar" },
    el("div", { class: "qr-field qr-grow" }, el("label", { for: "kit-base-input" }, "Owned base address"), kitBaseInput, kitBaseStatus),
    btnLoadKitSample,
  );
  kitIntroCard.append(kitBaseRow);

  // Add / edit link form
  const kitFormCard = el("section", { class: "card qr-kit-card", "aria-labelledby": "kit-add-h" });
  const kitFormHeading = el("h3", { id: "kit-add-h", class: "qr-step-head" }, el("span", { class: "qr-step" }, "2"), " Add or edit an owned link");

  const inLabel = el("input", { id: "kit-label", type: "text", placeholder: "Table tent menu", autocomplete: "off" });
  const inSlug = el("input", { id: "kit-slug", type: "text", placeholder: "menu", autocomplete: "off" });
  const inDest = el("input", { id: "kit-dest", type: "url", placeholder: "https://yoursite.com/spring-menu", autocomplete: "off" });
  const inDestHelp = el(
    "span",
    { class: "qr-help" },
    "Bare domains like yoursite.com/menu get https:// added automatically when you leave this field.",
  );
  inDest.addEventListener("input", () => {
    inDestHelp.textContent = "Bare domains like yoursite.com/menu get https:// added automatically when you leave this field.";
  });
  inDest.addEventListener("blur", () => {
    const norm = normalizeRawDomainUrl(inDest.value);
    if (norm.addedHttps) {
      inDest.value = norm.value;
      inDestHelp.textContent = `Added https://: ${norm.value}`;
    }
  });
  const inUtmSrc = el("input", { id: "kit-utm-src", type: "text", placeholder: "flyer (optional)", autocomplete: "off" });
  const inUtmMed = el("input", { id: "kit-utm-med", type: "text", placeholder: "print (optional)", autocomplete: "off" });
  const inUtmCamp = el("input", { id: "kit-utm-camp", type: "text", placeholder: "spring-sale (optional)", autocomplete: "off" });

  let slugTouched = false;
  inLabel.addEventListener("input", () => {
    if (!slugTouched && !editingSlug) inSlug.value = suggestSlug(inLabel.value);
  });
  inSlug.addEventListener("input", () => {
    slugTouched = inSlug.value.trim().length > 0;
  });

  const btnSaveLink = el("button", { type: "button", class: "btn" }, "Add link to kit");
  const btnCancelEdit = el("button", { type: "button", class: "btn ghost", hidden: "" }, "Cancel edit");
  const kitFormMsg = el("p", { class: "qr-notice", role: "alert", hidden: "" });

  const kitFormFields = el(
    "div",
    { class: "qr-fields" },
    el("div", { class: "qr-field" }, el("label", { for: "kit-label" }, "Printed piece label"), inLabel),
    el(
      "div",
      { class: "qr-field" },
      el("label", { for: "kit-slug" }, "Short name"),
      inSlug,
      el("span", { class: "qr-help" }, "Letters (A-Z, a-z), digits, hyphens, and underscores. Case is kept as typed."),
    ),
    el("div", { class: "qr-field qr-span-full" }, el("label", { for: "kit-dest" }, "Destination page address"), inDest, inDestHelp),
    el(
      "p",
      { class: "qr-help qr-span-full", style: "margin:0" },
      "Optional campaign tags: tags that show in your site's visitor report as where the scan came from.",
    ),
    el("div", { class: "qr-field" }, el("label", { for: "kit-utm-src" }, "Campaign source (optional)"), inUtmSrc),
    el("div", { class: "qr-field" }, el("label", { for: "kit-utm-med" }, "Campaign medium (optional)"), inUtmMed),
    el("div", { class: "qr-field qr-span-full" }, el("label", { for: "kit-utm-camp" }, "Campaign name (optional)"), inUtmCamp),
  );
  const kitFormActions = el("div", { class: "qr-actions", style: "margin-top:1rem" }, btnSaveLink, btnCancelEdit);

  // Bulk two-column paste details for Redirect Kit
  const kitBulkDetails = el("details", { class: "qr-campaign" });
  const kitBulkArea = el("textarea", {
    id: "kit-bulk-in",
    rows: "4",
    placeholder: "menu, https://yoursite.com/spring-menu\npamphlet, https://partner.example/pamphlet-a1.pdf",
  });
  const btnKitBulkAdd = el("button", { type: "button", class: "btn alt" }, "Add pasted links");
  const kitBulkMsg = el("span", { class: "qr-help", role: "status", "aria-live": "polite" });
  kitBulkDetails.append(
    el("summary", {}, "Bulk paste a list (2 columns: name, destination address)"),
    el("p", { class: "qr-fine" }, "Paste rows straight from a spreadsheet (comma or tab separated). Duplicate short names are numbered automatically."),
    el("div", { class: "qr-field" }, el("label", { for: "kit-bulk-in" }, "Bulk list"), kitBulkArea),
    el("div", { class: "qr-actions", style: "margin-top:0.7rem" }, btnKitBulkAdd, kitBulkMsg),
  );

  kitFormCard.append(kitFormHeading, kitFormFields, kitFormActions, kitFormMsg, kitBulkDetails);

  // Links list table card
  const kitListCard = el("section", { class: "card qr-kit-card", "aria-labelledby": "kit-list-h" });
  const kitListHead = el("h3", { id: "kit-list-h", class: "qr-step-head" }, el("span", { class: "qr-step" }, "3"), " Your owned links");
  const kitTableWrap = el("div", { class: "qr-table-wrap" });
  const kitTableBody = el("tbody");
  const kitTable = el(
    "table",
    { class: "qr-table" },
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", { scope: "col" }, "Owned QR address"),
        el("th", { scope: "col" }, "Forwards to"),
        el("th", { scope: "col" }, "Piece"),
        el("th", { scope: "col" }, "Actions"),
      ),
    ),
    kitTableBody,
  );
  const kitEmptyMsg = el(
    "p",
    { class: "qr-fine" },
    "No links in your kit yet. Add one above, paste a spreadsheet list, send one from the generator, or click Load 3 sample links.",
  );
  kitTableWrap.append(kitTable);

  // Main ZIP action + shared batch style summary + quieter side exports
  const btnKitBatchZip = el(
    "button",
    { id: "kit-batch-zip", type: "button", class: "btn", "data-guide-target": "kit-batch-zip" },
    "Download all QR codes (SVG ZIP)",
  );
  const kitStyleBar = bridge.batchStyle.createSummaryBar({ idPrefix: "kit" });
  const kitPrimaryRow = el("div", { class: "qr-actions", style: "margin-top:0.85rem" }, btnKitBatchZip, kitStyleBar);

  const btnKitCsvOut = el("button", { id: "kit-export-csv", type: "button", class: "qr-link-btn" }, "Export list (CSV)");
  const btnKitJsonOut = el("button", { id: "kit-export-json", type: "button", class: "qr-link-btn" }, "Export backup (JSON)");
  const kitImportInput = el("input", { type: "file", accept: ".json,.csv,application/json,text/csv", class: "sr" });
  const kitImportLabel = el("label", { class: "qr-link-btn" }, "Import CSV or JSON", kitImportInput);
  const kitTransferRow = el("div", { class: "qr-actions small" }, btnKitCsvOut, btnKitJsonOut, kitImportLabel);
  const kitListDisabledReason = createDisabledReason("kit-list-why-disabled");
  const kitTransferMsg = el("p", { class: "qr-help", role: "status", "aria-live": "polite" });
  kitListCard.append(kitListHead, kitEmptyMsg, kitTableWrap, kitPrimaryRow, kitTransferRow, kitListDisabledReason.el, kitTransferMsg);

  // Rule exporter card
  const kitExportCard = el("section", { class: "card qr-kit-card", "aria-labelledby": "kit-export-h" });
  kitExportCard.append(
    el("h3", { id: "kit-export-h", class: "qr-step-head" }, el("span", { class: "qr-step" }, "4"), " Download or copy forwarding rules"),
    el(
      "p",
      { class: "qr-fine" },
      "Pick where your website is hosted. Every rule uses a temporary redirect on purpose, so phones and browsers check for your latest link instead of permanently memorizing the first page you set. Rules keep the exact capitalization you typed (most hosts such as Apache, nginx, Vercel, and Linux static sites treat paths as case-sensitive). Server forwarding rules are the first choice when your host allows them; if you use a site builder without server redirects, use the Bandit Codes snippet tab instead.",
    ),
  );

  const fmtSelect = el("select", { id: "kit-fmt-select" });
  for (const f of RULE_FORMATS) fmtSelect.append(el("option", { value: f.id }, `${f.label} (${f.where})`));
  fmtSelect.value = activeFormat;
  const fmtField = el("div", { class: "qr-field" }, el("label", { for: "kit-fmt-select" }, "Host or server format"), fmtSelect);

  const btnCopyRules = el("button", { id: "kit-copy-rules", type: "button", class: "btn", "data-guide-target": "kit-copy-rules" }, "Copy rules");
  const btnDownloadRules = el(
    "button",
    { id: "kit-download-rules", type: "button", class: "btn alt", "data-guide-target": "kit-download-rules" },
    "Download file",
  );
  const rulesCopyStatus = el("span", { class: "qr-help", role: "status", "aria-live": "polite" });
  const rulesActions = el("div", { class: "qr-actions", style: "margin-top:0.85rem" }, btnCopyRules, btnDownloadRules);
  const kitRulesDisabledReason = createDisabledReason("kit-rules-why-disabled");

  // Multi-link Static HTML per-file download area (never concatenate multiple HTML docs into one index.html)
  const htmlMultiBox = el("div", { class: "qr-html-multi", hidden: "" });

  const rulesCodePre = el("pre", { class: "qr-code-out" });
  const rulesNotesList = el("ul", { class: "qr-errors", hidden: "" });
  const rulesStepsList = el("ol", { class: "qr-steps-list" });
  const rulesDevDetails = el("details", { class: "qr-campaign" });
  const rulesDevText = el("p", { class: "qr-fine" });
  rulesDevDetails.append(el("summary", {}, "Note for your developer"), rulesDevText);

  kitExportCard.append(
    fmtField,
    rulesActions,
    kitRulesDisabledReason.el,
    rulesCopyStatus,
    htmlMultiBox,
    rulesCodePre,
    rulesNotesList,
    rulesStepsList,
    rulesDevDetails,
  );

  redirectsPanel.append(kitIntroCard, kitFormCard, kitListCard, kitExportCard);

  function setKitFormMsg(msg: string) {
    kitFormMsg.textContent = msg;
    kitFormMsg.hidden = !msg;
  }

  function clearKitForm() {
    editingSlug = null;
    slugTouched = false;
    inLabel.value = "";
    inSlug.value = "";
    inDest.value = "";
    inUtmSrc.value = "";
    inUtmMed.value = "";
    inUtmCamp.value = "";
    btnSaveLink.textContent = "Add link to kit";
    btnCancelEdit.hidden = true;
    setKitFormMsg("");
  }

  function currentLinksFile(): LinksFile {
    return { format: "bandit-codes-links", version: 1, base: kitBase.trim(), links: kitLinks };
  }

  function renderRedirectKit() {
    kitBaseInput.value = kitBase;
    fmtSelect.value = activeFormat;
    const baseChk = checkBase(kitBase.trim());
    if (baseChk.ok) {
      kitBaseStatus.textContent = kitBaseAutoNote
        ? `${kitBaseAutoNote} Codes will print as ${baseChk.origin}${baseChk.path}<short-name>`
        : `Codes will print as ${baseChk.origin}${baseChk.path}<short-name> (bare domains get https:// and a trailing slash added when you leave this field).`;
    } else if (isMissingTrailingSlash(kitBase)) {
      kitBaseStatus.textContent = "Add a slash at the end (or leave this field and Bandit Codes will add it for you).";
    } else if (normalizeOwnedBaseOnBlur(kitBase).addedHttps) {
      kitBaseStatus.textContent = "Leave this field and Bandit Codes will add https:// automatically.";
    } else {
      kitBaseStatus.textContent = baseChk.reason;
    }

    kitTableBody.replaceChildren();
    kitEmptyMsg.hidden = kitLinks.length > 0;
    kitTableWrap.hidden = kitLinks.length === 0;

    const cleanBase = kitBase.trim().endsWith("/") ? kitBase.trim() : `${kitBase.trim()}/`;
    for (const row of kitLinks) {
      const fullOwned = `${cleanBase}${row.slug}`;
      const btnQr = el("button", { type: "button", class: "qr-mini-btn accent" }, "Make QR");
      btnQr.addEventListener("click", () => bridge.openInGenerator(fullOwned, row.label || row.slug));

      const btnEdit = el("button", { type: "button", class: "qr-mini-btn" }, "Edit");
      btnEdit.addEventListener("click", () => {
        editingSlug = row.slug;
        slugTouched = true;
        inLabel.value = row.label;
        inSlug.value = row.slug;
        inDest.value = row.destination;
        inUtmSrc.value = row.campaign.source;
        inUtmMed.value = row.campaign.medium;
        inUtmCamp.value = row.campaign.campaign;
        btnSaveLink.textContent = "Save changes";
        btnCancelEdit.hidden = false;
        inDest.focus();
      });

      const btnDel = el("button", { type: "button", class: "qr-mini-btn danger" }, "Remove");
      btnDel.addEventListener("click", () => {
        kitLinks = kitLinks.filter((l) => l.slug !== row.slug);
        if (editingSlug === row.slug) clearKitForm();
        persistIfOptedIn();
        renderRedirectKit();
        notifyCounts();
      });

      kitTableBody.append(
        el(
          "tr",
          {},
          el("td", { class: "mono qr-break" }, fullOwned),
          el("td", { class: "qr-break" }, row.destination),
          el("td", {}, row.label || row.slug),
          el("td", {}, el("div", { class: "qr-row-btns" }, btnQr, btnEdit, btnDel)),
        ),
      );
    }

    // Render output rules
    const fmtMeta = RULE_FORMATS.find((f) => f.id === activeFormat) ?? RULE_FORMATS[0];
    rulesStepsList.replaceChildren(...fmtMeta.steps.map((s) => el("li", {}, s)));
    rulesDevText.textContent = fmtMeta.devNote;
    rulesNotesList.replaceChildren();
    rulesNotesList.hidden = true;
    htmlMultiBox.replaceChildren();
    htmlMultiBox.hidden = true;

    const valid = parseLinksFile(currentLinksFile());
    if (!baseChk.ok || !valid.ok) {
      const errs: string[] = [];
      if (!baseChk.ok) errs.push(`Base address: ${baseChk.reason}`);
      if (!valid.ok) {
        for (const e of valid.errors) {
          if (!baseChk.ok && e.startsWith("Base address:")) continue;
          errs.push(e);
        }
      }
      rulesCodePre.hidden = false;
      rulesCodePre.textContent = `Fix these items to create forwarding rules:\n- ${errs.join("\n- ")}`;
      btnCopyRules.disabled = true;
      btnDownloadRules.disabled = true;
      if (!baseChk.ok) {
        const msg = isMissingTrailingSlash(kitBase)
          ? "Add a slash at the end of your base address in step 1."
          : `Fix your base address in step 1: ${baseChk.reason}`;
        kitRulesDisabledReason.set(msg, "Go to step 1", () => focusField(kitBaseInput));
      } else {
        kitRulesDisabledReason.set(`Fix the link error first: ${errs[0]}`, "Go to step 2", () => focusField(inLabel));
      }
    } else if (kitLinks.length === 0) {
      rulesCodePre.hidden = false;
      rulesCodePre.textContent = "Add at least one link above (or load the 3 sample links) to preview your forwarding rules here.";
      btnCopyRules.disabled = true;
      btnDownloadRules.disabled = true;
      kitRulesDisabledReason.set("Add at least one link in step 2 (or load the 3 sample links) to copy or download rules.", "Go to step 2", () =>
        focusField(inLabel),
      );
    } else if (activeFormat === "html" && valid.file.links.length > 1) {
      // Strictly one standalone HTML document per link (never concatenated)
      const files = writeHtmlFiles(valid.file);
      rulesCodePre.hidden = true;
      btnCopyRules.disabled = true;
      btnDownloadRules.disabled = true;
      btnDownloadRules.textContent = "Use folder ZIP below";
      htmlMultiBox.hidden = false;
      const btnZipHtml = el("button", { type: "button", class: "btn" }, `Download all ${files.length} HTML files (folder ZIP)`);
      btnZipHtml.addEventListener("click", () => {
        const zip = buildZip(files.map((f) => ({ path: f.filePath, data: f.html })));
        downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), "bandit-codes-static-html.zip");
        rulesCopyStatus.textContent = `Downloaded ${files.length} separate index.html files in bandit-codes-static-html.zip.`;
      });
      kitRulesDisabledReason.set(
        "Multiple links need one separate index.html file per folder. Use the folder ZIP button below instead.",
        "Jump to folder ZIP",
        () => focusField(btnZipHtml),
      );
      const perLinkList = el("div", { class: "qr-chips" });
      for (const f of files) {
        const b = el("button", { type: "button", class: "qr-chip" }, `Download ${f.slug}-index.html (${f.path}/index.html)`);
        b.addEventListener("click", () => {
          downloadBlob(new Blob([f.html], { type: "text/html;charset=utf-8" }), `${f.slug}-index.html`);
        });
        perLinkList.append(b);
      }
      htmlMultiBox.append(
        el(
          "p",
          { class: "qr-fine" },
          "Static HTML requires one separate index.html file inside each link's folder so one page does not forward to the wrong link. Download the folder ZIP below (or save each file individually), or switch to the Bandit Codes snippet tab for a single copy-paste block.",
        ),
        el("div", { class: "qr-actions", style: "margin:0.75rem 0" }, btnZipHtml),
        perLinkList,
      );
      const notes = ruleNotes(valid.file);
      if (notes.length) {
        for (const n of notes) rulesNotesList.append(el("li", {}, n));
        rulesNotesList.hidden = false;
      }
    } else {
      rulesCodePre.hidden = false;
      const out = writeRules(valid.file, activeFormat);
      rulesCodePre.textContent = out;
      btnCopyRules.disabled = false;
      btnDownloadRules.disabled = false;
      btnDownloadRules.textContent = `Download ${fmtMeta.file}`;
      kitRulesDisabledReason.clear();
      const notes = ruleNotes(valid.file);
      if (notes.length) {
        for (const n of notes) rulesNotesList.append(el("li", {}, n));
        rulesNotesList.hidden = false;
      }
    }

    const listDisabled = kitLinks.length === 0 || !baseChk.ok || !valid.ok;
    btnKitBatchZip.disabled = listDisabled || kitZipBusy;
    btnKitCsvOut.disabled = listDisabled;
    btnKitJsonOut.disabled = listDisabled;
    if (kitZipBusy) {
      kitListDisabledReason.set("Checking and building your SVG QR ZIP...");
    } else if (!baseChk.ok) {
      const msg = isMissingTrailingSlash(kitBase)
        ? "Add a slash at the end of your base address in step 1."
        : `Fix your base address in step 1: ${baseChk.reason}`;
      kitListDisabledReason.set(msg, "Go to step 1", () => focusField(kitBaseInput));
    } else if (kitLinks.length === 0) {
      kitListDisabledReason.set(
        "Add at least one link in step 2 (or load the 3 sample links) to download QR codes or export.",
        "Go to step 2",
        () => focusField(inLabel),
      );
    } else if (!valid.ok) {
      kitListDisabledReason.set(`Fix the link error first: ${valid.errors[0]}`, "Go to step 2", () => focusField(inLabel));
    } else {
      kitListDisabledReason.clear();
    }
  }

  kitBaseInput.addEventListener("input", () => {
    kitBaseAutoNote = "";
    kitBase = kitBaseInput.value.trim();
    persistIfOptedIn();
    renderRedirectKit();
  });
  kitBaseInput.addEventListener("blur", () => {
    const norm = normalizeOwnedBaseOnBlur(kitBaseInput.value);
    if (norm.addedHttps || norm.addedSlash) {
      kitBase = norm.value;
      kitBaseInput.value = norm.value;
      kitBaseAutoNote =
        norm.addedHttps && norm.addedSlash
          ? "Added https:// and the trailing slash."
          : norm.addedHttps
            ? "Added https://."
            : "Added the trailing slash.";
      persistIfOptedIn();
      renderRedirectKit();
    }
  });

  btnLoadKitSample.addEventListener("click", () => {
    kitBase = SAMPLE_LINKS.base;
    kitLinks = SAMPLE_LINKS.links.map((l) => ({ ...l, campaign: { ...l.campaign } }));
    clearKitForm();
    persistIfOptedIn();
    renderRedirectKit();
    notifyCounts();
  });

  btnCancelEdit.addEventListener("click", clearKitForm);

  btnSaveLink.addEventListener("click", () => {
    setKitFormMsg("");
    const slugRes = checkSlug(inSlug.value.trim());
    if (!slugRes.ok) {
      setKitFormMsg(slugRes.reason);
      return;
    }
    const campaign = {
      source: inUtmSrc.value.trim(),
      medium: inUtmMed.value.trim(),
      campaign: inUtmCamp.value.trim(),
      content: "",
    };
    const destNorm = normalizeRawDomainUrl(inDest.value);
    if (destNorm.addedHttps) inDest.value = destNorm.value;
    const destRes = checkDestination(inDest.value.trim(), campaign);
    if (!destRes.ok) {
      setKitFormMsg(destRes.reason);
      return;
    }
    const existing = kitLinks.find((l) => l.slug.toLowerCase() === slugRes.slug.toLowerCase());
    if (existing && (!editingSlug || existing.slug.toLowerCase() !== editingSlug.toLowerCase())) {
      setKitFormMsg(`Short name '${slugRes.slug}' conflicts with '${existing.slug}' in your kit. Pick another name or edit the existing row.`);
      return;
    }
    const row: LinkRow = {
      slug: slugRes.slug,
      label: inLabel.value.trim().slice(0, 200),
      destination: inDest.value.trim(),
      campaign,
    };
    if (editingSlug) {
      kitLinks = kitLinks.map((l) => (l.slug === editingSlug ? row : l));
    } else {
      kitLinks = [...kitLinks, row];
    }
    clearKitForm();
    persistIfOptedIn();
    renderRedirectKit();
    notifyCounts();
  });

  btnKitBulkAdd.addEventListener("click", () => {
    const res = parseTwoColumnLinks(
      kitBulkArea.value,
      kitBase,
      kitLinks.map((l) => l.slug),
    );
    if (!res.ok) {
      kitBulkMsg.textContent = res.reason;
      return;
    }
    kitLinks = [...kitLinks, ...res.links];
    kitBulkArea.value = "";
    kitBulkMsg.textContent =
      `Added ${plural(res.links.length, "link", "links")}.` +
      (res.skipped.length ? ` Skipped ${plural(res.skipped.length, "invalid line", "invalid lines")}.` : "");
    persistIfOptedIn();
    renderRedirectKit();
    notifyCounts();
  });

  fmtSelect.addEventListener("change", () => {
    activeFormat = fmtSelect.value as RuleFormat;
    rulesCopyStatus.textContent = "";
    renderRedirectKit();
  });

  btnCopyRules.addEventListener("click", async () => {
    const ok = await copyToClipboard(rulesCodePre.textContent || "");
    rulesCopyStatus.textContent = ok ? "Copied rules to your clipboard." : "Copy was blocked by the browser. Select the text below and copy it manually.";
  });

  btnDownloadRules.addEventListener("click", () => {
    if (!checkBase(kitBase.trim()).ok) return;
    const valid = parseLinksFile(currentLinksFile());
    if (!valid.ok) return;
    if (activeFormat === "html" && valid.file.links.length > 1) return;
    const fmtMeta = RULE_FORMATS.find((f) => f.id === activeFormat) ?? RULE_FORMATS[0];
    const mime = activeFormat === "json" || activeFormat === "vercel" ? "application/json" : activeFormat === "html" ? "text/html" : "text/plain";
    downloadBlob(new Blob([writeRules(valid.file, activeFormat)], { type: `${mime};charset=utf-8` }), fmtMeta.file);
  });

  btnKitBatchZip.addEventListener("click", () => {
    if (kitZipBusy) return;
    if (!checkBase(kitBase.trim()).ok) return;
    const initial = parseLinksFile(currentLinksFile());
    if (!initial.ok || initial.file.links.length === 0) return;
    const initialBase = initial.file.base.endsWith("/") ? initial.file.base : `${initial.file.base}/`;
    const longestUrl = initial.file.links
      .map((l) => `${initialBase}${l.slug}`)
      .sort((a, b) => b.length - a.length)[0];

    bridge.batchStyle.requestZipDownload(
      initial.file.links.length,
      async (chosenStyle: BatchQrStyle) => {
        if (kitZipBusy) return;
        kitZipBusy = true;
        renderRedirectKit();
        try {
          if (!checkBase(kitBase.trim()).ok) {
            kitTransferMsg.textContent = "Fix your base address in step 1 before downloading the ZIP.";
            return;
          }
          const valid = parseLinksFile(currentLinksFile());
          if (!valid.ok || valid.file.links.length === 0) {
            kitTransferMsg.textContent = valid.ok
              ? "Add at least one link before downloading the ZIP."
              : `Could not build ZIP: ${valid.errors[0]}`;
            return;
          }
          const sizeChk = checkBatchZipSize(valid.file.links.length, chosenStyle);
          if (!sizeChk.ok) {
            kitTransferMsg.textContent = sizeChk.reason;
            return;
          }
          const baseClean = valid.file.base.endsWith("/") ? valid.file.base : `${valid.file.base}/`;
          const batchItems = valid.file.links.map((l) => ({ id: l.slug, url: `${baseClean}${l.slug}` }));
          kitTransferMsg.textContent = `Checking that ${plural(batchItems.length, "code scans", "codes scan")}...`;
          const scanChk = await verifyBatchQrCodes(batchItems, chosenStyle, browserRasterizer, (done, total) => {
            kitTransferMsg.textContent = `Checking that codes scan (${done} of ${total})...`;
          });
          if (!scanChk.ok) {
            kitTransferMsg.textContent = `Stopped: code '${scanChk.failedId}' did not scan with the current style (${scanChk.message}) Click Change style to pick a higher-contrast look or smaller logo.`;
            return;
          }
          const entries: { path: string; data: string }[] = [];
          for (let i = 0; i < valid.file.links.length; i++) {
            const l = valid.file.links[i];
            entries.push({
              path: `${l.slug}.svg`,
              data: renderBatchQrSvg(`${baseClean}${l.slug}`, chosenStyle),
            });
            if ((i + 1) % 10 === 0 && i + 1 < valid.file.links.length) {
              kitTransferMsg.textContent = `Building QR ${i + 1} of ${valid.file.links.length}...`;
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }
          const manifest = [
            "Bandit Codes batch QR SVG export",
            `Owned prefix: ${cleanManifestCell(baseClean)}`,
            "",
            ...valid.file.links.map(
              (l) =>
                `${cleanManifestCell(l.slug)}.svg\t${cleanManifestCell(`${baseClean}${l.slug}`)}\t${cleanManifestCell(l.destination)}\t${cleanManifestCell(l.label)}`,
            ),
          ].join("\n") + "\n";
          entries.push({ path: "manifest.txt", data: manifest });
          const zip = buildZip(entries);
          downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), "bandit-codes-qr-batch.zip");
          kitTransferMsg.textContent = `Verified and downloaded ${plural(valid.file.links.length, "SVG QR code", "SVG QR codes")} in bandit-codes-qr-batch.zip.`;
        } catch (err) {
          kitTransferMsg.textContent = err instanceof Error ? err.message : "Could not build the ZIP file.";
        } finally {
          kitZipBusy = false;
          renderRedirectKit();
        }
      },
      longestUrl,
    );
  });

  btnKitCsvOut.addEventListener("click", () => {
    if (!checkBase(kitBase.trim()).ok) return;
    const valid = parseLinksFile(currentLinksFile());
    if (!valid.ok) return;
    downloadBlob(new Blob([writeLinksCsv(valid.file)], { type: "text/csv;charset=utf-8" }), "bandit-codes-links.csv");
  });

  btnKitJsonOut.addEventListener("click", () => {
    if (!checkBase(kitBase.trim()).ok) return;
    const valid = parseLinksFile(currentLinksFile());
    if (!valid.ok) return;
    downloadBlob(new Blob([writeLinksJson(valid.file)], { type: "application/json;charset=utf-8" }), "bandit-codes-links.json");
  });

  kitImportInput.addEventListener("change", async () => {
    const file = kitImportInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES) {
        kitTransferMsg.textContent = "That file is over 1 MB and was not opened.";
        return;
      }
      const text = await file.text();
      const res = file.name.toLowerCase().endsWith(".csv")
        ? parseLinksCsv(text, kitBase)
        : parseLinksFile(text);
      if (!res.ok) {
        kitTransferMsg.textContent = `Could not import file: ${res.errors.slice(0, 3).join(" ")}`;
        return;
      }
      kitBase = res.file.base;
      kitLinks = res.file.links;
      clearKitForm();
      persistIfOptedIn();
      renderRedirectKit();
      notifyCounts();
      kitTransferMsg.textContent = `Imported ${plural(res.file.links.length, "link", "links")} for ${res.file.base}.`;
    } catch {
      kitTransferMsg.textContent = "Could not read that file.";
    } finally {
      kitImportInput.value = "";
    }
  });

  // =========================================================================
  // PANEL 4: LOCK-IN CHECK & ESCAPE PLAN ("Escape before you cancel")
  // =========================================================================
  const escapePanel = el("div", {
    id: "qr-panel-escape",
    role: "tabpanel",
    "aria-labelledby": "qr-tab-escape",
    class: "qr-panel",
    hidden: "",
  });

  // Step 1: Decode & Check Lock-in
  const checkCard = el("section", { class: "card qr-kit-card", "aria-labelledby": "esc-check-h" });
  checkCard.append(
    el("h3", { id: "esc-check-h", class: "qr-step-head" }, el("span", { class: "qr-step" }, "1"), " Check a printed QR code for lock-in"),
    el(
      "p",
      { class: "qr-fine" },
      "Upload or drop a photo of any printed QR code (or paste a web address you scanned with your phone). Decoding happens right inside your browser; no photo or link ever leaves your device.",
    ),
  );

  const ownedDomInput = el("input", {
    id: "esc-domains",
    type: "text",
    value: escapePlan.ownedDomains,
    placeholder: "yoursite.com, shop.yoursite.com",
    autocomplete: "off",
  });
  const ownedDomHelp = el("span", { class: "qr-help" }, "Comma-separated domains you control. Used to tell portable links from outside links.");
  const ownedBaseInput = el("input", {
    id: "esc-base",
    type: "url",
    value: escapePlan.ownedBase,
    placeholder: "https://yoursite.com/go/",
    autocomplete: "off",
  });
  const escBaseHelp = el(
    "span",
    { class: "qr-help" },
    "Include a folder like /go/. Bare domains get https:// and a trailing slash added automatically when you leave this field.",
  );
  let escBaseAutoNote = "";

  const escSettingsGrid = el(
    "div",
    { class: "qr-fields" },
    el("div", { class: "qr-field" }, el("label", { for: "esc-domains" }, "Your own domains"), ownedDomInput, ownedDomHelp),
    el("div", { class: "qr-field" }, el("label", { for: "esc-base" }, "New owned prefix for replacements"), ownedBaseInput, escBaseHelp),
  );

  // Dropzone + file input + paste input
  const photoInput = el("input", {
    id: "esc-photo-file",
    type: "file",
    accept: "image/png,image/jpeg,image/webp,image/gif",
    class: "sr",
  });
  const dropZone = el(
    "label",
    { class: "qr-dropzone", for: "esc-photo-file" },
    el("strong", {}, "Upload or drop a photo of a printed QR code"),
    el("span", { class: "qr-help" }, "PNG, JPEG, WebP, or GIF. You can also paste a screenshot with Ctrl+V. On a phone, tap to pick a photo or snap one."),
    photoInput,
  );
  const manualScanInput = el("input", {
    id: "esc-manual-url",
    type: "text",
    placeholder: "Or paste the decoded web address here, e.g. https://vendor-qr.example/q/a8k2m",
    autocomplete: "off",
  });
  const manualField = el(
    "div",
    { class: "qr-field", style: "margin-top:0.85rem" },
    el("label", { for: "esc-manual-url" }, "Decoded content (auto-filled from photo, or paste directly)"),
    manualScanInput,
  );

  const verdictBox = el("div", { class: "qr-verdict", role: "status", "aria-live": "polite", hidden: "" });
  const verdictHead = el("p", { class: "qr-verdict-h" });
  const verdictDetail = el("p", { class: "qr-verdict-p" });
  const verdictNext = el("p", { class: "qr-fine" });
  const addPieceInput = el("input", { id: "esc-piece-name", type: "text", placeholder: "e.g. Lobby sign or Takeout menu", autocomplete: "off" });
  const addLandInput = el("input", { id: "esc-landing-url", type: "url", placeholder: "Where it lands today, e.g. https://yoursite.com/menu", autocomplete: "off" });
  addLandInput.addEventListener("blur", () => {
    const norm = normalizeRawDomainUrl(addLandInput.value);
    if (norm.addedHttps) addLandInput.value = norm.value;
  });
  const addPriSelect = el(
    "select",
    { id: "esc-add-pri" },
    el("option", { value: "high" }, "High priority (most scanned)"),
    el("option", { value: "medium", selected: "" }, "Medium priority"),
    el("option", { value: "low" }, "Low priority (or let lapse)"),
  );
  addPriSelect.value = "medium";
  const addStickerCheck = el("input", { id: "esc-add-sticker", type: "checkbox" });
  const btnAddToPlan = el("button", { type: "button", class: "btn" }, "Add to escape plan");
  const addToPlanBar = el(
    "div",
    { class: "qr-add-plan", hidden: "" },
    el(
      "div",
      { class: "qr-fields" },
      el("div", { class: "qr-field" }, el("label", { for: "esc-piece-name" }, "What is this printed on?"), addPieceInput),
      el(
        "div",
        { class: "qr-field" },
        el("label", { for: "esc-landing-url" }, "Where does it land today?"),
        addLandInput,
        el("span", { class: "qr-help" }, "Scan with your phone and paste the final page address (bare domains get https:// added on blur). A browser page cannot follow another site's redirect for you."),
      ),
      el("div", { class: "qr-field" }, el("label", { for: "esc-add-pri" }, "Reprint priority"), addPriSelect),
      el(
        "div",
        { class: "qr-field check" },
        addStickerCheck,
        el("label", { for: "esc-add-sticker" }, "Can cover old code with a sticker"),
      ),
    ),
    el("div", { class: "qr-actions", style: "margin-top:0.75rem" }, btnAddToPlan),
  );
  verdictBox.append(verdictHead, verdictDetail, verdictNext, addToPlanBar);

  checkCard.append(escSettingsGrid, dropZone, manualField, verdictBox);

  // Step 2: Escape Plan Inventory + Readiness Meter + Honest Re-point Callout
  const planCard = el("section", { class: "card qr-kit-card", "aria-labelledby": "esc-plan-h" });
  const planHead = el("h3", { id: "esc-plan-h", class: "qr-step-head" }, el("span", { class: "qr-step" }, "2"), " Your escape plan");

  const repointCallout = el(
    "div",
    { class: "qr-callout" },
    el("strong", {}, "Smart move before you cancel: re-point your vendor codes while you still pay."),
    el(
      "p",
      { class: "qr-fine", style: "margin-top:0.35rem" },
      "First set up your owned links (in Redirect kit or Bandit Codes snippet). Then log into your vendor portal while your vendor account is still active and point each live vendor code at its new owned address, so your already-printed copies keep working during the switch and you manage future updates on your own site. Be clear on the limit: printed codes on a vendor's domain still stop working when you cancel, no matter what tool you switch to. Reprint high-use pieces first, and mark low-value ones 'Let it lapse'.",
    ),
  );

  const readinessBox = el("div", { class: "qr-readiness", role: "status", "aria-live": "polite" });

  const btnLoadEscSample = el("button", { id: "esc-load-sample", type: "button", class: "qr-chip" }, "Load sample escape plan");
  const btnAddBlankRow = el("button", { type: "button", class: "qr-chip" }, "Add row manually");
  const btnPushToKit = el(
    "button",
    { id: "esc-push-to-kit", type: "button", class: "btn", "data-guide-target": "esc-push-to-kit" },
    "Send mapped links to Redirect kit",
  );
  const btnEscBatchZip = el(
    "button",
    { id: "esc-batch-zip", type: "button", class: "btn alt", "data-guide-target": "esc-batch-zip" },
    "Download replacement QR codes (SVG ZIP)",
  );
  const btnEscReprintCsv = el("button", { type: "button", class: "btn ghost" }, "Download reprint list (CSV)");
  const escStyleBar = bridge.batchStyle.createSummaryBar({ idPrefix: "esc" });
  const escTopActions = el("div", { class: "qr-actions" }, btnPushToKit, btnEscBatchZip, btnEscReprintCsv);
  const escSecondaryRow = el("div", { class: "qr-actions small" }, escStyleBar, btnAddBlankRow, btnLoadEscSample);
  const escDisabledReason = createDisabledReason("esc-why-disabled");

  const chkSortPri = el("input", { id: "esc-sort-pri", type: "checkbox" });
  const chkOnlyRem = el("input", { id: "esc-only-rem", type: "checkbox" });
  const escFilterBar = el(
    "div",
    { class: "qr-filter-bar" },
    el("label", { class: "qr-save-toggle", for: "esc-sort-pri" }, chkSortPri, el("span", {}, "Sort by priority (high first)")),
    el("label", { class: "qr-save-toggle", for: "esc-only-rem" }, chkOnlyRem, el("span", {}, "Show only pieces still to reprint")),
  );

  const escActionStatus = el("p", { class: "qr-help", role: "status", "aria-live": "polite" });

  // Bulk vendor export paste box
  const escBulkDetails = el("details", { class: "qr-campaign" });
  const escBulkArea = el("textarea", {
    id: "esc-bulk-in",
    rows: "4",
    placeholder: "Brochure A, https://vendor.example/q/a1, https://yoursite.com/pamphlet-a1.pdf\nLobby sign, https://vendor.example/q/b2, https://yoursite.com/visit",
  });
  const btnEscBulkAdd = el("button", { type: "button", class: "btn alt" }, "Add pasted rows to escape plan");
  const escBulkMsg = el("span", { class: "qr-help", role: "status", "aria-live": "polite" });
  escBulkDetails.append(
    el("summary", {}, "Have dozens or hundreds of codes? Paste a vendor export list"),
    el(
      "p",
      { class: "qr-fine" },
      "Tip: export your codes as CSV from your vendor portal, then either import the CSV file below or paste lines here (piece name, vendor link, landing page address; or two columns: piece name, landing page address). Duplicate short names are numbered automatically.",
    ),
    el("div", { class: "qr-field" }, el("label", { for: "esc-bulk-in" }, "Bulk paste"), escBulkArea),
    el("div", { class: "qr-actions", style: "margin-top:0.7rem" }, btnEscBulkAdd, escBulkMsg),
  );

  const escTableWrap = el("div", { class: "qr-table-wrap" });
  const escTableBody = el("tbody");
  const escTable = el(
    "table",
    { class: "qr-table qr-esc-table" },
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", { scope: "col" }, "Printed piece"),
        el("th", { scope: "col" }, "Old link & where it lands"),
        el("th", { scope: "col" }, "New short name"),
        el("th", { scope: "col" }, "Priority & status"),
        el("th", { scope: "col" }, "Actions"),
      ),
    ),
    escTableBody,
  );
  escTableWrap.append(escTable);
  const escEmptyMsg = el(
    "p",
    { class: "qr-fine" },
    "No printed codes tracked yet. Scan a photo above, paste a vendor export, or load the sample plan to see how a clean move works.",
  );

  // CSV + JSON backup portability row (quieter side actions)
  const btnEscCsvOut = el("button", { type: "button", class: "qr-link-btn" }, "Export full plan (CSV)");
  const btnEscJsonOut = el("button", { type: "button", class: "qr-link-btn" }, "Export backup (JSON)");
  const escImportInput = el("input", { type: "file", accept: ".json,.csv,application/json,text/csv", class: "sr" });
  const escImportLabel = el("label", { class: "qr-link-btn" }, "Import CSV or JSON", escImportInput);
  const escTransferRow = el("div", { class: "qr-actions small" }, btnEscCsvOut, btnEscJsonOut, escImportLabel);

  planCard.append(
    planHead,
    repointCallout,
    readinessBox,
    escTopActions,
    escSecondaryRow,
    escDisabledReason.el,
    escFilterBar,
    escActionStatus,
    escEmptyMsg,
    escTableWrap,
    escTransferRow,
    escBulkDetails,
  );
  escapePanel.append(checkCard, planCard);

  let lastPayload = "";

  function syncDomainHelp() {
    const det = parseOwnedDomainsDetailed(escapePlan.ownedDomains);
    if (det.ignored.length > 0) {
      ownedDomHelp.textContent = `Ignored unrecognized or shared domain suffix: ${det.ignored.join(", ")}. Enter your full domain (for example myshop.co.uk).`;
    } else {
      ownedDomHelp.textContent = "Comma-separated domains you control. Used to tell portable links from outside links.";
    }
  }

  function evaluateScannedText(raw: string, decodeNote = "") {
    lastPayload = raw.trim();
    if (!lastPayload) {
      verdictBox.hidden = true;
      return;
    }
    const v = classifyQrPayload(lastPayload, escapePlan.ownedDomains);
    verdictBox.hidden = false;
    verdictBox.className = `qr-verdict st-${v.status}`;
    verdictHead.textContent = decodeNote ? `${v.headline} (${decodeNote})` : v.headline;
    verdictDetail.textContent = v.detail;
    verdictNext.textContent = v.nextStep;
    addToPlanBar.hidden = v.status === "static" || v.status === "owned";
  }

  async function handleImageFile(file: File) {
    verdictBox.hidden = false;
    verdictBox.className = "qr-verdict st-unknown";
    verdictHead.textContent = "Reading QR code locally...";
    verdictDetail.textContent = "Decoding pixels on your device. Nothing is uploaded.";
    verdictNext.textContent = "";
    addToPlanBar.hidden = true;

    const res = await decodeQrFromImageFile(file);
    if (!res.ok) {
      verdictBox.className = "qr-verdict st-deprecated";
      verdictHead.textContent = "Could not decode image";
      verdictDetail.textContent = res.reason;
      verdictNext.textContent = "You can also scan the printed code with your phone camera and paste the web address in the box above.";
      return;
    }
    manualScanInput.value = res.text;
    evaluateScannedText(res.text, res.method === "native" ? "decoded by browser" : "decoded locally");
  }

  photoInput.addEventListener("change", () => {
    const f = photoInput.files?.[0];
    if (f) handleImageFile(f);
    photoInput.value = "";
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag");
    const f = e.dataTransfer?.files?.[0];
    if (f) handleImageFile(f);
  });

  escapePanel.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) {
          e.preventDefault();
          handleImageFile(f);
          return;
        }
      }
    }
  });

  manualScanInput.addEventListener("input", () => evaluateScannedText(manualScanInput.value));
  ownedDomInput.addEventListener("input", () => {
    escapePlan.ownedDomains = ownedDomInput.value.trim();
    syncDomainHelp();
    if (!escapePlan.ownedBase || escapePlan.ownedBase === "https://yoursite.com/go/") {
      const det = parseOwnedDomainsDetailed(escapePlan.ownedDomains);
      if (det.domains[0]) {
        escapePlan.ownedBase = `https://${det.domains[0]}/go/`;
        ownedBaseInput.value = escapePlan.ownedBase;
      }
    }
    persistIfOptedIn();
    if (lastPayload) evaluateScannedText(lastPayload);
    renderEscapePlan();
  });
  ownedBaseInput.addEventListener("input", () => {
    escBaseAutoNote = "";
    escapePlan.ownedBase = ownedBaseInput.value.trim();
    persistIfOptedIn();
    renderEscapePlan();
  });
  ownedBaseInput.addEventListener("blur", () => {
    const norm = normalizeOwnedBaseOnBlur(ownedBaseInput.value);
    if (norm.addedHttps || norm.addedSlash) {
      escapePlan.ownedBase = norm.value;
      ownedBaseInput.value = norm.value;
      escBaseAutoNote =
        norm.addedHttps && norm.addedSlash
          ? `Added https:// and the trailing slash: ${norm.value}`
          : norm.addedHttps
            ? `Added https://: ${norm.value}`
            : `Added the trailing slash: ${norm.value}`;
      persistIfOptedIn();
      renderEscapePlan();
    }
  });

  chkSortPri.addEventListener("change", () => {
    escSortByPriority = chkSortPri.checked;
    renderEscapePlan();
  });
  chkOnlyRem.addEventListener("change", () => {
    escOnlyRemaining = chkOnlyRem.checked;
    renderEscapePlan();
  });

  btnAddToPlan.addEventListener("click", () => {
    const piece = addPieceInput.value.trim() || `Printed piece ${escapePlan.items.length + 1}`;
    const landing = normalizeRawDomainUrl(addLandInput.value).value;
    const slug = suggestSlug(piece) || `code-${escapePlan.items.length + 1}`;
    const item: EscapeItem = {
      id: makeItemId(escapePlan.items.length),
      piece,
      currentUrl: lastPayload,
      landingUrl: landing,
      newSlug: slug,
      priority: (addPriSelect.value as EscapePriority) || "medium",
      status: landing ? "mapped" : "found",
      stickerOver: addStickerCheck.checked,
      notes: "",
    };
    escapePlan.items = [...escapePlan.items, item];
    addPieceInput.value = "";
    addLandInput.value = "";
    addPriSelect.value = "medium";
    addStickerCheck.checked = false;
    persistIfOptedIn();
    renderEscapePlan();
    notifyCounts();
    escActionStatus.textContent = `Added "${piece}" to your escape plan.`;
  });

  function badgeForItem(item: EscapeItem): HTMLElement | null {
    if (!item.currentUrl.trim()) return null;
    const v = classifyQrPayload(item.currentUrl, escapePlan.ownedDomains);
    const map: Record<typeof v.status, [string, string]> = {
      owned: ["pill-ok", "Your domain"],
      static: ["pill-ok", "Static"],
      trapped: ["pill-warn", "Third-party link"],
      deprecated: ["pill-warn", "Retired shortener"],
      unknown: ["pill-caution", "Domain unchecked"],
    };
    const [cls, txt] = map[v.status];
    return el("span", { class: `qr-pill ${cls}` }, txt);
  }

  function renderEscapePlan() {
    ownedDomInput.value = escapePlan.ownedDomains;
    ownedBaseInput.value = escapePlan.ownedBase;
    syncDomainHelp();
    const escBaseChk = checkBase(escapePlan.ownedBase.trim());
    if (escBaseChk.ok) {
      escBaseHelp.textContent =
        escBaseAutoNote ||
        "Include a folder like /go/. Bare domains get https:// and a trailing slash added automatically when you leave this field.";
    } else if (isMissingTrailingSlash(escapePlan.ownedBase)) {
      escBaseHelp.textContent = "Add a slash at the end (or leave this field and Bandit Codes will add it for you).";
    } else if (normalizeOwnedBaseOnBlur(escapePlan.ownedBase).addedHttps) {
      escBaseHelp.textContent = "Leave this field and Bandit Codes will add https:// automatically.";
    } else {
      escBaseHelp.textContent = escBaseChk.reason;
    }
    const sum = escapeSummary(escapePlan);

    readinessBox.replaceChildren();
    if (sum.total === 0) {
      readinessBox.className = "qr-readiness";
      readinessBox.append(
        el("strong", {}, "Escape readiness: "),
        "Add your printed codes to track re-pointing, reprints, and low-value pieces you plan to let lapse before canceling your old subscription.",
      );
    } else if (sum.readyToCancel) {
      readinessBox.className = "qr-readiness ready";
      readinessBox.append(
        el("strong", {}, `Ready to cancel (${sum.reprinted} reprinted, ${sum.retired} set to lapse out of ${sum.total}). `),
        "Every tracked piece is either reprinted with your own address or intentionally marked to lapse. Test each live printed code with your phone before ending your old plan.",
      );
    } else {
      readinessBox.className = "qr-readiness wait";
      readinessBox.append(
        el("strong", {}, `Do not cancel yet: ${sum.resolved} of ${sum.total} settled (${sum.reprinted} reprinted, ${sum.retired} set to lapse). `),
        `${plural(sum.repointed, "vendor code", "vendor codes")} re-pointed, ${plural(sum.live, "owned link", "owned links")} live, ${plural(sum.highRemaining, "high-priority piece", "high-priority pieces")} still waiting for reprint.`,
      );
    }

    let visibleItems = escapePlan.items;
    if (escOnlyRemaining) {
      visibleItems = visibleItems.filter((item) => item.status !== "reprinted" && item.status !== "retire");
    }
    if (escSortByPriority) {
      visibleItems = sortEscapeItems(visibleItems);
    }

    escEmptyMsg.hidden = visibleItems.length > 0;
    escTableWrap.hidden = visibleItems.length === 0;
    const noItems = escapePlan.items.length === 0;
    btnPushToKit.disabled = noItems || !escBaseChk.ok;
    btnEscReprintCsv.disabled = noItems;
    btnEscBatchZip.disabled = noItems || !escBaseChk.ok || escZipBusy;
    btnEscCsvOut.disabled = noItems;
    btnEscJsonOut.disabled = noItems;

    if (escZipBusy) {
      escDisabledReason.set("Checking and building your replacement SVG QR ZIP...");
    } else if (noItems) {
      escDisabledReason.set(
        "Add a printed code in step 1 (or load the sample escape plan) to transfer links, download replacement QR codes, or export.",
        "Go to step 1",
        () => focusField(manualScanInput),
      );
    } else if (!escBaseChk.ok) {
      const msg = isMissingTrailingSlash(escapePlan.ownedBase)
        ? "Add a slash at the end of your replacement prefix in step 1 to transfer links or download replacement QR codes."
        : `Fix your replacement prefix in step 1: ${escBaseChk.reason}`;
      escDisabledReason.set(msg, "Fix in step 1", () => focusField(ownedBaseInput));
    } else {
      escDisabledReason.clear();
    }

    escTableBody.replaceChildren();
    const baseClean = escapePlan.ownedBase.trim().endsWith("/")
      ? escapePlan.ownedBase.trim()
      : escapePlan.ownedBase.trim()
        ? `${escapePlan.ownedBase.trim()}/`
        : "https://yoursite.com/go/";

    for (const item of visibleItems) {
      const pieceIn = el("input", { type: "text", class: "qr-cell-in", value: item.piece, "aria-label": "Printed piece" });
      pieceIn.addEventListener("input", () => {
        item.piece = pieceIn.value;
        persistIfOptedIn();
      });

      const stickerChk = el("input", { type: "checkbox" });
      stickerChk.checked = item.stickerOver;
      stickerChk.addEventListener("change", () => {
        item.stickerOver = stickerChk.checked;
        persistIfOptedIn();
      });
      const stickerLbl = el("label", { class: "qr-mini-check" }, stickerChk, el("span", {}, "Can sticker over"));

      const curIn = el("input", {
        type: "text",
        class: "qr-cell-in mono",
        value: item.currentUrl,
        placeholder: "Old printed link",
        "aria-label": "Current printed link",
      });
      curIn.addEventListener("input", () => {
        item.currentUrl = curIn.value.trim();
        persistIfOptedIn();
      });

      const landIn = el("input", {
        type: "url",
        class: "qr-cell-in",
        value: item.landingUrl,
        placeholder: "Paste where it lands today",
        "aria-label": "Landing page address",
      });
      landIn.addEventListener("input", () => {
        item.landingUrl = landIn.value.trim();
        if (item.landingUrl && item.status === "found") item.status = "mapped";
        persistIfOptedIn();
      });
      landIn.addEventListener("blur", () => {
        const norm = normalizeRawDomainUrl(landIn.value);
        if (norm.addedHttps) {
          landIn.value = norm.value;
          item.landingUrl = norm.value;
          if (item.landingUrl && item.status === "found") item.status = "mapped";
          persistIfOptedIn();
        }
      });

      const slugIn = el("input", {
        type: "text",
        class: "qr-cell-in mono",
        value: item.newSlug,
        placeholder: "short-name",
        "aria-label": "New short name",
      });
      slugIn.addEventListener("input", () => {
        item.newSlug = slugIn.value.trim();
        persistIfOptedIn();
      });

      const priSel = el(
        "select",
        { class: "qr-cell-in", "aria-label": "Reprint priority" },
        el("option", { value: "high" }, "High priority"),
        el("option", { value: "medium" }, "Medium priority"),
        el("option", { value: "low" }, "Low priority"),
      );
      priSel.value = item.priority;
      priSel.addEventListener("change", () => {
        item.priority = priSel.value as EscapePriority;
        persistIfOptedIn();
        renderEscapePlan();
      });

      const statSel = el(
        "select",
        { class: "qr-cell-in", "aria-label": "Move status" },
        el("option", { value: "found" }, "1. Found"),
        el("option", { value: "mapped" }, "2. Mapped"),
        el("option", { value: "live" }, "3. Owned link live"),
        el("option", { value: "repointed" }, "4. Vendor code re-pointed"),
        el("option", { value: "reprinted" }, "5. Reprinted"),
        el("option", { value: "retire" }, "6. Let it lapse"),
      );
      statSel.value = item.status;
      statSel.addEventListener("change", () => {
        item.status = statSel.value as EscapeStatus;
        persistIfOptedIn();
        renderEscapePlan();
      });

      const btnMake = el("button", { type: "button", class: "qr-mini-btn accent" }, "Make QR");
      btnMake.disabled = item.status === "retire";
      btnMake.addEventListener("click", () => {
        const slug = item.newSlug.trim() || suggestSlug(item.piece) || "link";
        bridge.openInGenerator(`${baseClean}${slug}`, item.piece);
      });

      const btnRm = el("button", { type: "button", class: "qr-mini-btn danger" }, "Remove");
      btnRm.addEventListener("click", () => {
        escapePlan.items = escapePlan.items.filter((x) => x.id !== item.id);
        persistIfOptedIn();
        renderEscapePlan();
        notifyCounts();
      });

      const rowDisabledNote = item.status === "retire" ? el("span", { class: "qr-row-disabled-note" }, "Set to lapse (no new QR needed)") : null;
      const badge = badgeForItem(item);
      const linksStack = el("div", { class: "qr-cell-stack" }, curIn, landIn, badge);

      escTableBody.append(
        el(
          "tr",
          { class: item.status === "retire" ? "qr-row-retired" : "" },
          el("td", {}, el("div", { class: "qr-cell-stack" }, pieceIn, stickerLbl)),
          el("td", {}, linksStack),
          el("td", {}, slugIn),
          el("td", {}, el("div", { class: "qr-cell-stack" }, priSel, statSel)),
          el("td", {}, el("div", { class: "qr-cell-stack" }, el("div", { class: "qr-row-btns" }, btnMake, btnRm), rowDisabledNote)),
        ),
      );
    }
  }

  btnLoadEscSample.addEventListener("click", () => {
    escapePlan = {
      ...SAMPLE_ESCAPE,
      items: SAMPLE_ESCAPE.items.map((x) => ({ ...x })),
    };
    persistIfOptedIn();
    renderEscapePlan();
    notifyCounts();
    escActionStatus.textContent = "Loaded 3 sample printed items.";
  });

  btnAddBlankRow.addEventListener("click", () => {
    const n = escapePlan.items.length + 1;
    escapePlan.items = [
      ...escapePlan.items,
      {
        id: makeItemId(n),
        piece: `Printed piece ${n}`,
        currentUrl: "",
        landingUrl: "",
        newSlug: `piece-${n}`,
        priority: "medium",
        status: "found",
        stickerOver: false,
        notes: "",
      },
    ];
    persistIfOptedIn();
    renderEscapePlan();
    notifyCounts();
  });

  btnEscBulkAdd.addEventListener("click", () => {
    const res = parseBulkEscapePaste(escBulkArea.value, escapePlan.items);
    if (!res.ok) {
      escBulkMsg.textContent = res.reason;
      return;
    }
    escapePlan.items = [...escapePlan.items, ...res.items];
    escBulkArea.value = "";
    escBulkMsg.textContent = `Added ${plural(res.items.length, "item", "items")} to your escape plan.`;
    persistIfOptedIn();
    renderEscapePlan();
    notifyCounts();
  });

  btnPushToKit.addEventListener("click", () => {
    const res = escapeToLinks(escapePlan);
    if (!res.ok) {
      escActionStatus.textContent = res.reason;
      return;
    }
    if (res.file.links.length === 0) {
      escActionStatus.textContent = `No rows were ready to transfer yet. ${res.skipped.slice(0, 2).join(" ")}`;
      return;
    }
    kitBase = res.file.base;
    const bySlug = new Map(kitLinks.map((l) => [l.slug.toLowerCase(), l]));
    for (const l of res.file.links) bySlug.set(l.slug.toLowerCase(), l);
    kitLinks = [...bySlug.values()];
    persistIfOptedIn();
    renderRedirectKit();
    notifyCounts();
    const extra: string[] = [];
    if (res.renamed.length) extra.push(`${plural(res.renamed.length, "duplicate short name", "duplicate short names")} auto-numbered`);
    if (res.skipped.length) extra.push(`${plural(res.skipped.length, "row", "rows")} skipped`);
    escActionStatus.textContent = `Sent ${plural(res.file.links.length, "link", "links")} to Redirect kit.${extra.length ? ` (${extra.join("; ")})` : ""}`;
    bridge.switchTab("redirects");
  });

  btnEscReprintCsv.addEventListener("click", () => {
    downloadBlob(new Blob([writeReprintCsv(escapePlan)], { type: "text/csv;charset=utf-8" }), "bandit-codes-reprint-list.csv");
  });

  btnEscBatchZip.addEventListener("click", () => {
    if (escZipBusy) return;
    const initial = escapeToLinks(escapePlan);
    if (!initial.ok) {
      escActionStatus.textContent = initial.reason;
      return;
    }
    if (initial.file.links.length === 0) {
      escActionStatus.textContent = "Add a landing page address on at least one non-retired row before downloading replacement QR codes.";
      return;
    }
    const initialBase = initial.file.base.endsWith("/") ? initial.file.base : `${initial.file.base}/`;
    const longestUrl = initial.file.links
      .map((l) => `${initialBase}${l.slug}`)
      .sort((a, b) => b.length - a.length)[0];

    bridge.batchStyle.requestZipDownload(
      initial.file.links.length,
      async (chosenStyle: BatchQrStyle) => {
        if (escZipBusy) return;
        escZipBusy = true;
        renderEscapePlan();
        try {
          const res = escapeToLinks(escapePlan);
          if (!res.ok) {
            escActionStatus.textContent = res.reason;
            return;
          }
          if (res.file.links.length === 0) {
            escActionStatus.textContent = "Add a landing page address on at least one non-retired row before downloading replacement QR codes.";
            return;
          }
          const sizeChk = checkBatchZipSize(res.file.links.length, chosenStyle);
          if (!sizeChk.ok) {
            escActionStatus.textContent = sizeChk.reason;
            return;
          }
          const baseClean = res.file.base.endsWith("/") ? res.file.base : `${res.file.base}/`;
          const batchItems = res.file.links.map((l) => ({ id: l.slug, url: `${baseClean}${l.slug}` }));
          escActionStatus.textContent = `Checking that ${plural(batchItems.length, "replacement code scans", "replacement codes scan")}...`;
          const scanChk = await verifyBatchQrCodes(batchItems, chosenStyle, browserRasterizer, (done, total) => {
            escActionStatus.textContent = `Checking that replacement codes scan (${done} of ${total})...`;
          });
          if (!scanChk.ok) {
            escActionStatus.textContent = `Stopped: code '${scanChk.failedId}' did not scan with the current style (${scanChk.message}) Click Change style to pick a higher-contrast look or smaller logo.`;
            return;
          }
          const entries: { path: string; data: string }[] = [];
          for (let i = 0; i < res.file.links.length; i++) {
            const l = res.file.links[i];
            entries.push({
              path: `${l.slug}.svg`,
              data: renderBatchQrSvg(`${baseClean}${l.slug}`, chosenStyle),
            });
            if ((i + 1) % 10 === 0 && i + 1 < res.file.links.length) {
              escActionStatus.textContent = `Building QR ${i + 1} of ${res.file.links.length}...`;
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }
          const manifest = [
            "Bandit Codes replacement QR SVG export",
            `Owned prefix: ${cleanManifestCell(baseClean)}`,
            "",
            ...res.file.links.map(
              (l) =>
                `${cleanManifestCell(l.slug)}.svg\t${cleanManifestCell(`${baseClean}${l.slug}`)}\t${cleanManifestCell(l.destination)}\t${cleanManifestCell(l.label)}`,
            ),
          ].join("\n") + "\n";
          entries.push({ path: "manifest.txt", data: manifest });
          const zip = buildZip(entries);
          downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), "bandit-codes-replacement-qrs.zip");
          escActionStatus.textContent = `Verified and downloaded ${plural(res.file.links.length, "replacement SVG QR code", "replacement SVG QR codes")} in bandit-codes-replacement-qrs.zip.`;
        } catch (err) {
          escActionStatus.textContent = err instanceof Error ? err.message : "Could not build the replacement ZIP file.";
        } finally {
          escZipBusy = false;
          renderEscapePlan();
        }
      },
      longestUrl,
    );
  });

  btnEscCsvOut.addEventListener("click", () => {
    downloadBlob(new Blob([writeEscapeCsv(escapePlan)], { type: "text/csv;charset=utf-8" }), "bandit-codes-escape-plan.csv");
  });

  btnEscJsonOut.addEventListener("click", () => {
    downloadBlob(new Blob([writeEscapeJson(escapePlan)], { type: "application/json;charset=utf-8" }), "bandit-codes-escape-plan.json");
  });

  escImportInput.addEventListener("change", async () => {
    const file = escImportInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES) {
        escActionStatus.textContent = "That file is over 1 MB and was not opened.";
        return;
      }
      const text = await file.text();
      const res = file.name.toLowerCase().endsWith(".csv")
        ? parseEscapeCsv(text, escapePlan.ownedBase, escapePlan.ownedDomains)
        : parseEscapeJson(text);
      if (!res.ok) {
        escActionStatus.textContent = `Could not import file: ${res.errors.slice(0, 3).join(" ")}`;
        return;
      }
      escapePlan = res.plan;
      persistIfOptedIn();
      renderEscapePlan();
      notifyCounts();
      escActionStatus.textContent = `Imported ${plural(res.plan.items.length, "item", "items")}.`;
    } catch {
      escActionStatus.textContent = "Could not read that file.";
    } finally {
      escImportInput.value = "";
    }
  });

  // Initial renders
  renderRedirectKit();
  renderEscapePlan();

  return {
    redirectsPanel,
    escapePanel,
    upsertRedirectLink(base: string, row: LinkRow) {
      if (base.trim()) kitBase = base.trim();
      const idx = kitLinks.findIndex((l) => l.slug.toLowerCase() === row.slug.toLowerCase());
      if (idx >= 0) kitLinks[idx] = row;
      else kitLinks = [...kitLinks, row];
      persistIfOptedIn();
      renderRedirectKit();
      notifyCounts();
    },
    setRuleFormat(fmt: RuleFormat) {
      activeFormat = fmt;
      fmtSelect.value = fmt;
      rulesCopyStatus.textContent = "";
      renderRedirectKit();
    },
    getKitLinks: () => kitLinks.map((l) => ({ ...l, campaign: { ...l.campaign } })),
    persistIfOptedIn,
    getKitCount: () => kitLinks.length,
    getEscapeCount: () => escapePlan.items.length,
    onCountsChange: (cb) => {
      countCb = cb;
    },
  };
}
