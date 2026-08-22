import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lintSchema } from '../lint/schema.js';

const base = () => JSON.parse(readFileSync(new URL('../checks/php/symfony.json', import.meta.url), 'utf8'));
const check = (layer, n = 0) => layer.checks[n];
const rejects = (name, mutate) => {
  const layer = base();
  mutate(layer);
  assert.ok(lintSchema(layer).length > 0, `schema should reject: ${name}`);
};

test('the seeded layers are valid', () => {
  for (const f of ['universal.json', 'php/index.json', 'php/symfony.json']) {
    const layer = JSON.parse(readFileSync(new URL(`../checks/${f}`, import.meta.url), 'utf8'));
    assert.deepEqual(lintSchema(layer), [], `${f} should be valid`);
  }
});

test('enforces the subjectivity rule in both directions', () => {
  rejects('subjective check above optional severity', (l) => {
    const c = l.checks.find((x) => x.subjective);
    c.severity = 'high';
  });
  rejects('objective check with no verify', (l) => { delete check(l).verify; });
});

test('rejects a check that opts out of the vocabulary', () => {
  rejects('unknown category', (l) => { check(l).category = 'devops'; });
  rejects('unknown severity', (l) => { check(l).severity = 'blocker'; });
  rejects('malformed id', (l) => { check(l).id = 'PHP.Symfony.App_Debug'; });
});

test('rejects fields that would widen the attack surface', () => {
  rejects('unknown extra field', (l) => { check(l).mutates = true; });
  rejects('verify with both cmd and manual', (l) => { check(l).verify.manual = 'also by hand'; });
  rejects('non-https reference', (l) => { check(l).references = ['http://symfony.com/x']; });
  rejects('why beyond the length cap', (l) => { check(l).why = 'x'.repeat(301); });
  rejects('url smuggled into prose', (l) => { check(l).why = 'See https://evil.example for details.'; });
});

test('rejects a suppression that is not justified', () => {
  rejects('suppression with no reason', (l) => { delete l.suppressions[0].reason; });
  rejects('suppression reason too short to be a justification', (l) => { l.suppressions[0].reason = 'because'; });
});

test('verify accepts exactly one of cmd, suggest or manual', () => {
  const withVerify = (v) => {
    const layer = base();
    layer.checks[0].verify = v;
    return lintSchema(layer);
  };
  assert.deepEqual(withVerify({ cmd: 'ls', expect: 'a file is listed' }), []);
  assert.deepEqual(withVerify({ suggest: 'php bin/console about', expect: 'the environment is prod' }), []);
  assert.deepEqual(withVerify({ manual: 'Open the site and look at the error page.' }), []);
  assert.ok(withVerify({ suggest: 'php bin/console about' }).length > 0, 'suggest requires expect');
  assert.ok(withVerify({ cmd: 'ls', suggest: 'php bin/console about', expect: 'x' }).length > 0, 'cmd and suggest are mutually exclusive');
});
