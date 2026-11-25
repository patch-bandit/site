import { marked, type Token, type Tokens } from 'marked';

export type HtmlOutputMode = 'fragment' | 'document';
export type RawHtmlMode = 'escape' | 'strip';

export interface ConvertOptions {
  /** Output just the HTML body fragment or wrap in a full HTML5 page. Default: 'fragment'. */
  outputMode?: HtmlOutputMode;
  /** How raw HTML tags inside Markdown are handled: escape to text or strip. Default: 'escape'. */
  rawHtml?: RawHtmlMode;
  /** Convert single line breaks inside paragraphs into <br>. Default: false. */
  breaks?: boolean;
  /** Add clean slug id attributes to h1-h6 elements. Default: false. */
  headingIds?: boolean;
  /** Pretty-indent block HTML output. Default: true. */
  pretty?: boolean;
  /** Optional document <title> when outputMode is 'document'. Falls back to first heading or 'Converted Markdown'. */
  documentTitle?: string;
}

export interface ConvertStats {
  words: number;
  lines: number;
  markdownChars: number;
  htmlChars: number;
  headings: number;
  links: number;
  codeBlocks: number;
  tables: number;
}

export interface ConvertResult {
  html: string;
  plainText: string;
  tokens: Token[];
  title: string;
  stats: ConvertStats;
}

export const MAX_INPUT_CHARS = 500_000;

export const EXPORT_DOCUMENT_CSP =
  "default-src 'none'; img-src https: http:; style-src 'unsafe-inline'";

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

const BASIC_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

export function decodeBasicEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (full, body: string) => {
    const lower = body.toLowerCase();
    if (lower in BASIC_ENTITY_MAP) return BASIC_ENTITY_MAP[lower];
    if (lower.startsWith('#x')) {
      const cp = Number.parseInt(lower.slice(2), 16);
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
    }
    if (lower.startsWith('#')) {
      const cp = Number.parseInt(lower.slice(1), 10);
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
    }
    return full;
  });
}

function unescapeMarkedText(text: string, escaped?: boolean): string {
  return escaped ? decodeBasicEntities(text) : text;
}

/**
 * Validates a link or image URL against an allowlist of safe schemes.
 * Blocks javascript:, vbscript:, data:, file:, blob:, entity-obfuscated schemes,
 * and protocol-relative // (including backslash variants \\, /\, \/) URLs.
 */
