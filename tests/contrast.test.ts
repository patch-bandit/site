import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_COLOR_INPUT_LENGTH,
  MAX_HASH_LENGTH,
  WCAG_THRESHOLDS,
  contrastRatio,
  decodeHashState,
  encodeHashState,
  evaluateContrast,
  findNearestPassingColor,
  formatContrastRatio,
  formatRgb,
  hslToRgb,
  parseColor,
  pickReadableInk,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
  roundContrastRatio,
} from '../src/lib/contrast.ts';

test('parseColor handles 3-digit hex, 6-digit hex, rgb() comma/space syntax, and rejects invalid strings', () => {
  assert.deepEqual(parseColor('#777'), { r: 119, g: 119, b: 119 });
  assert.deepEqual(parseColor('777'), { r: 119, g: 119, b: 119 });
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor('#140A22'), { r: 20, g: 10, b: 34 });
  assert.deepEqual(parseColor('rgb(119, 119, 119)'), { r: 119, g: 119, b: 119 });
  assert.deepEqual(parseColor('RGB(20 10 34)'), { r: 20, g: 10, b: 34 });
  assert.deepEqual(parseColor('255, 242, 222'), { r: 255, g: 242, b: 222 });

  assert.equal(parseColor(''), null);
  assert.equal(parseColor('#1234'), null);
  assert.equal(parseColor('#12345678'), null);
  assert.equal(parseColor('#ggg'), null);
  assert.equal(parseColor('rgb(256, 0, 0)'), null);
  assert.equal(parseColor('rgb(-1, 0, 0)'), null);
  assert.equal(parseColor('rgb(1.5, 2, 3)'), null);
  assert.equal(parseColor('1.5, 2, 3'), null);
  assert.equal(parseColor('rgb(10, 20)'), null);
  assert.equal(parseColor('rgb(0,0,0) rgb(0,0,0)'), null);
  assert.equal(parseColor('rgba(0, 0, 0, 0.5)'), null);
  assert.equal(parseColor('rebeccapurple'), null);
  assert.equal(parseColor(' '.repeat(MAX_COLOR_INPUT_LENGTH + 1) + '#fff'), null);
});

test('parseColor and decodeHashState resist ReDoS and enforce input length limits', () => {
  const hostileRgb = `rgb(${' '.repeat(100_000)}x`;
  const t0 = performance.now();
  assert.equal(parseColor(hostileRgb), null);
  const dtRgb = performance.now() - t0;
  assert.ok(dtRgb < 50, `Expected linear rejection (<50ms), took ${dtRgb.toFixed(2)}ms`);

  // Also check hostile input within the 64-char cap (no closing paren)
  const shortHostile = `rgb(${' '.repeat(55)}x`;
  assert.ok(shortHostile.length <= MAX_COLOR_INPUT_LENGTH);
  assert.equal(parseColor(shortHostile), null);

  const hostileHash = `#fg=rgb(${'+'.repeat(100_000)}x&bg=fff`;
  const t1 = performance.now();
  assert.deepEqual(decodeHashState(hostileHash), {});
  const dtHash = performance.now() - t1;
  assert.ok(dtHash < 50, `Expected linear hash rejection (<50ms), took ${dtHash.toFixed(2)}ms`);

  const overCapHash = `#fg=777&bg=fff&pad=${'a'.repeat(MAX_HASH_LENGTH)}`;
  assert.deepEqual(decodeHashState(overCapHash), {});
});

test('known WCAG contrast pairs match spec (#777 on #fff = 4.48, black on white = 21)', () => {
  const black = parseColor('#000')!;
  const white = parseColor('#fff')!;
  const gray777 = parseColor('#777')!;
  const gray767676 = parseColor('#767676')!;

  assert.equal(relativeLuminance(black), 0);
  assert.equal(relativeLuminance(white), 1);

  assert.equal(roundContrastRatio(contrastRatio(black, white)), 21);
  assert.equal(formatContrastRatio(contrastRatio(black, white)), '21:1');
  assert.equal(roundContrastRatio(contrastRatio(white, white)), 1);
  assert.equal(formatContrastRatio(contrastRatio(white, white)), '1:1');

  const report777 = evaluateContrast(gray777, white);
  assert.equal(report777.rounded, 4.48);
  assert.equal(report777.formatted, '4.48:1');
  assert.equal(report777.checks.normalAA, false);
  assert.equal(report777.checks.normalAAA, false);
  assert.equal(report777.checks.largeAA, true);
  assert.equal(report777.checks.largeAAA, false);
  assert.equal(report777.checks.uiAA, true);
  assert.equal(report777.grade, 'AA Large');
  assert.match(report777.verdict, /Too faint for small text\. Fine for big headings/);

  const report76 = evaluateContrast(gray767676, white);
  assert.equal(report76.rounded, 4.54);
  assert.equal(report76.checks.normalAA, true);
  assert.equal(report76.checks.normalAAA, false);
  assert.equal(report76.checks.largeAAA, true);
  assert.equal(report76.grade, 'AA');

  const reportBW = evaluateContrast(black, white);
  assert.equal(reportBW.rounded, 21);
  assert.equal(reportBW.checks.normalAAA, true);
  assert.equal(reportBW.grade, 'AAA');
});

