import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkBase,
  checkDestination,
  checkSlug,
  csvCell,
  parseLinksCsv,
  parseLinksFile,
  parseTwoColumnLinks,
  ruleNotes,
  rulesOf,
  suggestSlug,
  writeHtmlFiles,
  writeLinksCsv,
  writeLinksJson,
  writeRules,
  type LinksFile,
  type RuleFormat,
} from "../../qr-src/lib/redirects.ts";
import { applyCampaign } from "../../qr-src/lib/campaignCore.ts";
import { parseCsv, unescapeCsvFormula, writeCsv } from "../../qr-src/lib/csv.ts";
import {
  classifyQrPayload,
  hostMatchesOwned,
  normalizeDomain,
  parseOwnedDomains,
  parseOwnedDomainsDetailed,
} from "../../qr-src/lib/lockin.ts";
import {
  escapeSummary,
  escapeToLinks,
  parseBulkEscapePaste,
  parseEscapeCsv,
  parseEscapeJson,
  sortEscapeItems,
  writeEscapeCsv,
  writeEscapeJson,
  writeReprintCsv,
  type EscapePlan,
} from "../../qr-src/lib/migration.ts";
import { printGuide } from "../../qr-src/lib/printSize.ts";
import { MAX_ZIP_BYTES, MAX_ZIP_ENTRIES, buildZip, crc32, validateZipLimits } from "../../qr-src/lib/batchZip.ts";

const NOW = new Date("2026-11-24T00:00:00Z");

const sampleLinksFile = (over: Partial<LinksFile> = {}): LinksFile => ({
  format: "bandit-codes-links",
  version: 1,
  base: "https://mybakery.com/go/",
  links: [
    {
      slug: "menu",
      label: "Table tent, main",
      destination: "https://mybakery.com/spring-menu?day=1#desserts",
      campaign: { source: "table-tent", medium: "print", campaign: "spring", content: "" },
    },
    {
      slug: "reviews",
      label: 'Counter "leave a note" card',
      destination: "https://mybakery.com/feedback/a.b",
      campaign: { source: "", medium: "", campaign: "", content: "" },
    },
  ],
  ...over,
});

