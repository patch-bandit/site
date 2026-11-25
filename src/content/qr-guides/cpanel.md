---
title: "Install Bandit Codes on Plain Hosting (cPanel) | Patch Bandit"
h1: "Install Bandit Codes on Plain Hosting (cPanel)"
description: "Set up instant temporary server redirects on cPanel or shared web hosting with .htaccess, or upload codes.json and the redirect page."
platform: "Plain Hosting / cPanel"
speed: "Instant (server rules)"
order: 9
source: "patch-bandit/qr-rescue-kit (guides/cpanel.md)"
---

Plain web hosting with cPanel (such as Bluehost, SiteGround, HostGator, DreamHost, A2 Hosting, or GoDaddy Web Hosting) supports **instant server redirects** using a hidden server settings file named `.htaccess`. Visitors are sent straight to the destination with no visible pause. If your host does not allow `.htaccess`, use Method 2 (upload `codes.json` and the ready-made redirect page).

## What you need

- Your cPanel login (usually sent in your hosting welcome email).
- Your Apache `.htaccess` rules from [Bandit Codes](/tools/qr-code-generator/) (or `dist/.htaccess` for Method 1, or `dist/codes.json` and `dist/redirect-page.html` for Method 2, from [Get your files ready](/tools/qr-code-generator/guides/getting-started/)).

## Method 1: Server redirects with `.htaccess` (Recommended, instant)

1. Log in to **cPanel**.
2. Under **Files**, click **File Manager**.
3. Click **Settings** in the top right of File Manager, check **Show Hidden Files (dotfiles)**, and click **Save**.
4. Open the `public_html` folder (this is your website's main folder; some hosts call it `www` or `httpdocs`).
5. Look for a file named `.htaccess`:
   - If it exists, right-click it and choose **Copy** to save a backup named `.htaccess.backup` first.
   - If it does not exist, click **+ File** in the top left and create `.htaccess`.
6. Right-click `.htaccess` and click **Edit** (confirm UTF-8 encoding if asked).
7. Copy your Apache rules from [Bandit Codes](/tools/qr-code-generator/) (or open `dist/.htaccess` on your computer and copy all of its lines), and paste them at the **very top** of your server's `.htaccess` file (above any existing lines).
8. Click **Save Changes** in the top right.

## Method 2: Upload `codes.json` and the redirect page (If `.htaccess` is disabled, short pause)

1. In cPanel **File Manager**, open `public_html`.
2. Click **Upload** and upload `codes.json` straight into `public_html` (so it lives at `https://yoursite.com/codes.json`).
3. Create a folder named `qr-codes` inside `public_html`.
4. Open `public_html/qr-codes`, upload `dist/redirect-page.html`, and rename it to `index.html`.
   - *Or, if you prefer to create `index.html` by hand:* click **+ File**, name it `index.html`, click **Edit**, and paste this complete page (replacing `PASTE dist/snippet-fetch.html HERE` with the full contents of `dist/snippet-fetch.html`):
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
5. Later, whenever a link changes, you only need to upload the updated `codes.json` file.

## Check it works

1. On your phone's browser, type `https://yoursite.com/go/menu` (or `https://yoursite.com/qr-codes?c=menu`, replacing `menu` with one of your real code IDs) and open it.
2. Confirm it jumps immediately to the destination page or PDF.
3. Open a test unknown code and confirm it goes to your fallback page.
4. To test with your phone camera, paste your owned address into [Bandit Codes](/tools/qr-code-generator/) (or any free static QR code maker without a tracking short link) and scan the image on screen.

## If it does not work

- **You see a "500 Internal Server Error" right after editing `.htaccess`:** Restore `.htaccess.backup` right away in File Manager. This usually happens if a line got wrapped during copy-paste, or if your host uses an older setting (ask your developer to check the Note at the bottom of this page).
- **The `/qr-codes` or `/go/` address shows "404 Not Found":** Make sure you pasted the lines at the **top** of `.htaccess` in `public_html` (not in a subfolder). If your host ignores `.htaccess` files, ask your developer to check the Note below, or use Method 2 instead.
- **Old links still load after you edit `.htaccess`:** Clear your host's cache (for example LiteSpeed Cache or Cloudflare cache) and test in a private browser tab on your phone.

## Limits on plain hosting (cPanel)

- Method 1 works on most cPanel hosts. If your host ignores `.htaccess` files, use Method 2 or ask your developer to install the server config in the Note below.
- Updating a code means updating your rules in [Bandit Codes](/tools/qr-code-generator/) (or rebuilding your `dist/` files via [Get your files ready](/tools/qr-code-generator/guides/getting-started/)) and replacing the Bandit Codes block at the top of `.htaccess` (or uploading the new `codes.json` in Method 2).

## Note for your developer

- `dist/.htaccess` uses `mod_rewrite` with `RewriteCond %{REQUEST_URI}`, `RewriteCond %{QUERY_STRING}`, and `[R=302,L,QSD,NE]` (with `%` escaped as `\%` in the substitution so percent-encoded destinations like `%20` are not treated as back-references or double-escaped). Apache 2.4+ and LiteSpeed support `QSD`. On legacy Apache 2.2, replace `QSD` with a trailing `?` on targets without their own query string.
- When `mod_headers` is enabled on Apache 2.4+, you can send `X-Robots-Tag: noindex` for your forwarding prefix with `<If "%{REQUEST_URI} =~ m#^/(go|qr-codes)#">Header always set X-Robots-Tag "noindex"</If>`.
- If the server runs nginx instead of Apache, `.htaccess` is ignored; use the nginx rules from Bandit Codes (or `dist/nginx.conf`, with `add_header X-Robots-Tag "noindex" always;` inside the redirect `location` block, run `nginx -t`, and reload).
- In Method 2, the `codes.json` loader calls `fetch(..., { redirect: "error" })`, so `/codes.json` must return HTTP `200` directly on the same origin without any redirect (even a same-origin redirect stops the loader).
