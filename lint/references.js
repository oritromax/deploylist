// Reference lint — implements docs/security-model.md section 5.

import { readFileSync } from 'node:fs';

const allowlist = new Set(
  JSON.parse(readFileSync(new URL('../schema/reference-domains.json', import.meta.url), 'utf8')).domains);

/** Redirectors can point anywhere after review. Permanently banned. */
const SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'buff.ly', 'is.gd',
  'rebrand.ly', 'lnkd.in', 'shorturl.at', 'cutt.ly', 'rb.gy',
];

export function lintReference(url, where) {
  const errors = [];
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [`${where}: is not a valid URL`];
  }
  if (parsed.protocol !== 'https:') errors.push(`${where}: must use https`);
  if (SHORTENERS.includes(parsed.hostname)) {
    errors.push(`${where}: uses a URL shortener, which is permanently banned`);
  } else if (!allowlist.has(parsed.hostname)) {
    errors.push(
      `${where}: host ${parsed.hostname} is not in schema/reference-domains.json. ` +
      `Adding a domain is a separate pull request reviewed by CODEOWNERS.`);
  }
  if (parsed.username || parsed.password) errors.push(`${where}: embeds credentials`);
  return errors;
}

// Identify ourselves. Node's fetch sends no User-Agent, which some
// documentation hosts treat as worth throttling.
const UA = 'deploylist-linkcheck/1 (+https://deploy-list.com)';

// One host answers one request at a time; this many hosts run at once.
const HOST_CONCURRENCY = 6;

/**
 * Optional, network-dependent. Run from the links workflow, not the gate.
 *
 * Returns one of:
 *   { state: 'ok' }
 *   { state: 'dead',    message }  the reference has rotted
 *   { state: 'skipped', message }  the host declined to answer right now
 */
export async function checkReachable(url, where) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    // A rate limit is the host declining to answer, which is not evidence the
    // link is dead. Calling it an error trains everyone to ignore the report,
    // and an ignored report is how real rot gets through.
    if (res.status === 429 || res.status === 503) {
      return { state: 'skipped', message: `${where}: rate limited (HTTP ${res.status})` };
    }
    if (!res.ok) return { state: 'dead', message: `${where}: returned HTTP ${res.status}` };
    return { state: 'ok' };
  } catch (e) {
    return { state: 'dead', message: `${where}: unreachable (${e.message})` };
  }
}

/**
 * Check many references without hammering any single host. Firing every URL at
 * once is what produced the rate limits this now avoids: requests to one host
 * run in series, and only HOST_CONCURRENCY hosts are in flight together.
 */
export async function checkAllReachable(entries) {
  const byHost = new Map();
  for (const [url, where] of entries) {
    const host = new URL(url).hostname;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push([url, where]);
  }

  const groups = [...byHost.values()];
  const dead = [];
  const skipped = [];
  let next = 0;

  const worker = async () => {
    while (next < groups.length) {
      for (const [url, where] of groups[next++]) {
        const result = await checkReachable(url, `${where} ${url}`);
        if (result.state === 'dead') dead.push(result.message);
        else if (result.state === 'skipped') skipped.push(result.message);
      }
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(HOST_CONCURRENCY, groups.length) }, worker));
  return { dead, skipped };
}

export const _internals = { allowlist, SHORTENERS };
