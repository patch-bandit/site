---
title: "Install Bandit Codes on Squarespace | Patch Bandit"
h1: "Install Bandit Codes on Squarespace"
description: "Step-by-step guide to running Bandit Codes on a hidden Squarespace page using Page Header Code Injection or a Code Block."
platform: "Squarespace"
speed: "Short pause (snippet)"
order: 3
source: "patch-bandit/qr-rescue-kit (guides/squarespace.md)"
---

Squarespace does not let you add server redirect rules that read `?c=menu` query links, so you will use the paste-in HTML snippet on a page called `/qr-codes`. Because this uses the snippet, a visitor sees your `/qr-codes` page for a split second before their phone jumps to the destination.

## What you need

- A Squarespace plan that supports custom code (such as **Business** or **Core** or higher; lower Personal or Basic plans block custom scripts).
- Your snippet from [Bandit Codes](/tools/qr-code-generator/) (or `dist/snippet.html` from [Get your files ready](/tools/qr-code-generator/guides/getting-started/)).

## Step-by-step instructions

1. Log in to your Squarespace dashboard and open your site.
2. In the left menu, click **Website > Pages** (older menus say **Pages** directly).
3. Under **Not Linked**, click the **+** button and choose **Blank Page**. Putting it under **Not Linked** keeps it out of your top navigation menu.
4. Name the page `QR Codes`.
5. Hover over `QR Codes` in the Pages list and click the **gear icon** (Page Settings).
6. Check the **URL Slug** field and make sure it says `/qr-codes`.
7. In the Page Settings panel, click **Advanced** and then **Page Header Code Injection** (Squarespace's box for custom code on one page).
8. Copy your snippet from [Bandit Codes](/tools/qr-code-generator/) (or `dist/snippet.html`, everything from `<!-- Bandit Codes v1: start -->` to `<!-- Bandit Codes v1: end -->`), and paste it into the box.
9. Click **Save**.

*Optional alternative:* Instead of Page Header Code Injection, you can edit the `/qr-codes` page, add a **Code** block, paste the snippet inside it (with HTML selected and "Display Source Code" turned off), and click **Save**. Note that Squarespace previews sometimes pause custom scripts while you are logged into the editor, so always test in a private browser window or on your phone.

## Check it works

1. On your phone (not logged into Squarespace), type `https://yoursite.com/qr-codes?c=menu` (replace `menu` with one of your real code IDs) into your browser and open it.
2. Confirm your phone jumps to the destination page or PDF after a brief pause.
3. Open `https://yoursite.com/qr-codes?c=unknown-test` and confirm it goes to your fallback page (your home page by default).
4. To test with your phone camera, paste `https://yoursite.com/qr-codes?c=menu` into [Bandit Codes](/tools/qr-code-generator/) (or any free static QR code maker without a tracking short link) and scan the image on screen.

## If it does not work

- **The page stays blank or shows the raw code text:** Check your Squarespace plan. Lower plans disable custom scripts in Code Blocks and Code Injection. Also make sure "Display Source Code" is turned off if you used a Code Block.
- **It does not redirect while you are editing the page:** Squarespace pauses custom scripts inside the logged-in editor for safety. Test on your phone or in an incognito or private browser tab.
- **You see "Page Not Found":** Check the page's **URL Slug** in Page Settings to verify it is `/qr-codes` and the page is enabled (not disabled).

## Limits on Squarespace

- Requires a plan that includes custom JavaScript in Code Injection or Code Blocks (Business, Core, or higher).
- Because Squarespace loads the page before running the snippet, there is a brief pause before the visitor arrives at the destination.
- Updating a code means editing your snippet in [Bandit Codes](/tools/qr-code-generator/) (or rebuilding `dist/snippet.html` via [Get your files ready](/tools/qr-code-generator/guides/getting-started/)), and pasting the updated block back into the Squarespace page.

## Note for your developer

- Add `<meta name="robots" content="noindex">` in Page Header Code Injection (or toggle **Hide Page from Search Results** in Page Settings > SEO) so `/qr-codes` is not indexed by search engines.
- If the owner leaves `fallback` empty to show the link list, the loader automatically appends the `<nav>` to `document.body` even when placed in Page Header Code Injection (`<head>`).
- If the owner prefers instant server-side HTTP 302 redirects and is willing to print path-based URLs (`https://yoursite.com/qr-codes/menu` instead of `?c=menu`), Squarespace's built-in **Settings > Developer Tools > URL Mappings** accepts lines like `/qr-codes/menu -> https://example.com/menu.pdf 302` (check plan availability). However, URL Mappings does not match `?c=` query parameters.
- Squarespace does not allow uploading an arbitrary `/codes.json` file at the site root, so use the inline snippet rather than the fetch variant.
