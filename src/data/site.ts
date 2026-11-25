export const SITE_NAME = 'Patch Bandit';
// The one place the code account is written. Change this one line and every page follows.
export const GITHUB_URL = 'https://github.com/patch-bandit';
export const GITHUB_LABEL = GITHUB_URL.replace(/^https?:\/\//, '');

// On-brand nav label and page eyebrow for /tools/. Change here and nav + page follow.
export const TOOLS_LABEL = 'The loot';

// GitHub Discussions target for the idea terminal on /den/.
export const IDEA_REPO_OWNER = 'patch-bandit';
export const IDEA_REPO_REPO = 'ideas';
export const IDEA_REPO_LIVE = true;

// Tagline and headline: kept in one place so every page derives from here.
export const TAGLINE = 'Quiet paws. Open code.';
export const HEADLINE = 'We build free online tools, minus the rent.';
export const CREED = 'We outsmart systems, never people.';
export const SIGNOFF = 'Paws up. Masks on.';

// Hero badge and inventory tools status: update here when tools ship.
export const HERO_TOOLS_BADGE = 'Six tools set free.';
export const MANIFESTO_TOOLS_STATUS = 'tools: 6 set free (bandit-codes, px-to-rem, uuid-generator, spotlight, html-boilerplate-generator, markdown-to-html)';
export const FOOTER_TOOLS_STATUS = 'Set free so far: 6. Bandit Codes, px to rem, UUID generator, Spotlight, HTML boilerplate generator, and Markdown to HTML. More in the stash.';

// Snack jar (tips): /snacks/ page plus the block on /den/. Paste the Stripe Payment Link into url; empty url shows 'opening soon'.
export const SNACK_JAR = {
  enabled: true,
  provider: 'stripe',
  url: '',
};

// Pattern cards on home. Add a URL to href when a category stash page exists.
export interface PatternCard {
  tag: string;
  title: string;
  body: string;
  href: string;
}

export const PATTERNS: PatternCard[] = [
  {
    tag: 'Pattern 01',
    title: 'Fees for easy jobs',
    body: 'Monthly bill for a one-second browser job. Your machine already does it with no server in the way.',
    href: '',
  },
  {
    tag: 'Pattern 02',
    title: 'Lock-in',
    body: 'Your file, locked in their format behind their login. They make leaving cost more than staying on purpose.',
    href: '',
  },
  {
    tag: 'Pattern 03',
    title: 'Watched while you work',
    body: 'Trackers tailing you from page to page while you resize one picture. The job is tiny, and the watching is not.',
    href: '',
  },
];

// Navigation, in story order: tools and lab sit ahead of the stash.
export const NAV = [
  { href: '/', label: 'The story' },
  { href: '/tools/', label: TOOLS_LABEL },
  { href: '/lab/', label: 'The lab' },
  { href: '/den/', label: 'The stash' },
];

// Pages that are not in the drops collection or LAB_EXPERIMENTS.
export const STATIC_PAGES = [
  { path: '/', title: `${SITE_NAME}: ${HEADLINE.replace(/\.$/, '')}` },
  { path: '/tools/', title: 'Free online tools from Patch Bandit: open source, no account' },
  { path: '/tools/qr-code-generator/', title: 'Free QR code generator (Bandit Codes) | Patch Bandit' },
  { path: '/tools/px-to-rem/', title: 'px to rem converter | Patch Bandit' },
  { path: '/tools/uuid-generator/', title: 'UUID generator and unique ID maker | Patch Bandit' },
  { path: '/tools/contrast-checker/', title: 'Color contrast checker (Spotlight) | Patch Bandit' },
  { path: '/tools/html-boilerplate-generator/', title: 'HTML boilerplate generator | Patch Bandit' },
  { path: '/tools/markdown-to-html/', title: 'Markdown to HTML converter | Patch Bandit' },
  { path: '/den/', title: "Open source project ideas: the raccoon's stash" },
  { path: '/lab/', title: 'CSS experiments from the raccoon lab: live demos, free code' },
  { path: '/lab/css-art-raccoon/', title: 'CSS art: a raccoon drawn in pure CSS, taken apart' },
];

// Lab experiments outside content/drops. The lab index, sitemap, llms.txt, and site-wide
// counts read this array plus the drops collection automatically. Append the next three
// lab pages here when ready (keep this list live-only, with no placeholders).
export interface LabExperiment {
  id: string;
  path: string;
  title: string;
  h1: string;
  description: string;
  phrase: string;
  date: string;
  snack: string;
  summary: string;
}

export const LAB_EXPERIMENTS: LabExperiment[] = [
  {
    id: 'css-container-queries',
    path: '/lab/css-container-queries/',
    title: 'CSS container query and style queries: live card demo',
    h1: 'CSS container query and style queries',
    description: 'Build a responsive CSS container query card with inline-size, cqi fluid type, and style queries, with no media queries or JavaScript. Live demo and code.',
    phrase: 'css container query',
    date: '2026-11-22',
    snack: 'Waffle fry',
    summary: 'This card sizes itself to its own box instead of the whole screen. Runs on @container breakpoints, cqi fluid type, and Baseline style queries.',
  },
  {
    id: 'html-dialog',
    path: '/lab/html-dialog/',
    title: 'HTML dialog modal with no JavaScript: commandfor demo',
    h1: 'HTML dialog modal with no JavaScript',
    description: 'Build an accessible HTML dialog modal with no JavaScript using commandfor, @starting-style, ::backdrop, and optional light-dismiss. Live demo and code.',
    phrase: 'html dialog',
    date: '2026-11-22',
    snack: 'Donut hole',
    summary: 'Ditch the modal library. Native <dialog> runs on commandfor, @starting-style transitions, and optional closedby="any", with no script.',
  },
  {
    id: 'css-accordion',
    path: '/lab/css-accordion/',
    title: 'CSS accordion with <details name> and smooth height',
    h1: 'CSS accordion with native <details name>',
    description: 'Build a pure CSS accordion with linked <details name> panels, ::details-content styling, and smooth interpolate-size height animation, with no JavaScript.',
    phrase: 'css accordion',
    date: '2026-11-22',
    snack: 'Cinnamon roll',
    summary: 'One drawer opens, the rest shut on their own. Native <details name> styled with ::details-content and progressive interpolate-size height animation.',
  },
  {
    id: 'css-popover',
    path: '/lab/css-popover/',
    title: 'CSS popover with no JavaScript: auto, manual, backdrop',
    h1: 'CSS popover with no JavaScript',
    description: 'Build a CSS popover with no JavaScript: auto vs manual dismiss, ::backdrop styling, and @starting-style entry transitions. Live demo and code to copy.',
    phrase: 'css popover',
    date: '2026-11-22',
    snack: 'Pretzel',
    summary: 'Pop open a box without a single script. Covers auto vs manual dismiss, backdrop styling, and smooth @starting-style entry.',
  },
  {
    id: 'css-text-wrap',
    path: '/lab/css-text-wrap/',
    title: 'CSS text-wrap: balance vs pretty (live width slider)',
    h1: 'CSS text-wrap: balance vs pretty, live',
    description: 'See how CSS text-wrap changes headlines and paragraphs live. Drag the width slider to compare wrap, balance, and pretty, then copy the CSS.',
    phrase: 'css text-wrap',
    date: '2026-11-22',
    snack: 'Popcorn',
    summary: 'Drag the width slider and watch sloppy line breaks fix themselves. Compares wrap, balance, and pretty live.',
  },
  {
    id: 'css-squircle',
    path: '/lab/css-squircle/',
    title: 'Squircle CSS with corner-shape: 6 shapes and fallback',
    h1: 'Squircle CSS with corner-shape',
    description: 'Build squircle CSS shapes with corner-shape: compare round, squircle, scoop, bevel, notch, and superellipse() live, with @supports and a plain fallback.',
    phrase: 'squircle css',
    date: '2026-11-22',
    snack: 'Apple slice',
    summary: 'Six corner shapes, no script. You get a live @supports check and a plain browser fallback.',
  },
  {
    id: 'css-parent-selector',
    path: '/lab/css-parent-selector/',
    title: 'CSS parent selector with :has(): cards and siblings',
    h1: 'CSS parent selector with :has()',
    description: 'Use the CSS parent selector :has() to style a checked card and dim its unchecked siblings with no JavaScript. Live demos and code to copy.',
    phrase: 'css parent selector',
    date: '2026-11-22',
    snack: 'Peanut',
    summary: 'Check one box, watch the whole card react. Pure CSS :has() highlights the pick and quiets its siblings.',
  },
  {
    id: 'css-animate-on-scroll',
    path: '/lab/css-animate-on-scroll/',
    title: 'CSS animate on scroll with animation-timeline: view()',
    h1: 'CSS animate on scroll without JavaScript',
    description: 'How to make elements CSS animate on scroll using animation-timeline: view() and pure CSS, with reduced-motion safety and a clean fallback for every browser.',
    phrase: 'css animate on scroll',
    date: '2026-11-22',
    snack: 'Blueberry',
    summary: 'No scroll listener needed. Pure CSS animation-timeline: view() drives reveals and progress bars, with a reduced-motion fallback.',
  },
  {
    id: 'css-color-mix',
    path: '/lab/css-color-mix/',
    title: 'CSS color-mix() playground: compare 4 color spaces',
    h1: 'CSS color-mix() playground',
    description: 'Test CSS color-mix() live with two color pickers and a ratio slider. Compare oklch, oklab, srgb, and hsl side by side, inspect the CSS line, and copy it.',
    phrase: 'css color-mix',
    date: '2026-11-22',
    snack: 'Gummy bear',
    summary: 'Two swatches in, four live blends out. Slide the ratio to compare color-mix() across oklch, oklab, srgb, and hsl.',
  },
  // Next three lab pages append here (keeps the 3-column /lab/ shelf even at 12 drops).
];

// Small helper so counts read as words in running text.
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
export const inWords = (n: number) => WORDS[n] ?? String(n);
