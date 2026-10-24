import { getCollection } from 'astro:content';
import { collator } from './search';
import type { DictionaryDataset } from '../../data/types';
import source from '../../data/categories.yaml?raw';
import { parseYaml } from '../../scripts/yaml.mjs';

const sourceCategories = parseYaml(source, 'data/categories.yaml') as { id: string }[];

export async function getDictionary(): Promise<DictionaryDataset> {
  const [termEntries, categoryEntries] = await Promise.all([
    getCollection('terms'),
    getCollection('categories'),
  ]);
  const order = new Map(
    (sourceCategories as { id: string }[]).map((category, i) => [category.id, i]),
  );
  return {
    schemaVersion: '1.0.0',
    language: 'en',
    attribution: 'Tech Dictionary contributors',
    license: { spdx: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    categories: categoryEntries
      .map((entry) => entry.data)
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!),
    terms: termEntries.map((entry) => entry.data).sort((a, b) => collator.compare(a.term, b.term)),
  };
}