describe("redirect rule writers (all formats)", () => {
  it("writes Netlify / Cloudflare Pages _redirects with 302 and encoded placeholders", () => {
    const out = writeRules(sampleLinksFile(), "netlify", NOW);
    assert.equal(
      out,
      `# Bandit Codes forwarding rules for https://mybakery.com/go/, made 2026-11-24. 302 (temporary) redirects.\n` +
        `/go/menu  https://mybakery.com/spring-menu?day=1&utm_source=table-tent&utm_medium=print&utm_campaign=spring  302\n` +
        `/go/reviews  https://mybakery.com/feedback/a.b  302\n`,
    );
    const special = sampleLinksFile({
      links: [
        {
          slug: "wild",
          label: "",
          destination: "https://mybakery.com:8443/*/:id?ref=:name",
          campaign: { source: "", medium: "", campaign: "", content: "" },
        },
      ],
    });
    const outSpecial = writeRules(special, "netlify", NOW);
    assert.ok(outSpecial.includes("https://mybakery.com:8443/"));
    assert.ok(outSpecial.includes("%2A"));
    assert.ok(outSpecial.includes("/%3Aid"));
    assert.ok(outSpecial.includes("?ref=%3Aname"));
  });

  it("writes Cloudflare Bulk Redirects headerless CSV with scheme-less source", () => {
    const out = writeRules(sampleLinksFile(), "cloudflare", NOW);
    assert.equal(
      out,
      `mybakery.com/go/menu,https://mybakery.com/spring-menu?day=1&utm_source=table-tent&utm_medium=print&utm_campaign=spring,302\n` +
        `mybakery.com/go/reviews,https://mybakery.com/feedback/a.b,302\n`,
    );
    const withComma = sampleLinksFile({
      links: [
        {
          slug: "a",
          label: "A",
          destination: "https://mybakery.com/x,y",
          campaign: { source: "", medium: "", campaign: "", content: "" },
        },
      ],
    });
    assert.equal(writeRules(withComma, "cloudflare", NOW), 'mybakery.com/go/a,"https://mybakery.com/x,y",302\n');
  });

  it("writes valid Vercel vercel.json with permanent: false and encodes : and $ after host", () => {
    const out = writeRules(sampleLinksFile(), "vercel", NOW);
    const parsed = JSON.parse(out);
    assert.deepEqual(parsed, {
      redirects: [
        {
          source: "/go/menu",
          destination: "https://mybakery.com/spring-menu?day=1&utm_source=table-tent&utm_medium=print&utm_campaign=spring",
          permanent: false,
        },
        {
          source: "/go/reviews",
          destination: "https://mybakery.com/feedback/a.b",
          permanent: false,
        },
      ],
    });

    const withPlaceholders = sampleLinksFile({
      links: [
        {
          slug: "v",
          label: "",
          destination: "https://mybakery.com/item/:id?price=$1",
          campaign: { source: "", medium: "", campaign: "", content: "" },
        },
      ],
    });
    const parsedPh = JSON.parse(writeRules(withPlaceholders, "vercel", NOW));
    assert.equal(parsedPh.redirects[0].destination, "https://mybakery.com/item/%3Aid?price=%241");
  });

  it("writes Apache .htaccess with escaped dots and server-safe characters", () => {
    const f = sampleLinksFile({ base: "https://mybakery.com/my.dir/" });
    const out = writeRules(f, "apache", NOW);
    assert.ok(
      out.includes(
        'RedirectMatch 302 "^/my\\.dir/menu/?$" "https://mybakery.com/spring-menu?day=1&utm_source=table-tent&utm_medium=print&utm_campaign=spring"',
      ),
    );
    assert.ok(!out.split("\n").filter((l) => !l.startsWith("#")).join("").includes("#"));
  });

  it("writes nginx config and neutralizes server-active characters", () => {
    const f = sampleLinksFile({
      links: [
        {
          slug: "safe",
          label: "SECRET-LABEL",
          destination: "https://mybakery.com/a$b;c{d}e%zz?q=1;DROP",
          campaign: { source: "", medium: "", campaign: "", content: "" },
        },
      ],
    });
    for (const fmt of ["apache", "nginx"] as RuleFormat[]) {
      const out = writeRules(f, fmt, NOW);
      assert.ok(!out.includes("SECRET-LABEL"));
      const lines = out.split("\n").filter((l) => l && !l.startsWith("#"));
      assert.equal(lines.length, 1);
      assert.ok(lines[0].includes("%24"));
      assert.ok(lines[0].includes("%3B"));
      assert.ok(lines[0].includes("%7B"));
      assert.ok(lines[0].includes("%7D"));
      assert.ok(lines[0].includes("%25zz"));
    }
  });

  it("writes WordPress Redirection plugin CSV with headers", () => {
    const out = writeRules(sampleLinksFile(), "redirection", NOW);
    assert.equal(
      out,
      `"source","target","regex","code"\n` +
        `"/go/menu","https://mybakery.com/spring-menu?day=1&utm_source=table-tent&utm_medium=print&utm_campaign=spring","0","302"\n` +
        `"/go/reviews","https://mybakery.com/feedback/a.b","0","302"\n`,
    );
  });

  it("enforces strictly one HTML document per file and refuses concatenated multi-link HTML", () => {
    const single = sampleLinksFile({ links: [sampleLinksFile().links[0]] });
    const out = writeRules(single, "html", NOW);
    assert.equal((out.match(/<!doctype html>/gi) ?? []).length, 1);
    assert.ok(out.includes('http-equiv="refresh"'));
    assert.ok(out.includes("&amp;utm_source=table-tent"));
    assert.ok(out.includes("#desserts"));
    assert.ok(out.includes("location.replace("));

    // Multi-link writeRules(..., "html") must refuse rather than concatenate documents
    assert.throws(() => writeRules(sampleLinksFile(), "html", NOW), /one separate index\.html/i);

    // writeHtmlFiles returns strictly one standalone HTML document per link
    const perFiles = writeHtmlFiles(sampleLinksFile());
    assert.equal(perFiles.length, 2);
    assert.equal(perFiles[0].filePath, "go/menu/index.html");
    assert.equal(perFiles[1].filePath, "go/reviews/index.html");
    for (const f of perFiles) {
      assert.equal((f.html.match(/<!doctype html>/gi) ?? []).length, 1);
      assert.equal((f.html.match(/<\/html>/gi) ?? []).length, 1);
    }
  });

  it("reports plain-language rule notes when fragments are cut, http:// is used, or chars are encoded", () => {
    const notes = ruleNotes(sampleLinksFile());
    assert.equal(notes.length, 1);
    assert.ok(notes[0].includes("#section"));
    assert.equal(rulesOf(sampleLinksFile())[0].cutFragment, true);

    const httpDest = sampleLinksFile({
      links: [
        {
          slug: "plain",
          label: "Old page",
          destination: "http://legacy.example/page",
          campaign: { source: "", medium: "", campaign: "", content: "" },
        },
      ],
    });
    const httpNotes = ruleNotes(httpDest);
    assert.ok(httpNotes.some((n) => n.includes("http://")));
  });
});

