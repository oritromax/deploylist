import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(new URL(`../dist/${f}`, import.meta.url), 'utf8');

// The page is hand-authored in site/. These tests are what stops it drifting
// away from what is actually published, now that no generator does it for us.

test('the site root is a page, not a 404', () => {
  execFileSync('node', ['build/index.js'], { cwd: ROOT, encoding: 'utf8' });
  const html = read('index.html');
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<link rel="stylesheet" href="\/style\.css">/);
  assert.ok(read('style.css').length > 0);
});

test('the page is copied verbatim from site/', () => {
  const authored = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.equal(read('index.html'), authored,
    'the build must copy site/index.html unchanged, not transform it');
});

test('the page leads with llms.txt and says who is responsible', () => {
  const html = read('index.html');
  assert.match(html, /deploy-list\.com\/llms\.txt/);
  assert.match(html, /https:\/\/ioritro\.com/);
  assert.match(html, /no warranty/i);
  assert.match(html, /not responsible/i);
});

test('the page says it will not change anything, autopilot included', () => {
  const html = read('index.html');
  assert.match(html, /never changes your project/i);
  assert.match(html, /autopilot/i);
});

test('the only JavaScript is our own, and none of it is inline', () => {
  const html = read('index.html');

  // Every script must have a same-origin src. An inline script would need the
  // CSP loosened to 'unsafe-inline', which is the loosening that actually
  // matters, and a third-party src would put someone else's code on a page
  // that tells people it sends nothing anywhere.
  const tags = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
  for (const attrs of tags) {
    const src = /\bsrc="([^"]+)"/.exec(attrs);
    assert.ok(src, `inline script found: <script${attrs}>`);
    assert.match(src[1], /^\/[^/]/, `script must be same-origin, got ${src[1]}`);
  }
  assert.ok(!/\bon[a-z]+=/i.test(html), 'no inline event handlers');
  assert.ok(read('copy.js').length > 0, 'the script the page references must be published');
});

test('the policy allows exactly the two same-origin things the page needs', () => {
  const headers = read('_headers');
  const policy = /Content-Security-Policy: (.+)/.exec(headers)[1];
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /style-src 'self'/);
  assert.match(policy, /img-src 'self'/);
  assert.ok(!policy.includes('unsafe-inline'), 'unsafe-inline defeats the point');
  assert.ok(!policy.includes('unsafe-eval'));
  assert.ok(!/https?:/.test(policy), 'no third-party origin belongs in this policy');
});

test('the page can be shared and indexed', () => {
  const html = read('index.html');

  // A social card that references an image the build does not publish is worse
  // than no card at all: it fails silently, in someone else's timeline.
  const og = /<meta property="og:image" content="https:\/\/deploy-list\.com\/([^"]+)">/.exec(html);
  assert.ok(og, 'og:image is missing');
  assert.ok(read(og[1]).length > 0, `og:image points at ${og[1]}, which is not published`);

  assert.match(html, /<meta name="description" content="[^"]{80,300}">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/deploy-list\.com\/">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<link rel="icon" href="\/favicon\.svg"/);
  assert.ok(read('favicon.svg').length > 0);
});

test('the sitemap lists every published stack', () => {
  const catalog = JSON.parse(read('index.json')).stacks;
  const sitemap = read('sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/deploy-list\.com\/<\/loc>/);
  for (const stack of catalog) {
    assert.ok(sitemap.includes(`/${stack.stem}.md</loc>`), `${stack.id} is missing from the sitemap`);
  }
});

test('robots.txt points at the sitemap and blocks nothing', () => {
  const robots = read('robots.txt');
  assert.match(robots, /Sitemap: https:\/\/deploy-list\.com\/sitemap\.xml/);
  assert.ok(!/^Disallow: \/$/m.test(robots), 'the whole site is meant to be read');
});

test('the copy buttons degrade instead of sitting there dead', () => {
  const html = read('index.html');
  const buttons = [...html.matchAll(/<button[^>]*data-copy="([^"]+)"[^>]*>/gi)];
  assert.equal(buttons.length, 2, 'the link and the sentence both get one');

  for (const [tag, payload] of buttons) {
    assert.match(tag, /\bhidden\b/, 'a copy button must start hidden and be revealed by script');
    assert.match(payload, /deploy-list\.com\/llms\.txt/);
  }
});

test('every published stack is linked from the page', () => {
  const catalog = JSON.parse(read('index.json')).stacks;
  const html = read('index.html');

  const missing = catalog
    .filter((s) => s.kind !== 'universal')
    .filter((s) => !html.includes(`"/${s.stem}.md"`))
    .map((s) => `${s.id} (add a link to /${s.stem}.md)`);

  assert.deepEqual(missing, [],
    `site/index.html is out of date with the catalog. Missing: ${missing.join(', ')}`);
  assert.ok(html.includes('"/universal.md"'), 'the universal layer should be linked too');
});

test('the page does not advertise a stack that is not published', () => {
  const catalog = JSON.parse(read('index.json')).stacks;
  const published = new Set(catalog.map((s) => `/${s.stem}.md`));
  const html = read('index.html');

  const linked = [...html.matchAll(/href="(\/[a-z0-9/-]+\.md)"/g)].map((m) => m[1]);
  const phantom = [...new Set(linked)].filter((href) => !published.has(href));

  assert.deepEqual(phantom, [],
    `the page links checklists that do not exist: ${phantom.join(', ')}`);
});
