import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_INPUT_CHARS,
  convertMarkdownToHtml,
  escapeHtml,
  sanitizeUrl,
} from '../src/lib/markdownToHtml.ts';
import {
  renderTokensToFragment,
  type MinimalDocument,
  type MinimalElement,
  type MinimalFragment,
  type MinimalNode,
} from '../src/lib/markdownDomPreview.ts';

// --- Lightweight mock DOM that throws if anyone ever tries innerHTML ---

interface MockTextNode extends MinimalNode {
  kind: 'text';
  data: string;
}

interface MockElement extends MinimalElement {
  kind: 'element';
  attrs: Record<string, string>;
  children: Array<MockElement | MockTextNode>;
}

interface MockFragment extends MinimalFragment {
  kind: 'fragment';
  children: Array<MockElement | MockTextNode>;
}

function createStrictMockDocument(): MinimalDocument {
  const makeEl = (tagName: string): MockElement => {
    const el: MockElement = {
      kind: 'element',
      tagName: tagName.toLowerCase(),
      className: '',
      attrs: {},
      children: [],
      get textContent() {
        return el.children.map((c) => (c.kind === 'text' ? c.data : c.textContent ?? '')).join('');
      },
      set textContent(v: string | null) {
        el.children = v ? [{ kind: 'text', data: v, textContent: v }] : [];
      },
      setAttribute(name: string, value: string) {
        el.attrs[name] = value;
      },
      appendChild<T extends MinimalNode>(node: T): T {
        el.children.push(node as unknown as MockElement | MockTextNode);
        return node;
      },
    };
    Object.defineProperty(el, 'innerHTML', {
      set() {
        throw new Error('innerHTML is forbidden');
      },
      get() {
        throw new Error('innerHTML is forbidden');
      },
    });
    return el;
  };

  return {
    createElement: makeEl,
    createTextNode(data: string): MockTextNode {
      return { kind: 'text', data, textContent: data };
    },
    createDocumentFragment(): MockFragment {
      const frag: MockFragment = {
        kind: 'fragment',
        children: [],
        textContent: null,
        appendChild<T extends MinimalNode>(node: T): T {
          frag.children.push(node as unknown as MockElement | MockTextNode);
          return node;
        },
      };
      return frag;
    },
  };
}

function walkMock(root: MockFragment | MockElement, visit: (el: MockElement) => void): void {
  for (const child of root.children) {
    if (child.kind === 'element') {
      visit(child);
      walkMock(child, visit);
    }
  }
}

// --- Core Markdown to HTML tests ---

test('converts headings, emphasis, strong, strikethrough, inline code, and hr', () => {
  const md = [
    '# Title One',
    '',
    'A **bold**, *italic*, ~~old~~, and `code` line.',
    '',
    '---',
    '',
    '## Subheading',
  ].join('\n');

  const res = convertMarkdownToHtml(md);
  assert.equal(
    res.html,
    [
      '<h1>Title One</h1>',
      '<p>A <strong>bold</strong>, <em>italic</em>, <del>old</del>, and <code>code</code> line.</p>',
      '<hr>',
      '<h2>Subheading</h2>',
    ].join('\n'),
  );
  assert.equal(res.title, 'Title One');
  assert.equal(res.stats.headings, 2);
});

test('adds unique slug IDs to headings when headingIds is enabled', () => {
  const md = '# Setup\n\n## Setup\n\n### Hello, World & Friends!';
  const res = convertMarkdownToHtml(md, { headingIds: true });
  assert.match(res.html, /<h1 id="setup">Setup<\/h1>/);
  assert.match(res.html, /<h2 id="setup-2">Setup<\/h2>/);
  assert.match(res.html, /<h3 id="hello-world-friends">Hello, World &amp; Friends!<\/h3>/);
});

test('converts GFM tables with alignment and task lists without duplicate checkboxes', () => {
  const md = [
    '| Tool | Status | Count |',
    '| :--- | :---: | ---: |',
    '| Parser | Ready | 1 |',
    '',
    '- [x] Parse GFM',
    '- [ ] Ship later',
  ].join('\n');

  const res = convertMarkdownToHtml(md);
  assert.equal(res.stats.tables, 1);
  assert.match(res.html, /<th scope="col" style="text-align:left">Tool<\/th>/);
  assert.match(res.html, /<th scope="col" style="text-align:center">Status<\/th>/);
  assert.match(res.html, /<th scope="col" style="text-align:right">Count<\/th>/);
  assert.match(res.html, /<li><input type="checkbox" checked disabled> Parse GFM<\/li>/);
  assert.match(res.html, /<li><input type="checkbox" disabled> Ship later<\/li>/);
  // Exactly 2 checkbox inputs total (no duplicates).
  assert.equal((res.html.match(/type="checkbox"/g) ?? []).length, 2);
});

test('preserves ordered list custom start attribute and nested lists', () => {
  const md = '3. Third\n4. Fourth\n   - Nested A\n   - Nested B';
  const res = convertMarkdownToHtml(md);
  assert.match(res.html, /<ol start="3">/);
  assert.match(res.html, /<ul>/);
  assert.match(res.html, /<li>Nested A<\/li>/);
});