describe("raw-text validation and campaign merging", () => {
  it("refuses http:// for owned base, hidden separators, lone surrogates, bad bases, and bad slugs, while keeping capital IDs", () => {
    for (const code of [0xa0, 0x85, 0x2028, 0x3000, 0x202e, 0x200b, 0xfeff]) {
      assert.equal(checkDestination(`https://a.com/x${String.fromCharCode(code)}301`).ok, false);
    }
    assert.equal(checkDestination(`https://a.com/${String.fromCharCode(0xd800)}`).ok, false);
    // http:// owned base refused
    assert.equal(checkBase("http://mybakery.com/go/").ok, false);
    assert.equal(checkBase("https://mybakery.com/").ok, false);
    assert.equal(checkBase("https://mybakery.com/go").ok, false);
    assert.equal(checkBase("https://mybakery.com/go/../x/").ok, false);
    assert.equal(checkBase("https://mybakery.com/go/").ok, true);
    // Capital code IDs accepted; leading punctuation, spaces, and special chars refused
    assert.equal(checkSlug("Menu").ok, true);
    assert.equal(checkSlug("SpringMenu_2026-A").ok, true);
    assert.equal(checkSlug("-leading-dash").ok, false);
    assert.equal(checkSlug("has space").ok, false);
    assert.equal(checkSlug("bad/slash").ok, false);
    assert.equal(checkSlug("spring-menu_2").ok, true);
    assert.equal(suggestSlug("Spring Menu 2026!"), "spring-menu-2026");

    // Case-only duplicates are refused in parseLinksFile to avoid ZIP and case-insensitive host collisions
    const dupCase = parseLinksFile({
      format: "bandit-codes-links",
      version: 1,
      base: "https://mybakery.com/go/",
      links: [
        { slug: "Menu", label: "A", destination: "https://mybakery.com/a", campaign: { source: "", medium: "", campaign: "", content: "" } },
        { slug: "menu", label: "B", destination: "https://mybakery.com/b", campaign: { source: "", medium: "", campaign: "", content: "" } },
      ],
    });
    assert.equal(dupCase.ok, false);
  });

  it("preserves capital code IDs across CSV/JSON import, rule writers, HTML paths, and honest case notes", () => {
    const capFile = sampleLinksFile({
      links: [
        {
          slug: "SpringMenu",
          label: "Spring Menu",
          destination: "https://mybakery.com/spring-menu",
          campaign: { source: "", medium: "", campaign: "", content: "" },
        },
      ],
    });
    const parsedJson = parseLinksFile(writeLinksJson(capFile));
    assert.equal(parsedJson.ok, true);
    if (parsedJson.ok) assert.equal(parsedJson.file.links[0].slug, "SpringMenu");

    const parsedCsv = parseLinksCsv(writeLinksCsv(capFile));
    assert.equal(parsedCsv.ok, true);
    if (parsedCsv.ok) assert.equal(parsedCsv.file.links[0].slug, "SpringMenu");

    assert.ok(writeRules(capFile, "netlify", NOW).includes("/go/SpringMenu  https://mybakery.com/spring-menu  302"));
    assert.ok(writeRules(capFile, "apache", NOW).includes('RedirectMatch 302 "^/go/SpringMenu/?$"'));
    assert.ok(writeRules(capFile, "nginx", NOW).includes("location ~ ^/go/SpringMenu/?$"));
    assert.ok(writeRules(capFile, "cloudflare", NOW).includes("mybakery.com/go/SpringMenu,https://mybakery.com/spring-menu,302"));
    assert.ok(writeRules(capFile, "redirection", NOW).includes('"/go/SpringMenu"'));
    assert.equal(JSON.parse(writeRules(capFile, "vercel", NOW)).redirects[0].source, "/go/SpringMenu");
    assert.equal(writeHtmlFiles(capFile)[0].filePath, "go/SpringMenu/index.html");

    const notes = ruleNotes(capFile);
    assert.ok(notes.some((n) => n.includes("Capital letters") && n.includes("case-sensitive")));

    const loopbackFile = sampleLinksFile({ base: "https://127.0.0.1/go/" });
    assert.ok(ruleNotes(loopbackFile).some((n) => /local or private IP/i.test(n)));
  });

  it("keeps existing utm_ parameters when merging campaign tags", () => {
    const merged = applyCampaign("https://mybakery.com/menu?utm_source=existing", {
      source: "flyer",
      medium: "print",
    });
    assert.equal(merged.url, "https://mybakery.com/menu?utm_source=existing&utm_medium=print");
    assert.deepEqual(merged.kept, ["utm_source"]);
  });
});

