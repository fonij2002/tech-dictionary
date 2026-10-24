import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Document, isSeq } from 'yaml';
import { root, loadDataset } from './dataset.mjs';
import { parseYamlDocument, readableNode, yamlOptions } from './yaml.mjs';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (!['--id', '--term', '--category', '--level', '--help'].includes(args[i]))
    throw new Error(`Unknown argument: ${args[i]}`);
  if (args[i] === '--help') {
    options.help = true;
    continue;
  }
  const key = args[i].slice(2);
  const value = args[++i];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
  options[key] = value;
}
if (options.help || !options.id || !options.term || !options.category) {
  console.log(
    'npm run new-term -- --id your-term --term "Your term" --category programming [--level beginner]',
  );
  process.exit(options.help ? 0 : 1);
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.id))
  throw new Error('ID must be a lowercase kebab-case slug');
const { categories, terms } = await loadDataset();
if (!categories.some((c) => c.id === options.category)) throw new Error('Unknown category');
if (terms.some((t) => t.id === options.id || t.term.toLowerCase() === options.term.toLowerCase()))
  throw new Error('That term or ID already exists');
if (!['beginner', 'intermediate', 'advanced'].includes(options.level ?? 'beginner'))
  throw new Error('Unknown level');
const file = path.join(root, 'data/terms', `${options.category}.yaml`);
const document = await readFile(file, 'utf8')
  .then((source) => parseYamlDocument(source, file))
  .catch((error) => {
    if (error.code === 'ENOENT') return new Document([]);
    throw error;
  });
if (!isSeq(document.contents)) throw new Error(`${file}: expected a YAML sequence`);
document.contents.add(
  readableNode(document, {
    id: options.id,
    term: options.term.trim(),
    aliases: [],
    category: options.category,
    level: options.level ?? 'beginner',
    tags: [options.category],
    definition: '',
    analogy: '',
    example: '',
    caveat: '',
    related: [],
    sources: [],
  }),
);
// Append without reordering existing nodes, so their comments and styles survive.
await writeFile(file, document.toString(yamlOptions));
console.log(
  `Created a draft in data/terms/${options.category}.yaml. Fill in the definition, analogy, example, and sources before running npm run check.`,
);