export function sanitizeUrl(rawUrl: string | undefined | null, allowMailto = true): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Strip ASCII control chars and whitespace before inspecting scheme so obfuscated
  // payloads like "java\nscript:alert(1)" or "&#x6a;avascript:" cannot slip through.
  const decoded = decodeBasicEntities(trimmed);
  const normalized = decoded.replace(/[\u0000-\u0020\u007f]+/g, '');
  if (!normalized) return null;

  // Browsers treat backslashes as slashes in http(s) URLs, so normalize them before
  // checking for protocol-relative prefixes like //, \\, /\, or \/.
  const slashNormalized = normalized.replace(/\\/g, '/');
  if (slashNormalized.startsWith('//')) return null;

  // Fragment or root-relative or dot-relative paths are safe.
  if (
    normalized.startsWith('#') ||
    normalized.startsWith('/') ||
    normalized.startsWith('./') ||
    normalized.startsWith('../')
  ) {
    return trimmed;
  }

  // Check if there is a URI scheme before any '/', '?', or '#'.
  const schemeEnd = slashNormalized.search(/[:/?#]/);
  if (schemeEnd === -1 || slashNormalized[schemeEnd] !== ':') {
    // Reject scheme-like entity obfuscation such as "javascript&colon;alert(1)".
    const leadSegment = schemeEnd === -1 ? slashNormalized : slashNormalized.slice(0, schemeEnd);
    if (/^[a-z][a-z0-9+.-]*&[a-z0-9#]+;/i.test(leadSegment)) {
      return null;
    }
    // Plain relative path like "docs/guide.html"
    return trimmed;
  }

  const scheme = slashNormalized.slice(0, schemeEnd).toLowerCase();
  if (scheme === 'https' || scheme === 'http') {
    return /^https?:\/\//i.test(normalized) ? trimmed : null;
  }
  if (allowMailto && scheme === 'mailto') {
    return trimmed;
  }
  return null;
}

export function slugifyHeading(text: string, seen: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';

  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function normalizePlainText(text: string): string {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    let end = line.length;
    while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) {
      end -= 1;
    }
    if (end !== line.length) {
      lines[i] = line.slice(0, end);
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function ensureTrailingNewline(parts: string[], startIndex: number): void {
  if (parts.length <= startIndex) return;
  const last = parts[parts.length - 1];
  if (last && !last.endsWith('\n')) {
    parts.push('\n');
  }
}

function collectPlainText(tokens: Token[] | undefined, rawHtml: RawHtmlMode, parts: string[]): void {
  if (!tokens || tokens.length === 0) return;
  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) {
          collectPlainText(t.tokens, rawHtml, parts);
        } else {
          const text = unescapeMarkedText(t.text, 'escaped' in t ? Boolean(t.escaped) : false);
          if (text) parts.push(text);
        }
        break;
      }
      case 'escape': {
        const t = token as Tokens.Escape;
        parts.push(t.raw.length >= 2 && t.raw.startsWith('\\') ? t.raw.slice(1) : decodeBasicEntities(t.text));
        break;
      }
      case 'codespan': {
        const t = token as Tokens.Codespan;
        const text = unescapeMarkedText(t.text, 'escaped' in t ? Boolean(t.escaped) : false);
        if (text) parts.push(text);
        break;
      }
      case 'br':
        parts.push('\n');
        break;
      case 'strong':
      case 'em':
      case 'del': {
        const t = token as { tokens?: Token[]; text?: string };
        if (t.tokens && t.tokens.length > 0) {
          collectPlainText(t.tokens, rawHtml, parts);
        } else if (t.text) {
          parts.push(t.text);
        }
        break;
      }
      case 'heading':
      case 'paragraph':
      case 'blockquote': {
        const t = token as { tokens?: Token[]; text?: string };
        const before = parts.length;
        if (t.tokens && t.tokens.length > 0) {
          collectPlainText(t.tokens, rawHtml, parts);
        } else if (t.text) {
          parts.push(t.text);
        }
        ensureTrailingNewline(parts, before);
        break;
      }
      case 'link': {
        const t = token as Tokens.Link;
        if (t.tokens && t.tokens.length > 0) {
          collectPlainText(t.tokens, rawHtml, parts);
        } else if (t.text) {
          parts.push(t.text);
        }
        break;
      }
      case 'image': {
        const t = token as Tokens.Image;
        if (t.text) parts.push(t.text);
        break;
      }
      case 'code': {
        const t = token as Tokens.Code;
        const txt = unescapeMarkedText(t.text, t.escaped);
        if (txt) parts.push(`${txt}\n`);
        break;
      }
      case 'list': {
        const t = token as Tokens.List;
        for (const item of t.items) {
          const before = parts.length;
          collectPlainText(item.tokens, rawHtml, parts);
          ensureTrailingNewline(parts, before);
        }
        break;
      }
      case 'list_item': {
        const t = token as Tokens.ListItem;
        const before = parts.length;
        collectPlainText(t.tokens, rawHtml, parts);
        ensureTrailingNewline(parts, before);
        break;
      }
      case 'table': {
        const t = token as Tokens.Table;
        const formatCell = (cellTokens: Token[]) => {
          const cellParts: string[] = [];
          collectPlainText(cellTokens, rawHtml, cellParts);
          return normalizePlainText(cellParts.join(''));
        };
        parts.push(`${t.header.map((c) => formatCell(c.tokens)).join(' | ')}\n`);
        for (const row of t.rows) {
          parts.push(`${row.map((c) => formatCell(c.tokens)).join(' | ')}\n`);
        }
        break;
      }
      case 'html': {
        const t = token as Tokens.HTML;
        if (rawHtml === 'escape' && t.raw) {
          parts.push(t.raw);
        }
        break;
      }
      case 'space':
      case 'hr':
      case 'def':
      case 'checkbox':
        break;
      default: {
        if ('tokens' in token && Array.isArray(token.tokens)) {
          collectPlainText(token.tokens, rawHtml, parts);
        } else if ('text' in token && typeof token.text === 'string' && token.text) {
          parts.push(token.text);
        }
        break;
      }
    }
  }
}

