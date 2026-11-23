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
export const HERO_TOOLS_BADGE = 'Bandit Codes is live.';
export const MANIFESTO_TOOLS_STATUS = 'tools: 1 set free (bandit-codes)';
export const FOOTER_TOOLS_STATUS = 'Tools: 1 set free (Bandit Codes).';

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
    body: 'A monthly charge for something your browser can already do in one second, with no server in the way.',
    href: '',
  },
  {
    tag: 'Pattern 02',
    title: 'Lock-in',
    body: 'Your own file, kept in their format, behind their login. Leaving costs more than staying, and that is the point.',
    href: '',
  },
  {
    tag: 'Pattern 03',
    title: 'Watched while you work',
    body: 'Trackers that follow you from page to page while you resize one picture. The job is small; the watching is not.',
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
  { path: '/den/', title: "Open source project ideas: the raccoon's stash" },
  { path: '/lab/', title: 'CSS experiments from the raccoon lab: live demos, free code' },
  { path: '/lab/css-art-raccoon/', title: 'CSS art: a raccoon drawn in pure CSS, taken apart' },
];

// Lab experiments outside content/drops. The lab index, sitemap, llms.txt, and site-wide
// counts read this array plus the drops collection automatically. Append the next three
// lab pages here when ready (keep this list live-only — no placeholders).
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
    title: 'CSS container query and style queries: live resizable card demo',
    h1: 'CSS container query and style queries',
    description: 'Build a responsive CSS container query component with container-type: inline-size, cqi fluid type, and CSS style queries — zero media queries, zero JavaScript. Live demo and code.',
    phrase: 'css container query',
    date: '2026-11-22',
    snack: 'Waffle fry',
    summary: 'A resizable component card using @container size breakpoints, cqi fluid type, and Baseline style queries.',
  },
  {
    id: 'html-dialog',
    path: '/lab/html-dialog/',
    title: 'HTML dialog modal with zero JavaScript: commandfor and @starting-style',
    h1: 'HTML dialog modal with zero JavaScript',
    description: 'Build an accessible HTML dialog modal with zero JavaScript using commandfor, @starting-style, and ::backdrop, plus an optional closedby="any" toggle. Live demo and code.',
    phrase: 'html dialog',
    date: '2026-11-22',
    snack: 'Donut hole',
    summary: 'Zero-script native <dialog> modal driven by commandfor, @starting-style transitions, and optional closedby="any".',
  },
  {
    id: 'css-accordion',
    path: '/lab/css-accordion/',
    title: 'CSS accordion with <details name>, ::details-content, and smooth height',
    h1: 'CSS accordion with native <details name>',
    description: 'Build a pure CSS accordion with linked <details name> panels, ::details-content styling, and interpolate-size: allow-keywords for smooth height animation — zero JavaScript.',
    phrase: 'css accordion',
    date: '2026-11-22',
    snack: 'Cinnamon roll',
    summary: 'Exclusive <details name> accordion styled with ::details-content and progressive interpolate-size height animation.',
  },
  {
    id: 'css-popover',
    path: '/lab/css-popover/',
    title: 'CSS popover with no JavaScript: auto, manual, backdrop, and transitions',
    h1: 'CSS popover with no JavaScript',
    description: 'Build a CSS popover with the HTML popover attribute and zero JavaScript: auto vs manual dismiss, ::backdrop styling, and @starting-style entry transitions. Live demo and code.',
    phrase: 'css popover',
    date: '2026-11-22',
    snack: 'Pretzel',
    summary: 'Zero-script popovers: auto vs manual dismiss, backdrop styling, and smooth @starting-style entry.',
  },
  {
    id: 'css-text-wrap',
    path: '/lab/css-text-wrap/',
    title: 'CSS text-wrap: balance vs pretty side by side (live width slider)',
    h1: 'CSS text-wrap: balance vs pretty, live',
    description: 'See how CSS text-wrap changes headlines and paragraphs in real time. Drag the width slider to compare wrap, text-wrap balance, and text-wrap pretty, then copy the CSS.',
    phrase: 'css text-wrap',
    date: '2026-11-22',
    snack: 'Popcorn',
    summary: 'A live width slider showing headlines and paragraphs reflow between wrap, balance, and pretty.',
  },
  {
    id: 'css-squircle',
    path: '/lab/css-squircle/',
    title: 'Squircle CSS with corner-shape: round, scoop, bevel, notch, and fallback',
    h1: 'Squircle CSS with corner-shape',
    description: 'Build squircle CSS shapes with the new corner-shape property: compare round, squircle, scoop, bevel, notch, and superellipse() live, with a @supports check and plain fallback.',
    phrase: 'squircle css',
    date: '2026-11-22',
    snack: 'Apple slice',
    summary: 'A zero-script corner-shape playground with a live @supports check and a plain browser fallback.',
  },
  {
    id: 'css-parent-selector',
    path: '/lab/css-parent-selector/',
    title: 'CSS parent selector with :has(): card highlight and sibling dimming',
    h1: 'CSS parent selector with :has()',
    description: 'Use the CSS parent selector :has() to style a card when a checkbox inside it is checked and dim its quiet siblings, with zero JavaScript. Live demos and code to copy.',
    phrase: 'css parent selector',
    date: '2026-11-22',
    snack: 'Peanut',
    summary: 'Pure-CSS :has() demos: cards that style themselves on check and quiet down their siblings.',
  },
  {
    id: 'css-animate-on-scroll',
    path: '/lab/css-animate-on-scroll/',
    title: 'CSS animate on scroll with animation-timeline: view() (no JavaScript)',
    h1: 'CSS animate on scroll without JavaScript',
    description: 'How to make elements CSS animate on scroll using animation-timeline: view() and pure CSS, with reduced-motion safety and a clean fallback for every browser.',
    phrase: 'css animate on scroll',
    date: '2026-11-22',
    snack: 'Blueberry',
    summary: 'Pure-CSS animation-timeline: view() reveals and scroll progress bars, with reduced-motion fallback.',
  },
  {
    id: 'css-color-mix',
    path: '/lab/css-color-mix/',
    title: 'CSS color-mix() playground: mix two colors across color spaces',
    h1: 'CSS color-mix() playground',
    description: 'Test CSS color-mix() live with two color pickers and a ratio slider. Compare oklch, oklab, srgb, and hsl side by side, inspect the CSS line, and copy it.',
    phrase: 'css color-mix',
    date: '2026-11-22',
    snack: 'Gummy bear',
    summary: 'Two color pickers and a ratio slider comparing color-mix() across oklch, oklab, srgb, and hsl.',
  },
  // Next three lab pages append here (keeps the 3-column /lab/ shelf even at 12 drops).
];

// Small helper so counts read as words in running text.
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
export const inWords = (n: number) => WORDS[n] ?? String(n);
