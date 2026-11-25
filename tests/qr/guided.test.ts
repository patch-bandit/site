import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GUIDED_GOALS,
  GUIDED_HOSTS,
  MAX_BATCH_QUIET_ZONE,
  MAX_BATCH_ZIP_BYTES,
  MIN_BATCH_QUIET_ZONE,
  RULE_FORMATS,
  batchStyleFromPreset,
  batchStyleMissingImageReason,
  batchStyleToConfig,
  checkBatchZipSize,
  clampBatchQuietZone,
  decodeBitmapDataUri,
  defaultBatchStyle,
  describeBatchStyle,
  estimateBatchZipBytes,
  getGuidedPlan,
  normalizeOwnedBaseOnBlur,
  normalizeRawDomainUrl,
  parseBulkEscapePaste,
  parseConfig,
  parseEscapeCsv,
  parseEscapeJson,
  parseLinksCsv,
  parseLinksFile,
  parseSnippetBulkPaste,
  parseSnippetOrJson,
  parseTwoColumnLinks,
  renderBatchQrSvg,
  renderSvg,
  verifyBatchQrCodes,
  type Rasterizer,
} from "../../qr-src/lib/index.ts";
import QRCode from "qrcode";

describe("round 5: blur trailing slash, raw domain https://, batch QR style, guided start, and noindex developer notes", () => {
  it("auto-adds https:// to bare domains while keeping http://, https://, and refusing non-HTTP schemes", () => {
    assert.deepEqual(normalizeRawDomainUrl("yoursite.com/menu"), {
      value: "https://yoursite.com/menu",
      addedHttps: true,
    });
    assert.deepEqual(normalizeRawDomainUrl("127.0.0.1/qr-codes"), {
      value: "https://127.0.0.1/qr-codes",
      addedHttps: true,
    });
    assert.deepEqual(normalizeRawDomainUrl("shop.mybakery.co.uk:8443/order?a=1#top"), {
      value: "https://shop.mybakery.co.uk:8443/order?a=1#top",
      addedHttps: true,
    });
    // Existing http:// and https:// are untouched
    assert.deepEqual(normalizeRawDomainUrl("http://legacy.example/menu"), {
      value: "http://legacy.example/menu",
      addedHttps: false,
    });
    assert.deepEqual(normalizeRawDomainUrl("https://yoursite.com/menu"), {
      value: "https://yoursite.com/menu",
      addedHttps: false,
    });
    // Relative paths, protocol-relative URLs, dangerous schemes, emails, and bare filenames stay untouched
    for (const untouch of [
      "/",
      "/qr-codes",
      "//evil.example/phish",
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://files.example/a",
      "mailto:owner@example.com",
      "owner@example.com",
      "not-a-url",
      "menu.pdf",
      "report.pdf/",
    ]) {
      assert.deepEqual(normalizeRawDomainUrl(untouch), { value: untouch, addedHttps: false }, `Should not modify ${untouch}`);
    }
  });

  it("adds https:// and a trailing slash on blur only when the owned base address is otherwise valid", () => {
    assert.deepEqual(normalizeOwnedBaseOnBlur("https://127.0.0.1/qr-codes"), {
      value: "https://127.0.0.1/qr-codes/",
      addedHttps: false,
      addedSlash: true,
    });
    assert.deepEqual(normalizeOwnedBaseOnBlur("127.0.0.1/qr-codes"), {
      value: "https://127.0.0.1/qr-codes/",
      addedHttps: true,
      addedSlash: true,
    });
    assert.deepEqual(normalizeOwnedBaseOnBlur("myshop.example/go"), {
      value: "https://myshop.example/go/",
      addedHttps: true,
      addedSlash: true,
    });
    assert.deepEqual(normalizeOwnedBaseOnBlur("https://myshop.example/go/"), {
      value: "https://myshop.example/go/",
      addedHttps: false,
      addedSlash: false,
    });
    // Bare origin without a folder adds https:// but does not add a root-only slash
    assert.deepEqual(normalizeOwnedBaseOnBlur("myshop.example"), {
      value: "https://myshop.example",
      addedHttps: true,
      addedSlash: false,
    });
    // http:// stays untouched and invalid for owned base
    assert.deepEqual(normalizeOwnedBaseOnBlur("http://127.0.0.1/qr-codes"), {
      value: "http://127.0.0.1/qr-codes",
      addedHttps: false,
      addedSlash: false,
    });
    // javascript: stays untouched and invalid
    assert.deepEqual(normalizeOwnedBaseOnBlur("javascript:alert(1)"), {
      value: "javascript:alert(1)",
      addedHttps: false,
      addedSlash: false,
    });
  });

  it("auto-adds https:// for bare domains across bulk paste, CSV, and JSON imports while still refusing dangerous schemes", () => {
    // Redirect kit bulk paste
    const bulkKit = parseTwoColumnLinks("menu, myshop.example/menu\nold, http://legacy.example/a\nbad, javascript:alert(1)", "myshop.example/go");
    assert.equal(bulkKit.ok, true);
    if (bulkKit.ok) {
      assert.equal(bulkKit.links.length, 2);
      assert.equal(bulkKit.links[0].destination, "https://myshop.example/menu");
      assert.equal(bulkKit.links[1].destination, "http://legacy.example/a");
      assert.equal(bulkKit.skipped.length, 1);
    }

    // Redirect kit CSV import
    const kitCsv = parseLinksCsv("base,slug,label,destination\nmyshop.example/go,menu,Menu,myshop.example/spring-menu\n");
    assert.equal(kitCsv.ok, true);
    if (kitCsv.ok) {
      assert.equal(kitCsv.file.base, "https://myshop.example/go/");
      assert.equal(kitCsv.file.links[0].destination, "https://myshop.example/spring-menu");
    }

    // Redirect kit JSON import (bare domain succeeds; javascript: refused)
    const kitJson = parseLinksFile({
      format: "bandit-codes-links",
      version: 1,
      base: "myshop.example/go",
      links: [{ slug: "menu", label: "Menu", destination: "myshop.example/menu", campaign: { source: "", medium: "", campaign: "", content: "" } }],
    });
    assert.equal(kitJson.ok, true);
    if (kitJson.ok) {
      assert.equal(kitJson.file.base, "https://myshop.example/go/");
      assert.equal(kitJson.file.links[0].destination, "https://myshop.example/menu");
    }
    const kitJsonBad = parseLinksFile({
      format: "bandit-codes-links",
      version: 1,
      base: "https://myshop.example/go/",
      links: [{ slug: "evil", label: "Bad", destination: "data:text/html,hi", campaign: { source: "", medium: "", campaign: "", content: "" } }],
    });
    assert.equal(kitJsonBad.ok, false);

    // Snippet bulk paste and JSON import
    const snipBulk = parseSnippetBulkPaste("menu, myshop.example/menu.pdf, Table tent\nlegacy, http://legacy.example/a\nbad, javascript:alert(1)");
    assert.equal(snipBulk.ok, true);
    if (snipBulk.ok) {
      assert.equal(snipBulk.rows[0].to, "https://myshop.example/menu.pdf");
      assert.equal(snipBulk.rows[1].to, "http://legacy.example/a");
      assert.equal(snipBulk.rows[2].to, "javascript:alert(1)");
    }
    const snipJson = parseSnippetOrJson(
      JSON.stringify({
        v: 1,
        param: "c",
        fallback: "myshop.example/home",
        codes: {
          menu: { to: "myshop.example/menu.pdf" },
          evil: { to: "javascript:alert(1)" },
        },
      }),
    );
    assert.equal(snipJson.ok, true);
    if (snipJson.ok) {
      assert.equal(snipJson.fallback, "https://myshop.example/home");
      assert.equal(snipJson.rows[0].to, "https://myshop.example/menu.pdf");
      assert.equal(snipJson.rows[1].to, "javascript:alert(1)");
    }

    // Escape plan CSV, JSON, and bulk paste
    const escCsv = parseEscapeCsv("piece,current_url,landing_url\nMenu,https://vendor.example/1,myshop.example/menu\n", "myshop.example/go", "myshop.example");
    assert.equal(escCsv.ok, true);
    if (escCsv.ok) {
      assert.equal(escCsv.plan.ownedBase, "https://myshop.example/go/");
      assert.equal(escCsv.plan.items[0].landingUrl, "https://myshop.example/menu");
    }
    const escJson = parseEscapeJson({
      format: "bandit-codes-escape-plan",
      version: 1,
      ownedBase: "myshop.example/go",
      ownedDomains: "myshop.example",
      items: [{ id: "e1", piece: "Menu", currentUrl: "", landingUrl: "myshop.example/menu", newSlug: "menu", priority: "high", status: "mapped", notes: "" }],
    });
    assert.equal(escJson.ok, true);
    if (escJson.ok) {
      assert.equal(escJson.plan.ownedBase, "https://myshop.example/go/");
      assert.equal(escJson.plan.items[0].landingUrl, "https://myshop.example/menu");
    }
    const escBulk = parseBulkEscapePaste("Table tent, myshop.example/menu");
    assert.equal(escBulk.ok, true);
    if (escBulk.ok) {
      assert.equal(escBulk.items[0].landingUrl, "https://myshop.example/menu");
    }
  });

  it("describes and renders custom batch QR styles for ZIP downloads", () => {
    const classic = defaultBatchStyle();
    assert.equal(describeBatchStyle(classic), "Style: black on white, square");

    const ink = batchStyleFromPreset("ink");
    assert.equal(describeBatchStyle(ink), "Style: dark on white, rounded");

    const alley = batchStyleFromPreset("alley");
    assert.equal(describeBatchStyle(alley), "Style: dark on cream, rounded");

    const svgDefault = renderBatchQrSvg("https://myshop.example/go/menu", classic);
    const svgInk = renderBatchQrSvg("https://myshop.example/go/menu", ink);
    assert.ok(svgDefault.startsWith("<svg"));
    assert.ok(svgInk.startsWith("<svg"));
    assert.ok(svgInk.includes("#140A22"));
    assert.notEqual(svgDefault, svgInk);
  });

  it("maps every goal and all 12 website hosts to valid tabs, formats, 3 ordered steps, and guide URLs", () => {
    assert.equal(GUIDED_GOALS.length, 3);
    assert.equal(GUIDED_HOSTS.length, 12);

    const validFormats = new Set(RULE_FORMATS.map((f) => f.id));
    for (const goal of GUIDED_GOALS) {
      for (const host of GUIDED_HOSTS) {
        const plan = getGuidedPlan(goal.id, host.id);
        assert.equal(plan.steps.length, 3);
        assert.deepEqual(
          plan.steps.map((s) => s.step),
          [1, 2, 3],
        );
        assert.ok(validFormats.has(plan.ruleFormat), `Invalid format ${plan.ruleFormat}`);
        assert.ok(plan.guidePath.startsWith("/tools/qr-code-generator/guides/"));
        assert.ok(plan.guidePath.endsWith("/"));
        assert.ok(plan.devNote.length > 20);
        // No em or en dashes in guided copy
        assert.ok(!/[\u2013\u2014]/.test(plan.summary + plan.devNote + plan.headline));
      }
    }

    const stuckSq = getGuidedPlan("stuck", "squarespace");
    assert.equal(stuckSq.initialTab, "escape");
    assert.equal(stuckSq.ownCodesTab, "snippet");
    assert.equal(stuckSq.guidePath, "/tools/qr-code-generator/guides/squarespace/");

    const freshNetlify = getGuidedPlan("fresh", "netlify");
    assert.equal(freshNetlify.initialTab, "redirects");
    assert.equal(freshNetlify.ruleFormat, "netlify");
    assert.equal(freshNetlify.guidePath, "/tools/qr-code-generator/guides/netlify/");

    const freshShopify = getGuidedPlan("fresh", "shopify");
    assert.equal(freshShopify.initialTab, "snippet");
    assert.equal(freshShopify.snippetPlaceholder, "https://yoursite.com/pages/qr-codes");

    const freshCpanel = getGuidedPlan("fresh", "cpanel");
    assert.equal(freshCpanel.initialTab, "redirects");
    assert.equal(freshCpanel.ruleFormat, "apache");
    assert.equal(freshCpanel.guidePath, "/tools/qr-code-generator/guides/cpanel/");
  });

  it("documents temporary redirects and X-Robots-Tag: noindex in every host format developer note", () => {
    for (const fmt of RULE_FORMATS) {
      if (fmt.id === "json") continue;
      assert.ok(
        fmt.devNote.includes("X-Robots-Tag") && fmt.devNote.includes("noindex"),
        `${fmt.id} devNote should explain X-Robots-Tag: noindex accurately`,
      );
      if (fmt.id !== "html") {
        assert.ok(
          fmt.devNote.includes("302") || fmt.devNote.includes("307"),
          `${fmt.id} devNote should confirm temporary redirect status (302 or 307)`,
        );
      }
      assert.ok(
        /case/i.test(fmt.devNote),
        `${fmt.id} devNote should state how redirect capitalization behaves`,
      );
    }
  });
});