test('escapes HTML entities cleanly without double-escaping in text and fenced code', () => {
  const md = [
    'Use `<div>` & "quotes" when 1 < 2 > 0.',
    '',
    '```html',
    '<section class="box">A & B</section>',
    '```',
  ].join('\n');

  const res = convertMarkdownToHtml(md);
  assert.equal(res.stats.codeBlocks, 1);
  assert.match(res.html, /<code>&lt;div&gt;<\/code> &amp; &quot;quotes&quot; when 1 &lt; 2 &gt; 0\./);
  assert.match(
    res.html,
    /<pre><code class="language-html">&lt;section class=&quot;box&quot;&gt;A &amp; B&lt;\/section&gt;<\/code><\/pre>/,
  );
  assert.doesNotMatch(res.html, /&amp;amp;|&amp;lt;/);
});

test('handles soft line breaks option and compact output mode', () => {
  const md = 'Line one\nLine two';
  const off = convertMarkdownToHtml(md, { breaks: false, pretty: false });
  const on = convertMarkdownToHtml(md, { breaks: true, pretty: false });
  assert.equal(off.html, '<p>Line one\nLine two</p>');
  assert.equal(on.html, '<p>Line one<br>Line two</p>');
});

test('sanitizeUrl allows safe schemes and blocks javascript, vbscript, data, and protocol-relative URLs', () => {
  assert.equal(sanitizeUrl('https://patchbandit.com/tools/'), 'https://patchbandit.com/tools/');
  assert.equal(sanitizeUrl('http://example.com'), 'http://example.com');
  assert.equal(sanitizeUrl('mailto:test@example.com', true), 'mailto:test@example.com');
  assert.equal(sanitizeUrl('mailto:test@example.com', false), null);
  assert.equal(sanitizeUrl('#heading'), '#heading');
  assert.equal(sanitizeUrl('/tools/markdown-to-html/'), '/tools/markdown-to-html/');
  assert.equal(sanitizeUrl('./local.html'), './local.html');

  assert.equal(sanitizeUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeUrl('  JaVaScRiPt:alert(1)'), null);
  assert.equal(sanitizeUrl('java\nscript:alert(1)'), null);
  assert.equal(sanitizeUrl('&#x6a;avascript:alert(1)'), null);
  assert.equal(sanitizeUrl('vbscript:msgbox(1)'), null);
  assert.equal(sanitizeUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(sanitizeUrl('//evil.example/a.js'), null);
  assert.equal(sanitizeUrl('\\\\evil.example'), null);
  assert.equal(sanitizeUrl('/\\evil.example'), null);
  assert.equal(sanitizeUrl('\\/evil.example'), null);
  assert.equal(sanitizeUrl('javascript&colon;alert(1)'), null);
});

test('neutralizes unsafe links and escapes or strips raw HTML safely', () => {
  const hostile = [
    '<script>alert(1)</script>',
    '',
    'Inline <img src=x onerror=alert(1)> text, [click](javascript:alert(1)), [obf](javascript&colon;alert(1)), [slash](/\\evil.example/x), plus [ok](https://patchbandit.com).',
  ].join('\n');

  const escaped = convertMarkdownToHtml(hostile, { rawHtml: 'escape' });
  assert.doesNotMatch(escaped.html, /<script>/i);
  assert.doesNotMatch(escaped.html, /<img\b/i);
  assert.doesNotMatch(escaped.html, /javascript:/i);
  assert.doesNotMatch(escaped.html, /javascript&amp;colon;/i);
  assert.doesNotMatch(escaped.html, /evil\.example/i);
  assert.match(escaped.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(escaped.html, /<a href="https:\/\/patchbandit\.com">ok<\/a>/);
  assert.equal(escaped.stats.links, 1);

  const stripped = convertMarkdownToHtml(hostile, { rawHtml: 'strip' });
  assert.doesNotMatch(stripped.html, /script|onerror|javascript:/i);
  assert.match(stripped.html, /<a href="https:\/\/patchbandit\.com">ok<\/a>/);
});

test('wraps full HTML5 document with CSP meta, escaped title, and no external resources', () => {
  const res = convertMarkdownToHtml('# Notes <v1> & More\n\nBody text.', {
    outputMode: 'document',
    pretty: true,
  });
  assert.match(res.html, /^<!doctype html>/);
  assert.match(
    res.html,
    /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http:; style-src 'unsafe-inline'">/,
  );
  assert.match(res.html, /<title>Notes &lt;v1&gt; &amp; More<\/title>/);
  assert.match(res.html, /<body>\n  <h1>Notes &lt;v1&gt; &amp; More<\/h1>/);
  assert.doesNotMatch(res.html, /https?:\/\//);
  assert.equal(res.plainText, 'Notes <v1> & More\nBody text.');

  const compact = convertMarkdownToHtml('# Compact', {
    outputMode: 'document',
    pretty: false,
  });
  assert.match(
    compact.html,
    /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http:; style-src 'unsafe-inline'">/,
  );
});

test('document mode preserves multi-line code block contents without extra indentation', () => {
  const md = [
    '# Code Demo',
    '',
    '```js',
    'const a = 1;',
    'if (a) {',
    '  b();',
    '',
    '  c();',
    '}',
    '```',
    '',
    '- List item',
    '',
    '  ```python',
    '  def greet():',
    '      return "hi"',
    '  ```',
    '',
    'After paragraph.',
  ].join('\n');

  const res = convertMarkdownToHtml(md, { outputMode: 'document', pretty: true });
  assert.ok(
    res.html.includes(
      '  <pre><code class="language-js">const a = 1;\nif (a) {\n  b();\n\n  c();\n}</code></pre>',
    ),
    `Top-level code block was altered:\n${res.html}`,
  );
  assert.ok(
    res.html.includes(
      '      <pre><code class="language-python">def greet():\n    return &quot;hi&quot;</code></pre>',
    ),
    `List-nested code block was altered:\n${res.html}`,
  );
  assert.ok(res.html.includes('\n  <p>After paragraph.</p>\n'));
});

test('handles long hostile whitespace input in linear time', () => {
  const hostile = `a${' '.repeat(400_000)}b`;
  const start = performance.now();
  const res = convertMarkdownToHtml(hostile);
  const elapsedMs = performance.now() - start;
  assert.ok(elapsedMs < 1000, `Expected linear-time conversion under 1000ms, took ${elapsedMs.toFixed(1)}ms`);
  assert.equal(res.plainText, 'a b');

  const trailingSpaces = `${' '.repeat(400_000)}\nnext`;
  const start2 = performance.now();
  const res2 = convertMarkdownToHtml(trailingSpaces);
  const elapsedMs2 = performance.now() - start2;
  assert.ok(elapsedMs2 < 1000, `Expected linear-time trailing-space conversion under 1000ms, took ${elapsedMs2.toFixed(1)}ms`);
  assert.equal(res2.plainText, 'next');
});

test('handles empty input and rejects oversized input cleanly', () => {
  const empty = convertMarkdownToHtml('   \n  ');
  assert.equal(empty.html, '');
  assert.equal(empty.stats.words, 0);
  assert.throws(() => convertMarkdownToHtml('a'.repeat(MAX_INPUT_CHARS + 1)), RangeError);
  assert.equal(escapeHtml(`a & <b> "c" 'd'`), 'a &amp; &lt;b&gt; &quot;c&quot; &#39;d&#39;');
});

// --- Zero-innerHTML DOM Preview tests ---

test('renderTokensToFragment builds preview DOM without innerHTML and blocks XSS & external image fetches', () => {
  const md = [
    '# main',
    '',
    '<script>window.__xss = 1</script>',
    '',
    'Text with <img src=x onerror=alert(1)>, [bad](javascript:alert(1)), [good](https://patchbandit.com), and ![Logo](https://tracker.example/pixel.png).',
    '',
    '| A | B |',
    '| - | - |',
    '| 1 | 2 |',
  ].join('\n');

  const res = convertMarkdownToHtml(md, { rawHtml: 'escape', headingIds: true });
  const doc = createStrictMockDocument();
  const frag = renderTokensToFragment(res.tokens, doc, { rawHtml: 'escape', headingIds: true }) as MockFragment;

  const tags: string[] = [];
  const allAttrs: Array<[string, string]> = [];
  walkMock(frag, (el) => {
    tags.push(el.tagName);
    for (const [k, v] of Object.entries(el.attrs)) {
      allAttrs.push([k, v]);
    }
  });

  // No script, no live img elements, no second h1, no id attributes clobbering host page IDs.
  assert.ok(!tags.includes('script'));
  assert.ok(!tags.includes('img'));
  assert.ok(!tags.includes('h1'));
  assert.ok(tags.includes('table'));
  assert.ok(allAttrs.some(([k, v]) => k === 'role' && v === 'heading'));
  assert.ok(allAttrs.some(([k, v]) => k === 'aria-level' && v === '1'));
  assert.ok(allAttrs.some(([k, v]) => k === 'data-md-heading-level' && v === '1'));
  assert.ok(allAttrs.some(([k, v]) => k === 'data-heading-id' && v === 'main'));
  assert.ok(!allAttrs.some(([k]) => k === 'id'));
  assert.ok(!allAttrs.some(([k]) => k.toLowerCase().startsWith('on')));
  assert.ok(!allAttrs.some(([k, v]) => k === 'href' && v.toLowerCase().startsWith('javascript:')));
  assert.ok(allAttrs.some(([k, v]) => k === 'href' && v === 'https://patchbandit.com'));
  assert.ok(allAttrs.some(([k, v]) => k === 'rel' && v === 'noopener noreferrer'));

  // External image appears only as a safe text placeholder, never a live network request.
  const stubs: MockElement[] = [];
  walkMock(frag, (el) => {
    if (el.className === 'md-img-stub') stubs.push(el);
  });
  assert.equal(stubs.length, 1);
  assert.match(stubs[0].textContent ?? '', /\[Image: Logo \(https:\/\/tracker\.example\/pixel\.png\)\]/);
});
