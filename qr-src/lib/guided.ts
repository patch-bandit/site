import type { RuleFormat } from "./redirects.ts";

export type StudioTabId = "make" | "redirects" | "snippet" | "escape";
export type GuidedGoal = "stuck" | "fresh" | "other";
export type GuidedHost =
  | "wordpress"
  | "squarespace"
  | "wix"
  | "shopify"
  | "webflow"
  | "godaddy"
  | "google-sites"
  | "netlify"
  | "vercel"
  | "cloudflare-pages"
  | "cpanel"
  | "not-sure";

export interface GuidedGoalOption {
  id: GuidedGoal;
  label: string;
  blurb: string;
}

export interface GuidedHostOption {
  id: GuidedHost;
  label: string;
  tag: string;
}

export interface GuidedStep {
  step: 1 | 2 | 3;
  tab: StudioTabId;
  title: string;
  detail: string;
}

export interface GuidedPlan {
  goal: GuidedGoal;
  host: GuidedHost;
  hostLabel: string;
  initialTab: StudioTabId;
  ownCodesTab: "redirects" | "snippet";
  ruleFormat: RuleFormat;
  guidePath: string;
  guideLabel: string;
  headline: string;
  summary: string;
  steps: [GuidedStep, GuidedStep, GuidedStep];
  highlightTargets: string[];
  devNote: string;
  snippetPlaceholder: string;
}

export const GUIDED_GOALS: readonly GuidedGoalOption[] = [
  {
    id: "stuck",
    label: "I have printed codes on a paid QR service and I'm stuck paying (or afraid of reprinting)",
    blurb: "Check which codes are locked in, set up addresses you own, and switch at your own pace.",
  },
  {
    id: "fresh",
    label: "I'm starting fresh and want codes I own",
    blurb: "Create short links on your own website so you can change where printed codes go anytime.",
  },
  {
    id: "other",
    label: "Something else",
    blurb: "Make a single QR code for a direct link, Wi-Fi login, contact card, or event.",
  },
];

export const GUIDED_HOSTS: readonly GuidedHostOption[] = [
  { id: "wordpress", label: "WordPress", tag: "Plugin or CSV" },
  { id: "squarespace", label: "Squarespace", tag: "Paste snippet" },
  { id: "wix", label: "Wix", tag: "Paste snippet" },
  { id: "shopify", label: "Shopify", tag: "Paste snippet" },
  { id: "webflow", label: "Webflow", tag: "Paste snippet" },
  { id: "godaddy", label: "GoDaddy", tag: "Snippet or subdomain" },
  { id: "google-sites", label: "Google Sites", tag: "Subdomain or link page" },
  { id: "netlify", label: "Netlify", tag: "Instant rules" },
  { id: "vercel", label: "Vercel", tag: "Instant rules" },
  { id: "cloudflare-pages", label: "Cloudflare Pages", tag: "Instant rules or upload" },
  { id: "cpanel", label: "cPanel or other web hosting", tag: "Instant rules" },
  { id: "not-sure", label: "Not sure", tag: "Help me pick" },
];

interface HostProfile {
  label: string;
  ownCodesTab: "redirects" | "snippet";
  ruleFormat: RuleFormat;
  guidePath: string;
  guideLabel: string;
  freshSummary: string;
  stuckStep2: string;
  freshStep1: string;
  freshStep2: string;
  highlightOnOwn: string[];
  devNote: string;
  snippetPlaceholder: string;
}

