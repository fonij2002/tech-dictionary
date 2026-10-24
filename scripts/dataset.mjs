import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseYaml } from './yaml.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
export const yaml = async (file) => parseYaml(await readFile(file, 'utf8'), file);

/**
 * @returns {Promise<{
 *   categories: import('../data/types').DictionaryCategory[],
 *   terms: import('../data/types').DictionaryTerm[],
 *   entries: {file: string, value: any}[]
 * }>}
 */
export async function loadDataset() {
  const categories = await yaml(path.join(root, 'data/categories.yaml'));
  const files = (await readdir(path.join(root, 'data/terms')))
    .filter((f) => f.endsWith('.yaml'))
    .sort();
  const terms = [];
  const entries = [];
  for (const file of files) {
    const value = await yaml(path.join(root, 'data/terms', file));
    entries.push({ file, value });
    if (Array.isArray(value)) terms.push(...value);
  }
  terms.sort((a, b) => String(a.term).localeCompare(String(b.term), 'en'));
  return { categories, terms, entries };
}

export const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );
