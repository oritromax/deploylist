#!/usr/bin/env node
// Build the published surface described in SPEC.md section 4 into dist/.
//
// The build refuses to run on input that does not lint. A published file is
// only ever produced from content that passed every gate.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadLayers, lintLayer } from '../lint/index.js';
import { lintStructure, resolve, sortChecks } from '../lint/compose.js';
import { idToUrlStem } from '../lint/paths.js';
import { renderMarkdown, renderJson, renderIndexJson, renderLlmsTxt, SEVERITIES } from './render.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const SITE = 'https://deploy-list.com';
const SCHEMA_VERSION = 1;

const CATEGORIES = ['security', 'secrets', 'config', 'performance', 'seo',
  'accessibility', 'observability', 'reliability', 'build', 'legal'];

// Cloudflare Pages does not set CORS headers by default, and the whole product
// is agents fetching these URLs, so a browser-context consumer needs this.
const HEADERS = `/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=600
  X-Content-Type-Options: nosniff
`;

const written = [];

function emit(relPath, content) {
  const full = join(DIST, relPath);
  mkdirSync(dirname(full), { recursive: true });
  const body = typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`;
  writeFileSync(full, body);
  written.push({ path: relPath, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') });
}

// Host configuration, consumed by the platform at deploy time and never served.
// It stays out of `written`, and so out of the manifest, because the manifest
// hashes files a consumer can fetch and this one 404s.
function emitConfig(relPath, content) {
  const full = join(DIST, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function stripInternal(checks) {
  return checks.map(({ _from, ...rest }) => rest);
}

function main() {
  const entries = loadLayers();
  if (!entries.length) {
    console.error('build: no layer files under checks/');
    return 1;
  }

  const errors = entries.flatMap((e) => lintLayer(e).errors);
  const valid = entries.filter((e) => e.layer && e.layer.id);
  errors.push(...lintStructure(valid));
  if (errors.length) {
    for (const e of errors.slice(0, 20)) console.error(`error ${e}`);
    console.error(`\nbuild refused: input does not lint (${errors.length} error(s)). Run npm run lint.`);
    return 1;
  }

  rmSync(DIST, { recursive: true, force: true });
  const generated = new Date().toISOString().slice(0, 10);
  const byId = new Map(valid.map((e) => [e.layer.id, e]));
  const catalog = [];

  for (const { layer } of valid) {
    const { checks: raw, errors: composeErrors, chain } = resolve(layer.id, byId);
    if (composeErrors.length) {
      for (const e of composeErrors) console.error(`error compose: ${e}`);
      return 1;
    }
    const checks = stripInternal(sortChecks(raw));
    const stem = idToUrlStem(layer.id);
    const ctx = { title: layer.name, stem, checks, chain, site: SITE, generated, schemaVersion: SCHEMA_VERSION };

    emit(`${stem}.md`, renderMarkdown(ctx));
    emit(`${stem}.json`, renderJson(ctx));
    emit(`${stem}/index.json`, renderIndexJson(ctx));

    for (const category of CATEGORIES) {
      const slice = checks.filter((c) => c.category === category);
      if (!slice.length) continue;
      const sctx = { ...ctx, checks: slice, title: `${layer.name} ${category}`, stem: `${stem}/${category}` };
      emit(`${stem}/${category}.md`, renderMarkdown(sctx));
      emit(`${stem}/${category}.json`, renderJson(sctx));
    }

    const blockers = checks.filter((c) => c.severity === 'critical' || c.severity === 'high');
    if (blockers.length) {
      const bctx = { ...ctx, checks: blockers, title: `${layer.name} ship-blockers`, stem: `${stem}/critical` };
      emit(`${stem}/critical.md`, renderMarkdown(bctx));
      emit(`${stem}/critical.json`, renderJson(bctx));
    }

    catalog.push({
      id: layer.id,
      kind: layer.kind,
      title: layer.name,
      stem,
      count: checks.length,
      by_severity: Object.fromEntries(
        SEVERITIES.map((s) => [s, checks.filter((c) => c.severity === s).length])),
      urls: { markdown: `${SITE}/${stem}.md`, json: `${SITE}/${stem}.json`, index: `${SITE}/${stem}/index.json` },
    });
  }

  catalog.sort((a, b) => a.id.localeCompare(b.id));
  emit('index.json', {
    _meta: { source: `${SITE}/index.json`, generated, schema_version: SCHEMA_VERSION },
    stacks: catalog,
  });
  emit('llms.txt', renderLlmsTxt(SITE, catalog.filter((c) => c.kind !== 'universal')));

  emitConfig('_headers', HEADERS);

  // Manifest last, and it does not hash itself.
  const manifest = {
    schema_version: SCHEMA_VERSION,
    generated,
    site: SITE,
    files: Object.fromEntries(written.map((w) => [w.path, { bytes: w.bytes, sha256: w.sha256 }])),
  };
  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const total = written.reduce((n, w) => n + w.bytes, 0);
  console.log(`build ok: ${written.length + 1} files, ${(total / 1024).toFixed(1)} KiB, ${catalog.length} layers`);
  return 0;
}

process.exit(main());
