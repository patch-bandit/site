import { describe, it } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  INLINE_LOADER_SOURCE,
  buildCodesJsonLoaderSource,
  isSafeFallback,
  isSafeTargetUrl,
  isSamePageUrl,
  normalizeSameOriginJsonPath,
  resolveBanditCode,
  type BanditCodesConfig,
} from "../../qr-src/lib/snippetLoader.ts";
import {
  checkSnippetPageUrl,
  cleanManifestCell,
  diffSnippetBaseline,
  parseSnippetBulkPaste,
  parseSnippetOrJson,
  rowsToBanditConfig,
  sanitizeSavedSnippetRows,
  snippetQrUrl,
  validateSnippetState,
  writeCodesJson,
  writeCodesJsonSnippet,
  writeInlineSnippet,
  type SnippetBaseline,
  type SnippetRow,
} from "../../qr-src/lib/snippet.ts";

/** Minimal DOM & location harness to execute the real INLINE_LOADER_SOURCE string in vm. */
function runInlineSnippetScript(
  config: BanditCodesConfig,
  search: string,
  pathname = "/qr-codes",
) {
  const replaced: string[] = [];
  const appendedLinks: { href: string; text: string }[] = [];

  const makeNode = (tag: string) => {
    const node = {
      tag,
      tagName: tag.toUpperCase(),
      href: "",
      target: "",
      rel: "",
      textContent: "",
      attrs: {} as Record<string, string>,
      children: [] as unknown[],
      childNodes: [] as unknown[],
      setAttribute(k: string, v: string) {
        node.attrs[k] = v;
      },
      appendChild(child: { tag?: string; href?: string; textContent?: string; children?: unknown[] }) {
        node.children.push(child);
        node.childNodes.push(child);
        if (child.tag === "a") appendedLinks.push({ href: child.href || "", text: child.textContent || "" });
        return child;
      },
    };
    return node;
  };

  const body = makeNode("body");
  const jsonEl = { textContent: JSON.stringify(config) };
  const doc = {
    body,
    currentScript: { parentNode: body },
    getElementById(id: string) {
      return id === "bandit-codes" ? jsonEl : null;
    },
    createElement(tag: string) {
      return makeNode(tag);
    },
  };

  const origin = "https://myshop.example";
  const ctx = vm.createContext({
    document: doc,
    location: {
      origin,
      pathname,
      search,
      href: `${origin}${pathname}${search}`,
      replace(u: string) {
        replaced.push(u);
      },
    },
    URL,
    URLSearchParams,
  });

  vm.runInContext(INLINE_LOADER_SOURCE, ctx);
  return { replaced, appendedLinks };
}

/** Minimal harness to execute the real buildCodesJsonLoaderSource string in vm. */
async function runCodesJsonScript(opts: {
  jsonPath?: string;
  pathname?: string;
  search?: string;
  fetchResponse: (url: string, init?: { credentials?: string; redirect?: string }) => Promise<unknown>;
}) {
  const src = buildCodesJsonLoaderSource(opts.jsonPath ?? "/codes.json");
  const fetched: { url: string; init?: { credentials?: string; redirect?: string } }[] = [];
  const replaced: string[] = [];
  const appendedLinks: { href: string; text: string }[] = [];

  const makeNode = (tag: string) => {
    const node = {
      tag,
      tagName: tag.toUpperCase(),
      href: "",
      target: "",
      rel: "",
      textContent: "",
      children: [] as unknown[],
      childNodes: [] as unknown[],
      setAttribute() {},
      appendChild(child: { tag?: string; href?: string; textContent?: string }) {
        node.children.push(child);
        node.childNodes.push(child);
        if (child.tag === "a") appendedLinks.push({ href: child.href || "", text: child.textContent || "" });
        return child;
      },
    };
    return node;
  };

  const body = makeNode("body");
  const origin = "https://myshop.example";
  const pathname = opts.pathname ?? "/qr-codes";
  const search = opts.search ?? "";
  const mockFetch = (url: string, init?: { credentials?: string; redirect?: string }) => {
    fetched.push({ url, init });
    return opts.fetchResponse(url, init);
  };
  const ctx = vm.createContext({
    fetch: mockFetch,
    window: {
      fetch: mockFetch,
    },
    document: { body, currentScript: { parentNode: body }, createElement: (tag: string) => makeNode(tag) },
    location: {
      origin,
      pathname,
      search,
      href: `${origin}${pathname}${search}`,
      replace(u: string) {
        replaced.push(u);
      },
    },
    URL,
    URLSearchParams,
  });
  vm.runInContext(src, ctx);
  await new Promise((r) => setTimeout(r, 15));
  return { fetched, replaced, appendedLinks };
}

