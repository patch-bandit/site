import type { Token, Tokens } from 'marked';
import {
  decodeBasicEntities,
  extractPlainTextFromTokens,
  sanitizeUrl,
  slugifyHeading,
  type RawHtmlMode,
} from './markdownToHtml.ts';

export interface PreviewOptions {
  rawHtml?: RawHtmlMode;
  headingIds?: boolean;
}

export interface MinimalNode {
  textContent: string | null;
}

export interface MinimalElement extends MinimalNode {
  tagName: string;
  className: string;
  setAttribute(name: string, value: string): void;
  appendChild<T extends MinimalNode>(node: T): T;
}

export interface MinimalFragment extends MinimalNode {
  appendChild<T extends MinimalNode>(node: T): T;
}

export interface MinimalDocument {
  createElement(tagName: string): MinimalElement;
  createTextNode(data: string): MinimalNode;
  createDocumentFragment(): MinimalFragment;
}

function unescapeText(text: string, escaped?: boolean): string {
  return escaped ? decodeBasicEntities(text) : text;
}

function cleanLanguage(lang: string | undefined): string {
  if (!lang) return '';
  const first = lang.trim().split(/\s+/)[0] ?? '';
  return first.replace(/[^a-zA-Z0-9_+#.-]/g, '');
}

function appendInlineNodes(
  parent: MinimalElement | MinimalFragment,
  tokens: Token[] | undefined,
  doc: MinimalDocument,
  rawHtml: RawHtmlMode,
  skipLeadingCheckbox = false,
): void {
  if (!tokens || tokens.length === 0) return;
  let skippedCheckbox = false;

  for (const token of tokens) {
    if (token.type === 'checkbox') {
      if (skipLeadingCheckbox && !skippedCheckbox) {
        skippedCheckbox = true;
        continue;
      }
      const cb = token as Tokens.Checkbox;
      const input = doc.createElement('input');
      input.setAttribute('type', 'checkbox');
      input.setAttribute('disabled', '');
      if (cb.checked) input.setAttribute('checked', '');
      input.setAttribute('aria-label', cb.checked ? 'Completed task' : 'Open task');
      parent.appendChild(input);
      parent.appendChild(doc.createTextNode(' '));
      continue;
    }

    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) {
          appendInlineNodes(parent, t.tokens, doc, rawHtml, skipLeadingCheckbox && !skippedCheckbox);
        } else {
          const text = unescapeText(t.text, 'escaped' in t ? Boolean(t.escaped) : false);
          parent.appendChild(doc.createTextNode(text));
        }
        break;
      }
      case 'escape': {
        const t = token as Tokens.Escape;
        const ch = t.raw.length >= 2 && t.raw.startsWith('\\') ? t.raw.slice(1) : decodeBasicEntities(t.text);
        parent.appendChild(doc.createTextNode(ch));
        break;
      }
      case 'strong': {
        const t = token as Tokens.Strong;
        const el = doc.createElement('strong');
        appendInlineNodes(el, t.tokens, doc, rawHtml);
        parent.appendChild(el);
        break;
      }
      case 'em': {
        const t = token as Tokens.Em;
        const el = doc.createElement('em');
        appendInlineNodes(el, t.tokens, doc, rawHtml);
        parent.appendChild(el);
        break;
      }
      case 'del': {
        const t = token as Tokens.Del;
        const el = doc.createElement('del');
        appendInlineNodes(el, t.tokens, doc, rawHtml);
        parent.appendChild(el);
        break;
      }
      case 'codespan': {
        const t = token as Tokens.Codespan;
        const el = doc.createElement('code');
        el.textContent = unescapeText(t.text, 'escaped' in t ? Boolean(t.escaped) : false);
        parent.appendChild(el);
        break;
      }
      case 'br': {
        parent.appendChild(doc.createElement('br'));
        break;
      }
      case 'link': {
        const t = token as Tokens.Link;
        const safeHref = sanitizeUrl(t.href, true);
        if (!safeHref) {
          if (t.tokens && t.tokens.length > 0) {
            appendInlineNodes(parent, t.tokens, doc, rawHtml);
          } else {
            parent.appendChild(doc.createTextNode(t.text));
          }
          break;
        }
        const a = doc.createElement('a');
        a.setAttribute('href', safeHref);
        if (t.title) a.setAttribute('title', t.title);
        if (/^https?:\/\//i.test(safeHref)) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }
        if (t.tokens && t.tokens.length > 0) {
          appendInlineNodes(a, t.tokens, doc, rawHtml);
        } else {
          a.textContent = t.text;
        }
        parent.appendChild(a);
        break;
      }
      case 'image': {
        // Never create a live <img> pointing at user URLs in preview so pasting untrusted
        // Markdown triggers no third-party network requests or tracking pixel loads.
        const t = token as Tokens.Image;
        const safeSrc = sanitizeUrl(t.href, false);
        const stub = doc.createElement('span');
        stub.className = 'md-img-stub';
        const altLabel = t.text ? t.text : 'Image';
        stub.textContent = safeSrc ? `[Image: ${altLabel} (${safeSrc})]` : `[Image blocked: ${altLabel}]`;
        parent.appendChild(stub);
        break;
      }
      case 'html': {
        const t = token as Tokens.HTML;
        if (rawHtml === 'escape') {
          parent.appendChild(doc.createTextNode(t.raw));
        }
        break;
      }
      default: {
        if ('tokens' in token && Array.isArray(token.tokens)) {
          appendInlineNodes(parent, token.tokens, doc, rawHtml);
        } else if ('raw' in token && typeof token.raw === 'string') {
          parent.appendChild(doc.createTextNode(token.raw));
        }
        break;
      }
    }
  }
}

