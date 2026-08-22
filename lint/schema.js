// JSON Schema validation against schema/layer.schema.json.

import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schema = JSON.parse(
  readFileSync(new URL('../schema/layer.schema.json', import.meta.url), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

export function lintSchema(layer) {
  if (validate(layer)) return [];
  return validate.errors.map((e) => {
    const path = e.instancePath || '/';
    const detail = e.params && Object.keys(e.params).length
      ? ` ${JSON.stringify(e.params)}` : '';
    return `${path}: ${e.message}${detail}`;
  });
}
