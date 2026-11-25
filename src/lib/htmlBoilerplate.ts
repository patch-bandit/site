// Clean, accessible HTML5 boilerplate generator.
// Browser-only, zero runtime dependencies, strict HTML/attribute escaping and URL/color checks.

export type PresetId = 'clean' | 'minimal' | 'article';
export type CssMode = 'none' | 'linked' | 'inline-base' | 'inline-classless';
export type ScriptMode = 'none' | 'defer' | 'module';
export type IndentMode = '2' | '4' | 'tab';

export interface BoilerplateOptions {
  title: string;
  description: string;
  lang: string;
  author: string;
  canonicalUrl: string;
  ogImageUrl: string;
  accentColor: string;
  includeViewport: boolean;
  includeColorScheme: boolean;
  includeThemeColor: boolean;
  includeFavicon: boolean;
  includeCanonical: boolean;
  includeOpenGraph: boolean;
  includeSkipLink: boolean;
  includeLandmarks: boolean;
  includeArticleWrapper: boolean;
  includeComments: boolean;
  cssMode: CssMode;
  stylesheetHref: string;
  scriptMode: ScriptMode;
  scriptSrc: string;
  indent: IndentMode;
}

export interface PresetDefinition {
  id: PresetId;
  label: string;
  summary: string;
  options: BoilerplateOptions;
}

export interface CheckBadge {
  id: string;
  label: string;
  ok: boolean;
}

export interface BoilerplateStats {
  lines: number;
  bytes: number;
  externalAssets: number;
  checks: CheckBadge[];
}

export interface GeneratedBoilerplate {
  html: string;
  previewHtml: string;
  stats: BoilerplateStats;
  warnings: string[];
}

export const QUICK_LANGS = ['en', 'es', 'fr', 'de', 'ja'];
export const DEFAULT_ACCENT = '#2563eb';
export const LIGHT_BG = '#ffffff';
export const DARK_BG = '#11131a';
export const DEFAULT_STYLESHEET = 'styles.css';
export const DEFAULT_SCRIPT = 'app.js';

export const DEFAULT_OPTIONS: BoilerplateOptions = {
  title: 'My new page',
  description: 'A clean HTML5 starter page with sensible defaults for headings, focus, and motion.',
  lang: 'en',
  author: '',
  canonicalUrl: 'https://example.com/',
  ogImageUrl: '',
  accentColor: DEFAULT_ACCENT,
  includeViewport: true,
  includeColorScheme: true,
  includeThemeColor: true,
  includeFavicon: true,
  includeCanonical: false,
  includeOpenGraph: false,
  includeSkipLink: true,
  includeLandmarks: true,
  includeArticleWrapper: false,
  includeComments: false,
  cssMode: 'inline-base',
  stylesheetHref: DEFAULT_STYLESHEET,
  scriptMode: 'none',
  scriptSrc: DEFAULT_SCRIPT,
  indent: '2',
};

export const PRESETS: PresetDefinition[] = [
  {
    id: 'clean',
    label: 'Clean starter',
    summary: 'Headings, focus, motion',
    options: { ...DEFAULT_OPTIONS },
  },
  {
    id: 'minimal',
    label: 'Minimal shell',
    summary: 'Bare HTML5 document',
    options: {
      ...DEFAULT_OPTIONS,
      description: '',
      includeColorScheme: false,
      includeThemeColor: false,
      includeFavicon: false,
      includeCanonical: false,
      includeOpenGraph: false,
      includeSkipLink: false,
      includeLandmarks: false,
      includeArticleWrapper: false,
      cssMode: 'none',
      scriptMode: 'none',
    },
  },
  {
    id: 'article',
    label: 'Share-ready article',
    summary: 'OG tags + classless CSS',
    options: {
      ...DEFAULT_OPTIONS,
      title: 'Notes from the workbench',
      description: 'An accessible article starter with Open Graph metadata and self-contained semantic CSS.',
      canonicalUrl: 'https://example.com/notes/',
      includeCanonical: true,
      includeOpenGraph: true,
      includeSkipLink: true,
      includeLandmarks: true,
      includeArticleWrapper: true,
      cssMode: 'inline-classless',
    },
  },
];