function makePngBytes(width: number, height: number): Uint8Array {
  // Minimal PNG header + IHDR chunk (enough for imageSize header check)
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  b[16] = (width >>> 24) & 0xff;
  b[17] = (width >>> 16) & 0xff;
  b[18] = (width >>> 8) & 0xff;
  b[19] = width & 0xff;
  b[20] = (height >>> 24) & 0xff;
  b[21] = (height >>> 16) & 0xff;
  b[22] = (height >>> 8) & 0xff;
  b[23] = height & 0xff;
  return b;
}

function bytesToDataUri(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function makeMatrixRasterizer(failUrlPrefix?: string): { rasterizer: Rasterizer; calls: number } {
  let calls = 0;
  const rasterizer: Rasterizer = {
    async toPixels(svg, size) {
      calls += 1;
      // Extract quiet zone and return blank white pixels when simulating a scan failure
      if (failUrlPrefix && svg.includes("#FAFAFA")) {
        const blank = new Uint8ClampedArray(size * size * 4);
        blank.fill(255);
        return { data: blank, width: size, height: size };
      }
      const data = new Uint8ClampedArray(size * size * 4);
      data.fill(255);
      return { data, width: size, height: size };
    },
    async toPng() {
      return new Uint8Array();
    },
  };
  return {
    rasterizer,
    get calls() {
      return calls;
    },
  };
}

function makeExactUrlRasterizer(failOnUrl?: string): Rasterizer {
  // Renders a crisp black-and-white QR bitmap directly from QRCode.create for any URL except failOnUrl
  let currentUrl = "";
  return {
    async toPixels(svg, size) {
      // Find which URL was encoded by matching viewBox/matrix or using failOnUrl test hook via tracked URLs
      const blank = new Uint8ClampedArray(size * size * 4);
      blank.fill(255);
      if (failOnUrl && currentUrl === failOnUrl) {
        return { data: blank, width: size, height: size };
      }
      // Decode matrix size from SVG viewBox="0 0 total total"
      const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
      if (!m) return { data: blank, width: size, height: size };
      const segs = [{ data: new TextEncoder().encode(currentUrl), mode: "byte" as const }];
      const qr = QRCode.create(segs, { errorCorrectionLevel: "M" });
      const n = qr.modules.size;
      const total = Number(m[1]);
      const q = Math.round((total - n) / 2);
      const scale = Math.max(1, Math.floor(size / total));
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (qr.modules.get(r, c) !== 1) continue;
          for (let dy = 0; dy < scale; dy++) {
            const row = ((r + q) * scale + dy) * size;
            for (let dx = 0; dx < scale; dx++) {
              const o = (row + (c + q) * scale + dx) * 4;
              blank[o] = 0;
              blank[o + 1] = 0;
              blank[o + 2] = 0;
            }
          }
        }
      }
      return { data: blank, width: size, height: size };
    },
    async toPng() {
      return new Uint8Array();
    },
    setUrl(u: string) {
      currentUrl = u;
    },
  } as Rasterizer & { setUrl: (u: string) => void };
}

