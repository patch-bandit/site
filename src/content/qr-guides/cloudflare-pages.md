---
title: "Install Bandit Codes on Cloudflare Pages | Patch Bandit"
h1: "Install Bandit Codes on Cloudflare Pages"
description: "Run Bandit Codes on Cloudflare Pages with browser drag-and-drop upload (codes.json) or instant Git-deployed Pages Functions."
platform: "Cloudflare Pages"
speed: "Short pause (upload) or instant (Git)"
order: 11
source: "patch-bandit/qr-rescue-kit (guides/cloudflare-pages.md)"
---

Cloudflare Pages gives you two options:

- **Method 1 (Direct upload in your browser, easiest):** No developer tools or Git needed. Drag and drop one folder in your browser. Visitors see a brief pause while the page loads before jumping to the destination. (If you use path-based links like `/go/menu` from Bandit Codes Redirect kit, `_redirects` also works directly.)
- **Method 2 (Instant server redirects for `?c=` links, needs Git or a developer):** No visible pause, but Cloudflare only deploys Pages Functions from a Git repository (such as GitHub) or Cloudflare's developer tool.

## What you need

- A free Cloudflare account.
- Your `_redirects` file from [Bandit Codes](/tools/qr-code-generator/), or `dist/codes.json` and `dist/redirect-page.html` (for Method 1), or `dist/cloudflare-function.js` (for Method 2) from [Get your files ready](/tools/qr-code-generator/guides/getting-started/).

## Method 1: Direct upload in your browser (Easiest, no developer tools needed, short pause)

### If you already upload your site manually to Cloudflare Pages

1. Copy `dist/codes.json` into the top level of your website folder.
2. Inside that same website folder, create a subfolder named `qr-codes`.
3. Copy `dist/redirect-page.html` into `qr-codes` and rename it to `index.html`.
   - *Or, if you prefer to create `qr-codes/index.html` by hand:* paste this complete page (replacing `PASTE dist/snippet-fetch.html HERE` with the contents of `dist/snippet-fetch.html`):
     ```html
     <!doctype html>
     <html lang="en">
     <head>
       <meta charset="utf-8">
       <meta name="viewport" content="width=device-width, initial-scale=1">
       <meta name="robots" content="noindex">
       <title>Redirecting</title>
     </head>
     <body>
       PASTE dist/snippet-fetch.html HERE
     </body>
     </html>
     ```
4. Log in to Cloudflare, open **Workers & Pages > your project > Create deployment**, and upload your updated website folder.

### Starting from scratch for a subdomain (like `go.yoursite.com`)

Use these steps if your main site is on GoDaddy Website Builder or Google Sites and you are creating a brand-new free Cloudflare Pages site for your QR codes:

1. When you build your files in [Get your files ready](/tools/qr-code-generator/guides/getting-started/), set your fallback address to your main website (`https://yoursite.com`) so a mistyped or unknown code sends visitors to your main site instead of a blank page.
2. On your computer, create a new folder named `qr-site`.
3. Copy `dist/codes.json` into `qr-site`.
4. Create a subfolder `qr-site/qr-codes`, copy `dist/redirect-page.html` inside it, and rename it to `index.html`.
5. Log in to Cloudflare, open **Workers & Pages > Create > Pages > Upload assets**, name your project `qr-codes`, and drag the `qr-site` folder into the upload box.
6. Click **Deploy site**.
7. Open your new project's **Custom domains** tab, add `go.yoursite.com`, and add the DNS record Cloudflare shows you at the company where you bought your domain (or ask your developer to add it).

## Method 2: Instant server redirects (for sites kept in Git or with a developer)

*This method assumes your website is already kept in a Git repository connected to Cloudflare Pages (or deployed with Cloudflare's developer tool).*

1. In your website project folder, create a folder named `functions` at the top level of the repository (next to `public/` or `dist/`).
2. Copy `dist/cloudflare-function.js` into that folder and rename it to match your QR path:
   `functions/qr-codes.js`
   (If you chose a different path, name the file to match that path.)
3. Commit and push to Git (or deploy with Cloudflare's developer tool).
4. In the Cloudflare dashboard, open **Workers & Pages > your project > Deployments** and wait until the new deployment shows **Success**.

## Check it works

1. On your phone's browser, type `https://yoursite.com/qr-codes?c=menu` (or `https://go.yoursite.com/qr-codes?c=menu`, replacing `menu` with one of your code IDs) and open it.
2. Confirm it jumps to the destination page or PDF.
3. Open `https://yoursite.com/qr-codes?c=unknown-test` (or `https://go.yoursite.com/qr-codes?c=unknown-test` if you set up a subdomain) and confirm it goes to your fallback page (your main website for a subdomain setup).
4. To test with your phone camera, paste your owned address into [Bandit Codes](/tools/qr-code-generator/) (or any free static QR code maker without a tracking short link) and scan the image on screen.

## If it does not work

- **You tried uploading a `?c=` `_redirects` file to Cloudflare Pages:** Cloudflare's `_redirects` file supports path rules (such as `/go/menu`) but ignores `?c=menu` query links. Use Method 1 or Method 2 above for `?c=` links.
- **You see "404 Not Found" with Method 2:** Confirm the folder is named `functions` (all lowercase) at the top level of your Git repository, and the file is named `functions/qr-codes.js`.
- **Direct upload did not run `functions/qr-codes.js`:** Cloudflare's browser drag-and-drop uploader does not deploy `functions/` files. Use Method 1 for drag-and-drop, or ask your developer to set up Method 2 with Git.

## Limits on Cloudflare Pages

- Direct drag-and-drop uploads in the Cloudflare dashboard support Method 1 (brief pause) or path-based `_redirects`; instant server redirects for `?c=` links (Method 2) require Git or Cloudflare's developer tool.
- Updating a code means updating your files and redeploying.

## Note for your developer

- `dist/cloudflare-function.js` is a Cloudflare Pages Function exporting `onRequestGet(context)`. It validates the `?c=` ID against `/^[a-z0-9-]{1,64}$/`, allows only `http:` and `https:` targets from the bundled Bandit Codes v1 config, and returns HTTP `302` with `Cache-Control: no-store`.
- To keep forwarding addresses out of search indexes, add a `_headers` file in your publish folder with `/go/*` (or `/qr-codes*`) and `X-Robots-Tag: noindex` (or return `X-Robots-Tag: noindex` from your Pages Function response headers).
- In Method 1, the `codes.json` loader calls `fetch(..., { redirect: "error" })`, so `/codes.json` must return HTTP `200` directly on the same origin without any redirect (even a same-origin redirect stops the loader).
- For a dedicated subdomain (`go.yoursite.com`), run `bandit-codes init --fallback https://yoursite.com` so unknown codes go to the main site rather than `/`.
- Cloudflare Pages `_redirects` matches path-style URLs (`/go/<id>`) with 302 rules, while Cloudflare Bulk Redirects (`Account Home > Bulk Redirects`) accepts a headerless CSV (`source_url,target_url,status_code`) for path-style URLs.
