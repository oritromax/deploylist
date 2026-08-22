// Mapping between a layer id and its file path. SPEC.md section 2.2.
//
//   universal          -> checks/universal.json
//   php                -> checks/php/index.json
//   php.symfony        -> checks/php/symfony.json

export function idToPath(id) {
  if (id === 'universal') return 'checks/universal.json';
  const parts = id.split('.');
  if (parts.length === 1) return `checks/${parts[0]}/index.json`;
  if (parts.length === 2) return `checks/${parts[0]}/${parts[1]}.json`;
  return null;
}

export function pathToId(relPath) {
  const p = relPath.replace(/\\/g, '/').replace(/^checks\//, '');
  if (p === 'universal.json') return 'universal';
  const m = p.match(/^([a-z0-9-]+)\/([a-z0-9-]+)\.json$/);
  if (!m) return null;
  return m[2] === 'index' ? m[1] : `${m[1]}.${m[2]}`;
}

/** Published URL stem for a layer. SPEC.md section 4. */
export function idToUrlStem(id) {
  return id === 'universal' ? 'universal' : id.split('.').join('/');
}
