---
title: "Install Bandit Codes on Webflow | Patch Bandit"
h1: "Install Bandit Codes on Webflow"
description: "Step-by-step guide to pasting the Bandit Codes snippet into a dedicated Webflow page Custom Code box."
platform: "Webflow"
speed: "Short pause (snippet)"
order: 6
source: "patch-bandit/qr-rescue-kit (guides/webflow.md)"
---

Webflow's built-in redirect settings only create fixed redirects on full page paths, not changeable `?c=menu` links. To run Bandit Codes on Webflow, paste the HTML snippet into a dedicated `/qr-codes` page using Webflow's Custom Code box. Because this uses the snippet, visitors see your `/qr-codes` page for a split second before jumping to the destination.

## What you need

- A paid Webflow **Site plan** (Webflow locks Custom Code on free Starter sites).
- Your snippet from [Bandit Codes](/tools/qr-code-generator/) (or `dist/snippet.html` from [Get your files ready](/tools/qr-code-generator/guides/getting-started/)).

## Step-by-step instructions

1. Open your project in the **Webflow Designer**.
2. In the left sidebar, click the **Pages** icon and click the **Create New Page** button.
3. Name the page `QR Codes` and confirm the **Slug** is `qr-codes`, so the address is `yoursite.com/qr-codes`.
4. Scroll down in the Page Settings panel to **Custom Code**.
5. Find the **Before `</body>` tag** box (or **Inside `<head>` tag**).
6. Copy your snippet from [Bandit Codes](/tools/qr-code-generator/) (or `dist/snippet.html`, everything from `<!-- Bandit Codes v1: start -->` to `<!-- Bandit Codes v1: end -->`), and paste it into the **Before `</body>` tag** box.
7. Click **Save**, then click **Publish** in the top right and publish to your live custom domain.

## Check it works

1. On your phone's browser, type `https://yoursite.com/qr-codes?c=menu` (replace `menu` with one of your real code IDs) and open it.
2. Confirm it jumps to the destination page or PDF after a short pause.
3. Open `https://yoursite.com/qr-codes?c=unknown-test` and confirm it opens your fallback page (your home page by default).
4. To test with your phone camera, paste `https://yoursite.com/qr-codes?c=menu` into [Bandit Codes](/tools/qr-code-generator/) (or any free static QR code maker without a tracking short link) and scan the image on screen.

## If it does not work

- **The Custom Code box is locked:** You need a paid Webflow Site plan (or Workspace plan with Custom Code enabled) to run custom scripts.
- **You see an error about character limits:** Webflow's Page Custom Code box has a 50,000-character limit, which holds roughly 300 to 400 typical codes. If you have more codes than that, ask your developer about hosting the redirects on Netlify or Cloudflare Pages on a subdomain such as `go.yoursite.com`.
- **Nothing happens when you test in Webflow Preview:** Webflow does not run Custom Code in Preview mode. You must click **Publish** and test on the live address.

## Limits on Webflow

- Requires a paid Site plan for Custom Code.
- Uses the HTML snippet, so visitors see a brief pause before being forwarded.
- Updating a code requires editing your snippet in [Bandit Codes](/tools/qr-code-generator/) (or rebuilding `dist/snippet.html` via [Get your files ready](/tools/qr-code-generator/guides/getting-started/)), pasting it back into the `/qr-codes` page's Custom Code box, and republishing the site.

## Note for your developer

- Add `<meta name="robots" content="noindex">` in the page's **Inside `<head>` tag** box so search engines do not index `/qr-codes`.
- If placed in **Inside `<head>` tag** with an empty fallback, the loader appends the link `<nav>` to `document.body` once the DOM is ready.
- Webflow's native **Site Settings > Publishing > 301 Redirects** only issues HTTP 301 permanent redirects (cached permanently by mobile browsers) and does not match `?c=` query parameters.
- Webflow does not support uploading a static `/codes.json` file at the site root; use the inline snippet (or place Cloudflare in front of the domain or use a subdomain on Cloudflare Pages or Netlify for edge 302s).
