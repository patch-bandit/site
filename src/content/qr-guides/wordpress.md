---
title: "Install Bandit Codes on WordPress | Patch Bandit"
h1: "Install Bandit Codes on WordPress"
description: "Run owned QR code redirects on WordPress using the free Bandit Codes plugin, the Redirection plugin CSV, or the paste-in HTML snippet."
platform: "WordPress"
speed: "Instant (plugin) or short pause (snippet)"
order: 2
source: "patch-bandit/qr-rescue-kit (guides/wordpress.md)"
---

WordPress gives you two ways to run Bandit Codes. **Method 1 (the Bandit Codes plugin)** is recommended because it uses instant server redirects with no visible pause and gives you an easy editable table inside WordPress. **Method 2 (the paste-in snippet)** works if you prefer not to install a plugin, though it shows a brief pause while the page loads first.

## What you need

- An Administrator login to your WordPress dashboard (usually `yoursite.com/wp-admin`).
- Your files from [Bandit Codes](/tools/qr-code-generator/) or the downloaded Bandit Codes kit folder on your computer. Follow [Get your files ready](/tools/qr-code-generator/guides/getting-started/) first to download the kit (which contains the `wordpress/bandit-codes/` plugin folder) and, if needed, build your `dist/` files.

## Method 1: Install the WordPress plugin (Recommended, instant redirect)

1. Inside the unzipped Bandit Codes kit folder on your computer, find `wordpress/bandit-codes`. Right-click that `bandit-codes` folder and compress it into `bandit-codes.zip`.
2. Log in to your WordPress dashboard.
3. In the left menu, click **Plugins > Add New Plugin** (older WordPress versions say **Plugins > Add New**).
4. Click **Upload Plugin** at the top of the page.
5. Click **Choose File**, select `bandit-codes.zip`, and click **Install Now**.
6. Click **Activate Plugin**.
7. In the left menu, click **Bandit Codes**.
8. Click **Add Code Row**, type a short ID (like `menu`), paste the destination web address (starting with `https://`), add a note (like `Table tent`), and click **Save Changes**.
9. If you already exported a file from the Patch Bandit QR generator or have many codes (especially 200 or more), scroll to **Import or Export Bandit Codes JSON**, choose `codes.json` or `bandit-codes-links.json` (or paste its JSON text), and click **Import JSON**.

### Alternative if you already use the Redirection plugin

If your site already has the free **Redirection** plugin installed:

1. In your WordPress dashboard, open **Tools > Redirection > Import/Export**.
2. Upload the `bandit-codes-redirection.csv` file from [Bandit Codes](/tools/qr-code-generator/) (or `dist/wordpress-redirection.csv` from your `dist/` folder).
3. Every code imports as an instant temporary redirect.

## Method 2: Paste the HTML snippet (No plugin, short pause)

1. In your WordPress dashboard, go to **Pages > Add New Page**.
2. Give the page the title `QR Codes` and make sure its page link (slug) is `qr-codes`, so the address is `yoursite.com/qr-codes`.
3. Click the **+** button to add a block and choose **Custom HTML**.
4. Copy the Bandit Codes snippet from [Bandit Codes](/tools/qr-code-generator/) (or open `dist/snippet.html` and copy everything from `<!-- Bandit Codes v1: start -->` to `<!-- Bandit Codes v1: end -->`), and paste it into the Custom HTML block.
5. Click **Publish**.

## Check it works

1. On your phone's browser, type `https://yoursite.com/qr-codes?c=menu` (replacing `menu` with one of your code IDs) and open it.
2. Confirm it lands on the destination page or PDF you entered.
3. Open a made-up code like `https://yoursite.com/qr-codes?c=does-not-exist` and confirm it goes to your fallback page (your home page by default).
4. To test with your phone camera, paste `https://yoursite.com/qr-codes?c=menu` into [Bandit Codes](/tools/qr-code-generator/) (or any free static QR code maker without a tracking short link) and scan the image on screen.

## If it does not work

- **You see a "Page Not Found" error with the plugin:** Open **Settings > Permalinks** in WordPress and click **Save Changes** once without changing anything. This refreshes WordPress links.
- **The page loads, but nothing redirects (Method 2):** Make sure you are logged in as an Administrator. WordPress strips custom code when saved by lower user roles (such as Editor or Author), and lower WordPress.com plans also strip custom code.
- **An old destination still opens after you changed it:** Clear any WordPress caching plugin (such as WP Rocket, W3 Total Cache, or LiteSpeed Cache) and exclude `/qr-codes` from page caching so every scan checks the latest destination.
- **Saving a very large table says the form was cut off:** Your web host limits how many form fields can be saved at once. Use the **Import JSON** box on the same screen instead of the table button; none of your existing codes were lost.

## Limits on WordPress

- **WordPress.com Free, Personal, and Premium plans** do not allow uploading custom plugins or running custom code snippets. You need a self-hosted WordPress.org site or a WordPress.com Business (or higher) plan.
- Aggressive page-caching plugins or host caches can cache the `/qr-codes` response unless you exclude `/qr-codes` from caching.
- Checking **Retired** hides a code from the public list; clear its destination address as well if you want scans to go to your fallback page instead of forwarding.

## Note for your developer

- The included plugin (`wordpress/bandit-codes/bandit-codes.php`, GPLv2 or later) hooks `parse_request` at priority 1, validates the query parameter against `[a-z0-9-]{1,64}`, looks up the target exclusively in the `bandit_codes_data` option, sends `nocache_headers()`, and returns an HTTP 302 via `wp_redirect`.
- To keep forwarding addresses out of search indexes, send `X-Robots-Tag: noindex` for the forwarding prefix via your web server config (Apache/nginx) or a WordPress header filter.
- Method 2 requires `unfiltered_html` (Administrator on single-site WordPress) so WordPress does not strip `<script>` tags from the Custom HTML block.
- The table form includes an end-of-form sentinel (`bc_form_complete`) to refuse truncated POSTs caused by PHP `max_input_vars` (default 1,000, roughly 240 rows); use JSON import for large lists.
- If the owner leaves the fallback address blank, placing `[bandit_codes_list]` on a `/qr-codes` WordPress page renders an escaped list of active codes.
