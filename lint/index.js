#!/usr/bin/env node
// deploylist lint — the CI gate described in CONTRIBUTING.md.
//
//   node lint/index.js                 schema, prose, commands, references, structure
//   node lint/index.js --check-links   additionally verify every reference resolves
//   node lint/index.js --stamp         write `added` on merged checks that lack it
//
// This never executes a contributed command. It validates shape only.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintSchema } from './schema.js';
import { lintProse } from './prose.js';
import { lintCommand, lintSuggestedCommand } from './command.js';
import { lintReference, checkAllReachable } from './references.js';
import { lintStructure, resolve } from './compose.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECKS_DIR = join(ROOT, 'checks');

export function loadLayers(dir = CHECKS_DIR) {
  const entries = [];
  const walk = (d) => {
    let names;
    try { names = readdirSync(d); } catch { return; }
    for (const name of names.sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.json')) continue;
      const path = relative(ROOT, full).replace(/\\/g, '/');
      let layer;
      try {
        layer = JSON.parse(readFileSync(full, 'utf8'));
      } catch (e) {
        entries.push({ path, layer: null, parseError: e.message });
        continue;
      }
      entries.push({ path, layer, full });
    }
  };
  walk(dir);
  return entries;
}

/** Every prose field in a layer, with a dotted path for messages. */
function* proseFields(layer) {
  if (layer.name) yield ['name', layer.name];
  for (const [i, s] of (layer.suppressions ?? []).entries()) {
    if (s.reason) yield [`suppressions[${i}].reason`, s.reason];
  }
  for (const [i, c] of (layer.checks ?? []).entries()) {
    const at = c.id ? `checks[${c.id}]` : `checks[${i}]`;
    for (const f of ['title', 'why', 'action']) {
      if (c[f]) yield [`${at}.${f}`, c[f]];
    }
    if (c.verify?.expect) yield [`${at}.verify.expect`, c.verify.expect];
    if (c.verify?.manual) yield [`${at}.verify.manual`, c.verify.manual];
  }
}

export function lintLayer({ path, layer, parseError }) {
  if (parseError) return { errors: [`${path}: not valid JSON (${parseError})`], warnings: [] };
  const errors = [];
  const warnings = [];
  const at = (m) => `${path}: ${m}`;

  errors.push(...lintSchema(layer).map(at));

  for (const [where, value] of proseFields(layer)) {
    errors.push(...lintProse(value, where).map(at));
  }

  for (const c of layer.checks ?? []) {
    const where = `checks[${c.id}]`;
    if (c.verify?.cmd) errors.push(...lintCommand(c.verify.cmd, `${where}.verify.cmd`).map(at));
    if (c.verify?.suggest) {
      errors.push(...lintSuggestedCommand(c.verify.suggest, `${where}.verify.suggest`).map(at));
    }
    for (const [i, url] of (c.references ?? []).entries()) {
      errors.push(...lintReference(url, `${where}.references[${i}]`).map(at));
    }
    if (!c.added) warnings.push(at(`checks[${c.id}] has no 'added' date; CI stamps it at merge`));
  }

  return { errors, warnings };
}

async function main() {
  const args = process.argv.slice(2);
  const entries = loadLayers();

  if (entries.length === 0) {
    console.log('no layer files found under checks/ — nothing to lint');
    return 0;
  }

  const allErrors = [];
  const allWarnings = [];

  for (const entry of entries) {
    const { errors, warnings } = lintLayer(entry);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }

  const valid = entries.filter((e) => e.layer && e.layer.id);
  allErrors.push(...lintStructure(valid));

  const byId = new Map(valid.map((e) => [e.layer.id, e]));
  for (const { layer } of valid) {
    const { errors } = resolve(layer.id, byId);
    allErrors.push(...errors.map((m) => `compose: ${m}`));
  }

  if (args.includes('--check-links')) {
    const seen = new Map();
    for (const { path, layer } of valid) {
      for (const c of layer.checks ?? []) {
        for (const url of c.references ?? []) {
          if (!seen.has(url)) seen.set(url, `${path}: checks[${c.id}]`);
        }
      }
    }
    const { dead, skipped } = await checkAllReachable([...seen]);
    // A host that rate-limited us has told us nothing about the link, so it is
    // a warning. Only rot is an error.
    allErrors.push(...dead);
    allWarnings.push(...skipped);
  }

  if (args.includes('--stamp')) {
    const today = new Date().toISOString().slice(0, 10);
    let stamped = 0;
    for (const entry of valid) {
      let changed = false;
      for (const c of entry.layer.checks) {
        if (!c.added) { c.added = today; changed = true; stamped++; }
      }
      if (changed) writeFileSync(entry.full, `${JSON.stringify(entry.layer, null, 2)}\n`);
    }
    console.log(`stamped 'added' on ${stamped} check(s)`);
    return 0;
  }

  const checkCount = valid.reduce((n, e) => n + (e.layer.checks?.length ?? 0), 0);

  for (const w of allWarnings) console.warn(`warn  ${w}`);
  for (const e of allErrors) console.error(`error ${e}`);

  if (allErrors.length) {
    console.error(`\nlint failed: ${allErrors.length} error(s) across ${entries.length} layer file(s)`);
    return 1;
  }
  console.log(
    `lint passed: ${entries.length} layer file(s), ${checkCount} check(s)` +
    (allWarnings.length ? `, ${allWarnings.length} warning(s)` : ''));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
