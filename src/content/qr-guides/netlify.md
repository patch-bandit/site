---
title: "Install Bandit Codes on Netlify | Patch Bandit"
h1: "Install Bandit Codes on Netlify"
description: "Set up instant temporary server redirects on Netlify by drag-and-drop or Git with a single _redirects file."
platform: "Netlify"
speed: "Instant (server rules)"
order: 10
source: "patch-bandit/qr-rescue-kit (guides/netlify.md)"
---

Netlify supports **instant server redirects** using a single plain-text file named `_redirects`. Visitors jump straight to the destination with no visible pause.

You can upload by simple drag-and-drop in your browser (Method 1, easiest for beginners and for new `go.yoursite.com` subdomains), or add the file to a Git repository if a developer already manages your site in Git (Method 2).

## What you need

- A free Netlify account.
- Your `_redirects` file from [Bandit Codes](/tools/qr-code-generator/) (or `dist/_redirects` from [Get your files ready](/tools/qr-code-generator/guides/getting-started/)).

## Method 1: Upload by drag-and-drop (Easiest, no developer tools needed)

### If you already upload your site manually to Netlify

1. Put `_redirects` inside the folder containing your website files (at the top level, right next to `index.html`).
2. Log in to Netlify, open your site, click **Deploys**, and drag your updated site folder into the deploy drop box.
3. Wait a few seconds for the deploy to finish and show **Published**.

### Starting from scratch for a subdomain (like `go.yoursite.com`)

Use these steps if your main site is on GoDaddy Website Builder, Google Sites, or another builder and you are creating a brand-new free Netlify site just for your QR redirects:

1. If building with the CLI kit in [Get your files ready](/tools/qr-code-generator/guides/getting-started/), set your fallback address to your main website (`https://yoursite.com`) so a mistyped or unknown code sends visitors to your main site instead of a blank page.
2. On your computer, create a new empty folder named `qr-site`.
3. Copy `_redirects` into `qr-site`.
4. Also create a tiny text file named `index.html` inside `qr-site` (it can contain just `<!doctype html><title>QR Links</title>`).
5. Log in to Netlify, click **Sites**, and drag the entire `qr-site` folder into the **deploy manually** drop box (Netlify Drop).
6. Wait a few seconds until Netlify shows **Published**.
7. In your new Netlify site, click **Domain management > Add a domain** and type your subdomain (for example `go.yoursite.com`).
8. Netlify will show you one DNS record to add at the company where you bought your domain name. Add that record there (or ask your developer to add it). Once it connects, your subdomain redirects are live.

## Method 2: If your site already updates from Git (for developers)

*This method assumes your website is already kept in a Git repository (such as GitHub or GitLab).*

1. Copy `_redirects` into your website's publish folder (usually `public/_redirects` or the root of your static site).
   - If you already have a `_redirects` file, open it and paste the Bandit Codes lines near the **top**, above any catch-all rules.
2. Commit and push the change so Netlify deploys your site.

## Check it works

1. On your phone's browser, type your owned short address (such as `https://yoursite.com/go/menu` or `https://go.yoursite.com/qr-codes?c=menu`, replacing `menu` with one of your code IDs) and open it.
2. Confirm it jumps immediately to your destination page or PDF with no blank page flash.
3. Open a made-up test code and confirm it goes to your fallback page.
4. To test with your phone camera, paste your owned address into [Bandit Codes](/tools/qr-code-generator/) (or any free static QR code maker without a tracking short link) and scan the image on screen.

## If it does not work

- **The file is named `_redirects.txt`:** Windows and Mac sometimes hide file extensions. Make sure the file is named exactly `_redirects` with no `.txt` at the end.
- **Netlify shows a "Page Not Found" error instead of redirecting:** Check the Netlify deploy log (**Deploys > click latest deploy**) and look for a line saying "X redirect rules processed." If it says 0 rules, `_redirects` was not inside your site's top-level upload folder.
- **Your home page or another page loads instead of redirecting:** Your site may have a catch-all redirect rule or an existing `/qr-codes` page taking priority. Ask your developer to check the Note at the bottom of this page.

## Limits on Netlify

- Netlify reads `_redirects` on every deploy, so updating a code requires updating `_redirects` and dragging the folder again (or pushing to Git).
- If you already have a static page at your forwarding path, Netlify shows that page first unless you remove it or ask your developer to force the redirect (see the Note below).

## Note for your developer

- `_redirects` uses HTTP 302 (temporary) status codes and percent-encoded `*` and `/:` tokens in destinations so mobile browsers re-check updated targets instead of caching a 301.
- To keep forwarding addresses out of search indexes, add a `_headers` file in your publish folder with your prefix (for example `/go/*` or `/qr-codes*`) and `X-Robots-Tag: noindex`.
- Put the Bandit Codes lines above any SPA catch-all rule such as `/* /index.html 200`.
- If a static file also exists at the same path in the publish directory, append `!` (`302!`) or remove the static file so Netlify always evaluates the redirect rule.
- Check on a live deploy whether Netlify appends incoming query parameters to external destinations; if a destination rejects unknown query parameters, test it explicitly.
- Alternatively, `dist/codes.json` and `dist/redirect-page.html` work as a static fallback if `_redirects` is not used.
