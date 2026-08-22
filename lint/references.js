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

/** Optional, network-dependent. Run in CI with --check-links, not on every local lint. */
export async function checkReachable(url, where) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [`${where}: returned HTTP ${res.status}`];
    return [];
  } catch (e) {
    return [`${where}: unreachable (${e.message})`];
  }
}

export const _internals = { allowlist, SHORTENERS };
