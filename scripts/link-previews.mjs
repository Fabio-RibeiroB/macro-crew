// Link previews: crawlers and chat apps do not run JavaScript, so each direct URL
// needs its own title, description and Open Graph / Twitter card tags in the static
// HTML. Page text comes from src/app/data/pages.mjs, the same list the app uses.
// Tags carry no live figures. No server-side rendering of the app itself.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGES, SITE, documentTitle } from '../src/app/data/pages.mjs';

/** Built file for a route: "/" is index.html, "/prices" is prices.html. */
export function previewFile(page) {
  return page.path === '/' ? 'index.html' : `${page.path.slice(1)}.html`;
}

const pageUrl = (page) => SITE.url + page.path;
const esc = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function previewTags(page) {
  const image = SITE.url + SITE.image.path;
  const title = documentTitle(page);
  const meta = (attr, name, content) => `<meta ${attr}="${name}" content="${esc(content)}" />`;
  return [
    `<title>${esc(title)}</title>`,
    meta('name', 'description', page.description),
    `<link rel="canonical" href="${esc(pageUrl(page))}" />`,
    meta('property', 'og:site_name', SITE.name),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:title', title),
    meta('property', 'og:description', page.description),
    meta('property', 'og:url', pageUrl(page)),
    meta('property', 'og:image', image),
    meta('property', 'og:image:type', 'image/png'),
    meta('property', 'og:image:width', SITE.image.width),
    meta('property', 'og:image:height', SITE.image.height),
    meta('property', 'og:image:alt', SITE.image.alt),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', page.description),
    meta('name', 'twitter:image', image),
    meta('name', 'twitter:image:alt', SITE.image.alt),
  ].join('\n    ');
}

/** Replace the generic title/description in the built entry HTML with a page's tags. */
export function renderPreview(html, page) {
  const stripped = html
    .replace(/\s*<title>[\s\S]*?<\/title>/i, '')
    .replace(/\s*<meta\s+(?:name|property)="(?:description|og:[^"]*|twitter:[^"]*)"[^>]*>/gi, '')
    .replace(/\s*<link\s+rel="canonical"[^>]*>/gi, '');
  if (!/<\/head>/i.test(stripped)) throw new Error('Entry HTML has no </head>');
  return stripped.replace(/\s*<\/head>/i, () => `\n    ${previewTags(page)}\n  </head>`);
}

function tag(html, attr, name) {
  for (const match of html.matchAll(/<meta\s+([^>]*?)\/?>/gi)) {
    if (match[1].includes(`${attr}="${name}"`)) {
      const content = /content="([^"]*)"/i.exec(match[1]);
      return content ? content[1] : '';
    }
  }
  return undefined;
}

/** Throws when any route's built HTML lacks, or has a malformed, preview tag. */
export function checkPreviews(root) {
  const origin = `${SITE.url}/`;
  if (!existsSync(resolve(root, SITE.image.path.slice(1)))) throw new Error(`Missing preview image ${SITE.image.path}`);
  for (const page of PAGES) {
    const file = previewFile(page);
    const where = `${file} (${page.path})`;
    if (!existsSync(resolve(root, file))) throw new Error(`Missing preview page for ${where}`);
    const html = readFileSync(resolve(root, file), 'utf8');
    const need = (value, what) => { if (!value) throw new Error(`${where} lacks ${what}`); return value; };
    const title = need(/<title>([^<]+)<\/title>/i.exec(html)?.[1], '<title>');
    const description = need(tag(html, 'name', 'description'), 'meta description');
    need(tag(html, 'property', 'og:title'), 'og:title');
    need(tag(html, 'property', 'og:description'), 'og:description');
    const url = need(tag(html, 'property', 'og:url'), 'og:url');
    const image = need(tag(html, 'property', 'og:image'), 'og:image');
    if (tag(html, 'property', 'og:type') !== 'website') throw new Error(`${where} og:type must be website`);
    need(tag(html, 'property', 'og:site_name'), 'og:site_name');
    if (tag(html, 'name', 'twitter:card') !== 'summary_large_image') throw new Error(`${where} twitter:card must be summary_large_image`);
    for (const name of ['og:image:width', 'og:image:height', 'og:image:alt']) need(tag(html, 'property', name), name);
    if (!url.startsWith(origin)) throw new Error(`${where} og:url is not an absolute ${SITE.url} URL`);
    if (!image.startsWith(origin)) throw new Error(`${where} og:image is not an absolute ${SITE.url} URL`);
    if (url !== pageUrl(page)) throw new Error(`${where} og:url does not match its route`);
    if (/\d/.test(description) || /\d/.test(title)) throw new Error(`${where} preview text must not contain figures`);
    // The app must still boot from this file.
    if (!/<div id="root"><\/div>/.test(html) || !/<script type="module"/.test(html)) throw new Error(`${where} is not an application entry page`);
  }
}

/** Vite plugin: writes one HTML file per route and verifies the result. */
export function linkPreviews() {
  let outDir = '';
  return {
    name: 'finstats-link-previews',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const entry = bundle['index.html'];
        if (!entry || entry.type !== 'asset') throw new Error('Built index.html not found for link previews');
        const html = String(entry.source);
        for (const page of PAGES) {
          const source = renderPreview(html, page);
          if (page.path === '/') entry.source = source;
          else this.emitFile({ type: 'asset', fileName: previewFile(page), source });
        }
      },
    },
    closeBundle() { checkPreviews(outDir); },
  };
}