export function extractPlainTextFromTokens(tokens: Token[] | undefined, rawHtml: RawHtmlMode = 'escape'): string {
  if (!tokens || tokens.length === 0) return '';
  const parts: string[] = [];
  collectPlainText(tokens, rawHtml, parts);
  return normalizePlainText(parts.join(''));
}

interface SerializeState {
  rawHtml: RawHtmlMode;
  headingIds: boolean;
  pretty: boolean;
  slugs: Map<string, number>;
  stats: {
    headings: number;
    links: number;
    codeBlocks: number;
    tables: number;
  };
  firstHeading: string;
}

function pad(depth: number, pretty: boolean): string {
  return pretty ? '  '.repeat(depth) : '';
}

function cleanLanguage(lang: string | undefined): string {
  if (!lang) return '';
  const first = lang.trim().split(/\s+/)[0] ?? '';
  return first.replace(/[^a-zA-Z0-9_+#.-]/g, '');
}

function serializeInline(tokens: Token[] | undefined, state: SerializeState, skipLeadingCheckbox = false): string {
  if (!tokens || tokens.length === 0) return '';
  let out = '';
  let skippedCheckbox = false;

  for (const token of tokens) {
    if (token.type === 'checkbox') {
      if (skipLeadingCheckbox && !skippedCheckbox) {
        skippedCheckbox = true;
        continue;
      }
      const cb = token as Tokens.Checkbox;
      out += cb.checked
        ? '<input type="checkbox" checked disabled> '
        : '<input type="checkbox" disabled> ';
      continue;
    }

    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) {
          out += serializeInline(t.tokens, state, skipLeadingCheckbox && !skippedCheckbox);
        } else {
          const raw = unescapeMarkedText(t.text, 'escaped' in t ? Boolean(t.escaped) : false);
          out += escapeHtml(raw);
        }
        break;
      }
      case 'escape': {
        const t = token as Tokens.Escape;
        const ch = t.raw.length >= 2 && t.raw.startsWith('\\') ? t.raw.slice(1) : decodeBasicEntities(t.text);
        out += escapeHtml(ch);
        break;
      }
      case 'strong': {
        const t = token as Tokens.Strong;
        out += `<strong>${serializeInline(t.tokens, state)}</strong>`;
        break;
      }
      case 'em': {
        const t = token as Tokens.Em;
        out += `<em>${serializeInline(t.tokens, state)}</em>`;
        break;
      }
      case 'del': {
        const t = token as Tokens.Del;
        out += `<del>${serializeInline(t.tokens, state)}</del>`;
        break;
      }
      case 'codespan': {
        const t = token as Tokens.Codespan;
        const raw = unescapeMarkedText(t.text, 'escaped' in t ? Boolean(t.escaped) : false);
        out += `<code>${escapeHtml(raw)}</code>`;
        break;
      }
      case 'br': {
        out += '<br>';
        break;
      }
      case 'link': {
        const t = token as Tokens.Link;
        const label = t.tokens && t.tokens.length > 0 ? serializeInline(t.tokens, state) : escapeHtml(t.text);
        const safeHref = sanitizeUrl(t.href, true);
        if (!safeHref) {
          out += label;
          break;
        }
        state.stats.links += 1;
        const titleAttr = t.title ? ` title="${escapeHtml(t.title)}"` : '';
        out += `<a href="${escapeHtml(safeHref)}"${titleAttr}>${label}</a>`;
        break;
      }
      case 'image': {
        const t = token as Tokens.Image;
        const alt = t.text ? escapeHtml(t.text) : '';
        const safeSrc = sanitizeUrl(t.href, false);
        if (!safeSrc) {
          out += alt;
          break;
        }
        const titleAttr = t.title ? ` title="${escapeHtml(t.title)}"` : '';
        out += `<img src="${escapeHtml(safeSrc)}" alt="${alt}"${titleAttr}>`;
        break;
      }
      case 'html': {
        const t = token as Tokens.HTML;
        if (state.rawHtml === 'escape') {
          out += escapeHtml(t.raw);
        }
        break;
      }
      default: {
        if ('tokens' in token && Array.isArray(token.tokens)) {
          out += serializeInline(token.tokens, state);
        } else if ('raw' in token && typeof token.raw === 'string') {
          out += escapeHtml(token.raw);
        }
        break;
      }
    }
  }
  return out;
}

