import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DARK_BG,
  DEFAULT_ACCENT,
  DEFAULT_OPTIONS,
  LIGHT_BG,
  PRESETS,
  buildFaviconDataUri,
  contrastRatio,
  escapeHtml,
  generateHtmlBoilerplate,
  getDarkAccentText,
  getPresetOptions,
  sanitizeAssetPath,
  sanitizeHexColor,
  sanitizeHttpUrl,
  sanitizeLang,
} from '../src/lib/htmlBoilerplate.ts';

test('default clean starter emits valid HTML5 doctype, focus ring, reduced motion, and skip link', () => {
  const res = generateHtmlBoilerplate();
  assert.ok(res.html.startsWith('<!doctype html>\n<html lang="en">\n'));
  assert.match(res.html, /<meta charset="utf-8">/);
  assert.match(res.html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(res.html, /<meta name="color-scheme" content="light dark">/);
  assert.match(res.html, /:focus-visible\s*\{/);
  assert.match(res.html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(res.html, /class="skip-link" href="#main"/);
  assert.match(res.html, /<header>[\s\S]*<main id="main">[\s\S]*<footer>/);
  assert.equal(res.stats.externalAssets, 0);
  assert.equal(res.warnings.length, 0);
});

test('default starter CSS passes WCAG AA link contrast in both light and dark modes', () => {
  const res = generateHtmlBoilerplate();
  assert.match(res.html, /a \{ color: var\(--accent-text\);/);

  const lightMatch = /:root \{[\s\S]*?--accent-text: (#[0-9a-f]{6});[\s\S]*?--bg: (#[0-9a-f]{6});/i.exec(res.html);
  assert.ok(lightMatch, 'light :root should declare --accent-text and --bg');
  assert.ok(
    contrastRatio(lightMatch[1], lightMatch[2]) >= 4.5,
    `light link contrast should be >= 4.5:1 (got ${contrastRatio(lightMatch[1], lightMatch[2]).toFixed(2)})`,
  );

  const darkMatch = /@media \(prefers-color-scheme: dark\) \{[\s\S]*?:root \{[\s\S]*?--accent-text: (#[0-9a-f]{6});[\s\S]*?--bg: (#[0-9a-f]{6});/i.exec(res.html);
  assert.ok(darkMatch, 'dark :root override should declare accessible --accent-text and --bg');
  assert.ok(
    contrastRatio(darkMatch[1], darkMatch[2]) >= 4.5,
    `dark link contrast should be >= 4.5:1 (got ${contrastRatio(darkMatch[1], darkMatch[2]).toFixed(2)})`,
  );

  // Dark accent helper guarantees >= 4.5:1 even for very dark inputs, and low light contrast warns.
  assert.ok(contrastRatio(getDarkAccentText('#000000'), DARK_BG) >= 4.5);
  assert.ok(contrastRatio(DEFAULT_ACCENT, LIGHT_BG) >= 4.5);
  const lowLight = generateHtmlBoilerplate({ accentColor: '#facc15' });
  assert.ok(lowLight.warnings.some((w) => /WCAG AA/i.test(w)));
});

test('presets produce distinct output shapes and warn on placeholder example.com URL', () => {
  assert.equal(PRESETS.length, 3);

  const minimal = generateHtmlBoilerplate(getPresetOptions('minimal'));
  assert.doesNotMatch(minimal.html, /<style>/);
  assert.doesNotMatch(minimal.html, /<header>/);
  assert.doesNotMatch(minimal.html, /skip-link/);
  assert.match(minimal.html, /<main id="main">/);
  assert.equal(minimal.warnings.length, 0);

  const article = generateHtmlBoilerplate(getPresetOptions('article'));
  assert.match(article.html, /<link rel="canonical" href="https:\/\/example\.com\/notes\/">/);
  assert.match(article.html, /<meta property="og:type" content="article">/);
  assert.match(article.html, /<article>/);
  assert.match(article.html, /<blockquote>/);
  assert.ok(article.warnings.some((w) => /example\.com/i.test(w)));

  const realArticle = generateHtmlBoilerplate({
    ...getPresetOptions('article'),
    canonicalUrl: 'https://notes.patchbandit.test/post/',
  });
  assert.equal(realArticle.warnings.length, 0);
});

test('escapes hostile HTML and script payloads in title, description, and author', () => {
  const payload = '"><script>alert(1)</script><img src=x onerror=alert(2)>';
  const res = generateHtmlBoilerplate({
    title: payload,
    description: payload,
    author: payload,
    includeOpenGraph: true,
  });
  assert.doesNotMatch(res.html, /<script>/);
  assert.doesNotMatch(res.html, /<img\b/i);
  assert.match(res.html, /&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&lt;img src=x onerror=alert\(2\)&gt;/);
  assert.doesNotMatch(res.previewHtml, /<script>/);
  assert.doesNotMatch(res.previewHtml, /<img\b/i);
});

test('rejects unsafe URLs, protocol-relative and backslash asset paths, and invalid colors', () => {
  assert.equal(sanitizeHttpUrl('javascript:alert(1)').valid, false);
  assert.equal(sanitizeHttpUrl('data:text/html,hi').valid, false);
  assert.equal(sanitizeHttpUrl('https://example.com/a').valid, true);

  assert.equal(sanitizeAssetPath('javascript:alert(1)', 'app.js').valid, false);
  assert.equal(sanitizeAssetPath('//evil.example/a.js', 'app.js').valid, false);
  assert.equal(sanitizeAssetPath('\\\\evil.example/a.js', 'app.js').valid, false);
  assert.equal(sanitizeAssetPath('/\\evil.example/a.js', 'app.js').valid, false);
  assert.equal(sanitizeAssetPath('\\/evil.example/a.js', 'app.js').valid, false);
  assert.equal(sanitizeAssetPath('js/app.js', 'app.js').path, 'js/app.js');

  assert.deepEqual(sanitizeHexColor('#abc'), { color: '#aabbcc', valid: true });
  assert.deepEqual(sanitizeHexColor('red;}</style><script>'), { color: DEFAULT_ACCENT, valid: false });

  const res = generateHtmlBoilerplate({
    accentColor: 'not-a-color',
    includeCanonical: true,
    canonicalUrl: 'javascript:alert(1)',
    includeOpenGraph: true,
    ogImageUrl: 'vbscript:msgbox(1)',
    cssMode: 'linked',
    stylesheetHref: '\\\\evil.example/site.css',
    scriptMode: 'defer',
    scriptSrc: '/\\evil.example/app.js',
  });
  assert.equal(res.warnings.length, 5);
  assert.doesNotMatch(res.html, /javascript:/i);
  assert.doesNotMatch(res.html, /vbscript:/i);
  assert.doesNotMatch(res.html, /evil\.example/i);
  assert.match(res.html, /href="styles\.css"/);
  assert.match(res.html, /src="app\.js"/);
  // Preview strips external links and scripts so preview never fetches over the network.
  assert.doesNotMatch(res.previewHtml, /<link rel="stylesheet"/);
  assert.doesNotMatch(res.previewHtml, /<script/);
});

test('sanitizes lang codes, matches CSS indentation to indent mode, and creates clean SVG data-URI favicon', () => {
  assert.equal(sanitizeLang('en-US'), 'en-US');
  assert.equal(sanitizeLang(' " onclick="x '), 'onclickx');
  assert.equal(sanitizeLang('!!!'), 'en');
  assert.equal(escapeHtml(`a&b<c>"d"'e'`), 'a&amp;b&lt;c&gt;&quot;d&quot;&#39;e&#39;');

  const tabOut = generateHtmlBoilerplate({ indent: 'tab' });
  assert.match(tabOut.html, /^\t<head>/m);
  const tabStyle = /<style>\n([\s\S]*?)\n\t\t<\/style>/.exec(tabOut.html);
  assert.ok(tabStyle, 'tab-indented output should include <style>');
  for (const line of tabStyle[1].split('\n')) {
    assert.match(line, /^\t+[^\t ]/, `tab-indented CSS line should use tabs only: ${JSON.stringify(line)}`);
  }

  const fourOut = generateHtmlBoilerplate({ indent: '4' });
  assert.match(fourOut.html, /^    <head>/m);
  const fourStyle = /<style>\n([\s\S]*?)\n        <\/style>/.exec(fourOut.html);
  assert.ok(fourStyle, '4-space output should include <style>');
  for (const line of fourStyle[1].split('\n')) {
    const leading = /^ */.exec(line)?.[0].length ?? 0;
    assert.equal(leading % 4, 0, `4-space CSS line indentation must be a multiple of 4: ${JSON.stringify(line)}`);
  }

  const fav = buildFaviconDataUri('<b>Starter</b>', '#0f6b4c');
  assert.ok(fav.startsWith('data:image/svg+xml,'));
  assert.ok(fav.includes('%230f6b4c'));
  assert.ok(fav.includes('%3EB%3C/text%3E'));
});

test('counts external assets accurately across CSS and script modes', () => {
  assert.equal(generateHtmlBoilerplate({ ...DEFAULT_OPTIONS, cssMode: 'inline-base', scriptMode: 'none' }).stats.externalAssets, 0);
  assert.equal(generateHtmlBoilerplate({ ...DEFAULT_OPTIONS, cssMode: 'linked', scriptMode: 'none' }).stats.externalAssets, 1);
  assert.equal(generateHtmlBoilerplate({ ...DEFAULT_OPTIONS, cssMode: 'linked', scriptMode: 'module' }).stats.externalAssets, 2);
});
