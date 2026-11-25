import {
  MAX_FILE_BYTES,
  SNIPPET_ID_PATTERN,
  browserRasterizer,
  buildZip,
  checkBatchZipSize,
  checkSnippetPageUrl,
  cleanManifestCell,
  diffSnippetBaseline,
  makeSnippetUid,
  normalizeRawDomainUrl,
  normalizeSameOriginJsonPath,
  parseSnippetBulkPaste,
  parseSnippetOrJson,
  renderBatchQrSvg,
  rowsToBanditConfig,
  sanitizeSavedSnippetRows,
  snippetQrUrl,
  suggestSnippetId,
  validateSnippetState,
  verifyBatchQrCodes,
  writeCodesJson,
  writeCodesJsonSnippet,
  writeInlineSnippet,
  type BatchQrStyle,
  type LinkRow,
  type SnippetBaseline,
  type SnippetRow,
} from "./lib/index.ts";
import {
  STORAGE_SNIPPET_KEY,
  copyToClipboard,
  createDisabledReason,
  downloadBlob,
  el,
  focusField,
  readOptInJson,
  writeOptInJson,
} from "./ui-dom.ts";
import type { BatchStyleController } from "./ui-batch-style.ts";

export interface SnippetBridge {
  openInGenerator: (url: string, label?: string) => void;
  getRedirectKitLinks: () => LinkRow[];
  batchStyle: BatchStyleController;
}

export interface SnippetController {
  panel: HTMLElement;
  persistIfOptedIn: () => void;
  setPageUrlPlaceholder: (placeholder: string) => void;
  getActiveCount: () => number;
  onCountChange: (cb: () => void) => void;
}

