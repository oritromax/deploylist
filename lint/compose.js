// Layer composition — implements SPEC.md section 2.3.
//
// A stack's published checklist is the flattened union of its layer chain:
// inherited checks, minus suppressions, plus the layer's own. There are no
// text overrides by design, so every resolved check is byte-identical to the
// check as it was reviewed in the layer that authored it.

import { idToPath, SURFACES } from './paths.js';

const KIND_DEPTH = { universal: 0, language: 1, framework: 2, runtime: 2 };

// Published slices live alongside layer files in the same directory, so a
// framework named "security" would emit dist/php/security.json over the top of
// the php security slice, and a language named "index" would collide with the
// root catalog. These slugs are reserved at every level.
const CATEGORIES = ['security', 'secrets', 'config', 'performance', 'seo',
  'accessibility', 'observability', 'reliability', 'build', 'legal'];
const RESERVED_SLUGS = new Set([...CATEGORIES, ...SURFACES,
  'index', 'critical', 'manifest', 'universal', 'llms']);

/**
 * Structural checks that the JSON Schema cannot express.
 * @param {{id:string,layer:object,path:string}[]} entries
 */
export function lintStructure(entries) {
  const errors = [];
  const byId = new Map(entries.map((e) => [e.layer.id, e]));

  for (const { layer, path } of entries) {
    const at = (m) => `${path}: ${m}`;

    const expected = idToPath(layer.id);
    if (expected !== path) {
      errors.push(at(`id ${layer.id} maps to ${expected}, not this location`));
    }

    const depth = KIND_DEPTH[layer.kind];
    const idParts = layer.id === 'universal' ? 0 : layer.id.split('.').length;
    if (layer.kind === 'universal' && layer.id !== 'universal') {
      errors.push(at('kind universal is only valid for the layer with id universal'));
    } else if (layer.kind === 'surface' && !SURFACES.has(layer.id)) {
      errors.push(at(
        `kind surface is only valid for a declared surface (${[...SURFACES].join(', ')}). ` +
        `Adding one changes where every stack inherits from, so it is a change to lint/paths.js.`));
    } else if (SURFACES.has(layer.id) && layer.kind !== 'surface') {
      errors.push(at(`${layer.id} is a surface, so it cannot also be a ${layer.kind} layer`));
    } else if (depth !== undefined && layer.id !== 'universal' && !SURFACES.has(layer.id)
               && idParts !== depth) {
      errors.push(at(`kind ${layer.kind} expects an id with ${depth} segment(s), got ${layer.id}`));
    }

    // Every check id must be namespaced to the layer that authors it, so a
    // layer cannot mint ids that appear to belong somewhere else.
    for (const check of layer.checks) {
      if (!check.id.startsWith(`${layer.id}.`)) {
        errors.push(at(`check ${check.id} must be prefixed with ${layer.id}.`));
      }
    }
    const seen = new Set();
    for (const check of layer.checks) {
      if (seen.has(check.id)) errors.push(at(`duplicate check id within the layer: ${check.id}`));
      seen.add(check.id);
    }

    const slug = (layer.id === 'universal' || SURFACES.has(layer.id))
      ? null : layer.id.split('.').pop();
    if (slug && RESERVED_SLUGS.has(slug)) {
      errors.push(at(
        `slug ${JSON.stringify(slug)} is reserved: the published surface emits ` +
        `category and severity slices under the same directory, so this layer ` +
        `would overwrite one of them`));
    }

    const ext = layer.extends ?? [];
    if (ext.length && ext[0] !== 'universal') {
      errors.push(at('extends must list universal first when present'));
    }
    if (layer.id !== 'universal' && !ext.includes('universal')) {
      errors.push(at('every layer other than universal must extend universal'));
    }
    if (layer.kind === 'framework') {
      const lang = layer.id.split('.')[0];
      if (!ext.includes(lang)) {
        errors.push(at(`framework layer must extend its language layer ${lang}`));
      }
    }
    for (const parent of ext) {
      if (!byId.has(parent)) errors.push(at(`extends unknown layer ${parent}`));
      if (parent === layer.id) errors.push(at('extends itself'));
    }
  }

  return errors;
}

/**
 * Flatten one layer's chain.
 * @returns {{checks:object[], errors:string[], chain:string[]}}
 */
export function resolve(layerId, byId, stack = []) {
  const errors = [];
  if (stack.includes(layerId)) {
    return { checks: [], errors: [`cycle in extends: ${[...stack, layerId].join(' -> ')}`], chain: [] };
  }
  const entry = byId.get(layerId);
  if (!entry) return { checks: [], errors: [`unknown layer ${layerId}`], chain: [] };
  const layer = entry.layer;

  /** @type {Map<string, {check:object, from:string}>} */
  const inherited = new Map();
  const chain = [];

  for (const parent of layer.extends ?? []) {
    const r = resolve(parent, byId, [...stack, layerId]);
    errors.push(...r.errors);
    for (const c of r.chain) if (!chain.includes(c)) chain.push(c);
    for (const item of r.checks) {
      // A check inherited through two paths (universal via php, and universal
      // directly) is the same object, not a conflict.
      const existing = inherited.get(item.id);
      if (existing && existing.from !== item._from) {
        errors.push(`${layer.id}: check ${item.id} inherited from both ${existing.from} and ${item._from}`);
      }
      inherited.set(item.id, { check: item, from: item._from });
    }
  }
  if (!chain.includes(layerId)) chain.push(layerId);

  const suppressed = new Set();
  for (const s of layer.suppressions ?? []) {
    if (!inherited.has(s.id)) {
      errors.push(
        `${layer.id}: suppression targets ${s.id}, which is not inherited by this layer. ` +
        `A suppression that matches nothing is a silent no-op.`);
      continue;
    }
    if (s.id.startsWith(`${layer.id}.`)) {
      errors.push(`${layer.id}: cannot suppress its own check ${s.id}; remove it instead`);
      continue;
    }
    suppressed.add(s.id);
  }

  const out = [];
  for (const [id, { check }] of inherited) {
    if (!suppressed.has(id)) out.push(check);
  }
  for (const check of layer.checks) {
    if (inherited.has(check.id)) {
      errors.push(`${layer.id}: check ${check.id} collides with an inherited check of the same id`);
      continue;
    }
    out.push({ ...check, _from: layer.id });
  }

  return { checks: out, errors, chain };
}

const SEVERITY_ORDER = { critical: 0, high: 1, recommended: 2, optional: 3 };

export function sortChecks(checks) {
  return [...checks].sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    a.category.localeCompare(b.category) ||
    a.id.localeCompare(b.id));
}

export { SEVERITY_ORDER };
