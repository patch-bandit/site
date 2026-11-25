---
title: "Install Bandit Codes on Wix | Patch Bandit"
h1: "Install Bandit Codes on Wix"
description: "Step-by-step guide to adding Bandit Codes on Wix with Settings > Custom Code so printed QR codes stay on your own domain."
platform: "Wix"
speed: "Short pause (snippet)"
order: 4
source: "patch-bandit/qr-rescue-kit (guides/wix.md)"
---

Wix's regular "Embed HTML" box runs inside a separate frame that cannot read your page's web address. Instead, use Wix's **Custom Code** tool in your site settings. Because this uses the paste-in snippet, a visitor sees a brief pause while the `/qr-codes` page loads before jumping to the destination.

## What you need

- A paid Wix plan with a **connected custom domain** (Wix only enables Custom Code on paid sites with a domain).
- Your snippet from [Bandit Codes](/tools/qr-code-generator/) (or `dist/snippet.html` from [Get your files ready](/tools/qr-code-generator/guides/getting-started/)).

## Step-by-step instructions

1. Log in to your Wix dashboard and open the Wix Editor to create the page first.
2. In the left menu, click **Pages & Menu** and click **+ Add Page > Blank Page**.
3. Name the page `QR Codes`, hide it from your site menu (click the three dots next to the page and choose **Hide from menu**), and set its page URL to `qr-codes` under **SEO Basics**.
4. Click **Publish** so the `/qr-codes` page exists on your live site.
5. Go back to your main **Wix Dashboard** (outside the visual editor).
6. In the left menu, click **Settings**, scroll to the **Development & Integrations** section, and click **Custom Code**.
7. Click **+ Add Custom Code** in the top right.
8. Copy your snippet from [Bandit Codes](/tools/qr-code-generator/) (or `dist/snippet.html`, everything from `<!-- Bandit Codes v1: start -->` to `<!-- Bandit Codes v1: end -->`), and paste it into the code box.
9. Name the snippet `Bandit Codes`.
10. Under **Add Code to Pages**, select **Choose specific pages** and pick **QR Codes**.
11. Under **Place Code in**, choose **Body - start** (or **Head**).
12. Click **Apply** and make sure the toggle switch for `Bandit Codes` is turned on.

## Check it works

1. On your phone's browser, type `https://yoursite.com/qr-codes?c=menu` (replace `menu` with one of your code IDs) and open it.
2. Confirm it jumps to your destination link after a short pause.
3. Open `https://yoursite.com/qr-codes?c=unknown-test` and confirm it opens your fallback page.
4. To test with your phone camera, paste `https://yoursite.com/qr-codes?c=menu` into [Bandit Codes](/tools/qr-code-generator/) (or any free static QR code maker without a tracking short link) and scan the image on screen.

## If it does not work

- **You pasted it into an "Embed HTML" element on the page and nothing happens:** Remove it from the Embed HTML box and move it to **Settings > Custom Code** as shown above. Wix isolates Embed HTML boxes so they cannot read `?c=` from your page address.
- **Custom Code is missing or locked in Settings:** Wix requires a paid Premium plan and a connected custom domain before Custom Code becomes available.
- **Changes do not show up right away:** Wait a minute, open a fresh private browser tab on your phone, and verify the **QR Codes** page is published and selected under **Choose specific pages**.

## Limits on Wix

- Requires a paid Wix plan with a connected custom domain.
- Uses the HTML snippet, so visitors see a brief pause while the page loads before being forwarded.
- Updating codes means editing your snippet in [Bandit Codes](/tools/qr-code-generator/) (or rebuilding `dist/snippet.html` via [Get your files ready](/tools/qr-code-generator/guides/getting-started/)) and replacing the text inside **Settings > Custom Code > Bandit Codes**.

## Note for your developer

- Under **SEO Basics** for the `/qr-codes` page, turn off **Let search engines index this page** so Wix outputs `<meta name="robots" content="noindex">`.
- Wix's "Embed HTML" widget renders inside a sandboxed cross-origin `<iframe>` (`filesusr.com`), so `location.search` and `location.replace` cannot read or redirect the parent window. Site-level **Custom Code** injects directly into the main document.
- If placed in **Head** with an empty fallback, the loader appends the link `<nav>` to `document.body` once the DOM is ready.
- Wix's built-in **URL Redirect Manager** (`Marketing & SEO > SEO > URL Redirect Manager`) only supports path-based 301 redirects (not query strings and not 302 temporary redirects), so avoid it for mutable QR codes.
- Wix does not allow uploading a root `/codes.json` file, so always use the inline snippet.