function serializeBlocks(tokens: Token[], state: SerializeState, depth: number): string[] {
  const lines: string[] = [];
  const indent = pad(depth, state.pretty);

  for (const token of tokens) {
    switch (token.type) {
      case 'space':
      case 'def':
        break;

      case 'heading': {
        const t = token as Tokens.Heading;
        const level = Math.min(6, Math.max(1, t.depth));
        state.stats.headings += 1;
        const plain = extractPlainTextFromTokens(t.tokens, state.rawHtml);
        if (!state.firstHeading && plain) {
          state.firstHeading = plain;
        }
        const idAttr = state.headingIds ? ` id="${escapeHtml(slugifyHeading(plain, state.slugs))}"` : '';
        const inner = serializeInline(t.tokens, state);
        lines.push(`${indent}<h${level}${idAttr}>${inner}</h${level}>`);
        break;
      }

      case 'paragraph': {
        const t = token as Tokens.Paragraph;
        const inner = serializeInline(t.tokens, state);
        if (inner !== '') {
          lines.push(`${indent}<p>${inner}</p>`);
        }
        break;
      }

      case 'text': {
        const t = token as Tokens.Text;
        const inner = t.tokens && t.tokens.length > 0
          ? serializeInline(t.tokens, state)
          : escapeHtml(unescapeMarkedText(t.text, 'escaped' in t ? Boolean(t.escaped) : false));
        if (inner !== '') {
          lines.push(`${indent}${inner}`);
        }
        break;
      }

      case 'blockquote': {
        const t = token as Tokens.Blockquote;
        const childLines = serializeBlocks(t.tokens, state, depth + 1);
        if (state.pretty) {
          lines.push(`${indent}<blockquote>`);
          lines.push(...childLines);
          lines.push(`${indent}</blockquote>`);
        } else {
          lines.push(`<blockquote>${childLines.join('')}</blockquote>`);
        }
        break;
      }

      case 'list': {
        const t = token as Tokens.List;
        const tag = t.ordered ? 'ol' : 'ul';
        const startAttr = t.ordered && t.start !== '' && Number(t.start) !== 1 ? ` start="${Number(t.start)}"` : '';
        if (state.pretty) {
          lines.push(`${indent}<${tag}${startAttr}>`);
        }
        const itemLines: string[] = [];
        for (const item of t.items) {
          const itemIndent = pad(depth + 1, state.pretty);
          const checkboxPrefix = item.task
            ? item.checked
              ? '<input type="checkbox" checked disabled> '
              : '<input type="checkbox" disabled> '
            : '';

          // Separate inline/first text vs nested blocks for clean tight lists.
          const itemTokens = item.tokens.filter((tk) => tk.type !== 'checkbox');
          const isSingleInline =
            !item.loose &&
            itemTokens.length === 1 &&
            (itemTokens[0].type === 'text' || itemTokens[0].type === 'paragraph');

          if (isSingleInline) {
            const first = itemTokens[0] as Tokens.Text | Tokens.Paragraph;
            const inner = first.tokens
              ? serializeInline(first.tokens, state, item.task)
              : escapeHtml(unescapeMarkedText(first.text, 'escaped' in first ? Boolean(first.escaped) : false));
            itemLines.push(`${itemIndent}<li>${checkboxPrefix}${inner}</li>`);
          } else {
            const children: string[] = [];
            let checkboxPlaced = !item.task;
            for (const sub of itemTokens) {
              if (!checkboxPlaced && (sub.type === 'text' || sub.type === 'paragraph')) {
                const subT = sub as Tokens.Text | Tokens.Paragraph;
                const inner = subT.tokens
                  ? serializeInline(subT.tokens, state, true)
                  : escapeHtml(unescapeMarkedText(subT.text, 'escaped' in subT ? Boolean(subT.escaped) : false));
                const subIndent = pad(depth + 2, state.pretty);
                children.push(
                  sub.type === 'paragraph'
                    ? `${subIndent}<p>${checkboxPrefix}${inner}</p>`
                    : `${subIndent}${checkboxPrefix}${inner}`,
                );
                checkboxPlaced = true;
              } else {
                children.push(...serializeBlocks([sub], state, depth + 2));
              }
            }
            if (!checkboxPlaced) {
              children.unshift(`${pad(depth + 2, state.pretty)}${checkboxPrefix.trimEnd()}`);
            }
            if (state.pretty) {
              itemLines.push(`${itemIndent}<li>`);
              itemLines.push(...children);
              itemLines.push(`${itemIndent}</li>`);
            } else {
              itemLines.push(`<li>${children.join('')}</li>`);
            }
          }
        }
        if (state.pretty) {
          lines.push(...itemLines);
          lines.push(`${indent}</${tag}>`);
        } else {
          lines.push(`<${tag}${startAttr}>${itemLines.join('')}</${tag}>`);
        }
        break;
      }

      case 'code': {
        const t = token as Tokens.Code;
        state.stats.codeBlocks += 1;
        const lang = cleanLanguage(t.lang);
        const classAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
        const rawCode = unescapeMarkedText(t.text, t.escaped);
        lines.push(`${indent}<pre><code${classAttr}>${escapeHtml(rawCode)}</code></pre>`);
        break;
      }

      case 'table': {
        const t = token as Tokens.Table;
        state.stats.tables += 1;
        const alignAttr = (idx: number): string => {
          const a = t.align[idx];
          return a === 'left' || a === 'center' || a === 'right' ? ` style="text-align:${a}"` : '';
        };
        if (state.pretty) {
          lines.push(`${indent}<table>`);
          lines.push(`${pad(depth + 1, true)}<thead>`);
          lines.push(`${pad(depth + 2, true)}<tr>`);
          t.header.forEach((cell, idx) => {
            lines.push(`${pad(depth + 3, true)}<th scope="col"${alignAttr(idx)}>${serializeInline(cell.tokens, state)}</th>`);
          });
          lines.push(`${pad(depth + 2, true)}</tr>`);
          lines.push(`${pad(depth + 1, true)}</thead>`);
          if (t.rows.length > 0) {
            lines.push(`${pad(depth + 1, true)}<tbody>`);
            for (const row of t.rows) {
              lines.push(`${pad(depth + 2, true)}<tr>`);
              row.forEach((cell, idx) => {
                lines.push(`${pad(depth + 3, true)}<td${alignAttr(idx)}>${serializeInline(cell.tokens, state)}</td>`);
              });
              lines.push(`${pad(depth + 2, true)}</tr>`);
            }
            lines.push(`${pad(depth + 1, true)}</tbody>`);
          }
          lines.push(`${indent}</table>`);
        } else {
          const headCells = t.header
            .map((cell, idx) => `<th scope="col"${alignAttr(idx)}>${serializeInline(cell.tokens, state)}</th>`)
            .join('');
          const bodyRows = t.rows
            .map(
              (row) =>
                `<tr>${row.map((cell, idx) => `<td${alignAttr(idx)}>${serializeInline(cell.tokens, state)}</td>`).join('')}</tr>`,
            )
            .join('');
          const bodyHtml = bodyRows ? `<tbody>${bodyRows}</tbody>` : '';
          lines.push(`<table><thead><tr>${headCells}</tr></thead>${bodyHtml}</table>`);
        }
        break;
      }

      case 'hr': {
        lines.push(`${indent}<hr>`);
        break;
      }

      case 'html': {
        const t = token as Tokens.HTML;
        if (state.rawHtml === 'escape') {
          const trimmed = t.raw.trim();
          if (trimmed) {
            lines.push(`${indent}<p>${escapeHtml(trimmed)}</p>`);
          }
        }
        break;
      }

      default:
        break;
    }
  }

  return lines;
}

