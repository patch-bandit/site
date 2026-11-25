import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { GITHUB_URL, LAB_EXPERIMENTS, TOOLS_LABEL, inWords } from '../data/site';

export const GET: APIRoute = async ({ site }) => {
  const base = site!.href;
  const drops = (await getCollection('drops')).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const qrGuides = (await getCollection('qrGuides')).sort((a, b) => a.data.order - b.data.order);
  const labCount = drops.length + LAB_EXPERIMENTS.length;
  const link = (p: string) => new URL(p, base).href;
  const lines = [
    '# Patch Bandit',
    '',
    `> Raccoons who build free online tools to replace simple tools that charge a monthly fee, source included. So far: ${inWords(labCount)} CSS experiments, a CSS art page, and six live browser tools (Bandit Codes, px to rem converter, UUID generator, Spotlight color contrast checker, HTML boilerplate generator, and Markdown to HTML converter). No users, partners, or sponsors exist.`,
    '',
    '## Pages',
    `- [The story](${link('/')}): what we do and why, data security, what we want to replace, and an honest inventory of what exists`,
    `- [${TOOLS_LABEL}](${link('/tools/')}): free online tools hub, featuring Bandit Codes, px to rem converter, UUID generator, Spotlight, HTML boilerplate generator, and Markdown to HTML converter`,
    `- [Bandit Codes: free QR code generator](${link('/tools/qr-code-generator/')}): make static or own-domain PNG and SVG QR codes locally, export redirect rules for seven hosts, and audit printed codes for subscription lock-in, MIT licensed`,
    `- [Bandit Codes install guides](${link('/tools/qr-code-generator/guides/')}): plain-language setup guides for 11 website platforms`,
    `- [px to rem converter](${link('/tools/px-to-rem/')}): two-way px and rem conversion with custom root font size and batch CSS conversion in your browser, no account, MIT licensed`,
    `- [UUID generator and unique ID maker](${link('/tools/uuid-generator/')}): make 1 to 100 UUID v4, RFC 9562 UUID v7, or custom short random IDs in your browser with Web Crypto, nothing sent anywhere, MIT licensed`,
    `- [Spotlight: color contrast checker](${link('/tools/contrast-checker/')}): check WCAG AA and AAA contrast for hex or RGB color pairs, preview text and UI parts live, find the nearest passing color, and share pairs in the URL hash, nothing sent anywhere, MIT licensed`,
    `- [HTML boilerplate generator](${link('/tools/html-boilerplate-generator/')}): build one clean HTML5 starter page with sensible defaults for headings, focus rings, reduced motion, and optional Open Graph tags right in your browser, no account, MIT licensed`,
    `- [Markdown to HTML converter](${link('/tools/markdown-to-html/')}): convert GitHub Flavored Markdown to clean, safe HTML with live DOM preview and fragment or full-page export in your browser, no uploads, MIT licensed`,
    `- [The stash](${link('/den/')}): open source project ideas, how the manifesto typing works, house rules, and how to build them together`,
    `- [The lab](${link('/lab/')}): the snack drop log of CSS experiments`,
    `- [The snack jar](${link('/snacks/')}): optional tips through Stripe; every tool stays free`,
    `- [Privacy](${link('/privacy/')}): no cookies, no tracking, tools run in your browser`,
    `- [CSS art raccoon](${link('/lab/css-art-raccoon/')}): a raccoon drawn in pure CSS, pulled apart piece by piece`,
    '',
    '## Bandit Codes install guides',
    ...qrGuides
      .filter((g) => g.id !== 'index')
      .map((g) => `- [${g.data.h1}](${link(`/tools/qr-code-generator/guides/${g.id}/`)}): ${g.data.description}`),
    '',
    '## Experiments',
    ...LAB_EXPERIMENTS.map((d) => `- [${d.h1}](${link(d.path)}): ${d.summary}`),
    ...drops.map((d) => `- [${d.data.h1}](${link(`/lab/${d.id}/`)}): ${d.data.summary}`),
    '',
    '## Code',
    `- [GitHub account](${GITHUB_URL}): repositories open as tools ship`,
    '',
    '## Notes',
    '- Code shown on the site is free to copy and change under the MIT License.',
    '- The site sets no cookies and loads nothing from other websites.',
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
