import { defineConfig } from 'astro/config';

// Static site, no integrations. The sitemap and llms.txt are small endpoints
// (src/pages/sitemap.xml.ts, src/pages/llms.txt.ts) that read the same page list.
// trailingSlash: 'ignore' lets `astro preview` serve dist/404.html for missing paths
// both with and without a trailing slash (matching GitHub Pages static hosting),
// while Base.astro and all internal links keep canonical trailing slashes.
export default defineConfig({
  site: 'https://patchbandit.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