interface SavedSnippetState {
  pageUrl: string;
  param: string;
  fallback: string;
  jsonPath: string;
  outputKind: "inline" | "codes-json";
  rows: SnippetRow[];
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const SAMPLE_ROWS: SnippetRow[] = [
  {
    uid: "sample-snip-1",
    originalId: null,
    id: "menu",
    to: "https://example.com/spring-menu.pdf",
    note: "Table tent menu",
    retired: false,
  },
  {
    uid: "sample-snip-2",
    originalId: null,
    id: "pamphlet",
    to: "https://example.com/files/pamphlet-a1.pdf",
    note: "Waiting room pamphlet",
    retired: false,
  },
  {
    uid: "sample-snip-3",
    originalId: null,
    id: "reviews",
    to: "https://example.com/leave-a-review",
    note: "Counter card",
    retired: false,
  },
];

export function createSnippetPanel(bridge: SnippetBridge): SnippetController {
  let countCb: (() => void) | null = null;
  const notifyCount = () => countCb?.();

  const saved = readOptInJson<SavedSnippetState>(STORAGE_SNIPPET_KEY);
  let mode: "fresh" | "update" = "fresh";
  const savedPageUrl = typeof saved?.pageUrl === "string" ? saved.pageUrl.trim() : "";
  let pageUrl = savedPageUrl && checkSnippetPageUrl(savedPageUrl).ok ? savedPageUrl : "";
  let param = typeof saved?.param === "string" && saved.param.trim() ? saved.param.trim() : "c";
  let fallback = typeof saved?.fallback === "string" ? saved.fallback : "/";
  let jsonPath = typeof saved?.jsonPath === "string" && saved.jsonPath.trim() ? saved.jsonPath.trim() : "/codes.json";
  let outputKind: "inline" | "codes-json" = saved?.outputKind === "codes-json" ? "codes-json" : "inline";
  let rows: SnippetRow[] = sanitizeSavedSnippetRows(saved?.rows);
  let baseline: SnippetBaseline | null = null;
  let zipBusy = false;

  const rowWidgets = new Map<
    string,
    { pillsHost: HTMLElement; btnQr: HTMLButtonElement; rowNote: HTMLElement; idIn: HTMLInputElement; toIn: HTMLInputElement }
  >();

  function persistIfOptedIn() {
    writeOptInJson(STORAGE_SNIPPET_KEY, {
      pageUrl,
      param,
      fallback,
      jsonPath,
      outputKind,
      rows,
    } satisfies SavedSnippetState);
  }

  const panel = el("div", {
    id: "qr-panel-snippet",
    role: "tabpanel",
    "aria-labelledby": "qr-tab-snippet",
    class: "qr-panel",
    hidden: "",
  });

  // ---------------- Card 1: Mode switcher & honest framing ----------------
  const introCard = el("section", { class: "card qr-kit-card", "aria-labelledby": "snip-intro-h" });
  introCard.append(
    el("h3", { id: "snip-intro-h", class: "qr-step-head" }, el("span", { class: "qr-step" }, "1"), " Bandit Codes snippet (for site builders)"),
    el(
      "p",
      { class: "qr-fine" },
      "Server forwarding rules in the Redirect kit stay the first choice when your host allows them, because they forward before a page loads. Use this snippet when your website builder cannot add server rules: paste the snippet on the one page your printed code points to (such as /qr-codes), not on your home page or in site-wide code. A phone loads that page for a brief moment and then forwards on. If your website builder blocks custom scripts, use the Redirect kit tab instead. Nothing ever points at Patch Bandit or any third party; if Patch Bandit disappears, every code keeps working as long as you keep your site and domain.",
    ),
    el(
      "p",
      { class: "qr-fine" },
      "Need step-by-step instructions for your website builder? ",
      el("a", { href: "/tools/qr-code-generator/guides/" }, "Read the Bandit Codes install guides"),
      ".",
    ),
  );

  const btnModeFresh = el("button", { id: "snip-mode-fresh", type: "button", class: "qr-own-btn on", "aria-pressed": "true" }, "Start fresh");
  const btnModeUpdate = el("button", { id: "snip-mode-update", type: "button", class: "qr-own-btn", "aria-pressed": "false" }, "Update my snippet");
  const modeBar = el(
    "div",
    { class: "qr-own-switch", style: "margin-top:0.9rem" },
    el("div", { class: "qr-own-row", role: "group", "aria-label": "Snippet maker mode" }, btnModeFresh, btnModeUpdate),
  );

  // Update-mode import box (paste existing snippet or codes.json, or drop a file)
  const updateBox = el("div", { class: "qr-update-box", hidden: "" });
  const pasteArea = el("textarea", {
    id: "snip-paste-in",
    rows: "6",
    placeholder: 'Paste your existing <!-- Bandit Codes v1: start --> ... <!-- Bandit Codes v1: end --> block or codes.json here...',
  });
  const fileDropIn = el("input", { id: "snip-file-in", type: "file", accept: ".html,.htm,.txt,.json,text/html,application/json", class: "sr" });
  const fileDropLabel = el(
    "label",
    { class: "qr-dropzone qr-drop-compact", for: "snip-file-in" },
    el("strong", {}, "Drop or choose your existing snippet (.html) or codes.json"),
    el("span", { class: "qr-help" }, "Read right in your browser. Nothing leaves your device."),
    fileDropIn,
  );
  const btnLoadBaseline = el("button", { type: "button", class: "btn" }, "Read snippet & open editor");
  const btnClearBaseline = el("button", { type: "button", class: "btn ghost", hidden: "" }, "Clear loaded baseline");
  const pasteMsg = el("p", { class: "qr-help", role: "status", "aria-live": "polite" });

  updateBox.append(
    fileDropLabel,
    el(
      "div",
      { class: "qr-field", style: "margin-top:0.85rem" },
      el("label", { for: "snip-paste-in" }, "Paste the whole block you put on your site last time (or your codes.json file)"),
      pasteArea,
    ),
    el("div", { class: "qr-actions", style: "margin-top:0.85rem" }, btnLoadBaseline, btnClearBaseline),
    pasteMsg,
  );

  // Settings grid (page address + fallback)
  const pageUrlIn = el("input", {
    id: "snip-page-url",
    type: "url",
    value: pageUrl,
    placeholder: "https://yoursite.com/qr-codes",
    autocomplete: "off",
  });
  const pageUrlHelp = el("span", { class: "qr-help" });
  const fallbackIn = el("input", {
    id: "snip-fallback",
    type: "text",
    value: fallback,
    placeholder: "/",
    autocomplete: "off",
  });
  const fallbackHelp = el("span", { class: "qr-help" }, "Use / for your home page, an https:// page address, or leave blank to show a plain list of links.");

  const settingsGrid = el(
    "div",
    { class: "qr-fields", style: "margin-top:1rem" },
    el("div", { class: "qr-field" }, el("label", { for: "snip-page-url" }, "Page on your site where you paste this"), pageUrlIn, pageUrlHelp),
    el("div", { class: "qr-field" }, el("label", { for: "snip-fallback" }, "Where to send people when a code is not found"), fallbackIn, fallbackHelp),
  );
  const placementWarning = el(
    "p",
    { id: "snip-placement-warning", class: "qr-readiness wait", style: "margin-top:0.9rem;margin-bottom:0" },
    "Paste this snippet on the one page your printed code points to (such as /qr-codes), not on your home page or in site-wide code.",
  );

  introCard.append(modeBar, updateBox, settingsGrid, placementWarning);

  // ---------------- Card 2: Editable codes table + Bulk paste ----------------
  const editorCard = el("section", { class: "card qr-kit-card", "aria-labelledby": "snip-edit-h" });
  editorCard.append(
    el("h3", { id: "snip-edit-h", class: "qr-step-head" }, el("span", { class: "qr-step" }, "2"), " Edit your code list"),
  );

  const btnAddRow = el("button", { id: "snip-add-row", type: "button", class: "btn" }, "Add code");
  const btnLoadSample = el("button", { id: "snip-load-sample", type: "button", class: "qr-chip" }, "Load 3 sample codes");
  const btnFromKit = el("button", { type: "button", class: "qr-chip" }, "Import from Redirect kit");
  const editorTopBar = el("div", { class: "qr-actions" }, btnAddRow, btnLoadSample, btnFromKit);
  const editorStatus = el("p", { class: "qr-help", role: "status", "aria-live": "polite" });
  const tableQrDisabledReason = createDisabledReason("snip-table-why-disabled");

  // Bulk two-column paste details
  const bulkDetails = el("details", { class: "qr-campaign" });
  const bulkArea = el("textarea", {
    id: "snip-bulk-in",
    rows: "4",
    placeholder: "menu, https://example.com/menu.pdf, Table tent\npamphlet, https://example.com/pamphlet-a1.pdf, Waiting room",
  });
  const btnBulkAdd = el("button", { type: "button", class: "btn alt" }, "Add pasted rows");
  const bulkMsg = el("span", { class: "qr-help", role: "status", "aria-live": "polite" });
  bulkDetails.append(
    el("summary", {}, "Paste a list of codes at once (2 or 3 columns)"),
    el("p", { class: "qr-fine" }, "Paste lines from a spreadsheet (comma or tab separated): code name, destination web address, and an optional note."),
    el("div", { class: "qr-field" }, el("label", { for: "snip-bulk-in" }, "Bulk list"), bulkArea),
    el("div", { class: "qr-actions", style: "margin-top:0.7rem" }, btnBulkAdd, bulkMsg),
  );

  const tableWrap = el("div", { class: "qr-table-wrap" });
  const tableBody = el("tbody");
  const table = el(
    "table",
    { class: "qr-table qr-snip-table" },
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", { scope: "col" }, "Code name"),
        el("th", { scope: "col" }, "Where it goes"),
        el("th", { scope: "col" }, "Note (printed piece)"),
        el("th", { scope: "col" }, "Actions"),
      ),
    ),
    tableBody,
  );
  tableWrap.append(table);

  const emptyMsg = el(
    "p",
    { class: "qr-fine" },
    "No codes in your snippet yet. Click Add code, load the 3 sample codes, or switch to Update my snippet to paste an existing one.",
  );

  const issuesSummary = el("ul", { class: "qr-errors", hidden: "" });
  const warningsSummary = el("ul", { class: "qr-warnings", hidden: "" });

  editorCard.append(editorTopBar, editorStatus, emptyMsg, tableQrDisabledReason.el, tableWrap, issuesSummary, warningsSummary, bulkDetails);

  // ---------------- Card 3: Live Diff vs. Pasted Baseline ----------------
  const diffCard = el("section", { class: "card qr-kit-card qr-diff-card", "aria-labelledby": "snip-diff-h", hidden: "" });
  const diffHead = el("h3", { id: "snip-diff-h", class: "qr-step-head" }, el("span", { class: "qr-step" }, "3"), " What changed from your pasted snippet");
  const diffSummaryEl = el("p", { class: "qr-readiness" });
  const diffList = el("ul", { class: "qr-diff-list" });
  diffCard.append(diffHead, diffSummaryEl, diffList);

  // ---------------- Card 4: Output Snippet + codes.json + Batch QR ZIP ----------------
  const outCard = el("section", { class: "card qr-kit-card", "aria-labelledby": "snip-out-h" });
  const outStepNum = el("span", { class: "qr-step" }, "3");
  outCard.append(
    el("h3", { id: "snip-out-h", class: "qr-step-head" }, outStepNum, " Copy your updated snippet"),
  );

  const btnOutInline = el("button", { type: "button", class: "qr-own-btn on", "aria-pressed": "true" }, "All-in-one HTML snippet (single paste)");
  const btnOutJson = el("button", { type: "button", class: "qr-own-btn", "aria-pressed": "false" }, "Hosted codes.json + loader snippet");
  const outSwitch = el(
    "div",
    { class: "qr-own-switch" },
    el("div", { class: "qr-own-row", role: "group", "aria-label": "Snippet output variant" }, btnOutInline, btnOutJson),
  );

  const jsonPathIn = el("input", { id: "snip-json-path", type: "text", value: jsonPath, placeholder: "/codes.json", autocomplete: "off" });
  const jsonPathWrap = el(
    "div",
    { class: "qr-field", style: "margin-bottom:0.9rem", hidden: "" },
    el("label", { for: "snip-json-path" }, "Path to codes.json on your own site"),
    jsonPathIn,
    el(
      "span",
      { class: "qr-help" },
      "Must start with / on the same domain (for example /codes.json). The loader only reads from your own site. If you edit only codes.json later, visitors with scripts turned off still see the links from when you pasted the HTML snippet.",
    ),
  );

  const btnCopySnippet = el(
    "button",
    { id: "snip-copy-snippet", type: "button", class: "btn", "data-guide-target": "snip-copy-snippet" },
    "Copy snippet",
  );
  const btnBatchZip = el(
    "button",
    { id: "snip-batch-zip", type: "button", class: "btn alt", "data-guide-target": "snip-batch-zip" },
    "Download all QR codes (SVG ZIP)",
  );
  const btnDownloadHtml = el("button", { type: "button", class: "btn ghost" }, "Download snippet (.html)");
  const btnDownloadJson = el("button", { type: "button", class: "btn ghost" }, "Download codes.json");
  const snipStyleBar = bridge.batchStyle.createSummaryBar({ idPrefix: "snip" });
  const outDisabledReason = createDisabledReason("snip-out-why-disabled");
  const outStatus = el("p", { class: "qr-help", role: "status", "aria-live": "polite" });

  const outPre = el("pre", { class: "qr-code-out" });

  const devDetails = el("details", { class: "qr-campaign" });
  devDetails.append(
    el("summary", {}, "Note for your developer"),
    el(
      "p",
      { class: "qr-fine" },
      "Bandit Codes format v1 embeds a <script type=\"application/json\" id=\"bandit-codes\"> data block, an inline loader with no network calls, and a <noscript> fallback list. A plain visit with no ?c= (or an empty ?c=) does nothing at all so the page loads normally. When ?c= is present, it matches exact typed case (matching the WordPress plugin; for example ?c=MENU does not match menu and goes to the backup address), validates https: or http: destinations only (refusing javascript: and data: schemes), checks against same-page fallback loops, and forwards with location.replace so the back button does not loop. To keep the dedicated /qr-codes page itself out of search results, add <meta name=\"robots\" content=\"noindex\"> in that page's head (or send X-Robots-Tag: noindex on hosts that support custom response headers). The codes.json variant reads from the same origin only using fetch with redirect: \"error\" and verifies the final response origin. Sites with a strict Content-Security-Policy that blocks inline scripts should use server redirects (Redirect kit) or host the loader script from the same origin.",
    ),
  );

  outCard.append(
    outSwitch,
    jsonPathWrap,
    el("div", { class: "qr-actions" }, btnCopySnippet, btnBatchZip),
    el("div", { class: "qr-actions small" }, snipStyleBar, btnDownloadHtml, btnDownloadJson),
    outDisabledReason.el,
    outStatus,
    outPre,
    devDetails,
  );

  panel.append(introCard, editorCard, diffCard, outCard);

  function setMode(next: "fresh" | "update") {
    mode = next;
    btnModeFresh.classList.toggle("on", next === "fresh");
    btnModeFresh.setAttribute("aria-pressed", String(next === "fresh"));
    btnModeUpdate.classList.toggle("on", next === "update");
    btnModeUpdate.setAttribute("aria-pressed", String(next === "update"));
    updateBox.hidden = next !== "update";
  }

  function loadFromRawText(raw: string, sourceLabel: string) {
    const res = parseSnippetOrJson(raw);
    if (!res.ok) {
      pasteMsg.textContent = `Could not read ${sourceLabel}: ${res.errors[0]}`;
      return;
    }
    param = res.param;
    fallback = res.fallback;
    fallbackIn.value = fallback;
    rows = res.rows.map((r) => ({ ...r }));
    baseline = {
      param: res.param,
      fallback: res.fallback,
      rows: res.rows.map((r) => ({ ...r })),
    };
    btnClearBaseline.hidden = false;
    const warnSuffix = res.warnings.length ? ` Note: ${res.warnings.slice(0, 2).join(" ")}` : "";
    pasteMsg.textContent = `Loaded ${plural(rows.length, "code", "codes")} from your ${res.sourceKind === "snippet" ? "HTML snippet" : "codes.json"}. Edit any row below to see what changed.${warnSuffix}`;
    persistIfOptedIn();
    render();
    notifyCount();
  }

  function renderDiff() {
    if (!baseline) {
      diffCard.hidden = true;
      outStepNum.textContent = "3";
      return;
    }
    diffCard.hidden = false;
    outStepNum.textContent = "4";
    const d = diffSnippetBaseline(baseline, rows, param, fallback);
    diffList.replaceChildren();
    if (!d.hasChanges) {
      diffSummaryEl.className = "qr-readiness";
      diffSummaryEl.textContent = "No changes yet compared to the snippet you pasted.";
      return;
    }
    const parts: string[] = [];
    if (d.updated.length) parts.push(`${d.updated.length} updated`);
    if (d.added.length) parts.push(`${d.added.length} added`);
    if (d.renamed.length) parts.push(`${d.renamed.length} renamed`);
    if (d.retired.length) parts.push(`${d.retired.length} retired`);
    if (d.metaChanges.length) parts.push(plural(d.metaChanges.length, "setting change", "setting changes"));
    diffSummaryEl.className = "qr-readiness ready";
    diffSummaryEl.textContent = `Changes ready to paste: ${parts.join(", ")}.`;

    for (const m of d.metaChanges) {
      diffList.append(el("li", { class: "qr-diff-item diff-upd" }, el("span", { class: "qr-pill pill-info" }, "Setting"), " ", m));
    }
    for (const u of d.updated) {
      const details: string[] = [];
      if (u.oldTo !== u.newTo) details.push(`destination changed from ${u.oldTo} to ${u.newTo}`);
      if (u.oldNote !== u.newNote) details.push(`note changed from "${u.oldNote}" to "${u.newNote}"`);
      diffList.append(
        el("li", { class: "qr-diff-item diff-upd" }, el("span", { class: "qr-pill pill-info" }, "Updated"), " ", `${u.id}: ${details.join("; ")}`),
      );
    }
    for (const a of d.added) {
      diffList.append(
        el("li", { class: "qr-diff-item diff-add" }, el("span", { class: "qr-pill pill-ok" }, "Added"), " ", `${a.id} to ${a.to}`),
      );
    }
    for (const rn of d.renamed) {
      const extras: string[] = [];
      if (rn.oldTo !== rn.newTo) extras.push(`destination also changed from ${rn.oldTo} to ${rn.newTo}`);
      if (rn.oldNote !== rn.newNote) extras.push(`note also changed from "${rn.oldNote}" to "${rn.newNote}"`);
      const extraText = extras.length ? ` (${extras.join("; ")})` : "";
      diffList.append(
        el(
          "li",
          { class: "qr-diff-item diff-ren" },
          el("span", { class: "qr-pill pill-caution" }, "Renamed"),
          " ",
          `${rn.oldId} to ${rn.newId}${extraText}. Warning: printed QR codes carrying ?${param}=${rn.oldId} will stop matching until reprinted.`,
        ),
      );
    }
    for (const rt of d.retired) {
      diffList.append(
        el(
          "li",
          { class: "qr-diff-item diff-ret" },
          el("span", { class: "qr-pill pill-warn" }, "Retired"),
          " ",
          `${rt.id} is no longer in your snippet (previously ${rt.oldTo}). Printed copies of this code will now go to your backup address or link list.`,
        ),
      );
    }
  }

  function render() {
    emptyMsg.hidden = rows.length > 0;
    tableWrap.hidden = rows.length === 0;
    tableBody.replaceChildren();
    rowWidgets.clear();

    for (const r of rows) {
      const idIn = el("input", {
        type: "text",
        class: "qr-cell-in mono",
        value: r.id,
        placeholder: "menu",
        "aria-label": "Code name",
      });
      idIn.disabled = r.retired;
      idIn.addEventListener("input", () => {
        r.id = idIn.value.trim();
        persistIfOptedIn();
        renderLiveOnly();
      });

      const toIn = el("input", {
        type: "url",
        class: "qr-cell-in",
        value: r.to,
        placeholder: "https://example.com/menu.pdf",
        "aria-label": "Destination web address",
      });
      toIn.disabled = r.retired;
      toIn.addEventListener("input", () => {
        r.to = toIn.value.trim();
        persistIfOptedIn();
        renderLiveOnly();
      });
      toIn.addEventListener("blur", () => {
        const norm = normalizeRawDomainUrl(toIn.value);
        if (norm.addedHttps) {
          toIn.value = norm.value;
          r.to = norm.value;
          persistIfOptedIn();
          renderLiveOnly();
        }
      });

      const noteIn = el("input", {
        type: "text",
        class: "qr-cell-in",
        value: r.note,
        placeholder: "Table tent",
        "aria-label": "Note",
      });
      noteIn.disabled = r.retired;
      noteIn.addEventListener("input", () => {
        r.note = noteIn.value;
        persistIfOptedIn();
        renderLiveOnly();
      });

      const idCell = el("div", { class: "qr-cell-stack" }, idIn);
      if (r.retired) idCell.append(el("span", { class: "qr-pill pill-warn" }, "Retired: no longer in your snippet"));

      const pillsHost = el("div", { class: "qr-cell-stack", hidden: "" });
      const toCell = el("div", { class: "qr-cell-stack" }, toIn, pillsHost);

      const btnQr = el("button", { type: "button", class: "qr-mini-btn accent" }, "Make QR");
      btnQr.addEventListener("click", () => {
        const valNow = validateSnippetState(rows, { pageUrl, param, fallback });
        if (!valNow.qrReady) return;
        bridge.openInGenerator(snippetQrUrl(pageUrl, param, r.id), r.note || r.id);
      });

      const btnRetire = el("button", { type: "button", class: "qr-mini-btn" }, r.retired ? "Restore" : "Retire");
      btnRetire.addEventListener("click", () => {
        r.retired = !r.retired;
        persistIfOptedIn();
        render();
        notifyCount();
      });

      const btnDel = el("button", { type: "button", class: "qr-mini-btn danger" }, "Remove");
      btnDel.addEventListener("click", () => {
        rows = rows.filter((x) => x.uid !== r.uid);
        persistIfOptedIn();
        render();
        notifyCount();
      });

      const rowNote = el("span", { class: "qr-row-disabled-note", hidden: "" });
      rowWidgets.set(r.uid, { pillsHost, btnQr, rowNote, idIn, toIn });

      const tr = el(
        "tr",
        { class: r.retired ? "qr-row-retired" : "" },
        el("td", {}, idCell),
        el("td", {}, toCell),
        el("td", {}, noteIn),
        el("td", {}, el("div", { class: "qr-cell-stack" }, el("div", { class: "qr-row-btns" }, btnQr, btnRetire, btnDel), rowNote)),
      );
      tableBody.append(tr);
    }

    renderLiveOnly();
  }

  /** Re-validates, updates per-row pills and Make QR state, refreshes diff, and updates output without losing focus. */
  function renderLiveOnly() {
    const val = validateSnippetState(rows, { pageUrl, param, fallback });
    const trimmedPage = pageUrl.trim();
    if (val.pageUrlError) {
      pageUrlHelp.textContent = val.pageUrlError;
    } else if (!trimmedPage) {
      pageUrlHelp.textContent =
        "Enter your own site's page address (bare domains like myshop.com/qr-codes get https:// added when you leave this field) to unlock Make QR and batch QR ZIP downloads.";
    } else if (val.pageUrlWarning) {
      pageUrlHelp.textContent = val.pageUrlWarning;
    } else {
      pageUrlHelp.textContent = `Printed QR codes point to ${trimmedPage.replace(/[?#].*$/, "")}?${param}=<code-name> (bare domains get https:// added automatically).`;
    }

    fallbackHelp.textContent = val.fallbackError
      ? val.fallbackError
      : val.fallbackWarning ||
        "Use / for your home page, a web address (bare domains get https:// added on blur), or leave blank to show a plain list of links.";

    let firstBadInput: HTMLElement | null = null;
    for (const r of rows) {
      const widget = rowWidgets.get(r.uid);
      if (!widget) continue;
      const issue = val.rowIssues.get(r.uid);
      widget.pillsHost.replaceChildren();
      if (issue && (issue.errors.length > 0 || issue.warnings.length > 0)) {
        for (const e of issue.errors) widget.pillsHost.append(el("span", { class: "qr-pill pill-warn" }, e));
        for (const w of issue.warnings) widget.pillsHost.append(el("span", { class: "qr-pill pill-caution" }, w));
        widget.pillsHost.hidden = false;
      } else {
        widget.pillsHost.hidden = true;
      }
      const rowHasErr = (issue?.errors.length ?? 0) > 0;
      if (rowHasErr && !firstBadInput) firstBadInput = widget.toIn;
      widget.btnQr.disabled = r.retired || !val.qrReady || rowHasErr;
      if (r.retired) {
        widget.rowNote.textContent = "Retired (click Restore to make a QR)";
        widget.rowNote.hidden = false;
      } else if (rowHasErr) {
        widget.rowNote.textContent = "Fix this row to make a QR";
        widget.rowNote.hidden = false;
      } else if (!val.qrReady) {
        widget.rowNote.textContent = "Needs page address in step 1";
        widget.rowNote.hidden = false;
      } else {
        widget.rowNote.textContent = "";
        widget.rowNote.hidden = true;
      }
    }

    if (rows.length > 0 && !val.qrReady) {
      if (val.pageUrlError) {
        tableQrDisabledReason.set(`Make QR is locked: ${val.pageUrlError}`, "Fix in step 1", () => focusField(pageUrlIn));
      } else if (!trimmedPage) {
        tableQrDisabledReason.set(
          "Make QR is locked until you add the page address on your site in step 1 (for example https://myshop.com/qr-codes).",
          "Go to step 1",
          () => focusField(pageUrlIn),
        );
      } else if (val.fallbackError) {
        tableQrDisabledReason.set(`Make QR is locked: ${val.fallbackError}`, "Fix in step 1", () => focusField(fallbackIn));
      } else if (val.errors.length > 0) {
        tableQrDisabledReason.set(`Make QR is locked until row errors are fixed: ${val.errors[0]}`, "Jump to row", () =>
          focusField(firstBadInput ?? btnAddRow),
        );
      } else {
        tableQrDisabledReason.clear();
      }
    } else {
      tableQrDisabledReason.clear();
    }

    issuesSummary.replaceChildren();
    if (val.errors.length) {
      for (const e of val.errors.slice(0, 8)) issuesSummary.append(el("li", {}, e));
      issuesSummary.hidden = false;
    } else {
      issuesSummary.hidden = true;
    }

    warningsSummary.replaceChildren();
    if (val.warnings.length) {
      for (const w of val.warnings.slice(0, 6)) warningsSummary.append(el("li", {}, w));
      warningsSummary.hidden = false;
    } else {
      warningsSummary.hidden = true;
    }

    renderDiff();

    btnOutInline.classList.toggle("on", outputKind === "inline");
    btnOutInline.setAttribute("aria-pressed", String(outputKind === "inline"));
    btnOutJson.classList.toggle("on", outputKind === "codes-json");
    btnOutJson.setAttribute("aria-pressed", String(outputKind === "codes-json"));
    jsonPathWrap.hidden = outputKind !== "codes-json";

    const pathOk = outputKind === "inline" || normalizeSameOriginJsonPath(jsonPath) !== null;
    if (!val.ok || !pathOk) {
      const msgs = [...val.errors];
      if (!pathOk) msgs.push("The codes.json path must start with / on your own site (for example /codes.json).");
      if (val.activeCount === 0 && msgs.length === 0) {
        outPre.textContent = "Add at least one active code above (or click Load 3 sample codes) to preview your Bandit Codes snippet.";
      } else {
        outPre.textContent = `Fix these items before copying your snippet:\n- ${msgs.join("\n- ")}`;
      }
      btnCopySnippet.disabled = true;
      btnDownloadHtml.disabled = true;
      btnDownloadJson.disabled = true;
      btnBatchZip.disabled = true;
      if (val.activeCount === 0 && !val.pageUrlError && !val.fallbackError) {
        outDisabledReason.set("Add at least one active code in step 2 (or load the 3 sample codes) to build your snippet.", "Go to step 2", () =>
          focusField(btnAddRow),
        );
      } else if (val.pageUrlError) {
        outDisabledReason.set(`Fix your page address in step 1: ${val.pageUrlError}`, "Fix in step 1", () => focusField(pageUrlIn));
      } else if (val.fallbackError) {
        outDisabledReason.set(`Fix your backup address in step 1: ${val.fallbackError}`, "Fix in step 1", () => focusField(fallbackIn));
      } else if (!pathOk) {
        outDisabledReason.set("The codes.json path must start with / on your own site (for example /codes.json).", "Fix path", () =>
          focusField(jsonPathIn),
        );
      } else {
        outDisabledReason.set(`Fix the code error in step 2: ${msgs[0] ?? ""}`, "Go to step 2", () => focusField(firstBadInput ?? btnAddRow));
      }
      return;
    }

    const cfg = rowsToBanditConfig(rows, param, fallback);
    const out = outputKind === "inline" ? writeInlineSnippet(cfg) : writeCodesJsonSnippet(cfg, jsonPath);
    outPre.textContent = out;
    btnCopySnippet.disabled = false;
    btnDownloadHtml.disabled = false;
    btnDownloadJson.disabled = false;
    btnBatchZip.disabled = zipBusy || !val.qrReady;

    if (zipBusy) {
      outDisabledReason.set("Building your SVG QR ZIP...");
    } else if (!val.qrReady) {
      outDisabledReason.set(
        "Download all QR codes needs your site's https:// page address in step 1 (for example https://myshop.com/qr-codes).",
        "Add in step 1",
        () => focusField(pageUrlIn),
      );
    } else {
      outDisabledReason.clear();
    }
  }

  // ---------------- Event handlers ----------------
  btnModeFresh.addEventListener("click", () => setMode("fresh"));
  btnModeUpdate.addEventListener("click", () => setMode("update"));

  btnLoadBaseline.addEventListener("click", () => loadFromRawText(pasteArea.value, "pasted text"));

  btnClearBaseline.addEventListener("click", () => {
    baseline = null;
    rows = rows.map((r) => ({ ...r, originalId: null }));
    btnClearBaseline.hidden = true;
    pasteMsg.textContent = "Cleared baseline comparison.";
    render();
  });

  async function handleSnippetFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      pasteMsg.textContent = "That file is over 1 MB and was not opened.";
      return;
    }
    try {
      const txt = await file.text();
      pasteArea.value = txt;
      loadFromRawText(txt, file.name);
    } catch {
      pasteMsg.textContent = "Could not read that file.";
    }
  }

  fileDropIn.addEventListener("change", () => {
    const f = fileDropIn.files?.[0];
    if (f) handleSnippetFile(f);
    fileDropIn.value = "";
  });
  fileDropLabel.addEventListener("dragover", (e) => {
    e.preventDefault();
    fileDropLabel.classList.add("drag");
  });
  fileDropLabel.addEventListener("dragleave", () => fileDropLabel.classList.remove("drag"));
  fileDropLabel.addEventListener("drop", (e) => {
    e.preventDefault();
    fileDropLabel.classList.remove("drag");
    const f = e.dataTransfer?.files?.[0];
    if (f) handleSnippetFile(f);
  });

  pageUrlIn.addEventListener("input", () => {
    pageUrl = pageUrlIn.value.trim();
    persistIfOptedIn();
    renderLiveOnly();
  });
  pageUrlIn.addEventListener("blur", () => {
    const norm = normalizeRawDomainUrl(pageUrlIn.value);
    if (norm.addedHttps) {
      pageUrl = norm.value;
      pageUrlIn.value = norm.value;
      persistIfOptedIn();
      renderLiveOnly();
    }
  });
  fallbackIn.addEventListener("input", () => {
    fallback = fallbackIn.value.trim();
    persistIfOptedIn();
    renderLiveOnly();
  });
  fallbackIn.addEventListener("blur", () => {
    const t = fallbackIn.value.trim();
    if (!t || t.startsWith("/")) return;
    const norm = normalizeRawDomainUrl(t);
    if (norm.addedHttps) {
      fallback = norm.value;
      fallbackIn.value = norm.value;
      persistIfOptedIn();
      renderLiveOnly();
    }
  });
  jsonPathIn.addEventListener("input", () => {
    jsonPath = jsonPathIn.value.trim();
    persistIfOptedIn();
    renderLiveOnly();
  });

  btnAddRow.addEventListener("click", () => {
    const n = rows.length + 1;
    rows = [
      ...rows,
      {
        uid: makeSnippetUid(n),
        originalId: null,
        id: `code-${n}`,
        to: "https://example.com/",
        note: "",
        retired: false,
      },
    ];
    persistIfOptedIn();
    render();
    notifyCount();
  });

  btnLoadSample.addEventListener("click", () => {
    rows = SAMPLE_ROWS.map((r) => ({ ...r }));
    baseline = null;
    btnClearBaseline.hidden = true;
    editorStatus.textContent = "Loaded 3 sample codes.";
    persistIfOptedIn();
    render();
    notifyCount();
  });

  btnFromKit.addEventListener("click", () => {
    const kitLinks = bridge.getRedirectKitLinks();
    if (kitLinks.length === 0) {
      editorStatus.textContent = "Your Redirect kit has no links yet. Add links there first or load the sample codes here.";
      return;
    }
    const existing = new Set(rows.map((r) => r.id.toLowerCase()));
    let added = 0;
    for (const l of kitLinks) {
      const id = SNIPPET_ID_PATTERN.test(l.slug) ? l.slug : suggestSnippetId(l.slug) || `code-${rows.length + 1}`;
      if (existing.has(id.toLowerCase())) continue;
      existing.add(id.toLowerCase());
      rows.push({
        uid: makeSnippetUid(rows.length + 1),
        originalId: null,
        id,
        to: l.destination,
        note: l.label || l.slug,
        retired: false,
      });
      added += 1;
    }
    editorStatus.textContent = added
      ? `Imported ${plural(added, "link", "links")} from your Redirect kit.`
      : "All Redirect kit links are already in this snippet.";
    persistIfOptedIn();
    render();
    notifyCount();
  });

  btnBulkAdd.addEventListener("click", () => {
    const res = parseSnippetBulkPaste(
      bulkArea.value,
      rows.map((r) => r.id),
    );
    if (!res.ok) {
      bulkMsg.textContent = res.reason;
      return;
    }
    rows = [...rows, ...res.rows];
    bulkArea.value = "";
    bulkMsg.textContent = `Added ${plural(res.rows.length, "code", "codes")} to your list.`;
    persistIfOptedIn();
    render();
    notifyCount();
  });

  btnOutInline.addEventListener("click", () => {
    outputKind = "inline";
    persistIfOptedIn();
    renderLiveOnly();
  });
  btnOutJson.addEventListener("click", () => {
    outputKind = "codes-json";
    persistIfOptedIn();
    renderLiveOnly();
  });

  btnCopySnippet.addEventListener("click", async () => {
    const ok = await copyToClipboard(outPre.textContent || "");
    outStatus.textContent = ok
      ? "Copied the Bandit Codes snippet to your clipboard."
      : "Copy was blocked by your browser. Select the text below and copy it manually.";
  });

  btnDownloadHtml.addEventListener("click", () => {
    const text = outPre.textContent || "";
    if (!text) return;
    downloadBlob(new Blob([text], { type: "text/html;charset=utf-8" }), "bandit-codes-snippet.html");
  });

  btnDownloadJson.addEventListener("click", () => {
    const cfg = rowsToBanditConfig(rows, param, fallback);
    downloadBlob(new Blob([writeCodesJson(cfg)], { type: "application/json;charset=utf-8" }), "codes.json");
  });

  btnBatchZip.addEventListener("click", () => {
    if (zipBusy) return;
    const val = validateSnippetState(rows, { pageUrl, param, fallback });
    if (!val.qrReady) return;
    const active = rows.filter((r) => !r.retired && r.id.trim());
    if (active.length === 0) return;
    const longestUrl = active
      .map((r) => snippetQrUrl(pageUrl, param, r.id))
      .sort((a, b) => b.length - a.length)[0];

    bridge.batchStyle.requestZipDownload(
      active.length,
      async (chosenStyle: BatchQrStyle) => {
        if (zipBusy) return;
        zipBusy = true;
        renderLiveOnly();
        try {
          const valNow = validateSnippetState(rows, { pageUrl, param, fallback });
          if (!valNow.qrReady) {
            outStatus.textContent = valNow.pageUrlError || valNow.errors[0] || "Fix your snippet settings before downloading the ZIP.";
            return;
          }
          const activeNow = rows.filter((r) => !r.retired && r.id.trim());
          if (activeNow.length === 0) {
            outStatus.textContent = "Add at least one active code before downloading the ZIP.";
            return;
          }
          const sizeChk = checkBatchZipSize(activeNow.length, chosenStyle);
          if (!sizeChk.ok) {
            outStatus.textContent = sizeChk.reason;
            return;
          }
          const batchItems = activeNow.map((r) => ({ id: r.id.trim(), url: snippetQrUrl(pageUrl, param, r.id) }));
          outStatus.textContent = `Checking that ${plural(batchItems.length, "code scans", "codes scan")}...`;
          const scanChk = await verifyBatchQrCodes(batchItems, chosenStyle, browserRasterizer, (done, total) => {
            outStatus.textContent = `Checking that codes scan (${done} of ${total})...`;
          });
          if (!scanChk.ok) {
            outStatus.textContent = `Stopped: code '${scanChk.failedId}' did not scan with the current style (${scanChk.message}) Click Change style to pick a higher-contrast look or smaller logo.`;
            return;
          }
          const entries: { path: string; data: string }[] = [];
          for (let i = 0; i < activeNow.length; i++) {
            const r = activeNow[i];
            entries.push({
              path: `${r.id.trim()}.svg`,
              data: renderBatchQrSvg(snippetQrUrl(pageUrl, param, r.id), chosenStyle),
            });
            if ((i + 1) % 10 === 0 && i + 1 < activeNow.length) {
              outStatus.textContent = `Building QR ${i + 1} of ${activeNow.length}...`;
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }
          const manifest = [
            "Bandit Codes batch QR SVG export",
            `Snippet page: ${cleanManifestCell(pageUrl)}`,
            "",
            ...activeNow.map(
              (r) =>
                `${cleanManifestCell(r.id)}.svg\t${cleanManifestCell(snippetQrUrl(pageUrl, param, r.id))}\t${cleanManifestCell(r.to)}\t${cleanManifestCell(r.note)}`,
            ),
          ].join("\n") + "\n";
          entries.push({ path: "manifest.txt", data: manifest });
          const zipBytes = buildZip(entries);
          downloadBlob(new Blob([zipBytes as BlobPart], { type: "application/zip" }), "bandit-codes-snippet-qrs.zip");
          outStatus.textContent = `Verified and downloaded ${plural(activeNow.length, "SVG QR code", "SVG QR codes")} in bandit-codes-snippet-qrs.zip.`;
        } catch (err) {
          outStatus.textContent = err instanceof Error ? err.message : "Could not build the ZIP file.";
        } finally {
          zipBusy = false;
          renderLiveOnly();
        }
      },
      longestUrl,
    );
  });

  render();

  return {
    panel,
    persistIfOptedIn,
    setPageUrlPlaceholder(placeholder: string) {
      pageUrlIn.setAttribute("placeholder", placeholder);
    },
    getActiveCount: () => rows.filter((r) => !r.retired).length,
    onCountChange: (cb) => {
      countCb = cb;
    },
  };
}
