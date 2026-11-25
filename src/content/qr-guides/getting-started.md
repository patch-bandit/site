---
title: "Get your Bandit Codes files ready | Patch Bandit"
h1: "Get your files ready"
description: "Create your Bandit Codes snippet or redirect files in the browser studio or with the open-source CLI kit before following your platform guide."
platform: "Getting started"
speed: "Start here"
order: 1
source: "patch-bandit/qr-rescue-kit (guides/getting-started.md)"
---

**Fastest option (no install needed):** You can create your snippet, forwarding rules, and QR code ZIP right inside your browser with [Bandit Codes](/tools/qr-code-generator/). Use the steps below if you prefer the downloadable command-line kit or the WordPress plugin.

Every platform guide in this kit asks for a file from your `dist` folder (such as `dist/snippet.html`, `dist/_redirects`, or `dist/.htaccess`), or for the WordPress plugin folder (`wordpress/bandit-codes`). This page shows you how to download the kit and create those files, even if you have never edited a website before.

## Step 1: Download the Bandit Codes kit

1. Open the Bandit Codes kit on GitHub in your browser: <a href="https://github.com/patch-bandit/qr-rescue-kit" target="_blank" rel="noopener noreferrer">github.com/patch-bandit/qr-rescue-kit</a>
2. Click the green **Code** button near the top right, then click **Download ZIP**.
3. Find the downloaded `.zip` file on your computer (usually in your **Downloads** folder) and unzip it.
4. Open the unzipped folder (its name may end in `-main`, such as `qr-rescue-kit-main`).
   - **Using the WordPress plugin?** You already have what you need inside `wordpress/bandit-codes`. You can jump straight to the [WordPress guide](/tools/qr-code-generator/guides/wordpress/) and skip Steps 2 and 3 unless you have dozens of codes to import from a spreadsheet.

## Step 2: Create your redirect files

You have two ways to build your `dist` folder. Pick whichever feels easier:

### Option A: Ask your developer or AI assistant (Easiest)

Hand the unzipped folder and your list of links (or your spreadsheet from your old QR vendor) to your developer or your AI coding assistant. Tell them:

> "Follow `skill/SKILL.md` in this folder to add my QR codes, check them, and build the `dist` folder for `yoursite.com`."

When they finish, you will have a `dist` folder containing the exact ready-to-paste or ready-to-upload file your platform guide asks for.

### Option B: Build the files yourself on your computer

1. Install **Node.js** (a free tool that runs the kit on your computer). Download the **LTS** version from `nodejs.org` and run the installer with the default choices.
2. Open the Terminal app (on Mac, press Command + Space and type `Terminal`; on Windows, open the Start menu and type `PowerShell`).
3. Type `cd ` (with a space after it), drag your unzipped folder into the Terminal window, and press Enter.
4. Run these four commands one at a time, replacing the example link and `yoursite.com` with your own:
   ```sh
   node ./cli/bin/bandit-codes.mjs init
   node ./cli/bin/bandit-codes.mjs add menu https://example.com/menu.pdf --note "Table tent"
   node ./cli/bin/bandit-codes.mjs check
   node ./cli/bin/bandit-codes.mjs build --out dist --path /qr-codes --domain yoursite.com
   ```
   - **Using a separate subdomain like `go.yoursite.com`?** Change the first line to `node ./cli/bin/bandit-codes.mjs init --fallback https://yoursite.com` so any mistyped or unknown code sends visitors to your main website instead of a blank page.

## Step 3: Find the file your guide asks for

When the build finishes, a new folder named `dist` appears inside your unzipped folder. Inside `dist`, you will see ready-made files for every website platform. You only need the one your guide names:

- `dist/snippet.html`: A block of code you copy and paste into site builders (Squarespace, Wix, Shopify, Webflow, GoDaddy Website Builder, or WordPress without a plugin).
- `dist/codes.json`: Your list of codes as a single file. Upload it to plain hosting or Cloudflare Pages, or paste its contents into the WordPress plugin's **Import JSON** box.
- `dist/redirect-page.html`: A ready-to-upload web page that reads `codes.json` (used with plain hosting Method 2 or Cloudflare Pages Method 1).
- `dist/snippet-fetch.html`: A smaller paste-in code block that reads `codes.json`, if you prefer to build your own HTML page by hand in plain hosting Method 2 or Cloudflare Pages Method 1.
- `dist/_redirects`: A small text file for Netlify.
- `dist/.htaccess`: A server settings file for plain web hosting (cPanel).
- `dist/nginx.conf`: A server settings file for developers whose host does not use `.htaccess` (see the developer note in the plain hosting guide).
- `dist/vercel.json`: A settings file for Vercel.
- `dist/cloudflare-function.js`: A redirect file for Cloudflare Pages (when using Git).
- `dist/cloudflare-redirects.csv`: An optional spreadsheet for developers using Cloudflare's path-style redirects (see the developer note in the Cloudflare Pages guide).
- `dist/wordpress-redirection.csv`: A spreadsheet for sites that already use the WordPress Redirection plugin.

Now go back to [Which Guide Is Mine?](/tools/qr-code-generator/guides/) and follow the steps for your website platform.

## Extra commands (for imports and reprints)

To import a spreadsheet exported from a paid QR vendor instead of adding codes one by one:

```sh
node ./cli/bin/bandit-codes.mjs import your-vendor-export.csv --slugify
```

To print a reprint list with full QR web addresses (`https://yoursite.com/qr-codes?c=<id>`):

```sh
node ./cli/bin/bandit-codes.mjs list --urls --domain yoursite.com --path /qr-codes
```
