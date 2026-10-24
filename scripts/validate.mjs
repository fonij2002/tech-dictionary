import { pathToFileURL } from 'node:url';
import { loadDataset, json, root } from './dataset.mjs';
import path from 'node:path';

// A small dependency-free validator for the deliberately limited JSON Schema vocabulary we use.
export function validateValue(value, schema, location = '$') {
  const errors = [];
  const error = (message) => errors.push(`${location}: ${message}`);
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (schema.type && schema.type !== type) {
    error(`expected ${schema.type}, got ${type}`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value))
    error(`must be one of ${schema.enum.join(', ')}`);
  if (type === 'string') {
    if (value !== value.trim()) error('remove leading/trailing whitespace');
    if (schema.minLength && value.length < schema.minLength)
      error(`must be at least ${schema.minLength} characters`);
    if (schema.maxLength && value.length > schema.maxLength)
      error(`must be at most ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      error(`must match ${schema.pattern}`);
    if (schema.format === 'uri') {
      try {
        const url = new URL(value);
        if (!url.hostname || url.username || url.password)
          error('must be a public URL without credentials');
      } catch {
        error('must be a valid absolute URL');
      }
    }
  }
  if (type === 'array') {
    if (schema.minItems && value.length < schema.minItems)
      error(`needs at least ${schema.minItems} item(s)`);
    if (schema.uniqueItems && new Set(value.map((x) => JSON.stringify(x))).size !== value.length)
      error('items must be unique');
    if (schema.items)
      value.forEach((item, i) =>
        errors.push(...validateValue(item, schema.items, `${location}[${i}]`)),
      );
  }
  if (type === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) error(`missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key])
        errors.push(...validateValue(item, schema.properties[key], `${location}.${key}`));
      else if (schema.additionalProperties === false) error(`unknown field ${key}`);
    }
  }
  return errors;
}

/** @param {Awaited<ReturnType<typeof loadDataset>> | null} [dataset] */
export async function validateDataset(dataset = null) {
  const { categories, terms, entries } = dataset ?? (await loadDataset());
  const schema = await json(path.join(root, 'data/term.schema.json'));
  const errors = [];
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const categoryIds = new Set();
  const colors = new Set(['teal', 'blue', 'purple', 'amber', 'pink']);
  if (!Array.isArray(categories) || !categories.length)
    return ['categories.yaml must be a nonempty array'];
  for (const category of categories) {
    if (!category || typeof category !== 'object' || Array.isArray(category)) {
      errors.push('invalid category record');
      continue;
    }
    if (!slug.test(category.id ?? '')) errors.push(`invalid category ID: ${category.id}`);
    if (categoryIds.has(category.id)) errors.push(`duplicate category: ${category.id}`);
    categoryIds.add(category.id);
    for (const key of ['name', 'shortName', 'description'])
      if (typeof category[key] !== 'string' || !category[key].trim())
        errors.push(`${category.id}: missing ${key}`);
    if (!colors.has(category.color)) errors.push(`${category.id}: unsupported color`);
  }
  const ids = new Set();
  const names = new Set();
  for (const { file, value } of entries) {
    if (!Array.isArray(value)) {
      errors.push(`${file}: must be an array`);
      continue;
    }
    if (!categoryIds.has(file.replace(/\.yaml$/, ''))) errors.push(`${file}: no matching category`);
    for (const term of value) {
      errors.push(...validateValue(term, schema, `${file}/${term?.id ?? '?'}`));
      if (!term || typeof term !== 'object' || Array.isArray(term)) continue;
      if (ids.has(term.id)) errors.push(`duplicate ID: ${term.id}`);
      ids.add(term.id);
      const normalized = typeof term.term === 'string' ? term.term.toLocaleLowerCase('en') : '';
      if (names.has(normalized)) errors.push(`duplicate display term: ${term.term}`);
      names.add(normalized);
      if (!categoryIds.has(term.category)) errors.push(`${term.id}: unknown category`);
      if (term.category !== file.replace(/\.yaml$/, ''))
        errors.push(`${term.id}: belongs in ${term.category}.yaml`);
    }
  }
  for (const term of terms) {
    if (!Array.isArray(term?.related)) continue;
    for (const related of term.related) {
      if (!ids.has(related)) errors.push(`${term.id}: unknown related term ${related}`);
      if (term.id === related) errors.push(`${term.id}: cannot relate to itself`);
    }
  }
  if (!terms.length) errors.push('the dictionary must contain terms');
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const errors = await validateDataset();
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      const { terms, categories } = await loadDataset();
      console.log(`Validated ${terms.length} terms in ${categories.length} categories.`);
    }
  } catch (error) {
    console.error(`Validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