function appendBlockNodes(
  parent: MinimalElement | MinimalFragment,
  tokens: Token[],
  doc: MinimalDocument,
  rawHtml: RawHtmlMode,
  headingIds: boolean,
  slugs: Map<string, number>,
): void {
  for (const token of tokens) {
    switch (token.type) {
      case 'space':
      case 'def':
        break;

      case 'heading': {
        const t = token as Tokens.Heading;
        // Render preview headings as styled divs with ARIA heading semantics so user Markdown
        // never injects a second <h1> or clobbers host-page landmark IDs.
        const level = Math.min(6, Math.max(1, t.depth));
        const el = doc.createElement('div');
        el.className = `md-h${level}`;
        el.setAttribute('role', 'heading');
        el.setAttribute('aria-level', String(level));
        el.setAttribute('data-md-heading-level', String(level));
        if (headingIds) {
          const plain = extractPlainTextFromTokens(t.tokens);
          const slug = slugifyHeading(plain, slugs);
          el.setAttribute('data-heading-id', slug);
        }
        appendInlineNodes(el, t.tokens, doc, rawHtml);
        parent.appendChild(el);
        break;
      }

      case 'paragraph': {
        const t = token as Tokens.Paragraph;
        const p = doc.createElement('p');
        appendInlineNodes(p, t.tokens, doc, rawHtml);
        parent.appendChild(p);
        break;
      }

      case 'text': {
        const t = token as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) {
          appendInlineNodes(parent, t.tokens, doc, rawHtml);
        } else {
          parent.appendChild(doc.createTextNode(unescapeText(t.text, 'escaped' in t ? Boolean(t.escaped) : false)));
        }
        break;
      }

      case 'blockquote': {
        const t = token as Tokens.Blockquote;
        const bq = doc.createElement('blockquote');
        appendBlockNodes(bq, t.tokens, doc, rawHtml, headingIds, slugs);
        parent.appendChild(bq);
        break;
      }

      case 'list': {
        const t = token as Tokens.List;
        const listEl = doc.createElement(t.ordered ? 'ol' : 'ul');
        if (t.ordered && t.start !== '' && Number(t.start) !== 1) {
          listEl.setAttribute('start', String(Number(t.start)));
        }
        for (const item of t.items) {
          const li = doc.createElement('li');
          if (item.task) {
            li.className = 'md-task-item';
          }
          const itemTokens = item.tokens.filter((tk) => tk.type !== 'checkbox');

          const makeCheckbox = () => {
            const input = doc.createElement('input');
            input.setAttribute('type', 'checkbox');
            input.setAttribute('disabled', '');
            if (item.checked) input.setAttribute('checked', '');
            input.setAttribute('aria-label', item.checked ? 'Completed task' : 'Open task');
            return input;
          };

          const isSingleInline =
            !item.loose &&
            itemTokens.length === 1 &&
            (itemTokens[0].type === 'text' || itemTokens[0].type === 'paragraph');

          if (isSingleInline) {
            if (item.task) {
              li.appendChild(makeCheckbox());
              li.appendChild(doc.createTextNode(' '));
            }
            const first = itemTokens[0] as Tokens.Text | Tokens.Paragraph;
            if (first.tokens && first.tokens.length > 0) {
              appendInlineNodes(li, first.tokens, doc, rawHtml, item.task);
            } else {
              li.appendChild(
                doc.createTextNode(unescapeText(first.text, 'escaped' in first ? Boolean(first.escaped) : false)),
              );
            }
          } else {
            let checkboxPlaced = !item.task;
            for (const sub of itemTokens) {
              if (!checkboxPlaced && (sub.type === 'text' || sub.type === 'paragraph')) {
                const subT = sub as Tokens.Text | Tokens.Paragraph;
                const host = sub.type === 'paragraph' ? doc.createElement('p') : li;
                host.appendChild(makeCheckbox());
                host.appendChild(doc.createTextNode(' '));
                if (subT.tokens && subT.tokens.length > 0) {
                  appendInlineNodes(host, subT.tokens, doc, rawHtml, true);
                } else {
                  host.appendChild(
                    doc.createTextNode(unescapeText(subT.text, 'escaped' in subT ? Boolean(subT.escaped) : false)),
                  );
                }
                if (host !== li) li.appendChild(host);
                checkboxPlaced = true;
              } else {
                appendBlockNodes(li, [sub], doc, rawHtml, headingIds, slugs);
              }
            }
            if (!checkboxPlaced) {
              li.appendChild(makeCheckbox());
            }
          }
          listEl.appendChild(li);
        }
        parent.appendChild(listEl);
        break;
      }

      case 'code': {
        const t = token as Tokens.Code;
        const pre = doc.createElement('pre');
        const code = doc.createElement('code');
        const lang = cleanLanguage(t.lang);
        if (lang) code.className = `language-${lang}`;
        code.textContent = unescapeText(t.text, t.escaped);
        pre.appendChild(code);
        parent.appendChild(pre);
        break;
      }

      case 'table': {
        const t = token as Tokens.Table;
        const wrap = doc.createElement('div');
        wrap.className = 'md-table-wrap';
        const table = doc.createElement('table');

        const thead = doc.createElement('thead');
        const headTr = doc.createElement('tr');
        t.header.forEach((cell, idx) => {
          const th = doc.createElement('th');
          th.setAttribute('scope', 'col');
          const align = t.align[idx];
          if (align === 'left' || align === 'center' || align === 'right') {
            th.setAttribute('data-align', align);
          }
          appendInlineNodes(th, cell.tokens, doc, rawHtml);
          headTr.appendChild(th);
        });
        thead.appendChild(headTr);
        table.appendChild(thead);

        if (t.rows.length > 0) {
          const tbody = doc.createElement('tbody');
          for (const row of t.rows) {
            const tr = doc.createElement('tr');
            row.forEach((cell, idx) => {
              const td = doc.createElement('td');
              const align = t.align[idx];
              if (align === 'left' || align === 'center' || align === 'right') {
                td.setAttribute('data-align', align);
              }
              appendInlineNodes(td, cell.tokens, doc, rawHtml);
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          }
          table.appendChild(tbody);
        }

        wrap.appendChild(table);
        parent.appendChild(wrap);
        break;
      }

      case 'hr': {
        parent.appendChild(doc.createElement('hr'));
        break;
      }

      case 'html': {
        const t = token as Tokens.HTML;
        if (rawHtml === 'escape') {
          const trimmed = t.raw.trim();
          if (trimmed) {
            const p = doc.createElement('p');
            p.textContent = trimmed;
            parent.appendChild(p);
          }
        }
        break;
      }

      default:
        break;
    }
  }
}

/**
 * Renders parsed Markdown tokens into a DOM DocumentFragment strictly via
 * createElement, createTextNode, textContent, and allowlisted attributes.
 * Never touches innerHTML, outerHTML, insertAdjacentHTML, or DOMParser.
 */
export function renderTokensToFragment(
  tokens: Token[],
  doc: MinimalDocument,
  options: PreviewOptions = {},
): MinimalFragment {
  const rawHtml: RawHtmlMode = options.rawHtml === 'strip' ? 'strip' : 'escape';
  const headingIds = Boolean(options.headingIds);
  const frag = doc.createDocumentFragment();
  appendBlockNodes(frag, tokens, doc, rawHtml, headingIds, new Map());
  return frag;
}
