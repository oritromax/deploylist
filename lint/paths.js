// Mapping between a layer id and its file path. SPEC.md section 2.2.
//
//   universal          -> checks/universal.json
//   web                -> checks/web.json
//   php                -> checks/php/index.json
//   php.symfony        -> checks/php/symfony.json

// Surfaces are what a project *is*, cutting across what it is written in: a web
// application, and in time a CLI, a mobile app, a library. They live beside
// universal as bare files, because a surface is not a language and must not
// occupy a language's directory.
//
// A surface layer is a structural decision, so the list is explicit and lives
// on a CODEOWNERS-protected path rather than being inferred from the tree.
export const SURFACES = new Set(['web']);

export function idToPath(id) {
  if (id === 'universal') return 'checks/universal.json';
  if (SURFACES.has(id)) return `checks/${id}.json`;
  const parts = id.split('.');
  if (parts.length === 1) return `checks/${parts[0]}/index.json`;
  if (parts.length === 2) return `checks/${parts[0]}/${parts[1]}.json`;
  return null;
}

export function pathToId(relPath) {
  const p = relPath.replace(/\\/g, '/').replace(/^checks\//, '');
  if (p === 'universal.json') return 'universal';
  const bare = p.match(/^([a-z0-9-]+)\.json$/);
  if (bare) return bare[1];
  const m = p.match(/^([a-z0-9-]+)\/([a-z0-9-]+)\.json$/);
  if (!m) return null;
  return m[2] === 'index' ? m[1] : `${m[1]}.${m[2]}`;
}

/** Published URL stem for a layer. SPEC.md section 4. */
export function idToUrlStem(id) {
  return id === 'universal' ? 'universal' : id.split('.').join('/');
}
