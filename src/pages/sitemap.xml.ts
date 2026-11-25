import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { LAB_EXPERIMENTS } from '../data/site';

// Hand-written sitemap: no extra package. It reads the drops collection plus LAB_EXPERIMENTS.
export const GET: APIRoute = async ({ site }) => {
  const base = site!.href;
  const drops = await getCollection('drops');
  const qrGuides = (await getCollection('qrGuides')).sort((a, b) => a.data.order - b.data.order);
  const labDates = [
    ...drops.map((d) => d.data.date.toISOString().slice(0, 10)),
    ...LAB_EXPERIMENTS.map((d) => d.date),
  ].sort();
  const entries = [
    { path: '/', date: '2026-11-24' },
    { path: '/tools/', date: '2026-11-24' },
    { path: '/tools/qr-code-generator/', date: '2026-11-24' },
    ...qrGuides.map((g) => ({
      path: g.id === 'index' ? '/tools/qr-code-generator/guides/' : `/tools/qr-code-generator/guides/${g.id}/`,
      date: '2026-11-24',
    })),
    { path: '/tools/px-to-rem/', date: '2026-11-24' },
    { path: '/tools/uuid-generator/', date: '2026-11-24' },
    { path: '/den/', date: '2026-11-24' },
    { path: '/snacks/', date: '2026-11-23' },
    { path: '/privacy/', date: '2026-11-24' },
    { path: '/lab/', date: labDates.pop() ?? '2026-11-22' },
    ...LAB_EXPERIMENTS.map((d) => ({ path: d.path, date: d.date })),
    ...drops.map((d) => ({ path: `/lab/${d.id}/`, date: d.data.date.toISOString().slice(0, 10) })),
    { path: '/lab/css-art-raccoon/', date: '2026-11-22' },
  ];
  const body = entries
    .map((e) => `  <url><loc>${new URL(e.path, base).href}</loc><lastmod>${e.date}</lastmod></url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