describe("batch scan checks, quiet zone bounds, ZIP size caps, image hardening, and renderer validation", () => {
  it("enforces batch quiet zone 2..8 bounds and catches missing picture mode without silently falling back", () => {
    assert.equal(MIN_BATCH_QUIET_ZONE, 2);
    assert.equal(MAX_BATCH_QUIET_ZONE, 8);
    assert.equal(clampBatchQuietZone(0), 2);
    assert.equal(clampBatchQuietZone(1), 2);
    assert.equal(clampBatchQuietZone(4), 4);
    assert.equal(clampBatchQuietZone(16), 8);

    const noPicLogo = { ...defaultBatchStyle(), image: { mode: "logo" as const, scale: 0.22, veil: 0.3 } };
    assert.ok(batchStyleMissingImageReason(noPicLogo)?.includes("logo"));
    assert.throws(() => batchStyleToConfig("https://myshop.example/go/menu", noPicLogo), /Add an image/i);
    // Preview mode explicitly opts into allowMissingImage
    const previewCfg = batchStyleToConfig("https://myshop.example/go/menu", noPicLogo, { allowMissingImage: true });
    assert.equal(previewCfg.image.mode, "none");

    const noPicBlend = { ...defaultBatchStyle(), image: { mode: "blend" as const, scale: 0.22, veil: 0.3 } };
    assert.ok(batchStyleMissingImageReason(noPicBlend)?.includes("photo"));
    assert.throws(() => batchStyleToConfig("https://myshop.example/go/menu", noPicBlend), /Add an image/i);
  });

  it("verifies real batch URLs longest-first and stops with the failing code ID on unreadable styles", async () => {
    const items = [
      { id: "short", url: "https://myshop.example/go/a" },
      { id: "longest-code", url: "https://myshop.example/go/very-long-campaign-short-name-2026" },
    ];
    // Quiet zone < 2 fails verify immediately and reports the longest code first
    const badQuiet = { ...defaultBatchStyle(), quietZone: 1 };
    const dummy = makeMatrixRasterizer().rasterizer;
    const failedQuiet = await verifyBatchQrCodes(items, badQuiet, dummy);
    assert.equal(failedQuiet.ok, false);
    if (!failedQuiet.ok) {
      assert.equal(failedQuiet.failedId, "longest-code");
      assert.ok(failedQuiet.message.includes("margin"));
    }

    // Rasterizer that fails on the longest real URL stops the batch and names that code
    const failingRasterizer: Rasterizer = {
      async toPixels(_svg, size) {
        const blank = new Uint8ClampedArray(size * size * 4);
        blank.fill(255);
        return { data: blank, width: size, height: size };
      },
      async toPng() {
        return new Uint8Array();
      },
    };
    const failedScan = await verifyBatchQrCodes(items, defaultBatchStyle(), failingRasterizer);
    assert.equal(failedScan.ok, false);
    if (!failedScan.ok) {
      assert.equal(failedScan.failedId, "longest-code");
      assert.ok(failedScan.message.includes("did not read back"));
    }

    // Passing rasterizer verifies every item in the batch
    const singleItem = [{ id: "SpringMenu", url: "https://myshop.example/go/SpringMenu" }];
    const okRaster = makeExactUrlRasterizer() as Rasterizer & { setUrl: (u: string) => void };
    okRaster.setUrl(singleItem[0].url);
    const passed = await verifyBatchQrCodes(singleItem, defaultBatchStyle(), okRaster);
    assert.deepEqual(passed, { ok: true, checkedCount: 1 });
  });

  it("caps batch ZIP estimated size at 50 MB when a picture is repeated across many codes", () => {
    const plain = defaultBatchStyle();
    assert.equal(checkBatchZipSize(500, plain).ok, true);

    const bigPhoto = {
      ...defaultBatchStyle(),
      image: { mode: "blend" as const, src: `data:image/jpeg;base64,${"A".repeat(300_000)}`, scale: 0.22, veil: 0.3 },
    };
    const est = estimateBatchZipBytes(200, bigPhoto);
    assert.ok(est > MAX_BATCH_ZIP_BYTES);
    const chk = checkBatchZipSize(200, bigPhoto);
    assert.equal(chk.ok, false);
    if (!chk.ok) {
      assert.ok(chk.reason.includes("50 MB"));
      assert.ok(chk.reason.includes("Change style"));
    }
  });

  it("refuses SVG data URIs, disguised markup, unreadable headers, and huge pixel-bomb PNGs on config import", () => {
    const svgUri = `data:image/svg+xml;base64,${Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>").toString("base64")}`;
    const parsedSvg = parseConfig({
      version: 1,
      type: "link",
      content: { url: "https://myshop.example/" },
      image: { mode: "logo", src: svgUri, scale: 0.2, veil: 0.3 },
    });
    assert.equal(parsedSvg.ok, false);
    assert.throws(() => decodeBitmapDataUri(svgUri), /SVG/i);

    // Disguised SVG labeled image/png
    const fakePng = `data:image/png;base64,${Buffer.from("<svg></svg>").toString("base64")}`;
    assert.throws(() => decodeBitmapDataUri(fakePng), /markup/i);

    // Corrupt / unreadable PNG header
    const corruptPng = `data:image/png;base64,${Buffer.from("not-a-png-header").toString("base64")}`;
    assert.throws(() => decodeBitmapDataUri(corruptPng), /size could not be read/i);

    // 30,000 x 30,000 PNG decompression bomb is refused by header check
    const bombUri = bytesToDataUri("image/png", makePngBytes(30_000, 30_000));
    assert.throws(() => decodeBitmapDataUri(bombUri), /8,000 pixels/i);

    // Valid small PNG header passes decodeBitmapDataUri
    const okUri = bytesToDataUri("image/png", makePngBytes(64, 64));
    const decoded = decodeBitmapDataUri(okUri);
    assert.equal(decoded.mime, "image/png");
    assert.equal(decoded.bytes.length, 33);
  });

  it("validates batch configs through parseConfig and refuses non-hex colors in renderSvg", () => {
    const badStyle = { ...defaultBatchStyle(), dotColor: '#000000" onload="alert(1)' };
    assert.throws(() => batchStyleToConfig("https://myshop.example/go/menu", badStyle), /6-digit hex/i);

    // Direct call to renderSvg with tampered colors must also throw
    const validCfg = batchStyleToConfig("https://myshop.example/go/menu", defaultBatchStyle());
    const tamperedDot = { ...validCfg, style: { ...validCfg.style, dotColor: '#000" onload="alert(1)' } };
    assert.throws(() => renderSvg(tamperedDot), /6-digit hex/i);
    const tamperedBg = { ...validCfg, style: { ...validCfg.style, backgroundColor: "white" } };
    assert.throws(() => renderSvg(tamperedBg), /6-digit hex/i);
    const tamperedCorner = { ...validCfg, style: { ...validCfg.style, cornerColor: "#123" } };
    assert.throws(() => renderSvg(tamperedCorner), /6-digit hex/i);
  });
});