const HOST_PROFILES: Record<GuidedHost, HostProfile> = {
  wordpress: {
    label: "WordPress",
    ownCodesTab: "redirects",
    ruleFormat: "redirection",
    guidePath: "/tools/qr-code-generator/guides/wordpress/",
    guideLabel: "Open the WordPress guide",
    freshSummary:
      "WordPress supports instant forwarding using the free Bandit Codes plugin or the Redirection plugin CSV below (no visible pause when someone scans).",
    stuckStep2:
      "Send your mapped links to Redirect kit, download the WordPress Redirection CSV (or use the Bandit Codes WordPress plugin), and follow the WordPress guide.",
    freshStep1: "Enter your website address (such as https://yoursite.com/go/) and add your links in Redirect kit.",
    freshStep2:
      "Download the WordPress Redirection CSV in step 4 (or install the Bandit Codes plugin from the WordPress guide) so every link forwards immediately.",
    highlightOnOwn: ["kit-download-rules", "kit-batch-zip"],
    devNote:
      "WordPress Redirection CSV imports HTTP 302 rules. The Bandit Codes WordPress plugin hooks parse_request and sends wp_redirect(..., 302) with nocache_headers(). Exclude your QR path from page caching plugins and add X-Robots-Tag: noindex at Apache/nginx or via a header filter if desired.",
    snippetPlaceholder: "https://yoursite.com/qr-codes",
  },
  squarespace: {
    label: "Squarespace",
    ownCodesTab: "snippet",
    ruleFormat: "html",
    guidePath: "/tools/qr-code-generator/guides/squarespace/",
    guideLabel: "Open the Squarespace guide",
    freshSummary:
      "On Squarespace, create a hidden /qr-codes page and paste the Bandit Codes snippet once. Visitors see that page for a brief moment and then land on your link.",
    stuckStep2:
      "Switch to the Bandit Codes snippet tab, add your codes, copy the snippet, and paste it onto a hidden /qr-codes page using the Squarespace guide.",
    freshStep1: "Enter your Squarespace QR page address (such as https://yoursite.com/qr-codes) and add your links in Bandit Codes snippet.",
    freshStep2: "Copy your snippet and paste it into your /qr-codes page using the Squarespace guide.",
    highlightOnOwn: ["snip-copy-snippet", "snip-batch-zip"],
    devNote:
      "Squarespace requires a plan that supports Page Header Code Injection or Code Blocks (Business, Core, or higher). Squarespace does not allow uploading a root /codes.json file and its URL Mappings do not match ?c= query strings, so use the all-in-one inline snippet. Add <meta name=\"robots\" content=\"noindex\"> in Page Header Code Injection on /qr-codes.",
    snippetPlaceholder: "https://yoursite.com/qr-codes",
  },
  wix: {
    label: "Wix",
    ownCodesTab: "snippet",
    ruleFormat: "html",
    guidePath: "/tools/qr-code-generator/guides/wix/",
    guideLabel: "Open the Wix guide",
    freshSummary:
      "On Wix, create a hidden /qr-codes page and paste the Bandit Codes snippet under Settings > Custom Code (not the regular Embed HTML box).",
    stuckStep2:
      "Switch to the Bandit Codes snippet tab, add your codes, copy the snippet, and place it in Wix Settings > Custom Code using the Wix guide.",
    freshStep1: "Enter your Wix QR page address (such as https://yoursite.com/qr-codes) and add your links in Bandit Codes snippet.",
    freshStep2: "Copy your snippet and add it to the /qr-codes page in Wix Settings > Custom Code using the Wix guide.",
    highlightOnOwn: ["snip-copy-snippet", "snip-batch-zip"],
    devNote:
      "Wix requires a paid plan with a connected custom domain for Settings > Custom Code. Avoid Wix Embed HTML (sandboxed cross-origin iframe cannot read window.location.search) and avoid Wix URL Redirect Manager (301 permanent redirects only). Set the /qr-codes page to noindex in Wix SEO Basics.",
    snippetPlaceholder: "https://yoursite.com/qr-codes",
  },
  shopify: {
    label: "Shopify",
    ownCodesTab: "snippet",
    ruleFormat: "html",
    guidePath: "/tools/qr-code-generator/guides/shopify/",
    guideLabel: "Open the Shopify guide",
    freshSummary:
      "Shopify puts pages under /pages/, so your QR page lives at /pages/qr-codes. Paste the Bandit Codes snippet into a Custom Liquid section on its own page template.",
    stuckStep2:
      "Switch to the Bandit Codes snippet tab, set your page address to https://yoursite.com/pages/qr-codes, copy the snippet, and follow the Shopify guide.",
    freshStep1:
      "Enter your Shopify QR page address (for example https://yoursite.com/pages/qr-codes) and add your links in Bandit Codes snippet.",
    freshStep2: "Copy your snippet and paste it into a Custom Liquid section on a dedicated qr-codes template using the Shopify guide.",
    highlightOnOwn: ["snip-copy-snippet", "snip-batch-zip"],
    devNote:
      "Shopify pages always use the /pages/ prefix. Avoid Shopify's built-in URL Redirects (HTTP 301 only and only fires on 404 paths). Optional: create templates/page.qr-codes.liquid with {% layout none %} and <meta name=\"robots\" content=\"noindex\"> for faster client-side forwarding and noindex protection.",
    snippetPlaceholder: "https://yoursite.com/pages/qr-codes",
  },
  webflow: {
    label: "Webflow",
    ownCodesTab: "snippet",
    ruleFormat: "html",
    guidePath: "/tools/qr-code-generator/guides/webflow/",
    guideLabel: "Open the Webflow guide",
    freshSummary:
      "On Webflow, create a /qr-codes page and paste the Bandit Codes snippet into that page's Custom Code box, then publish to your live domain.",
    stuckStep2:
      "Switch to the Bandit Codes snippet tab, add your codes, copy the snippet, and paste it into your /qr-codes page's Custom Code box using the Webflow guide.",
    freshStep1: "Enter your Webflow QR page address (such as https://yoursite.com/qr-codes) and add your links in Bandit Codes snippet.",
    freshStep2: "Copy your snippet and paste it into your /qr-codes page's Custom Code box using the Webflow guide.",
    highlightOnOwn: ["snip-copy-snippet", "snip-batch-zip"],
    devNote:
      "Webflow requires a paid Site plan for Custom Code and does not run Custom Code in Preview mode. Avoid Webflow's native 301 Redirects for mutable QR links. Page Custom Code allows up to 50,000 characters; add <meta name=\"robots\" content=\"noindex\"> in the page's Inside <head> box.",
    snippetPlaceholder: "https://yoursite.com/qr-codes",
  },
  godaddy: {
    label: "GoDaddy",
    ownCodesTab: "snippet",
    ruleFormat: "apache",
    guidePath: "/tools/qr-code-generator/guides/godaddy-website-builder/",
    guideLabel: "Open the GoDaddy guide",
    freshSummary:
      "GoDaddy sells two products: GoDaddy Web Hosting (cPanel) supports instant rules in Redirect kit, while GoDaddy Website Builder uses the snippet (or a free go.yoursite.com subdomain if its HTML box blocks redirects).",
    stuckStep2:
      "Check which GoDaddy product you have in the GoDaddy guide: paste the snippet on GoDaddy Website Builder, or use Apache rules in Redirect kit if you have cPanel hosting.",
    freshStep1:
      "Enter your QR page address in Bandit Codes snippet (or switch to Redirect kit with Apache rules if you use GoDaddy cPanel hosting).",
    freshStep2:
      "Copy your snippet and test it on your phone. If GoDaddy Website Builder blocks redirects in a locked box, use the free subdomain steps in the GoDaddy guide.",
    highlightOnOwn: ["snip-copy-snippet", "snip-batch-zip", "kit-copy-rules"],
    devNote:
      "GoDaddy Websites + Marketing often isolates HTML sections in a cross-origin iframe, blocking window.location.search and top-level navigation. Pointing a CNAME (go.<domain>) in GoDaddy DNS to Netlify (_redirects) or Cloudflare Pages gives true HTTP 302 redirects without moving the main site. GoDaddy cPanel hosting uses Apache .htaccess.",
    snippetPlaceholder: "https://yoursite.com/qr-codes",
  },
  "google-sites": {
    label: "Google Sites",
    ownCodesTab: "redirects",
    ruleFormat: "netlify",
    guidePath: "/tools/qr-code-generator/guides/google-sites/",
    guideLabel: "Open the Google Sites guide",
    freshSummary:
      "Google Sites blocks automatic redirect scripts inside embedded boxes. If you own a domain, point a free subdomain like go.yoursite.com to Netlify for instant forwarding; otherwise use a plain links page.",
    stuckStep2:
      "Send your mapped links to Redirect kit with a subdomain prefix like https://go.yoursite.com/go/, download the Netlify _redirects file, and follow the Google Sites guide.",
    freshStep1:
      "Enter your own subdomain prefix (such as https://go.yoursite.com/go/) and add your links in Redirect kit.",
    freshStep2:
      "Download the _redirects file in step 4 and follow the Google Sites guide to connect that subdomain for free on Netlify (your main site stays on Google Sites).",
    highlightOnOwn: ["kit-download-rules", "kit-batch-zip"],
    devNote:
      "Google Sites Embed Code runs inside nested sandboxed iframes (googleusercontent.com) with no access to window.top.location.search. Delegating go.<domain> via CNAME to Netlify (_redirects + _headers X-Robots-Tag: noindex) or Cloudflare Pages provides HTTP 302 redirects on the owner's domain.",
    snippetPlaceholder: "https://go.yoursite.com/qr-codes",
  },
  netlify: {
    label: "Netlify",
    ownCodesTab: "redirects",
    ruleFormat: "netlify",
    guidePath: "/tools/qr-code-generator/guides/netlify/",
    guideLabel: "Open the Netlify guide",
    freshSummary:
      "Netlify supports instant forwarding with a single _redirects text file. Visitors go straight to your link with no blank page or pause.",
    stuckStep2:
      "Send your mapped links to Redirect kit, download the _redirects file (pre-selected for Netlify), and upload it following the Netlify guide.",
    freshStep1: "Enter your domain prefix (such as https://yoursite.com/go/) and add your links in Redirect kit.",
    freshStep2: "Download the _redirects file in step 4 and drop it into your site folder using the Netlify guide.",
    highlightOnOwn: ["kit-download-rules", "kit-copy-rules", "kit-batch-zip"],
    devNote:
      "Uses Netlify _redirects with HTTP 302 (temporary) status codes so mobile browsers re-check destinations after updates. Place the rules above any SPA catch-all and add X-Robots-Tag: noindex for your prefix in _headers.",
    snippetPlaceholder: "https://yoursite.com/qr-codes",
  },
  vercel: {
    label: "Vercel",
    ownCodesTab: "redirects",
    ruleFormat: "vercel",
    guidePath: "/tools/qr-code-generator/guides/vercel/",
    guideLabel: "Open the Vercel guide",
    freshSummary:
      "Vercel supports instant forwarding inside your vercel.json file, with temporary redirects so phones check for updates whenever you change a link.",
    stuckStep2:
      "Send your mapped links to Redirect kit, copy or download the vercel.json rules (pre-selected for Vercel), and deploy following the Vercel guide.",
    freshStep1: "Enter your domain prefix (such as https://yoursite.com/go/) and add your links in Redirect kit.",
    freshStep2: "Copy or download the vercel.json rules in step 4 and add them to your project using the Vercel guide.",
    highlightOnOwn: ["kit-copy-rules", "kit-download-rules", "kit-batch-zip"],
    devNote:
      "Generates vercel.json redirects with permanent: false (HTTP 307 temporary redirect). Merge into an existing vercel.json rather than replacing it, and add a headers entry for X-Robots-Tag: noindex on your forwarding prefix.",
    snippetPlaceholder: "https://yoursite.com/qr-codes",
  },
  "cloudflare-pages": {
    label: "Cloudflare Pages",
    ownCodesTab: "redirects",
    ruleFormat: "netlify",
    guidePath: "/tools/qr-code-generator/guides/cloudflare-pages/",
    guideLabel: "Open the Cloudflare Pages guide",
    freshSummary:
      "Cloudflare Pages supports instant forwarding for short paths like /go/menu using a _redirects file (or a quick folder upload with codes.json in the guide).",
    stuckStep2:
      "Send your mapped links to Redirect kit, download the _redirects file (pre-selected for Cloudflare Pages), and follow the Cloudflare Pages guide.",
    freshStep1: "Enter your domain prefix (such as https://yoursite.com/go/) and add your links in Redirect kit.",
    freshStep2: "Download the _redirects file in step 4 and deploy it following the Cloudflare Pages guide.",
    highlightOnOwn: ["kit-download-rules", "kit-copy-rules", "kit-batch-zip"],
    devNote:
      "Cloudflare Pages _redirects matches path-based rules (/go/menu -> target 302) directly. If using ?c= query URLs instead, deploy a Pages Function (functions/qr-codes.js) via Git or direct-upload codes.json + redirect-page.html. Add X-Robots-Tag: noindex in _headers for your prefix.",
    snippetPlaceholder: "https://yoursite.com/qr-codes",
  },
  cpanel: {
    label: "cPanel or other web hosting",
    ownCodesTab: "redirects",
    ruleFormat: "apache",
    guidePath: "/tools/qr-code-generator/guides/cpanel/",
    guideLabel: "Open the cPanel / plain hosting guide",
    freshSummary:
      "Plain web hosting with cPanel supports instant forwarding right inside your .htaccess file, so scans go straight to your link with no pause.",
    stuckStep2:
      "Send your mapped links to Redirect kit, copy the Apache .htaccess lines (pre-selected for cPanel), and paste them at the top of .htaccess using the cPanel guide.",
    freshStep1: "Enter your domain prefix (such as https://yoursite.com/go/) and add your links in Redirect kit.",
    freshStep2: "Copy the Apache .htaccess rules in step 4 and paste them into public_html/.htaccess using the cPanel guide.",
    highlightOnOwn: ["kit-copy-rules", "kit-download-rules", "kit-batch-zip"],
    devNote:
      "Uses Apache RedirectMatch 302 lines above existing rewrite rules. If your host runs nginx instead of Apache, switch the format selector in step 4 to nginx. Where mod_headers is enabled, add Header always set X-Robots-Tag \"noindex\" for your prefix.",
    snippetPlaceholder: "https://yoursite.com/qr-codes",
  },
  "not-sure": {
    label: "Not sure",
    ownCodesTab: "snippet",
    ruleFormat: "netlify",
    guidePath: "/tools/qr-code-generator/guides/",
    guideLabel: "Open the platform finder guide",
    freshSummary:
      "No problem. Open the platform finder guide to match your website login screen in 30 seconds, or start with the Bandit Codes snippet which works on most site builders.",
    stuckStep2:
      "Check the platform finder guide to match your host, then set up your owned links in Bandit Codes snippet (site builders) or Redirect kit (web hosts).",
    freshStep1: "Enter the page address on your site (such as https://yoursite.com/qr-codes) and add your links in Bandit Codes snippet.",
    freshStep2: "Open the platform finder guide to match your website login screen and follow the step-by-step paste instructions.",
    highlightOnOwn: ["snip-copy-snippet", "snip-batch-zip"],
    devNote:
      "Check the login URL or hosting bill (wp-admin, squarespace.com, wix.com, myshopify.com, webflow.com, or cPanel) to decide between instant server 302/307 redirects (Redirect kit) and the inline Bandit Codes v1 HTML snippet.",
    snippetPlaceholder: "https://yoursite.com/qr-codes",
  },
};