describe("CSV, JSON, bulk paste, reprint list, and ZIP export", () => {
  it("neutralizes spreadsheet formulas on export and unescapes cleanly on import", () => {
    assert.equal(csvCell('a"b'), '"a""b"');
    for (const bad of ["=1+1", "+1", "-20% off", "@sum", "\tx", "  =x"]) {
      assert.ok(csvCell(bad).startsWith(`"'`));
    }
    assert.equal(unescapeCsvFormula("'-20% off"), "-20% off");
    assert.equal(unescapeCsvFormula("'normal"), "'normal");

    const rows = [
      ["col1", "col2"],
      ['hello, "world"', "line1\nline2"],
    ];
    assert.deepEqual(parseCsv(writeCsv(rows)), rows);
  });

  it("round-trips Redirect Kit through JSON and CSV including formula-prefixed labels", () => {
    const original = sampleLinksFile({
      links: [
        ...sampleLinksFile().links,
        {
          slug: "promo",
          label: "-20% off coupon",
          destination: "https://mybakery.com/promo",
          campaign: { source: "", medium: "", campaign: "", content: "" },
        },
      ],
    });
    const jsonBack = parseLinksFile(writeLinksJson(original));
    assert.equal(jsonBack.ok, true);
    if (jsonBack.ok) assert.deepEqual(jsonBack.file, original);

    const csvBack = parseLinksCsv(writeLinksCsv(original));
    assert.equal(csvBack.ok, true);
    if (csvBack.ok) assert.deepEqual(csvBack.file, original);
  });

  it("parses bulk two-column paste, preserves capital IDs, and auto-numbers duplicate slugs case-insensitively", () => {
    const res = parseTwoColumnLinks(
      "Brochure, https://partner.example/a.pdf\nbrochure, https://partner.example/b.pdf\nBrochure, https://partner.example/c.pdf",
      "https://mybakery.com/go/",
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(
        res.links.map((l) => l.slug),
        ["Brochure", "brochure-2", "Brochure-3"],
      );
    }
  });

  it("supports repointed and retire statuses, lets readyToCancel pass with retired items, and sorts reprint CSV", () => {
    const plan: EscapePlan = {
      format: "bandit-codes-escape-plan",
      version: 1,
      ownedBase: "https://mybakery.com/go/",
      ownedDomains: "mybakery.com",
      items: [
        {
          id: "esc-1",
          piece: "Low flyer",
          currentUrl: "https://qrco.de/low1",
          landingUrl: "https://mybakery.com/old",
          newSlug: "brochure",
          priority: "low",
          status: "retire",
          stickerOver: false,
          notes: "Let it lapse",
        },
        {
          id: "esc-2",
          piece: "Table tent",
          currentUrl: "https://qrco.de/hi1",
          landingUrl: "https://mybakery.com/menu",
          newSlug: "brochure",
          priority: "high",
          status: "repointed",
          stickerOver: true,
          notes: "Re-pointed while paying",
        },
        {
          id: "esc-3",
          piece: "Counter card",
          currentUrl: "https://qrco.de/med1",
          landingUrl: "https://mybakery.com/reviews",
          newSlug: "brochure",
          priority: "medium",
          status: "reprinted",
          stickerOver: false,
          notes: "Done",
        },
      ],
    };

    const sum1 = escapeSummary(plan);
    assert.equal(sum1.total, 3);
    assert.equal(sum1.repointed, 2); // repointed + reprinted
    assert.equal(sum1.reprinted, 1);
    assert.equal(sum1.retired, 1);
    assert.equal(sum1.resolved, 2);
    assert.equal(sum1.highRemaining, 1);
    assert.equal(sum1.readyToCancel, false);

    // Mark the remaining high-priority item reprinted -> readyToCancel becomes true even with 1 retired item!
    const allSettled: EscapePlan = {
      ...plan,
      items: plan.items.map((it) => (it.id === "esc-2" ? { ...it, status: "reprinted" } : it)),
    };
    const sum2 = escapeSummary(allSettled);
    assert.equal(sum2.readyToCancel, true);
    assert.equal(sum2.highRemaining, 0);

    // Priority sort puts high -> medium -> low
    assert.deepEqual(
      sortEscapeItems(plan.items).map((i) => i.priority),
      ["high", "medium", "low"],
    );

    // Reprint CSV excludes reprinted and retired items, keeping only remaining high-priority item + sticker_over column
    const reprintCsv = writeReprintCsv(plan);
    const reprintRows = parseCsv(reprintCsv);
    assert.equal(reprintRows.length, 2); // header + 1 remaining row
    assert.equal(reprintRows[1][0], "Table tent");
    assert.equal(reprintRows[1][7], "yes");

    // escapeToLinks skips retired item and auto-numbers duplicate slugs
    const converted = escapeToLinks(plan);
    assert.equal(converted.ok, true);
    if (converted.ok) {
      assert.deepEqual(
        converted.file.links.map((l) => l.slug),
        ["brochure", "brochure-2"],
      );
      assert.equal(converted.renamed.length, 1);
      assert.equal(converted.skipped.length, 1);
    }

    // Full JSON + CSV round-trip
    const jsonBack = parseEscapeJson(writeEscapeJson(plan));
    assert.equal(jsonBack.ok, true);
    if (jsonBack.ok) assert.deepEqual(jsonBack.plan, plan);

    const csvBack = parseEscapeCsv(writeEscapeCsv(plan), "", "mybakery.com");
    assert.equal(csvBack.ok, true);
    if (csvBack.ok) {
      assert.equal(csvBack.plan.items.length, 3);
      assert.equal(csvBack.plan.items[0].status, "retire");
      assert.equal(csvBack.plan.items[1].status, "repointed");
      assert.equal(csvBack.plan.items[1].stickerOver, true);
    }
  });

  it("handles vendor-style CSV headers, missing piece names, duplicate JSON IDs, and bulk paste", () => {
    const vendorCsv = "Name,Short URL,Destination\n,https://vendor.example/1,https://mybakery.com/a\nBrochure,https://vendor.example/2,https://mybakery.com/b\n";
    const parsed = parseEscapeCsv(vendorCsv, "https://mybakery.com/go/", "mybakery.com");
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.plan.items.length, 2);
      assert.equal(parsed.plan.items[0].piece, "Printed piece 1");
      assert.equal(parsed.plan.items[1].currentUrl, "https://vendor.example/2");
      assert.equal(parsed.plan.items[1].landingUrl, "https://mybakery.com/b");
    }

    // Duplicate IDs in imported JSON get deduplicated
    const dupJson = parseEscapeJson({
      format: "bandit-codes-escape-plan",
      version: 1,
      ownedBase: "https://mybakery.com/go/",
      ownedDomains: "mybakery.com",
      items: [
        { id: "same", piece: "A", currentUrl: "", landingUrl: "", newSlug: "a", priority: "high", status: "found", notes: "" },
        { id: "same", piece: "B", currentUrl: "", landingUrl: "", newSlug: "b", priority: "low", status: "found", notes: "" },
      ],
    });
    assert.equal(dupJson.ok, true);
    if (dupJson.ok) {
      assert.notEqual(dupJson.plan.items[0].id, dupJson.plan.items[1].id);
    }

    const pasted = parseBulkEscapePaste(
      "Pamphlet A\thttps://vendor.example/q/1\thttps://partner.example/a1.pdf\nPamphlet A\thttps://vendor.example/q/2\thttps://partner.example/a2.pdf",
    );
    assert.equal(pasted.ok, true);
    if (pasted.ok) {
      assert.equal(pasted.items.length, 2);
      assert.deepEqual(
        pasted.items.map((x) => x.newSlug),
        ["pamphlet-a", "pamphlet-a-2"],
      );
    }
  });

  it("builds a valid Store-mode ZIP archive with PK headers, CRC-32, and enforces ZIP32 caps", () => {
    const zip = buildZip([
      { path: "go/menu/index.html", data: "<!doctype html><html></html>" },
      { path: "menu.svg", data: "<svg></svg>" },
    ]);
    // Starts with Local File Header PK\x03\x04
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);
    assert.equal(zip[2], 0x03);
    assert.equal(zip[3], 0x04);
    // Ends with End of Central Directory PK\x05\x06 at zip.length - 22
    const eocd = zip.length - 22;
    assert.equal(zip[eocd], 0x50);
    assert.equal(zip[eocd + 1], 0x4b);
    assert.equal(zip[eocd + 2], 0x05);
    assert.equal(zip[eocd + 3], 0x06);
    assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);

    // ZIP32 caps refuse > 65,535 entries or > 4 GB archives
    const tooMany = Array.from({ length: MAX_ZIP_ENTRIES + 1 }, () => ({ path: "a", data: "" }));
    assert.throws(() => buildZip(tooMany), /65,535/);
    assert.throws(() => validateZipLimits(1, MAX_ZIP_BYTES + 1), /4 GB/);
  });
});