function indentHtmlOutsidePre(html: string, prefix = '  '): string {
  if (!html) return '';
  const lines = html.split('\n');
  let inPre = false;
  const out: string[] = [];

  for (const line of lines) {
    if (inPre) {
      out.push(line);
    } else {
      out.push(line ? `${prefix}${line}` : '');
    }

    const tagRe = /<(\/?)pre(?:\s[^>]*)?>/gi;
    let match: RegExpExecArray | null;
    while ((match = tagRe.exec(line)) !== null) {
      inPre = match[1] !== '/';
    }
  }

  return out.join('\n');
}

export function wrapHtmlDocument(fragment: string, title: string, pretty = true): string {
  const safeTitle = escapeHtml(title.trim() || 'Converted Markdown');
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${EXPORT_DOCUMENT_CSP}">`;
  const styleBlock = [
    'body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }',
    'pre { overflow-x: auto; padding: 1rem; background: #f4f4f6; border-radius: 6px; }',
    'code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }',
    'blockquote { margin: 1rem 0; padding-left: 1rem; border-left: 3px solid #c4c4cc; color: #444; }',
    'table { border-collapse: collapse; width: 100%; margin: 1rem 0; }',
    'th, td { border: 1px solid #d4d4d8; padding: 0.45rem 0.7rem; text-align: left; }',
    'img { max-width: 100%; height: auto; }',
  ];

  if (!pretty) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${cspMeta}<title>${safeTitle}</title><style>${styleBlock.join(' ')}</style></head><body>${fragment}</body></html>`;
  }

  const indentedBody = indentHtmlOutsidePre(fragment, '  ');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  ${cspMeta}`,
    `  <title>${safeTitle}</title>`,
    '  <style>',
    ...styleBlock.map((rule) => `    ${rule}`),
    '  </style>',
    '</head>',
    '<body>',
    ...(indentedBody ? [indentedBody] : []),
    '</body>',
    '</html>',
  ].join('\n');
}