export function getGuidedPlan(goal: GuidedGoal, host: GuidedHost): GuidedPlan {
  const hp = HOST_PROFILES[host];
  const ownTabLabel = hp.ownCodesTab === "redirects" ? "Redirect kit" : "Bandit Codes snippet";

  if (goal === "stuck") {
    return {
      goal,
      host,
      hostLabel: hp.label,
      initialTab: "escape",
      ownCodesTab: hp.ownCodesTab,
      ruleFormat: hp.ruleFormat,
      guidePath: hp.guidePath,
      guideLabel: hp.guideLabel,
      headline: `Your 3-step escape plan for ${hp.label}`,
      summary:
        "You do not have to reprint everything overnight. List your printed codes first, set up addresses on your own site, and point each vendor code at your new address while your old account is still active so printed copies keep working during the switch.",
      steps: [
        {
          step: 1,
          tab: "escape",
          title: "List your printed codes",
          detail: "Upload a photo of a printed code or paste your vendor export in Lock-in check & escape plan.",
        },
        {
          step: 2,
          tab: hp.ownCodesTab,
          title: `Set up your ${hp.label} links`,
          detail: hp.stuckStep2,
        },
        {
          step: 3,
          tab: "escape",
          title: "Re-point while active, then reprint",
          detail:
            "Point each live vendor code at your new owned address while you still pay, then download your replacement QR codes and reprint high-use pieces before canceling.",
        },
      ],
      highlightTargets: ["esc-push-to-kit", "esc-batch-zip", ...hp.highlightOnOwn],
      devNote: hp.devNote,
      snippetPlaceholder: hp.snippetPlaceholder,
    };
  }

  if (goal === "fresh") {
    return {
      goal,
      host,
      hostLabel: hp.label,
      initialTab: hp.ownCodesTab,
      ownCodesTab: hp.ownCodesTab,
      ruleFormat: hp.ruleFormat,
      guidePath: hp.guidePath,
      guideLabel: hp.guideLabel,
      headline: `Your 3-step path to owned codes on ${hp.label}`,
      summary: hp.freshSummary,
      steps: [
        {
          step: 1,
          tab: hp.ownCodesTab,
          title: "Add your links",
          detail: hp.freshStep1,
        },
        {
          step: 2,
          tab: hp.ownCodesTab,
          title: `Put them on ${hp.label}`,
          detail: hp.freshStep2,
        },
        {
          step: 3,
          tab: hp.ownCodesTab,
          title: "Style and download your QR codes",
          detail:
            "Click Download all QR codes (SVG ZIP) to set your look once for every code, or use Make a code for a single custom code, then test one scan with your phone.",
        },
      ],
      highlightTargets: [...hp.highlightOnOwn],
      devNote: hp.devNote,
      snippetPlaceholder: hp.snippetPlaceholder,
    };
  }

  return {
    goal,
    host,
    hostLabel: hp.label,
    initialTab: "make",
    ownCodesTab: hp.ownCodesTab,
    ruleFormat: hp.ruleFormat,
    guidePath: hp.guidePath,
    guideLabel: hp.guideLabel,
    headline: `Quick QR maker (plus your ${hp.label} route if you want editable links)`,
    summary:
      "Make a direct QR code right below for a web link, Wi-Fi login, contact card, email, or event. No website setup is needed for static codes. If you want codes you can change later without reprinting, jump to step 3.",
    steps: [
      {
        step: 1,
        tab: "make",
        title: "Pick a QR type and enter details",
        detail: "Choose Link, Wi-Fi, Contact card, or any of the 9 types in Make a code.",
      },
      {
        step: 2,
        tab: "make",
        title: "Style, check scan, and download",
        detail: "Adjust colors or add a logo, wait for the green Scans badge, and download PNG or SVG.",
      },
      {
        step: 3,
        tab: hp.ownCodesTab,
        title: `Need editable links on ${hp.label}?`,
        detail: `Switch to ${ownTabLabel} whenever you want printed codes whose destination you can update later.`,
      },
    ],
    highlightTargets: ["make-download-png", "make-download-svg", ...hp.highlightOnOwn],
    devNote: hp.devNote,
    snippetPlaceholder: hp.snippetPlaceholder,
  };
}
