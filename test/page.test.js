import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderIndexHtml, PLANNED } from '../build/page.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(new URL(`../dist/${f}`, import.meta.url), 'utf8');

test('the site root is a page, not a 404', () => {
  execFileSync('node', ['build/index.js'], { cwd: ROOT, encoding: 'utf8' });
  const html = read('index.html');
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<link rel="stylesheet" href="\/style\.css">/);
  assert.ok(read('style.css').length > 0);
});

test('the page leads with llms.txt and says who is responsible', () => {
  const html = read('index.html');
  assert.match(html, /https:\/\/deploy-list\.com\/llms\.txt/);
  assert.match(html, /https:\/\/ioritro\.com/);
  assert.match(html, /no warranty/i);
  assert.match(html, /not responsible/i);
});

test('the page says it will not change anything, autopilot included', () => {
  const html = read('index.html');
  assert.match(html, /never changes your project/i);
  assert.match(html, /autopilot/i);
});

test('coverage comes from the catalog, so it cannot drift', () => {
  const catalog = JSON.parse(read('index.json')).stacks;
  const html = read('index.html');
  for (const stack of catalog.filter((s) => s.kind !== 'universal')) {
    assert.ok(html.includes(`>${stack.title}</a>`),
      `${stack.title} is published but missing from the page`);
  }
  // The universal layer is linked by what it is, not by its layer name.
  assert.match(html, /universal\.md">universal\s+checks<\/a>/);
  for (const planned of PLANNED) assert.ok(html.includes(`<li>${planned}</li>`));
});

test('the page never sums composed counts', () => {
  const catalog = JSON.parse(read('index.json')).stacks;
  const js = catalog.find((s) => s.id === 'javascript');
  const next = catalog.find((s) => s.id === 'javascript.nextjs');
  const html = renderIndexHtml({
    site: 'https://example.com', catalog, generated: '2026-01-01',
  });
  // A framework list already contains its language and the universal layer.
  assert.ok(!html.includes(`${js.count + next.count} checks`),
    'adding a language to its framework counts the inherited checks twice');
});

test('a hostile layer name cannot inject markup into the page', () => {
  const html = renderIndexHtml({
    site: 'https://example.com',
    catalog: [{ id: 'x', kind: 'language', title: '<script>alert(1)</script>', stem: 'x', count: 1 }],
    generated: '2026-01-01',
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});