export function convertMarkdownToHtml(markdown: string, options: ConvertOptions = {}): ConvertResult {
  if (typeof markdown !== 'string') {
    throw new TypeError('Markdown input must be a string.');
  }
  if (markdown.length > MAX_INPUT_CHARS) {
    throw new RangeError(`Input exceeds the ${MAX_INPUT_CHARS.toLocaleString('en-US')} character limit.`);
  }

  const outputMode: HtmlOutputMode = options.outputMode === 'document' ? 'document' : 'fragment';
  const rawHtml: RawHtmlMode = options.rawHtml === 'strip' ? 'strip' : 'escape';
  const breaks = Boolean(options.breaks);
  const headingIds = Boolean(options.headingIds);
  const pretty = options.pretty !== false;

  const normalized = markdown.replace(/\r\n?/g, '\n');
  const tokens = normalized.trim() ? Array.from(marked.lexer(normalized, { gfm: true, breaks })) : [];

  const state: SerializeState = {
    rawHtml,
    headingIds,
    pretty,
    slugs: new Map(),
    stats: { headings: 0, links: 0, codeBlocks: 0, tables: 0 },
    firstHeading: '',
  };

  const blockLines = serializeBlocks(tokens, state, 0);
  const fragment = pretty ? blockLines.join('\n') : blockLines.join('');
  const title = (options.documentTitle ?? '').trim() || state.firstHeading || 'Converted Markdown';
  const html = outputMode === 'document' ? wrapHtmlDocument(fragment, title, pretty) : fragment;
  const plainText = extractPlainTextFromTokens(tokens, rawHtml);

  const trimmed = normalized.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const lines = normalized === '' ? 0 : normalized.split('\n').length;

  return {
    html,
    plainText,
    tokens,
    title,
    stats: {
      words,
      lines,
      markdownChars: normalized.length,
      htmlChars: html.length,
      headings: state.stats.headings,
      links: state.stats.links,
      codeBlocks: state.stats.codeBlocks,
      tables: state.stats.tables,
    },
  };
}
