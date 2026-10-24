import type { Loader } from 'astro/loaders';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../../scripts/dataset.mjs';
import { validateDataset } from '../../scripts/validate.mjs';

// Retain the existing category-based YAML files and stable IDs. Both collections
// use the same source validation, including cross-file related-term checks.
export function dictionaryLoader(kind: 'terms' | 'categories'): Loader {
  return {
    name: `dictionary-${kind}`,
    async load({ store, parseData, watcher, config, logger }) {
      const directory = fileURLToPath(new URL('data/', config.root));
      async function sync() {
        const dataset = await loadDataset();
        const errors = await validateDataset(dataset);
        if (errors.length) throw new Error(errors.join('\n'));
        const records = await Promise.all(
          dataset[kind].map(async (entry) => ({
            id: entry.id,
            data: await parseData({ id: entry.id, data: { ...entry } }),
            filePath:
              'category' in entry ? `data/terms/${entry.category}.yaml` : 'data/categories.yaml',
          })),
        );
        store.clear();
        for (const record of records) store.set(record);
      }
      await sync();
      if (watcher) {
        watcher.add(directory);
        const refresh = (file: string) => {
          if (file.startsWith(directory) && file.endsWith('.yaml')) {
            sync().catch((error: Error) => logger.error(error.message));
          }
        };
        watcher.on('add', refresh).on('change', refresh).on('unlink', refresh);
      }
    },
  };
}
