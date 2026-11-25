---
title: "Install Bandit Codes on Shopify | Patch Bandit"
h1: "Install Bandit Codes on Shopify"
description: "Step-by-step guide to running Bandit Codes on a dedicated Shopify /pages/qr-codes template using a Custom Liquid section."
platform: "Shopify"
speed: "Short pause (snippet)"
order: 5
source: "patch-bandit/qr-rescue-kit (guides/shopify.md)"
---

Shopify puts custom pages under `/pages/`, so your QR page address will be `https://yoursite.com/pages/qr-codes?c=menu`. Shopify's built-in redirect tool only creates links that phones remember forever instead of checking for updates. Instead, you will paste the Bandit Codes snippet into a **Custom Liquid** section (Shopify's box for custom code). Visitors see a brief pause while the page loads before being sent on to the destination.

## What you need

- A Shopify store login with permission to edit pages and your Online Store theme.
- Your snippet from [Bandit Codes](/tools/qr-code-generator/) (or `dist/snippet.html` from [Get your files ready](/tools/qr-code-generator/guides/getting-started/)). If your developer or AI assistant builds the files for you, tell them your site is on Shopify so they use `/pages/qr-codes` as the page path.

## Step-by-step instructions

1. Log in to your Shopify admin dashboard.
2. In the left menu, click **Online Store > Pages**.
3. Click **Add page** in the top right.
4. Set the **Title** to `QR Codes`. Scroll down to **Search engine listing**, click **Edit**, and confirm the **URL handle** ends in `/pages/qr-codes`.
5. Click **Save** (leave the main content box empty for now, because Shopify's normal page editor can strip custom code).
6. Next, create a dedicated template for this page so the snippet only runs on `/pages/qr-codes`:
   - In the left menu, click **Online Store > Themes**, then click **Customize** on your live theme.
   - At the top center dropdown (where it says **Home page**), select **Pages > Create template**.
   - Name the template `qr-codes` (based on `Default page`) and click **Create template**.
   - In the left sidebar under **Template**, click **+ Add section** and choose **Custom Liquid** (Shopify's custom code box).
   - Copy your snippet from [Bandit Codes](/tools/qr-code-generator/) (or `dist/snippet.html`, everything from `<!-- Bandit Codes v1: start -->` to `<!-- Bandit Codes v1: end -->`), and paste it into the **Liquid code** box.
   - Click **Save** in the top right.
7. Go back to **Online Store > Pages**, open **QR Codes**, find the **Theme template** dropdown on the right side, change it from `Default page` to `qr-codes`, and click **Save**.

## Check it works

1. On your phone's browser, type `https://yoursite.com/pages/qr-codes?c=menu` (replace `menu` with one of your code IDs) and open it.
2. Confirm it jumps to the destination page or PDF after a short pause.
3. Open `https://yoursite.com/pages/qr-codes?c=unknown-test` and confirm it sends you to your fallback page.
4. To test with your phone camera, paste `https://yoursite.com/pages/qr-codes?c=menu` into [Bandit Codes](/tools/qr-code-generator/) (or any free static QR code maker without a tracking short link) and scan the image on screen.

## If it does not work

- **The page opens, shows nothing, and does not redirect:** Make sure you assigned the new `qr-codes` theme template to the **QR Codes** page in Step 7, and that you pasted the snippet into a **Custom Liquid** section rather than the normal page editor.
- **Your link says "404 Page Not Found":** Remember Shopify requires `/pages/` in the address (`https://yoursite.com/pages/qr-codes?c=menu`), not `/qr-codes?c=menu`.
- **The snippet ran on every page of your store:** Make sure you created a separate `qr-codes` page template in Step 6 instead of adding Custom Liquid to `Default page`.

## Limits on Shopify

- Shopify page addresses always begin with `/pages/`, so print `https://yoursite.com/pages/qr-codes?c=<id>` in your QR codes.
- Uses the HTML snippet, so visitors see a brief pause while the page loads before being forwarded.
- Updating codes means editing your snippet in [Bandit Codes](/tools/qr-code-generator/) (or rebuilding `dist/snippet.html` via [Get your files ready](/tools/qr-code-generator/guides/getting-started/)) and pasting the new block into the **Custom Liquid** section of your `qr-codes` template.

## Note for your developer

- Pass `--path /pages/qr-codes` when running `bandit-codes build` or `bandit-codes list --urls` so helper files match Shopify's `/pages/` prefix.
- Shopify's built-in **URL Redirects** (`Content > Menus > URL Redirects` or `Online Store > Navigation > URL Redirects`) only fires on 404 paths, does not match `?c=` query strings, and issues permanent HTTP 301 redirects (which mobile browsers cache aggressively). Do not use it for mutable QR links.
- Alternatively, you can add `templates/page.qr-codes.liquid` directly in **Online Store > Themes > Edit code** and paste the snippet there with `{% layout none %}` and `<meta name="robots" content="noindex">` to eliminate theme CSS/JS overhead, speed up the client-side redirect, and keep `/pages/qr-codes` out of search indexes.