describe("owned vs. vendor domain detection", () => {
  it("normalizes domains, handles unicode/punycode, rejects public suffixes and suffix spoofing", () => {
    assert.equal(normalizeDomain("https://WWW.MyBakery.com/go/menu"), "mybakery.com");
    assert.equal(normalizeDomain("mybakery.com."), "mybakery.com");
    assert.equal(normalizeDomain("not a domain"), null);
    // Reject multi-part public suffix
    assert.equal(normalizeDomain("co.uk"), null);
    assert.equal(normalizeDomain("com.au"), null);
    assert.equal(normalizeDomain("mybakery.co.uk"), "mybakery.co.uk");
    // Unicode domain converts to punycode instead of being silently dropped
    assert.equal(normalizeDomain("café.example"), "xn--caf-dma.example");

    const det = parseOwnedDomainsDetailed("mybakery.com, co.uk, bad domain");
    assert.deepEqual(det.domains, ["mybakery.com"]);
    assert.ok(det.ignored.includes("co.uk"));

    assert.deepEqual(parseOwnedDomains("mybakery.com, https://shop.mybakery.com/a; mybakery.com"), [
      "mybakery.com",
      "shop.mybakery.com",
    ]);
    assert.equal(hostMatchesOwned("go.mybakery.com", "mybakery.com"), true);
    assert.equal(hostMatchesOwned("www.mybakery.com", "mybakery.com"), true);
    assert.equal(hostMatchesOwned("evilmybakery.com", "mybakery.com"), false);
  });

  it("classifies owned, trapped, retired shorteners, bare domains, unknown schemes, static, and unknown", () => {
    const owned = classifyQrPayload("https://go.mybakery.com/menu", "mybakery.com");
    assert.equal(owned.status, "owned");
    // Host caveat present
    assert.ok(owned.detail.includes("your own web host"));

    const trappedShort = classifyQrPayload("https://qrco.de/aB3x9K", "mybakery.com");
    assert.equal(trappedShort.status, "trapped");
    assert.equal(trappedShort.likelyShortLink, true);
    // Avoids claiming "vendor redirect" as fact
    assert.ok(!trappedShort.detail.toLowerCase().includes("vendor redirect"));

    const spoofed = classifyQrPayload("https://evilmybakery.com/go/menu", "mybakery.com");
    assert.equal(spoofed.status, "trapped");

    // Bare domain without scheme is classified as web link (trapped), NOT static plain text
    const bareTrapped = classifyQrPayload("vendor-qr.example/q/abc123", "mybakery.com");
    assert.equal(bareTrapped.status, "trapped");
    assert.equal(bareTrapped.host, "vendor-qr.example");

    // Unknown custom scheme is classified as unknown, NOT static
    const customScheme = classifyQrPayload("intent://scan/#Intent;scheme=app;end", "mybakery.com");
    assert.equal(customScheme.status, "unknown");

    // Short-link shutdown wording: goo.gl and git.io say stopped creating new short links, no dates, no "stopped resolving"
    const goo = classifyQrPayload("https://goo.gl/abc123", "mybakery.com");
    assert.equal(goo.status, "deprecated");
    assert.ok(goo.detail.includes("stopped creating new short links"));
    assert.ok(!goo.detail.includes("2018"));
    assert.ok(!goo.detail.includes("stopped resolving"));

    const gitio = classifyQrPayload("https://git.io/xyz", "mybakery.com");
    assert.equal(gitio.status, "deprecated");
    assert.ok(gitio.detail.includes("stopped creating new short links"));
    assert.ok(!gitio.detail.includes("2022"));

    const wifi = classifyQrPayload("WIFI:T:WPA;S:BakeryGuest;P:freshbread;;", "mybakery.com");
    assert.equal(wifi.status, "static");
    assert.equal(wifi.payloadKind, "Wi-Fi login");

    const vcard = classifyQrPayload("BEGIN:VCARD\nVERSION:3.0\nFN:Snick\nEND:VCARD", "mybakery.com");
    assert.equal(vcard.status, "static");
    assert.equal(vcard.payloadKind, "Contact card (vCard)");

    const unknown = classifyQrPayload("https://qrco.de/aB3x9K", "");
    assert.equal(unknown.status, "unknown");
    assert.equal(unknown.likelyShortLink, true);
  });
});

describe("print size guide", () => {
  it("calculates sensible closeup and 3ft print widths", () => {
    const simple = printGuide(25, 4);
    assert.equal(simple.densityLabel, "Simple");
    assert.ok(simple.minCloseupMm >= 20);
    assert.ok(simple.sign3ftMm >= 92);

    const dense = printGuide(57, 4);
    assert.equal(dense.densityLabel, "Dense");
    assert.ok(dense.minCloseupMm > simple.minCloseupMm);
  });
});