test('contrastRatio is symmetric when foreground and background swap', () => {
  const fg = parseColor('#ff7b67')!;
  const bg = parseColor('#140a22')!;
  assert.equal(contrastRatio(fg, bg), contrastRatio(bg, fg));
});

test('findNearestPassingColor finds a verified passing hex color and preserves hue', () => {
  const white = parseColor('#fff')!;
  const gray777 = parseColor('#777')!;

  const aaFix = findNearestPassingColor(gray777, white, WCAG_THRESHOLDS.normalAA);
  assert.ok(aaFix);
  assert.equal(aaFix.direction, 'darker');
  assert.equal(aaFix.flipsPolarity, false);
  assert.ok(aaFix.ratio >= WCAG_THRESHOLDS.normalAA, `Expected >= 4.5, got ${aaFix.ratio}`);
  assert.ok(aaFix.ratio < 4.7, `Expected near 4.5, got ${aaFix.ratio}`);
  assert.equal(contrastRatio(parseColor(aaFix.hex)!, white), aaFix.ratio);

  const bgPolarityFlip = findNearestPassingColor(white, gray777, WCAG_THRESHOLDS.normalAA);
  assert.ok(bgPolarityFlip);
  assert.equal(bgPolarityFlip.direction, 'darker');
  assert.equal(bgPolarityFlip.flipsPolarity, true);
  assert.ok(bgPolarityFlip.ratio >= WCAG_THRESHOLDS.normalAA);

  const brandCoral = parseColor('#ff7b67')!;
  const coralOnWhite = findNearestPassingColor(brandCoral, white, WCAG_THRESHOLDS.normalAA);
  assert.ok(coralOnWhite);
  assert.ok(coralOnWhite.ratio >= WCAG_THRESHOLDS.normalAA);
  const origHue = rgbToHsl(brandCoral).h;
  const fixedHue = rgbToHsl(coralOnWhite.rgb).h;
  assert.ok(Math.abs(origHue - fixedHue) < 3, `Hue drifted from ${origHue} to ${fixedHue}`);

  const alreadyPassing = findNearestPassingColor(parseColor('#000')!, white, WCAG_THRESHOLDS.normalAAA);
  assert.ok(alreadyPassing);
  assert.equal(alreadyPassing.direction, 'unchanged');
  assert.equal(alreadyPassing.hex, '#000000');
});

test('findNearestPassingColor returns null when no sRGB color can reach target against a mid-tone', () => {
  const midGray = parseColor('#767676')!;
  const impossible = findNearestPassingColor(parseColor('#ffffff')!, midGray, WCAG_THRESHOLDS.normalAAA);
  assert.equal(impossible, null);

  // Adjusting the background instead succeeds cleanly.
  const bgFix = findNearestPassingColor(midGray, parseColor('#ffffff')!, WCAG_THRESHOLDS.normalAAA);
  assert.ok(bgFix);
  assert.ok(bgFix.ratio >= WCAG_THRESHOLDS.normalAAA);

  assert.throws(() => findNearestPassingColor(midGray, midGray, 25), RangeError);
});

test('URL hash state encodes and decodes cleanly without throwing on bad input', () => {
  const fg = parseColor('#140a22')!;
  const bg = parseColor('#fff2de')!;
  const hash = encodeHashState(fg, bg);
  assert.equal(hash, '#fg=140a22&bg=fff2de');

  const decoded = decodeHashState(hash);
  assert.deepEqual(decoded, { fg, bg });

  const partial = decodeHashState('#fg=777&bg=notacolor&extra=1');
  assert.deepEqual(partial, { fg: { r: 119, g: 119, b: 119 } });
  assert.deepEqual(decodeHashState(''), {});
});

test('formatting, HSL roundtrip, and readable ink helpers work accurately', () => {
  const sample = { r: 134, g: 227, b: 190 };
  assert.equal(rgbToHex(sample), '#86e3be');
  assert.equal(formatRgb(sample), 'rgb(134, 227, 190)');

  const back = hslToRgb(rgbToHsl(sample));
  assert.ok(Math.abs(back.r - sample.r) <= 1);
  assert.ok(Math.abs(back.g - sample.g) <= 1);
  assert.ok(Math.abs(back.b - sample.b) <= 1);

  assert.equal(pickReadableInk(parseColor('#ffffff')!), '#140a22');
  assert.equal(pickReadableInk(parseColor('#140a22')!), '#fff2de');
});