export function getPresetOptions(id: PresetId): BoilerplateOptions {
  const found = PRESETS.find((p) => p.id === id);
  return found ? { ...found.options } : { ...DEFAULT_OPTIONS };
}

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeSingleLine(raw: string, maxLen = 240): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeLang(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 35);
  return cleaned || 'en';
}

export function sanitizeHexColor(raw: string, fallback = DEFAULT_ACCENT): { color: string; valid: boolean } {
  const trimmed = raw.trim();
  const six = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (six) return { color: `#${six[1].toLowerCase()}`, valid: true };
  const three = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (three) {
    const [r, g, b] = three[1].toLowerCase().split('');
    return { color: `#${r}${r}${g}${g}${b}${b}`, valid: true };
  }
  return { color: fallback, valid: false };
}

export function sanitizeHttpUrl(raw: string): { url: string; valid: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { url: '', valid: true };
  if (/[\u0000-\u0020"'<>]/.test(trimmed)) return { url: '', valid: false };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return { url: parsed.href, valid: true };
    }
    return { url: '', valid: false };
  } catch {
    return { url: '', valid: false };
  }
}

export function sanitizeAssetPath(raw: string, fallback: string): { path: string; valid: boolean; external: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { path: fallback, valid: true, external: false };
  if (/[\u0000-\u0020"'<>\\]/.test(trimmed)) return { path: fallback, valid: false, external: false };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    const checked = sanitizeHttpUrl(trimmed);
    if (checked.valid && checked.url) {
      return { path: checked.url, valid: true, external: true };
    }
    return { path: fallback, valid: false, external: false };
  }
  if (trimmed.startsWith('//')) {
    return { path: fallback, valid: false, external: false };
  }
  return { path: trimmed.slice(0, 180), valid: true, external: false };
}

function hexToRgb(hex: string): [number, number, number] {
  const safe = sanitizeHexColor(hex, DEFAULT_ACCENT).color;
  const num = parseInt(safe.slice(1), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function getDarkAccentText(accent: string): string {
  const safe = sanitizeHexColor(accent, DEFAULT_ACCENT).color;
  if (contrastRatio(safe, DARK_BG) >= 4.5) return safe;
  const [r, g, b] = hexToRgb(safe);
  for (let step = 1; step <= 50; step += 1) {
    const t = step / 50;
    const nr = Math.round(r + (255 - r) * t);
    const ng = Math.round(g + (255 - g) * t);
    const nb = Math.round(b + (255 - b) * t);
    const candidate = `#${[nr, ng, nb].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    if (contrastRatio(candidate, DARK_BG) >= 6.0) {
      return candidate;
    }
  }
  return '#ffffff';
}

function isPlaceholderHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'example.com' || host.endsWith('.example.com');
  } catch {
    return false;
  }
}

export function buildFaviconDataUri(title: string, accentColor: string): string {
  const match = /[A-Za-z0-9]/.exec(title);
  const initial = (match ? match[0] : 'H').toUpperCase();
  const safeColor = sanitizeHexColor(accentColor).color;
  const encodedColor = safeColor.replace('#', '%23');
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='${encodedColor}'/%3E%3Ctext x='32' y='44' text-anchor='middle' font-family='system-ui,sans-serif' font-size='34' font-weight='700' fill='%23ffffff'%3E${initial}%3C/text%3E%3C/svg%3E`;
}

function getIndentUnit(mode: IndentMode): string {
  if (mode === '4') return '    ';
  if (mode === 'tab') return '\t';
  return '  ';
}

function buildBaselineCss(accent: string, includeSkipLink: boolean, pad: string): string[] {
  const p2 = pad + pad;
  const darkAccent = getDarkAccentText(accent);
  const lines = [
    ':root {',
    `${pad}color-scheme: light dark;`,
    `${pad}--accent: ${accent};`,
    `${pad}--accent-text: ${accent};`,
    `${pad}--bg: ${LIGHT_BG};`,
    `${pad}--fg: #18181b;`,
    `${pad}--muted: #52525b;`,
    `${pad}--line: #d4d4d8;`,
    '}',
    '@media (prefers-color-scheme: dark) {',
    `${pad}:root {`,
    ...(darkAccent !== accent ? [`${p2}--accent-text: ${darkAccent};`] : []),
    `${p2}--bg: ${DARK_BG};`,
    `${p2}--fg: #f4f4f5;`,
    `${p2}--muted: #a1a1aa;`,
    `${p2}--line: #2e3240;`,
    `${pad}}`,
    '}',
    '*, *::before, *::after { box-sizing: border-box; }',
    'html { -webkit-text-size-adjust: 100%; }',
    'body {',
    `${pad}margin: 0;`,
    `${pad}background: var(--bg);`,
    `${pad}color: var(--fg);`,
    `${pad}font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;`,
    `${pad}font-size: 1.0625rem;`,
    `${pad}line-height: 1.65;`,
    '}',
    'header, main, footer {',
    `${pad}width: min(100% - 2rem, 48rem);`,
    `${pad}margin-inline: auto;`,
    '}',
    'header { padding: 1.5rem 0 1rem; border-bottom: 1px solid var(--line); }',
    'main { padding: 2rem 0; }',
    'footer { padding: 1.25rem 0 2.5rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.92rem; }',
    'h1, h2, h3 { line-height: 1.2; text-wrap: balance; margin-top: 0; }',
    'p, li { max-width: 68ch; }',
    'img, svg, video { max-width: 100%; height: auto; display: block; }',
    'a { color: var(--accent-text); text-underline-offset: 0.2em; }',
    ':focus-visible { outline: 3px solid var(--accent-text); outline-offset: 3px; border-radius: 3px; }',
  ];

  if (includeSkipLink) {
    lines.push(
      '.skip-link {',
      `${pad}position: absolute;`,
      `${pad}left: 1rem;`,
      `${pad}top: -4rem;`,
      `${pad}background: var(--fg);`,
      `${pad}color: var(--bg);`,
      `${pad}padding: 0.6rem 1rem;`,
      `${pad}border-radius: 6px;`,
      `${pad}font-weight: 600;`,
      `${pad}text-decoration: none;`,
      '}',
      '.skip-link:focus { top: 0.75rem; }',
    );
  }

  lines.push(
    '@media (prefers-reduced-motion: reduce) {',
    `${pad}*, *::before, *::after {`,
    `${p2}animation-duration: 0.01ms !important;`,
    `${p2}animation-iteration-count: 1 !important;`,
    `${p2}transition-duration: 0.01ms !important;`,
    `${p2}scroll-behavior: auto !important;`,
    `${pad}}`,
    '}',
  );
  return lines;
}

function buildClasslessCss(accent: string, includeSkipLink: boolean, pad: string): string[] {
  const lines = [
    ...buildBaselineCss(accent, includeSkipLink, pad),
    'nav ul { list-style: none; padding: 0; margin: 0.5rem 0 0; display: flex; flex-wrap: wrap; gap: 1rem; }',
    'code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; }',
    'pre { overflow-x: auto; padding: 1rem; border-radius: 8px; border: 1px solid var(--line); }',
    'blockquote { margin: 1.5rem 0; padding: 0.25rem 0 0.25rem 1rem; border-left: 4px solid var(--accent); color: var(--muted); }',
    'button, input, textarea, select { font: inherit; color: inherit; }',
    'button { padding: 0.55rem 1rem; border-radius: 8px; border: 1px solid var(--line); background: transparent; cursor: pointer; }',
    'table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }',
    'th, td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line); }',
    'hr { border: 0; border-top: 1px solid var(--line); margin: 2rem 0; }',
  ];
  return lines;
}

function renderDocument(
  opts: BoilerplateOptions,
  accent: string,
  canonicalUrl: string,
  ogImageUrl: string,
  stylesheetPath: string,
  scriptPath: string,
  forPreview: boolean,
): string {
  const pad = getIndentUnit(opts.indent);
  const p2 = pad + pad;
  const p3 = p2 + pad;
  const p4 = p3 + pad;
  const titleText = sanitizeSingleLine(opts.title, 140) || 'My new page';
  const descText = sanitizeSingleLine(opts.description, 300);
  const authorText = sanitizeSingleLine(opts.author, 100);
  const lang = sanitizeLang(opts.lang);

  const lines: string[] = [
    '<!doctype html>',
    `<html lang="${escapeHtml(lang)}">`,
    `${pad}<head>`,
    `${p2}<meta charset="utf-8">`,
  ];

  if (opts.includeViewport) {
    lines.push(`${p2}<meta name="viewport" content="width=device-width, initial-scale=1">`);
  }

  lines.push(`${p2}<title>${escapeHtml(titleText)}</title>`);

  if (descText) {
    lines.push(`${p2}<meta name="description" content="${escapeHtml(descText)}">`);
  }
  if (authorText) {
    lines.push(`${p2}<meta name="author" content="${escapeHtml(authorText)}">`);
  }
  if (opts.includeColorScheme) {
    lines.push(`${p2}<meta name="color-scheme" content="light dark">`);
  }
  if (opts.includeThemeColor) {
    lines.push(`${p2}<meta name="theme-color" content="${escapeHtml(accent)}">`);
  }
  if (opts.includeCanonical && canonicalUrl) {
    lines.push(`${p2}<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
  }
  if (opts.includeFavicon) {
    const uri = buildFaviconDataUri(titleText, accent);
    lines.push(`${p2}<link rel="icon" href="${uri}" type="image/svg+xml">`);
  }

  if (opts.includeOpenGraph) {
    if (opts.includeComments) {
      lines.push(`${p2}<!-- Social sharing metadata -->`);
    }
    lines.push(`${p2}<meta property="og:type" content="${opts.includeArticleWrapper ? 'article' : 'website'}">`);
    lines.push(`${p2}<meta property="og:title" content="${escapeHtml(titleText)}">`);
    if (descText) {
      lines.push(`${p2}<meta property="og:description" content="${escapeHtml(descText)}">`);
    }
    if (canonicalUrl) {
      lines.push(`${p2}<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`);
    }
    if (ogImageUrl) {
      lines.push(`${p2}<meta property="og:image" content="${escapeHtml(ogImageUrl)}">`);
    }
    lines.push(`${p2}<meta name="twitter:card" content="${ogImageUrl ? 'summary_large_image' : 'summary'}">`);
  }

  if (opts.cssMode === 'linked') {
    if (!forPreview) {
      if (opts.includeComments) {
        lines.push(`${p2}<!-- External stylesheet -->`);
      }
      lines.push(`${p2}<link rel="stylesheet" href="${escapeHtml(stylesheetPath)}">`);
    } else {
      lines.push(`${p2}<style>body{font-family:system-ui,sans-serif;padding:1.25rem;line-height:1.6;} .pb-preview-note{font:500 0.85rem/1.4 ui-monospace,monospace;padding:0.6rem 0.8rem;border:1px dashed #6b7280;border-radius:6px;margin-bottom:1rem;}</style>`);
    }
  } else if (opts.cssMode === 'inline-base' || opts.cssMode === 'inline-classless') {
    if (opts.includeComments) {
      lines.push(`${p2}<!-- Accessible typography, focus ring, and reduced-motion defaults -->`);
    }
    lines.push(`${p2}<style>`);
    const cssLines =
      opts.cssMode === 'inline-classless'
        ? buildClasslessCss(accent, opts.includeSkipLink, pad)
        : buildBaselineCss(accent, opts.includeSkipLink, pad);
    for (const cssLine of cssLines) {
      lines.push(`${p3}${cssLine}`);
    }
    lines.push(`${p2}</style>`);
  }

  if (!forPreview && opts.scriptMode !== 'none') {
    if (opts.includeComments) {
      lines.push(`${p2}<!-- Deferred script avoids render blocking -->`);
    }
    if (opts.scriptMode === 'module') {
      lines.push(`${p2}<script type="module" src="${escapeHtml(scriptPath)}"></script>`);
    } else {
      lines.push(`${p2}<script src="${escapeHtml(scriptPath)}" defer></script>`);
    }
  }

  lines.push(`${pad}</head>`);
  lines.push(`${pad}<body>`);

  if (forPreview && opts.cssMode === 'linked') {
    lines.push(`${p2}<p class="pb-preview-note">Preview note: external stylesheet (${escapeHtml(stylesheetPath)}) is omitted here so the preview makes no network calls.</p>`);
  }

  if (opts.includeSkipLink) {
    lines.push(`${p2}<a class="skip-link" href="#main">Skip to content</a>`);
  }

  if (opts.includeLandmarks) {
    if (opts.includeComments) {
      lines.push(`${p2}<!-- Semantic landmarks for keyboard and screen-reader navigation -->`);
    }
    lines.push(`${p2}<header>`);
    lines.push(`${p3}<p><strong>${escapeHtml(titleText)}</strong></p>`);
    lines.push(`${p3}<nav aria-label="Primary">`);
    lines.push(`${p4}<ul>`);
    lines.push(`${p4}${pad}<li><a href="#main">Overview</a></li>`);
    lines.push(`${p4}${pad}<li><a href="#details">Details</a></li>`);
    lines.push(`${p4}</ul>`);
    lines.push(`${p3}</nav>`);
    lines.push(`${p2}</header>`);
  }

  lines.push(`${p2}<main id="main">`);
  const innerPad = opts.includeArticleWrapper ? p4 : p3;
  if (opts.includeArticleWrapper) {
    lines.push(`${p3}<article>`);
  }
  lines.push(`${innerPad}<h1>${escapeHtml(titleText)}</h1>`);
  lines.push(
    `${innerPad}<p>${escapeHtml(descText || 'Start writing your page here. Headings, focus outlines, and motion rules are already wired in.')}</p>`,
  );
  lines.push(`${innerPad}<section id="details" aria-labelledby="details-heading">`);
  lines.push(`${innerPad}${pad}<h2 id="details-heading">Next steps</h2>`);
  lines.push(`${innerPad}${pad}<p>Replace this placeholder block with your own copy, links, or form controls.</p>`);
  if (opts.cssMode === 'inline-classless') {
    lines.push(`${innerPad}${pad}<blockquote><p>Clean semantic HTML stays fast, readable, and easy to maintain.</p></blockquote>`);
  }
  lines.push(`${innerPad}</section>`);
  if (opts.includeArticleWrapper) {
    lines.push(`${p3}</article>`);
  }
  lines.push(`${p2}</main>`);

  if (opts.includeLandmarks) {
    lines.push(`${p2}<footer>`);
    lines.push(`${p3}<p>Built with plain HTML5.</p>`);
    lines.push(`${p2}</footer>`);
  }

  lines.push(`${pad}</body>`);
  lines.push('</html>');
  return lines.join('\n') + '\n';
}

export function generateHtmlBoilerplate(partial: Partial<BoilerplateOptions> = {}): GeneratedBoilerplate {
  const opts: BoilerplateOptions = { ...DEFAULT_OPTIONS, ...partial };
  const warnings: string[] = [];

  const hasInlineCss = opts.cssMode === 'inline-base' || opts.cssMode === 'inline-classless';

  const colorCheck = sanitizeHexColor(opts.accentColor, DEFAULT_ACCENT);
  if (!colorCheck.valid && opts.accentColor.trim() !== '') {
    warnings.push(`Accent color "${sanitizeSingleLine(opts.accentColor, 30)}" is not a valid hex value. Using ${DEFAULT_ACCENT}.`);
  } else if (hasInlineCss) {
    const lightRatio = contrastRatio(colorCheck.color, LIGHT_BG);
    if (lightRatio < 4.5) {
      warnings.push(
        `Accent color ${colorCheck.color} has ${lightRatio.toFixed(2)}:1 link contrast on the light background (WCAG AA needs 4.5:1). Pick a darker hex for light mode.`,
      );
    }
  }

  const canonicalCheck = sanitizeHttpUrl(opts.canonicalUrl);
  if ((opts.includeCanonical || opts.includeOpenGraph) && opts.canonicalUrl.trim() !== '' && !canonicalCheck.valid) {
    warnings.push('Page URL must start with https:// or http://. Omitted until valid.');
  } else if (
    (opts.includeCanonical || opts.includeOpenGraph) &&
    canonicalCheck.valid &&
    canonicalCheck.url &&
    isPlaceholderHost(canonicalCheck.url)
  ) {
    warnings.push('Page URL still points at example.com. Replace it with your real URL before publishing.');
  }

  const ogImgCheck = sanitizeHttpUrl(opts.ogImageUrl);
  if (opts.includeOpenGraph && opts.ogImageUrl.trim() !== '' && !ogImgCheck.valid) {
    warnings.push('Open Graph image URL must start with https:// or http://. Omitted until valid.');
  }

  const cssAsset = sanitizeAssetPath(opts.stylesheetHref, DEFAULT_STYLESHEET);
  if (opts.cssMode === 'linked' && !cssAsset.valid) {
    warnings.push(`Stylesheet path is not a safe relative path or http(s) URL. Using ${DEFAULT_STYLESHEET}.`);
  }

  const scriptAsset = sanitizeAssetPath(opts.scriptSrc, DEFAULT_SCRIPT);
  if (opts.scriptMode !== 'none' && !scriptAsset.valid) {
    warnings.push(`Script path is not a safe relative path or http(s) URL. Using ${DEFAULT_SCRIPT}.`);
  }

  const html = renderDocument(
    opts,
    colorCheck.color,
    canonicalCheck.url,
    ogImgCheck.url,
    cssAsset.path,
    scriptAsset.path,
    false,
  );
  const previewHtml = renderDocument(
    opts,
    colorCheck.color,
    canonicalCheck.url,
    ogImgCheck.url,
    cssAsset.path,
    scriptAsset.path,
    true,
  );

  let externalAssets = 0;
  if (opts.cssMode === 'linked') externalAssets += 1;
  if (opts.scriptMode !== 'none') externalAssets += 1;

  const bytes = new TextEncoder().encode(html).length;
  const lines = html.split('\n').length - 1;

  const checks: CheckBadge[] = [
    { id: 'lang', label: `lang="${sanitizeLang(opts.lang)}"`, ok: true },
    { id: 'viewport', label: 'Mobile viewport', ok: opts.includeViewport },
    { id: 'focus-motion', label: 'Focus & motion CSS', ok: hasInlineCss },
    { id: 'skip', label: 'Skip link', ok: opts.includeSkipLink },
    { id: 'landmarks', label: 'Landmarks', ok: opts.includeLandmarks },
    { id: 'self-contained', label: 'No external files', ok: externalAssets === 0 },
  ];

  return {
    html,
    previewHtml,
    stats: { lines, bytes, externalAssets, checks },
    warnings,
  };
}
