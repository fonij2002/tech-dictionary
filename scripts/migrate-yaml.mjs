import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { root } from './dataset.mjs';
import { parseYaml, stringifyYaml } from './yaml.mjs';

async function readIfPresent(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Validate every conversion before writing; remove originals only after verifying
// all written YAML files. Existing, edited YAML files are never overwritten.
export async function migrateDataset(
  directory = path.join(root, 'data'),
  { removeJSON = false } = {},
) {
  const termFiles = (await readdir(path.join(directory, 'terms')))
    .filter((file) => file.endsWith('.json'))
    .sort();
  const files = ['categories.json', ...termFiles.map((file) => `terms/${file}`)];
  const pending = [];
  for (const relative of files) {
    const source = path.join(directory, relative);
    const text = await readIfPresent(source);
    if (text === null) continue;
    const value = JSON.parse(text);
    if (!Array.isArray(value)) throw new Error(`${relative}: expected an array`);
    const target = source.replace(/\.json$/, '.yaml');
    const yaml = stringifyYaml(value);
    if (!isDeepStrictEqual(parseYaml(yaml, target), value))
      throw new Error(`${relative}: conversion would change the data`);
    const existing = await readIfPresent(target);
    if (existing !== null && !isDeepStrictEqual(parseYaml(existing, target), value)) {
      throw new Error(
        `${target} already exists with different content. Resolve it before migrating.`,
      );
    }
    pending.push({ source, target, yaml, value, exists: existing !== null });
  }
  for (const item of pending)
    if (!item.exists) await writeFile(item.target, item.yaml, { flag: 'wx' });
  for (const item of pending) {
    if (
      !isDeepStrictEqual(parseYaml(await readFile(item.target, 'utf8'), item.target), item.value)
    ) {
      throw new Error(`${item.target}: verification failed; original JSON files were retained`);
    }
  }
  if (removeJSON) for (const item of pending) await unlink(item.source);
  return pending.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== '--remove-json'))
      throw new Error('Usage: npm run migrate:yaml -- [--remove-json]');
    const removeJSON = args.includes('--remove-json');
    const count = await migrateDataset(undefined, { removeJSON });
    console.log(
      count
        ? `Converted and verified ${count} source files.${removeJSON ? ' Original JSON source files removed.' : ' Original JSON source files retained; use --remove-json to remove verified originals.'}`
        : 'No JSON source files remain to migrate.',
    );
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  }
}
