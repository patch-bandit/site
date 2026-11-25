import assert from 'node:assert/strict';
import test from 'node:test';
import {
  convertCssPxToRem,
  convertCssRemToPx,
  formatUnitNumber,
  pxToRem,
  remToPx,
} from '../src/lib/pxToRem.ts';
import {
  ALPHABET_PRESETS,
  createUuidV7State,
  dedupeAlphabet,
  estimateEntropyBits,
  makeIdBatch,
  makeShortId,
  makeUuidV4,
  makeUuidV7,
} from '../src/lib/idMaker.ts';

// --- px to rem tests ---

test('pxToRem converts standard values accurately at default 16px root', () => {
  assert.equal(pxToRem(16), 1);
  assert.equal(pxToRem(24), 1.5);
  assert.equal(pxToRem(14), 0.875);
  assert.equal(pxToRem(1), 0.0625);
  assert.equal(pxToRem(0), 0);
  assert.equal(pxToRem(-8), -0.5);
});

test('pxToRem respects custom root size and precision', () => {
  assert.equal(pxToRem(20, 10), 2);
  assert.equal(pxToRem(15, 10), 1.5);
  assert.equal(pxToRem(18, 18), 1);
  assert.equal(pxToRem(10, 12, 4), 0.8333);
  assert.equal(pxToRem(10, 12, 2), 0.83);
});

test('remToPx converts back accurately', () => {
  assert.equal(remToPx(1), 16);
  assert.equal(remToPx(1.5), 24);
  assert.equal(remToPx(0.875), 14);
  assert.equal(remToPx(2, 10), 20);
  assert.equal(remToPx(-0.5, 16), -8);
  assert.equal(remToPx(0, 16), 0);
});

test('formatUnitNumber trims trailing zeros and normalizes negative zero', () => {
  assert.equal(formatUnitNumber(1.5), '1.5');
  assert.equal(formatUnitNumber(2.0), '2');
  assert.equal(formatUnitNumber(20, 0), '20');
  assert.equal(formatUnitNumber(0.0625), '0.0625');
  assert.equal(formatUnitNumber(-0), '0');
  assert.equal(formatUnitNumber(-0.00001, 4), '0');
});

test('formatUnitNumber preserves exponent notation for numbers at 1e21 and above', () => {
  assert.equal(formatUnitNumber(1e21), '1e+21');
  assert.equal(formatUnitNumber(1e30), '1e+30');
  assert.equal(formatUnitNumber(-1.5e25), '-1.5e+25');
  const cssRes = convertCssPxToRem('a{w:16000000000000000000000000000000px}', { rootPx: 16 });
  assert.equal(cssRes.count, 1);
  assert.equal(cssRes.css, 'a{w:1e+30rem}');
});

test('pxToRem and remToPx reject invalid root sizes and overflow', () => {
  assert.throws(() => pxToRem(16, 0), RangeError);
  assert.throws(() => pxToRem(16, -16), RangeError);
  assert.throws(() => remToPx(1, Number.NaN), RangeError);
  assert.throws(() => pxToRem(1e308, 0.5), RangeError);
  assert.throws(() => remToPx(1e308, 16), RangeError);
  assert.throws(
    () => convertCssPxToRem(`a { width: ${'9'.repeat(308)}px; }`, { rootPx: 0.5 }),
    RangeError,
  );
});

test('convertCssPxToRem converts rules, calc, shorthands, negatives, and decimals', () => {
  const input = [
    '.card {',
    '  font-size: 18px;',
    '  padding: 12px 24px 0px .5px;',
    '  margin-top: -8px;',
    '  width: calc(100% - 32px);',
    '  border: 1PX solid #333;',
    '}',
  ].join('\n');

  const res = convertCssPxToRem(input, { rootPx: 16 });
  assert.equal(res.count, 8);
  assert.equal(
    res.css,
    [
      '.card {',
      '  font-size: 1.125rem;',
      '  padding: 0.75rem 1.5rem 0rem 0.0313rem;',
      '  margin-top: -0.5rem;',
      '  width: calc(100% - 2rem);',
      '  border: 0.0625rem solid #333;',
      '}',
    ].join('\n'),
  );
});

test('convertCssPxToRem handles clamp() and font size/line-height slash shorthands', () => {
  const input = 'h1 { font: 700 24px/32px sans-serif; gap: clamp(12px, 2vw, 24px); }';
  const res = convertCssPxToRem(input, { rootPx: 16 });
  assert.equal(res.count, 4);
  assert.equal(res.css, 'h1 { font: 700 1.5rem/2rem sans-serif; gap: clamp(0.75rem, 2vw, 1.5rem); }');
});

test('convertCssPxToRem preserves comments, strings, url(), and identifiers', () => {
  const input = [
    '/* keep 16px in comments */',
    '.box-16px, .p-8px {',
    '  --gap-24px: 24px;',
    '  content: "20px and 32px";',
    "  background: url('/img/icon-16px.png');",
    '  mask-image: url(/img/badge\\)16px.svg);',
    '  gap: 8px;',
    '}',
  ].join('\n');

  const res = convertCssPxToRem(input, { rootPx: 16 });
  assert.equal(res.count, 2);
  assert.match(res.css, /\/\* keep 16px in comments \*\//);
  assert.match(res.css, /\.box-16px, \.p-8px/);
  assert.match(res.css, /--gap-24px: 1\.5rem;/);
  assert.match(res.css, /content: "20px and 32px";/);
  assert.match(res.css, /url\('\/img\/icon-16px\.png'\)/);
  assert.match(res.css, /url\(\/img\/badge\\\)16px\.svg\)/);
  assert.match(res.css, /gap: 0\.5rem;/);
});

