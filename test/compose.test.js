import test from 'node:test';
import assert from 'node:assert/strict';
import { lintStructure, resolve, sortChecks } from '../lint/compose.js';

const layer = (over) => ({
  path: 'checks/x.json', layer: { schema_version: 1, name: 'X', checks: [], ...over },
});
const universal = layer({ id: 'universal', kind: 'universal', checks: [{ id: 'universal.a', severity: 'critical', category: 'security' }] });
universal.path = 'checks/universal.json';
const php = layer({ id: 'php', kind: 'language', extends: ['universal'], checks: [{ id: 'php.b', severity: 'high', category: 'config' }] });
php.path = 'checks/php/index.json';

const entries = (...extra) => [universal, php, ...extra];
const errorsFor = (...extra) => lintStructure(entries(...extra));

test('resolves a chain into a flat list', () => {
  const sym = layer({ id: 'php.symfony', kind: 'framework', extends: ['universal', 'php'], checks: [{ id: 'php.symfony.c', severity: 'high', category: 'config' }] });
  sym.path = 'checks/php/symfony.json';
  const byId = new Map(entries(sym).map((e) => [e.layer.id, e]));
  const { checks, errors, chain } = resolve('php.symfony', byId);
  assert.deepEqual(errors, []);
  assert.deepEqual(chain, ['universal', 'php', 'php.symfony']);
  assert.deepEqual(checks.map((c) => c.id).sort(), ['php.b', 'php.symfony.c', 'universal.a']);
});

test('a suppression removes an inherited check', () => {
  const sym = layer({
    id: 'php.symfony', kind: 'framework', extends: ['universal', 'php'],
    suppressions: [{ id: 'universal.a', reason: 'Replaced by a framework specific check below.' }],
    checks: [{ id: 'php.symfony.c', severity: 'high', category: 'config' }],
  });
  sym.path = 'checks/php/symfony.json';
  const byId = new Map(entries(sym).map((e) => [e.layer.id, e]));
  const { checks, errors } = resolve('php.symfony', byId);
  assert.deepEqual(errors, []);
  assert.ok(!checks.some((c) => c.id === 'universal.a'));
});

test('a suppression that matches nothing is an error, not a silent no-op', () => {
  const sym = layer({
    id: 'php.symfony', kind: 'framework', extends: ['universal', 'php'],
    suppressions: [{ id: 'universal.does-not-exist', reason: 'Typo that would otherwise pass silently.' }],
    checks: [{ id: 'php.symfony.c' }],
  });
  sym.path = 'checks/php/symfony.json';
  const byId = new Map(entries(sym).map((e) => [e.layer.id, e]));
  const { errors } = resolve('php.symfony', byId);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not inherited/);
});

test('check ids must be namespaced to their authoring layer', () => {
  const bad = layer({ id: 'php.symfony', kind: 'framework', extends: ['universal', 'php'], checks: [{ id: 'universal.impersonated' }] });
  bad.path = 'checks/php/symfony.json';
  assert.ok(errorsFor(bad).some((e) => /must be prefixed with php\.symfony\./.test(e)));
});

test('id must match file location', () => {
  const bad = layer({ id: 'php.symfony', kind: 'framework', extends: ['universal', 'php'], checks: [{ id: 'php.symfony.a' }] });
  bad.path = 'checks/javascript/symfony.json';
  assert.ok(errorsFor(bad).some((e) => /maps to checks\/php\/symfony\.json/.test(e)));
});

test('reserved slugs that would overwrite a published slice are rejected', () => {
  for (const slug of ['security', 'critical', 'index', 'legal']) {
    const bad = layer({ id: `php.${slug}`, kind: 'framework', extends: ['universal', 'php'], checks: [{ id: `php.${slug}.a` }] });
    bad.path = `checks/php/${slug}.json`;
    assert.ok(errorsFor(bad).some((e) => /reserved/.test(e)), `${slug} should be reserved`);
  }
});

test('a framework must extend its own language, and universal comes first', () => {
  const orphan = layer({ id: 'php.symfony', kind: 'framework', extends: ['universal'], checks: [{ id: 'php.symfony.a' }] });
  orphan.path = 'checks/php/symfony.json';
  assert.ok(errorsFor(orphan).some((e) => /must extend its language layer php/.test(e)));

  const misordered = layer({ id: 'php.symfony', kind: 'framework', extends: ['php', 'universal'], checks: [{ id: 'php.symfony.a' }] });
  misordered.path = 'checks/php/symfony.json';
  assert.ok(errorsFor(misordered).some((e) => /universal first/.test(e)));
});

test('a cycle in extends terminates instead of hanging', () => {
  const a = layer({ id: 'a', kind: 'language', extends: ['universal', 'b'], checks: [] });
  const b = layer({ id: 'b', kind: 'language', extends: ['universal', 'a'], checks: [] });
  const byId = new Map([[universal.layer.id, universal], ['a', a], ['b', b]]);
  const { errors } = resolve('a', byId);
  assert.ok(errors.some((e) => /cycle in extends/.test(e)));
});

test('sorts by severity, then category, then id', () => {
  const sorted = sortChecks([
    { id: 'z', severity: 'optional', category: 'seo' },
    { id: 'a', severity: 'critical', category: 'secrets' },
    { id: 'm', severity: 'critical', category: 'config' },
  ]);
  assert.deepEqual(sorted.map((c) => c.id), ['m', 'a', 'z']);
});
