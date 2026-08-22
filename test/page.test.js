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

test('the site ships no JavaScript', () => {
  // The CSP denies scripts outright. A script tag here would be dead markup
  // and a broken promise at the same time.
  assert.ok(!/<script/i.test(read('index.html')));
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