test('convertCssPxToRem preserves escaped parentheses in unquoted url()', () => {
  const input = 'a { background: url(a\\)b.png); width: 16px; margin: 1px; mask-image: url(a\\)16px.png); }';
  const res = convertCssPxToRem(input, { rootPx: 16 });
  assert.equal(res.count, 2);
  assert.equal(
    res.css,
    'a { background: url(a\\)b.png); width: 1rem; margin: 0.0625rem; mask-image: url(a\\)16px.png); }',
  );
});

test('convertCssPxToRem skipOnePx preserves 1px and -1px when enabled', () => {
  const input = 'border: 1px solid; outline-offset: -1px; padding: 16px;';
  const res = convertCssPxToRem(input, { rootPx: 16, skipOnePx: true });
  assert.equal(res.count, 1);
  assert.equal(res.css, 'border: 1px solid; outline-offset: -1px; padding: 1rem;');
});

test('convertCssRemToPx converts rem values back to px safely', () => {
  const input = '/* 1rem */ .x { font-size: 1.5rem; margin: -0.5rem 2rem; }';
  const res = convertCssRemToPx(input, { rootPx: 16 });
  assert.equal(res.count, 3);
  assert.equal(res.css, '/* 1rem */ .x { font-size: 24px; margin: -8px 32px; }');
});

// --- Unique ID maker tests ---

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('makeUuidV4 matches RFC 9562 v4 layout and formatting options', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const id = makeUuidV4();
    assert.match(id, UUID_V4_RE);
    seen.add(id);
  }
  assert.equal(seen.size, 50);

  const upperNoDash = makeUuidV4({ uppercase: true, hyphens: false });
  assert.match(upperNoDash, /^[0-9A-F]{12}4[0-9A-F]{3}[89AB][0-9A-F]{15}$/);
});

test('makeUuidV7 matches RFC 9562 v7 layout, encodes timestamp, and sorts monotonically', () => {
  const fixedMs = 1_760_000_000_123;
  const expectedHexPrefix = fixedMs.toString(16).padStart(12, '0');
  const state = createUuidV7State();
  const ids = makeIdBatch({
    mode: 'uuid-v7',
    count: 100,
    timestampMs: fixedMs,
    state,
  });

  assert.equal(ids.length, 100);
  for (let i = 0; i < ids.length; i += 1) {
    assert.match(ids[i], UUID_V7_RE);
    if (i > 0) {
      assert.ok(ids[i] > ids[i - 1], `Expected monotonic order at index ${i}`);
    }
  }
  const firstPrefix = ids[0].replace(/-/g, '').slice(0, 12);
  assert.equal(firstPrefix, expectedHexPrefix);
});

test('makeUuidV7 increments millisecond cleanly when 12-bit monotonic counter rolls over', () => {
  const fixedMs = 1_760_000_000_500;
  const state = { lastMs: fixedMs, seq: 0x0fff };
  const rolled = makeUuidV7({ timestampMs: fixedMs, state });
  assert.match(rolled, UUID_V7_RE);
  const expectedNextPrefix = (fixedMs + 1).toString(16).padStart(12, '0');
  assert.equal(rolled.replace(/-/g, '').slice(0, 12), expectedNextPrefix);
  assert.equal(state.lastMs, fixedMs + 1);
  assert.equal(state.seq, 0);
});

test('makeShortId honors requested length and alphabet with no stray characters', () => {
  for (const preset of ALPHABET_PRESETS) {
    const allowed = new Set(Array.from(preset.chars));
    const id = makeShortId(24, preset.chars);
    assert.equal(id.length, 24);
    for (const ch of id) {
      assert.ok(allowed.has(ch), `Unexpected char ${ch} for preset ${preset.id}`);
    }
  }

  const custom = makeShortId(16, 'ABC123ABC');
  assert.equal(custom.length, 16);
  assert.match(custom, /^[ABC123]{16}$/);
});

test('makeShortId supports minimum (2) and maximum (256) alphabet sizes', () => {
  const binId = makeShortId(32, '01');
  assert.match(binId, /^[01]{32}$/);

  const maxAlpha = Array.from({ length: 256 }, (_, i) => String.fromCharCode(0x20 + i)).join('');
  const maxId = makeShortId(20, maxAlpha);
  assert.equal(Array.from(maxId).length, 20);
});

test('dedupeAlphabet and makeShortId reject invalid inputs', () => {
  assert.equal(dedupeAlphabet('aabbcc\n'), 'abc');
  assert.throws(() => makeShortId(12, 'aaaaa'), RangeError);
  assert.throws(() => makeShortId(0, 'abcdef'), RangeError);
  assert.throws(() => makeIdBatch({ mode: 'uuid-v4', count: 0 }), RangeError);
  assert.throws(() => makeIdBatch({ mode: 'uuid-v4', count: 101 }), RangeError);
});

test('makeIdBatch creates 1 to 100 unique IDs across all modes', () => {
  const v4Batch = makeIdBatch({ mode: 'uuid-v4', count: 100 });
  assert.equal(new Set(v4Batch).size, 100);

  const shortBatch = makeIdBatch({
    mode: 'short',
    count: 100,
    length: 12,
    alphabet: ALPHABET_PRESETS[0].chars,
  });
  assert.equal(shortBatch.length, 100);
  assert.equal(new Set(shortBatch).size, 100);
  assert.equal(estimateEntropyBits('uuid-v4'), 122);
  assert.equal(estimateEntropyBits('uuid-v7'), 74);
  assert.equal(estimateEntropyBits('short', 12, 64), 72);
});