const SAMPLE_CONFIG: BanditCodesConfig = {
  v: 1,
  param: "c",
  fallback: "/",
  codes: {
    menu: { to: "https://example.com/menu.pdf", note: "Table tent" },
    SpringMenu: { to: "https://example.com/spring.pdf", note: "Spring special" },
    old: { to: "http://example.com/legacy", note: "Legacy page" },
    retired1: { to: "https://example.com/gone", note: "Retired", retired: true },
    eviljs: { to: "javascript:alert(1)", note: "Bad script" },
    evildata: { to: "data:text/html,<script>alert(1)</script>", note: "Bad data" },
    evilrel: { to: "//evil.example/phish", note: "Bad protocol-relative" },
  },
};

describe("Bandit Codes v1 loader (pure resolver + live inline and codes.json loader execution)", () => {
  it("redirects known codes with exact typed case (supporting capital IDs) and sends mismatched case to fallback", () => {
    const pure = resolveBanditCode(SAMPLE_CONFIG, "?c=menu", "https://myshop.example/qr-codes");
    assert.deepEqual(pure, { action: "redirect", target: "https://example.com/menu.pdf", matchedId: "menu" });

    const run = runInlineSnippetScript(SAMPLE_CONFIG, "?c=menu");
    assert.deepEqual(run.replaced, ["https://example.com/menu.pdf"]);
    assert.equal(run.appendedLinks.length, 0);

    // Capital code ID matches exact typed case; mismatched case goes to fallback
    const capPure = resolveBanditCode(SAMPLE_CONFIG, "?c=SpringMenu", "https://myshop.example/qr-codes");
    assert.deepEqual(capPure, { action: "redirect", target: "https://example.com/spring.pdf", matchedId: "SpringMenu" });
    assert.deepEqual(runInlineSnippetScript(SAMPLE_CONFIG, "?c=SpringMenu").replaced, ["https://example.com/spring.pdf"]);
    assert.deepEqual(runInlineSnippetScript(SAMPLE_CONFIG, "?c=springmenu").replaced, ["/"]);

    // Exact typed-case match: ?c=MENU goes to fallback when only lowercase menu exists
    const upperPure = resolveBanditCode(SAMPLE_CONFIG, "?c=MENU", "https://myshop.example/qr-codes");
    assert.deepEqual(upperPure, { action: "fallback", target: "/", reason: "unknown" });
    const upper = runInlineSnippetScript(SAMPLE_CONFIG, "?c=MENU");
    assert.deepEqual(upper.replaced, ["/"]);

    const httpRun = runInlineSnippetScript(SAMPLE_CONFIG, "?c=old");
    assert.deepEqual(httpRun.replaced, ["http://example.com/legacy"]);

    // Retired entries in JSON are not followed
    const retRun = runInlineSnippetScript(SAMPLE_CONFIG, "?c=retired1");
    assert.deepEqual(retRun.replaced, ["/"]);
  });

  it("does nothing on a plain visit with no ?c= or an empty ?c= in both loaders", async () => {
    const homeCfg: BanditCodesConfig = { ...SAMPLE_CONFIG, fallback: "/menu" };
    const noFallback: BanditCodesConfig = { ...SAMPLE_CONFIG, fallback: "" };

    for (const search of ["", "?", "?c=", "?c", "?c=%20", "?utm_source=flyer"]) {
      const pure = resolveBanditCode(homeCfg, search, "https://myshop.example/");
      assert.deepEqual(pure, { action: "noop", reason: "missing" });

      const inlineRun = runInlineSnippetScript(homeCfg, search, "/");
      assert.deepEqual(inlineRun.replaced, []);
      assert.deepEqual(inlineRun.appendedLinks, []);

      // Even with an empty fallback, a plain visit leaves the page untouched (no injected list)
      const inlineNoFb = runInlineSnippetScript(noFallback, search, "/qr-codes");
      assert.deepEqual(inlineNoFb.replaced, []);
      assert.deepEqual(inlineNoFb.appendedLinks, []);

      const hostedRun = await runCodesJsonScript({
        pathname: "/",
        search,
        fetchResponse: () =>
          Promise.resolve({
            ok: true,
            redirected: false,
            url: "https://myshop.example/codes.json",
            json: () => Promise.resolve(homeCfg),
          }),
      });
      assert.deepEqual(hostedRun.replaced, []);
      assert.deepEqual(hostedRun.appendedLinks, []);
      if (search === "" || search === "?") {
        assert.equal(hostedRun.fetched.length, 0);
      }
    }
  });

  it("handles present unknown codes with fallback or link list when fallback is empty in both loaders", async () => {
    const unk = resolveBanditCode(SAMPLE_CONFIG, "?c=missing", "https://myshop.example/qr-codes");
    assert.deepEqual(unk, { action: "fallback", target: "/", reason: "unknown" });
    assert.deepEqual(runInlineSnippetScript(SAMPLE_CONFIG, "?c=missing").replaced, ["/"]);

    const unkHosted = await runCodesJsonScript({
      search: "?c=missing",
      fetchResponse: () =>
        Promise.resolve({
          ok: true,
          redirected: false,
          url: "https://myshop.example/codes.json",
          json: () => Promise.resolve(SAMPLE_CONFIG),
        }),
    });
    assert.deepEqual(unkHosted.replaced, ["/"]);

    // Prototype keys treated as unknown
    assert.equal(resolveBanditCode(SAMPLE_CONFIG, "?c=__proto__", "https://myshop.example/qr-codes").action, "fallback");
    assert.equal(resolveBanditCode(SAMPLE_CONFIG, "?c=constructor", "https://myshop.example/qr-codes").action, "fallback");
    assert.deepEqual(runInlineSnippetScript(SAMPLE_CONFIG, "?c=toString").replaced, ["/"]);

    // Empty fallback with a present unknown code renders plain list of active safe links only
    const noFallback: BanditCodesConfig = { ...SAMPLE_CONFIG, fallback: "" };
    const listRes = resolveBanditCode(noFallback, "?c=unknown-id", "https://myshop.example/qr-codes");
    assert.equal(listRes.action, "list");
    if (listRes.action === "list") {
      assert.deepEqual(
        listRes.items.map((i) => i.id),
        ["menu", "SpringMenu", "old"],
      );
    }
    const listRun = runInlineSnippetScript(noFallback, "?c=unknown-id");
    assert.deepEqual(listRun.replaced, []);
    assert.deepEqual(listRun.appendedLinks, [
      { href: "https://example.com/menu.pdf", text: "Table tent (menu)" },
      { href: "https://example.com/spring.pdf", text: "Spring special (SpringMenu)" },
      { href: "http://example.com/legacy", text: "Legacy page (old)" },
    ]);
  });

  it("stops endless reload loops when fallback points at the snippet's own page", async () => {
    assert.equal(isSamePageUrl("/", "https://myshop.example/"), true);
    assert.equal(isSamePageUrl("/qr-codes/", "https://myshop.example/qr-codes"), true);
    assert.equal(isSamePageUrl("/", "https://myshop.example/qr-codes"), false);

    // Pure resolver falls back to list when an unknown code hits a fallback equal to the current path
    const pureRoot = resolveBanditCode(SAMPLE_CONFIG, "?c=nope", "https://myshop.example/");
    assert.equal(pureRoot.action, "list");

    // Inline loader on site root "/" with default fallback "/" and unknown code renders list instead of calling location.replace("/")
    const inlineRoot = runInlineSnippetScript(SAMPLE_CONFIG, "?c=nope", "/");
    assert.deepEqual(inlineRoot.replaced, []);
    assert.equal(inlineRoot.appendedLinks.length, 3);

    // Inline loader on "/qr-codes" with fallback "/qr-codes/" and unknown code renders list instead of looping
    const selfCfg: BanditCodesConfig = { ...SAMPLE_CONFIG, fallback: "/qr-codes/" };
    const inlineSelf = runInlineSnippetScript(selfCfg, "?c=nope", "/qr-codes");
    assert.deepEqual(inlineSelf.replaced, []);
    assert.equal(inlineSelf.appendedLinks.length, 3);

    // Hosted codes.json loader on site root "/" with fallback "/" and unknown code also renders list instead of looping
    const hostedRoot = await runCodesJsonScript({
      pathname: "/",
      search: "?c=nope",
      fetchResponse: () =>
        Promise.resolve({
          ok: true,
          redirected: false,
          url: "https://myshop.example/codes.json",
          json: () => Promise.resolve(SAMPLE_CONFIG),
        }),
    });
    assert.deepEqual(hostedRoot.replaced, []);
    assert.equal(hostedRoot.appendedLinks.length, 3);
  });

  it("refuses javascript:, data:, vbscript:, file:, and protocol-relative schemes in both targets and fallback", () => {
    assert.equal(isSafeTargetUrl("javascript:alert(1)"), null);
    assert.equal(isSafeTargetUrl("data:text/html,hi"), null);
    assert.equal(isSafeTargetUrl("vbscript:msgbox(1)"), null);
    assert.equal(isSafeTargetUrl("//evil.example/x"), null);
    assert.equal(isSafeTargetUrl("file:///etc/passwd"), null);
    assert.equal(isSafeFallback("javascript:alert(1)"), null);
    assert.equal(isSafeFallback("//evil.example/x"), null);
    assert.equal(isSafeFallback("/"), "/");
    assert.equal(isSafeFallback("/qr-help"), "/qr-help");

    for (const badId of ["eviljs", "evildata", "evilrel"]) {
      const res = resolveBanditCode(SAMPLE_CONFIG, `?c=${badId}`, "https://myshop.example/qr-codes");
      assert.equal(res.action, "fallback");
      const run = runInlineSnippetScript(SAMPLE_CONFIG, `?c=${badId}`);
      assert.deepEqual(run.replaced, ["/"]);
    }

    const badFbCfg: BanditCodesConfig = { ...SAMPLE_CONFIG, fallback: "javascript:alert(1)" };
    const runBadFb = runInlineSnippetScript(badFbCfg, "?c=eviljs");
    assert.deepEqual(runBadFb.replaced, []);
    assert.equal(runBadFb.appendedLinks.length, 3);
  });

  it("enforces same-origin codes.json fetch with redirect: error and refuses redirects or cross-origin final URLs", async () => {
    assert.equal(normalizeSameOriginJsonPath("/codes.json"), "/codes.json");
    assert.equal(normalizeSameOriginJsonPath("https://evil.example/codes.json"), null);
    assert.equal(normalizeSameOriginJsonPath("//evil.example/codes.json"), null);
    assert.equal(normalizeSameOriginJsonPath("/../secret.json"), null);
    assert.throws(() => buildCodesJsonLoaderSource("https://evil.example/codes.json"));

    // Normal same-origin fetch passes redirect: "error" and redirects to target
    const okRun = await runCodesJsonScript({
      search: "?c=menu",
      fetchResponse: () =>
        Promise.resolve({
          ok: true,
          redirected: false,
          url: "https://myshop.example/codes.json",
          json: () => Promise.resolve(SAMPLE_CONFIG),
        }),
    });
    assert.equal(okRun.fetched.length, 1);
    assert.equal(okRun.fetched[0].url, "https://myshop.example/codes.json");
    assert.equal(okRun.fetched[0].init?.credentials, "same-origin");
    assert.equal(okRun.fetched[0].init?.redirect, "error");
    assert.deepEqual(okRun.replaced, ["https://example.com/menu.pdf"]);

    // Redirected response refused
    const redirRun = await runCodesJsonScript({
      search: "?c=menu",
      fetchResponse: () =>
        Promise.resolve({
          ok: true,
          redirected: true,
          url: "https://myshop.example/other.json",
          json: () => Promise.resolve(SAMPLE_CONFIG),
        }),
    });
    assert.deepEqual(redirRun.replaced, []);
    assert.deepEqual(redirRun.appendedLinks, []);

    // Cross-origin final response URL refused even if redirected flag were false
    const xOriginRun = await runCodesJsonScript({
      search: "?c=menu",
      fetchResponse: () =>
        Promise.resolve({
          ok: true,
          redirected: false,
          url: "https://evil.example/codes.json",
          json: () => Promise.resolve(SAMPLE_CONFIG),
        }),
    });
    assert.deepEqual(xOriginRun.replaced, []);
    assert.deepEqual(xOriginRun.appendedLinks, []);

    // Capital code ID matches exact case in codes.json loader too; mismatched ?c=MENU goes to fallback
    const capHosted = await runCodesJsonScript({
      search: "?c=SpringMenu",
      fetchResponse: () =>
        Promise.resolve({
          ok: true,
          redirected: false,
          url: "https://myshop.example/codes.json",
          json: () => Promise.resolve(SAMPLE_CONFIG),
        }),
    });
    assert.deepEqual(capHosted.replaced, ["https://example.com/spring.pdf"]);

    const upperHosted = await runCodesJsonScript({
      search: "?c=MENU",
      fetchResponse: () =>
        Promise.resolve({
          ok: true,
          redirected: false,
          url: "https://myshop.example/codes.json",
          json: () => Promise.resolve(SAMPLE_CONFIG),
        }),
    });
    assert.deepEqual(upperHosted.replaced, ["/"]);
  });
});

