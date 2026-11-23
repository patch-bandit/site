import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { GITHUB_URL, LAB_EXPERIMENTS, TOOLS_LABEL, inWords } from '../data/site';

export const GET: APIRoute = async ({ site }) => {
  const base = site!.href;
  const drops = (await getCollection('drops')).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const labCount = drops.length + LAB_EXPERIMENTS.length;
  const link = (p: string) => new URL(p, base).href;
  const lines = [
    '# Patch Bandit',
    '',
    `> Raccoons who build free online tools to replace simple tools that charge a monthly fee, source included. So far: ${inWords(labCount)} CSS experiments, a CSS art page, and one live browser tool (Bandit Codes). No users, partners, or sponsors exist.`,
    '',
    '## Pages',
    `- [The story](${link('/')}): what we do and why, data security, what we want to replace, and an honest inventory of what exists`,
    `- [${TOOLS_LABEL}](${link('/tools/')}): free online tools hub, featuring Bandit Codes (free QR code generator no sign up, live now)`,
    `- [Bandit Codes — free QR code generator](${link('/tools/qr-code-generator/')}): make PNG and SVG QR codes locally in your browser with live scan verification, no account, no tracking, MIT licensed`,
    `- [The stash](${link('/den/')}): open source project ideas, how the manifesto typing works, house rules, and how to build them together`,
    `- [The lab](${link('/lab/')}): the snack drop log of CSS experiments`,
    `- [The snack jar](${link('/snacks/')}): optional tips through Stripe; every tool stays free`,
    `- [Privacy](${link('/privacy/')}): no cookies, no tracking, tools run in your browser`,
    `- [CSS art raccoon](${link('/lab/css-art-raccoon/')}): a raccoon drawn in pure CSS, pulled apart piece by piece`,
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
