import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGES, SITE } from "../../src/app/data/pages.mjs";
import { checkPreviews, previewFile, renderPreview } from "../../scripts/link-previews.mjs";
import { checkStatic } from "../../scripts/check-static.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const entry = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<title>generic</title><meta name="description" content="generic" />
<script type="module" src="/assets/app.js"></script></head>
<body><div id="root"></div></body></html>`;

function fixture(mutate = (_page, html) => html) {
  const root = mkdtempSync(join(tmpdir(), "finstats-previews-"));
  copyFileSync(join(ROOT, "public", "og-image.png"), join(root, "og-image.png"));
  for (const page of PAGES) {
    writeFileSync(join(root, previewFile(page)), mutate(page, renderPreview(entry, page)));
  }
  return root;
}

test("every route has its own page-specific title and description", () => {
  assert.equal(new Set(PAGES.map((p) => p.description)).size, PAGES.length);
  for (const page of PAGES) {
    assert.ok(page.description && page.description.length >= 50 && page.description.length <= 200, page.path);
    assert.doesNotMatch(page.description, /\d/, `${page.path} description must not hold figures`);
  }
  const root = fixture();
  try {
    checkPreviews(root);
    const prices = readFileSync(join(root, "prices.html"), "utf8");
    assert.match(prices, /<title>Prices and the cost of living \| finstats UK<\/title>/);
    assert.match(prices, /og:url" content="https:\/\/finstats\.fabio\.org\.uk\/prices"/);
    assert.match(prices, /og:image" content="https:\/\/finstats\.fabio\.org\.uk\/og-image\.png"/);
    assert.match(prices, /twitter:card" content="summary_large_image"/);
    assert.doesNotMatch(prices, /<title>generic/);
    assert.equal((prices.match(/<title>/g) || []).length, 1);
    assert.equal((prices.match(/name="description"/g) || []).length, 1);
    // The overview keeps the trailing-slash root URL.
    assert.match(readFileSync(join(root, "index.html"), "utf8"), /og:url" content="https:\/\/finstats\.fabio\.org\.uk\/"/);
  } finally { rmSync(root, { recursive: true }); }
});

test("rendering is idempotent and escapes page text", () => {
  const page = PAGES[0];
  const once = renderPreview(entry, page);
  assert.equal(renderPreview(once, page), once);
  const tricky = renderPreview(entry, { ...page, description: 'Jobs & "pay" <b>' });
  assert.match(tricky, /content="Jobs &amp; &quot;pay&quot; &lt;b&gt;"/);
});

test("the check fails when a route lacks or mangles a preview tag", () => {
  const cases = [
    ["a missing file", (p) => p.path === "/housing" ? null : undefined, /Missing preview page for housing\.html/],
    ["no og:image", (p, h) => p.path === "/about" ? h.replace(/<meta property="og:image" [^>]*>/, "") : h, /about\.html.*lacks og:image/],
    ["relative og:image", (p, h) => p.path === "/about" ? h.replace(/(og:image" content=")https:\/\/finstats\.fabio\.org\.uk/, "$1") : h, /og:image is not an absolute/],
    ["relative og:url", (p, h) => p.path === "/sources" ? h.replace(/(og:url" content=")https:\/\/finstats\.fabio\.org\.uk/, "$1") : h, /og:url is not an absolute/],
    ["wrong og:url", (p, h) => p.path === "/sources" ? h.replace(/og:url" content="[^"]*"/, 'og:url" content="https://finstats.fabio.org.uk/prices"') : h, /does not match its route/],
    ["no twitter card", (p, h) => p.path === "/calendar" ? h.replace(/summary_large_image/, "summary") : h, /twitter:card/],
    ["no og:site_name", (p, h) => p.path === "/economy" ? h.replace(/<meta property="og:site_name" [^>]*>/, "") : h, /og:site_name/],
    ["a live figure", (p, h) => p.path === "/prices" ? h.replace(/(og:description" content=")/, "$1CPIH is 3.3%. ").replace(/(name="description" content=")/, "$1CPIH is 3.3%. ") : h, /must not contain figures/],
    ["generic fallback title", (_p, h) => h.replace(/<title>[^<]*<\/title>/, ""), /lacks <title>/],
  ];
  for (const [label, mutate, expected] of cases) {
    const root = fixture();
    try {
      for (const page of PAGES) {
        const file = join(root, previewFile(page));
        const html = readFileSync(file, "utf8");
        const out = mutate(page, html);
        if (out === null) rmSync(file);
        else if (out !== undefined) writeFileSync(file, out);
      }
      assert.throws(() => checkPreviews(root), expected, label);
    } finally { rmSync(root, { recursive: true }); }
  }
  const root = fixture();
  try {
    rmSync(join(root, "og-image.png"));
    assert.throws(() => checkPreviews(root), /Missing preview image/);
  } finally { rmSync(root, { recursive: true }); }
});

test("the preview image is the declared size and kept small", () => {
  const png = readFileSync(join(ROOT, "public", "og-image.png"));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), SITE.image.width);
  assert.equal(png.readUInt32BE(20), SITE.image.height);
  assert.ok(png.length < 150 * 1024, `${png.length} bytes`);
});

test(".htaccess serves exactly the application routes from their preview pages", () => {
  const htaccess = readFileSync(join(ROOT, "public", ".htaccess"), "utf8");
  const routes = PAGES.filter((p) => p.path !== "/").map((p) => p.path.slice(1));
  const rule = /RewriteRule \^\(([^)]*)\)\/\?\$ \$1\.html \[L\]/.exec(htaccess);
  assert.ok(rule, "internal rewrite rule present");
  assert.deepEqual(rule[1].split("|").sort(), [...routes].sort());
  const redirect = /RewriteCond %\{THE_REQUEST\} "[^"]*\/\(([^)]*)\)\\\.html/.exec(htaccess);
  assert.ok(redirect, ".html canonical redirect present");
  assert.deepEqual(redirect[1].split("|").sort(), [...routes].sort());
  // Everything is guarded so a host without mod_rewrite keeps the SPA fallback.
  assert.match(htaccess, /<IfModule mod_rewrite\.c>[\s\S]*<\/IfModule>/);
  // The rule must not touch data, reports or status files.
  for (const name of ["data/current.json", "ai_status.json", "research_report.json", "history_report.json"]) {
    assert.ok(!new RegExp(`^(?:${rule[1]})/?$`).test(name), name);
  }
  // Entry pages revalidate: every generated route file matches the Cache-Control rule.
  const files = /<FilesMatch "([^"]+\.html\$)">\s*Header set Cache-Control "no-cache/.exec(htaccess);
  assert.ok(files, "HTML cache rule present");
  for (const page of PAGES) assert.match(previewFile(page), new RegExp(files[1]));
});

test("a real production build emits a verified HTML file per route and passes the static boundary", async () => {
  const { build } = await import("vite");
  const out = mkdtempSync(join(tmpdir(), "finstats-build-"));
  try {
    await build({ root: ROOT, logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
    checkPreviews(out);
    checkStatic(out);
    const names = readdirSync(out).filter((n) => n.endsWith(".html")).sort();
    assert.deepEqual(names, PAGES.map(previewFile).sort());
    for (const page of PAGES) {
      const html = readFileSync(join(out, previewFile(page)), "utf8");
      // The application bundle and stylesheet are still referenced from every route.
      assert.match(html, /<script type="module"[^>]*src="\/assets\/index-[\w-]+\.js"/);
      assert.match(html, /<div id="root"><\/div>/);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});