describe("Bandit Codes v1 snippet parse, edit, validate, diff, storage sanitization, and round-trip", () => {
  it("writes the exact shared HTML snippet format and round-trips through parseSnippetOrJson", () => {
    const rows: SnippetRow[] = [
      { uid: "1", originalId: null, id: "menu", to: "https://example.com/menu.pdf", note: "Table tent", retired: false },
      {
        uid: "2",
        originalId: null,
        id: "pamphlet-a1",
        to: "https://partner.example/pamphlet.pdf#page=2",
        note: 'Safe </script><script>alert(1)</script> note',
        retired: false,
      },
    ];
    const cfg = rowsToBanditConfig(rows, "c", "/");
    const html = writeInlineSnippet(cfg);

    assert.ok(html.startsWith("<!-- Bandit Codes v1: start -->\n"));
    assert.ok(html.trimEnd().endsWith("<!-- Bandit Codes v1: end -->"));
    assert.ok(html.includes('<script type="application/json" id="bandit-codes">'));
    assert.ok(html.includes("<noscript><ul>"));
    assert.ok(!html.includes("</script><script>alert(1)</script>"));
    assert.ok(html.includes("\\u003c/script\\u003e"));

    const parsedHtml = parseSnippetOrJson(html);
    assert.equal(parsedHtml.ok, true);
    if (parsedHtml.ok) {
      assert.equal(parsedHtml.sourceKind, "snippet");
      assert.equal(parsedHtml.param, "c");
      assert.equal(parsedHtml.fallback, "/");
      assert.equal(parsedHtml.rows.length, 2);
      assert.equal(parsedHtml.rows[0].id, "menu");
      assert.equal(parsedHtml.rows[1].note, 'Safe </script><script>alert(1)</script> note');
      assert.deepEqual(parsedHtml.warnings, []);
    }

    const jsonText = writeCodesJson(cfg);
    const parsedJson = parseSnippetOrJson(jsonText);
    assert.equal(parsedJson.ok, true);
    if (parsedJson.ok) {
      assert.equal(parsedJson.sourceKind, "json");
      assert.deepEqual(rowsToBanditConfig(parsedJson.rows, parsedJson.param, parsedJson.fallback), cfg);
    }

    const hostedHtml = writeCodesJsonSnippet(cfg, "/codes.json");
    assert.ok(hostedHtml.includes("/codes.json"));
    assert.ok(hostedHtml.includes("<noscript>"));
  });

  it("refuses placeholder page addresses, gates qrReady, flags fallback loops, and allows capital IDs while catching case-only duplicates", () => {
    assert.equal(checkSnippetPageUrl("http://myshop.example/qr-codes").ok, false);
    assert.equal(checkSnippetPageUrl("https://yoursite.com/qr-codes").ok, false);
    assert.equal(checkSnippetPageUrl("https://theirsite.com/qr-codes").ok, false);
    assert.equal(checkSnippetPageUrl("https://myshop.example/qr-codes").ok, true);
    assert.equal(snippetQrUrl("https://myshop.example/qr-codes", "c", "menu"), "https://myshop.example/qr-codes?c=menu");

    const goodRows: SnippetRow[] = [
      { uid: "r1", originalId: null, id: "menu", to: "https://example.com/menu", note: "Table tent", retired: false },
    ];

    // Unset pageUrl allows snippet copy/edit, blocks QR & ZIP (qrReady === false), and still shows the home page warning
    const noPage = validateSnippetState(goodRows, { pageUrl: "", param: "c", fallback: "/" });
    assert.equal(noPage.ok, true);
    assert.equal(noPage.qrReady, false);
    assert.ok(noPage.pageUrlWarning && /home page/i.test(noPage.pageUrlWarning) && /site-wide/i.test(noPage.pageUrlWarning));

    // Placeholder pageUrl is refused and blocks QR & ZIP
    const placeholder = validateSnippetState(goodRows, { pageUrl: "https://yoursite.com/qr-codes", param: "c", fallback: "/" });
    assert.equal(placeholder.ok, false);
    assert.equal(placeholder.qrReady, false);
    assert.ok(placeholder.pageUrlError && /example address/i.test(placeholder.pageUrlError));

    // Real dedicated pageUrl unlocks QR & ZIP and clears the home page warning
    const ready = validateSnippetState(goodRows, { pageUrl: "https://myshop.example/qr-codes", param: "c", fallback: "/" });
    assert.equal(ready.ok, true);
    assert.equal(ready.qrReady, true);
    assert.equal(ready.pageUrlWarning, null);

    // Fallback pointing at snippet's own page is refused (loop prevention)
    const loopRoot = validateSnippetState(goodRows, { pageUrl: "https://myshop.example/", param: "c", fallback: "/" });
    assert.equal(loopRoot.ok, false);
    assert.ok(loopRoot.fallbackError && /loop/i.test(loopRoot.fallbackError));
    assert.ok(loopRoot.pageUrlWarning && /home page/i.test(loopRoot.pageUrlWarning));

    const loopSelf = validateSnippetState(goodRows, { pageUrl: "https://myshop.example/qr-codes", param: "c", fallback: "/qr-codes/" });
    assert.equal(loopSelf.ok, false);
    assert.ok(loopSelf.fallbackError && /loop/i.test(loopSelf.fallbackError));

    // Site root with empty fallback is allowed (shows list) with root warning
    const rootList = validateSnippetState(goodRows, { pageUrl: "https://myshop.example/", param: "c", fallback: "" });
    assert.equal(rootList.ok, true);
    assert.ok(rootList.pageUrlWarning && /home page/i.test(rootList.pageUrlWarning));

    const badRows: SnippetRow[] = [
      { uid: "r1", originalId: null, id: "Menu", to: "https://example.com/menu", note: "", retired: false },
      { uid: "r2", originalId: null, id: "menu", to: "http://example.com/plain", note: "", retired: false },
      { uid: "r3", originalId: null, id: "Bad_ID", to: "javascript:alert(1)", note: "", retired: false },
      { uid: "r4", originalId: null, id: "retired-dup", to: "not-a-url", note: "", retired: true },
      { uid: "r5", originalId: null, id: "SpringMenu-2026", to: "https://example.com/spring", note: "", retired: false },
    ];
    const val = validateSnippetState(badRows, { pageUrl: "https://myshop.example/qr-codes", param: "c", fallback: "/" });
    assert.equal(val.ok, false);
    assert.equal(val.qrReady, false);
    assert.ok(val.rowIssues.get("r1")!.errors.some((e) => /duplicate/i.test(e)));
    assert.ok(val.rowIssues.get("r2")!.errors.some((e) => /duplicate/i.test(e)));
    assert.ok(val.rowIssues.get("r2")!.warnings.some((w) => /http:\/\//i.test(w)));
    assert.ok(val.rowIssues.get("r3")!.errors.some((e) => /letters \(A-Z, a-z\), digits, and hyphens/i.test(e)));
    assert.ok(val.rowIssues.get("r3")!.errors.some((e) => /refused address/i.test(e)));
    assert.equal(val.rowIssues.get("r4")!.errors.length, 0);
    assert.equal(val.rowIssues.get("r5")!.errors.length, 0);
  });

  it("computes accurate diffs including rename+edit, dual updates, and trimmed baseline notes", () => {
    const baseRows: SnippetRow[] = [
      { uid: "b1", originalId: "menu", id: "menu", to: "https://example.com/v1.pdf", note: "Menus  ", retired: false },
      { uid: "b2", originalId: "flyer", id: "flyer", to: "https://example.com/flyer", note: "Flyer", retired: false },
      { uid: "b3", originalId: "old", id: "old", to: "https://example.com/old", note: "Old", retired: false },
      { uid: "b4", originalId: "stay", id: "stay", to: "https://example.com/stay", note: "Trailing space  ", retired: false },
    ];
    const baseline: SnippetBaseline = { param: "c", fallback: "/", rows: baseRows.map((r) => ({ ...r })) };

    const editedRows: SnippetRow[] = [
      { uid: "b1", originalId: "menu", id: "menu", to: "https://example.com/v2.pdf", note: "Dinner menu", retired: false },
      { uid: "b2", originalId: "flyer", id: "spring-flyer", to: "https://example.com/flyer-v2", note: "Spring flyer", retired: false },
      { uid: "b3", originalId: "old", id: "old", to: "https://example.com/old", note: "Old", retired: true },
      { uid: "b4", originalId: "stay", id: "stay", to: "https://example.com/stay", note: "Trailing space", retired: false },
      { uid: "n5", originalId: null, id: "reviews", to: "https://example.com/reviews", note: "Counter", retired: false },
    ];

    const diff = diffSnippetBaseline(baseline, editedRows, "c", "");
    assert.equal(diff.hasChanges, true);
    assert.equal(diff.updated.length, 1);
    assert.equal(diff.updated[0].newTo, "https://example.com/v2.pdf");
    assert.equal(diff.updated[0].newNote, "Dinner menu");
    assert.equal(diff.renamed.length, 1);
    assert.equal(diff.renamed[0].oldId, "flyer");
    assert.equal(diff.renamed[0].newId, "spring-flyer");
    assert.equal(diff.renamed[0].newTo, "https://example.com/flyer-v2");
    assert.equal(diff.renamed[0].newNote, "Spring flyer");
    assert.equal(diff.retired.length, 1);
    assert.equal(diff.retired[0].id, "old");
    assert.equal(diff.added.length, 1);
    assert.equal(diff.added[0].id, "reviews");
    assert.equal(diff.metaChanges.length, 1);
  });

  it("keeps malformed JSON code entries with warnings instead of silently dropping them and trims notes", () => {
    const raw = JSON.stringify({
      v: 1,
      param: "c",
      fallback: "/",
      codes: {
        menu: { to: "https://example.com/menu.pdf", note: "  Table tent  " },
        broken: null,
        num: 42,
      },
    });
    const parsed = parseSnippetOrJson(raw);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.rows.length, 3);
      assert.equal(parsed.rows[0].note, "Table tent");
      assert.equal(parsed.rows[1].id, "broken");
      assert.equal(parsed.rows[1].to, "");
      assert.equal(parsed.rows[2].id, "num");
      assert.equal(parsed.warnings.length, 2);
    }
  });

  it("sanitizes saved storage rows, cleans manifest cells, and parses pathological script inputs in linear time", () => {
    const cleaned = sanitizeSavedSnippetRows([
      null,
      "bad",
      { id: 123, to: "https://example.com" },
      { id: "missing-to" },
      { uid: "ok-1", id: " menu ", to: " https://example.com/m ", note: "  Line  ", retired: 1 },
    ]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].id, "menu");
    assert.equal(cleaned[0].to, "https://example.com/m");
    assert.equal(cleaned[0].note, "Line");
    assert.equal(cleaned[0].retired, true);

    assert.equal(cleanManifestCell("Table\ttent\r\nline 2\nline 3"), "Table tent line 2 line 3");

    // 20,000 unclosed <script tags must not hang (linear-time parser)
    const nasty = "<script ".repeat(20_000);
    const t0 = Date.now();
    const res = parseSnippetOrJson(nasty);
    const elapsed = Date.now() - t0;
    assert.equal(res.ok, false);
    assert.ok(elapsed < 500, `Expected linear-time refusal, took ${elapsed}ms`);

    // 50,000 closed <script x></script> tags before a real snippet must also parse in linear time
    const validCfg = rowsToBanditConfig(
      [{ uid: "s1", originalId: null, id: "menu", to: "https://example.com/menu.pdf", note: "Table tent", retired: false }],
      "c",
      "/",
    );
    const closedMany = "<script x></script>".repeat(50_000) + writeInlineSnippet(validCfg);
    const t1 = Date.now();
    const closedRes = parseSnippetOrJson(closedMany);
    const elapsedClosed = Date.now() - t1;
    assert.equal(closedRes.ok, true);
    assert.ok(elapsedClosed < 1000, `Expected linear-time scan over closed script tags, took ${elapsedClosed}ms`);
  });

  it("round-trips snippets containing Turkish dotted capital I (U+0130) in notes and leading text", () => {
    const rows: SnippetRow[] = [
      {
        uid: "tr-1",
        originalId: null,
        id: "menu",
        to: "https://example.com/menu.pdf",
        note: "İçecek menüsü",
        retired: false,
      },
    ];
    const cfg = rowsToBanditConfig(rows, "c", "/");
    const html = writeInlineSnippet(cfg);

    const parsedNote = parseSnippetOrJson(html);
    assert.equal(parsedNote.ok, true);
    if (parsedNote.ok) {
      assert.equal(parsedNote.rows.length, 1);
      assert.equal(parsedNote.rows[0].id, "menu");
      assert.equal(parsedNote.rows[0].note, "İçecek menüsü");
    }

    const withLeadingI = `<!-- İstanbul location -->\n${html}`;
    const parsedLeading = parseSnippetOrJson(withLeadingI);
    assert.equal(parsedLeading.ok, true);
    if (parsedLeading.ok) {
      assert.equal(parsedLeading.rows.length, 1);
      assert.equal(parsedLeading.rows[0].id, "menu");
      assert.equal(parsedLeading.rows[0].note, "İçecek menüsü");
    }
  });

  it("parses bulk paste rows, preserves capital IDs, and auto-numbers duplicate snippet IDs", () => {
    const bulk = parseSnippetBulkPaste(
      "Menu, https://example.com/a.pdf, Front\nmenu, https://example.com/b.pdf, Back",
    );
    assert.equal(bulk.ok, true);
    if (bulk.ok) {
      assert.deepEqual(
        bulk.rows.map((r) => r.id),
        ["Menu", "menu-2"],
      );
      assert.equal(bulk.rows[0].note, "Front");
    }
  });
});
