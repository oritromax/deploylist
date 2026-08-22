import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReachable, checkAllReachable } from '../lint/references.js';

/** Swap in a fake fetch for the duration of one test. */
async function withFetch(fake, body) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await body(); } finally { globalThis.fetch = real; }
}

test('a rate limit is skipped, not called dead', async () => {
  for (const status of [429, 503]) {
    const result = await withFetch(
      async () => new Response(null, { status }),
      () => checkReachable('https://example.com/a', 'where'));
    assert.equal(result.state, 'skipped', `HTTP ${status} must not read as rot`);
  }
});

test('a reference that has actually rotted is dead', async () => {
  const gone = await withFetch(
    async () => new Response(null, { status: 404 }),
    () => checkReachable('https://example.com/a', 'where'));
  assert.equal(gone.state, 'dead');

  const unreachable = await withFetch(
    async () => { throw new Error('getaddrinfo ENOTFOUND'); },
    () => checkReachable('https://example.com/a', 'where'));
  assert.equal(unreachable.state, 'dead');
});

test('a reference that resolves is ok, and identifies itself', async () => {
  let sent;
  const result = await withFetch(
    async (_url, init) => { sent = init; return new Response(null, { status: 200 }); },
    () => checkReachable('https://example.com/a', 'where'));
  assert.equal(result.state, 'ok');
  assert.equal(sent.method, 'HEAD');
  assert.match(sent.headers['user-agent'], /deploylist/);
});

test('one host is never asked two things at once', async () => {
  const inFlight = new Map();
  let worst = 0;

  await withFetch(async (url) => {
    const host = new URL(url).hostname;
    const now = (inFlight.get(host) ?? 0) + 1;
    inFlight.set(host, now);
    worst = Math.max(worst, now);
    await new Promise((r) => setTimeout(r, 5));
    inFlight.set(host, now - 1);
    return new Response(null, { status: 200 });
  }, async () => {
    // Ten URLs on one host is the shape that got us rate limited for real.
    const entries = Array.from({ length: 10 },
      (_, i) => [`https://docs.example.com/${i}`, `ref ${i}`]);
    entries.push(['https://other.example.com/x', 'ref other']);
    const { dead, skipped } = await checkAllReachable(entries);
    assert.deepEqual(dead, []);
    assert.deepEqual(skipped, []);
  });

  assert.equal(worst, 1, 'requests to one host must run in series');
});

test('rot and rate limits are reported separately', async () => {
  await withFetch(async (url) => {
    if (url.includes('/gone')) return new Response(null, { status: 404 });
    if (url.includes('/busy')) return new Response(null, { status: 429 });
    return new Response(null, { status: 200 });
  }, async () => {
    const { dead, skipped } = await checkAllReachable([
      ['https://a.example.com/gone', 'ref a'],
      ['https://b.example.com/busy', 'ref b'],
      ['https://c.example.com/fine', 'ref c'],
    ]);
    assert.equal(dead.length, 1);
    assert.match(dead[0], /404/);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0], /rate limited/);
  });
});
