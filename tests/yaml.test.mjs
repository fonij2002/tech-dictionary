import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
  copyFile,
  symlink,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { root } from '../scripts/dataset.mjs';
import { parseYaml, stringifyYaml } from '../scripts/yaml.mjs';
import { migrateDataset } from '../scripts/migrate-yaml.mjs';

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(root, 'yaml-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'terms'));
  return directory;
}

test('YAML serialization preserves prose, Unicode, and strings that resemble other types', () => {
  const values = [
    {
      id: '123',
      term: 'true',
      aliases: ['null', '2026-10-08', '001', 'No', 'C#', 'a: b'],
      definition: 'Line one.\nLine two.\n\nA new paragraph.',
      analogy: 'فارسی و English: a # symbol.',
      example: '  leading spaces',
      caveat: '',
      nested: { active: false, count: 0, missing: null },
      sources: [],
    },
  ];
  const source = stringifyYaml(values);
  assert.deepEqual(parseYaml(source), values);
  assert.match(source, /definition: >-/);
});

test('YAML parsing reports duplicate keys, invalid indentation, and unknown tags with a filename', () => {
  for (const source of ['id: api\nid: other\n', 'item:\n\tname: bad\n', 'item: !unknown value\n']) {
    assert.throws(() => parseYaml(source, 'broken.yaml'), /broken\.yaml:/);
  }
});

test('migration verifies content, retains JSON by default, and supports explicit cleanup and reruns', async (t) => {
  const directory = await temporaryDirectory(t);
  const categories = [{ id: 'web', name: 'Web' }],
    terms = [{ id: 'api', definition: 'A: message # safely preserved.' }];
  await writeFile(path.join(directory, 'categories.json'), JSON.stringify(categories));
  await writeFile(path.join(directory, 'terms/web.json'), JSON.stringify(terms));
  await writeFile(path.join(directory, 'term.schema.json'), '{}');
  assert.equal(await migrateDataset(directory), 2);
  await access(path.join(directory, 'terms/web.json'));
  assert.deepEqual(
    parseYaml(await readFile(path.join(directory, 'terms/web.yaml'), 'utf8')),
    terms,
  );
  assert.equal(await migrateDataset(directory, { removeJSON: true }), 2);
  await assert.rejects(access(path.join(directory, 'terms/web.json')), { code: 'ENOENT' });
  await access(path.join(directory, 'term.schema.json'));
  assert.equal(await migrateDataset(directory, { removeJSON: true }), 0);
});

test('migration refuses conflicting YAML before writing or deleting any source file', async (t) => {
  const directory = await temporaryDirectory(t);
  await writeFile(path.join(directory, 'categories.json'), '[{"id":"web"}]');
  await writeFile(path.join(directory, 'categories.yaml'), '- id: edited\n');
  await writeFile(path.join(directory, 'terms/web.json'), '[]');
  await assert.rejects(migrateDataset(directory, { removeJSON: true }), /different content/);
  await access(path.join(directory, 'categories.json'));
  await access(path.join(directory, 'terms/web.json'));
  await assert.rejects(access(path.join(directory, 'terms/web.yaml')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(directory, 'categories.yaml'), 'utf8'), '- id: edited\n');
});

test('new-term writes a YAML draft while preserving existing comments and data', async (t) => {
  const directory = await temporaryDirectory(t);
  await mkdir(path.join(directory, 'scripts'));
  await mkdir(path.join(directory, 'data'));
  await mkdir(path.join(directory, 'data/terms'));
  for (const file of ['new-term.mjs', 'dataset.mjs', 'yaml.mjs'])
    await copyFile(path.join(root, 'scripts', file), path.join(directory, 'scripts', file));
  await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  await writeFile(path.join(directory, 'data/categories.yaml'), '- id: web\n');
  const source =
    '# Keep this topic note.\n- id: api # Keep this inline note.\n  term: API\n  category: web\n  definition: >-\n    An existing definition.\n';
  await writeFile(path.join(directory, 'data/terms/web.yaml'), source);
  const before = parseYaml(source)[0];
  await promisify(execFile)(process.execPath, [
    path.join(directory, 'scripts/new-term.mjs'),
    '--id',
    'web-test',
    '--term',
    'Web test',
    '--category',
    'web',
  ]);
  const updated = await readFile(path.join(directory, 'data/terms/web.yaml'), 'utf8');
  const values = parseYaml(updated);
  assert.ok(
    updated.includes('# Keep this topic note.') && updated.includes('# Keep this inline note.'),
  );
  assert.deepEqual(values[0], before);
  assert.equal(values[1].id, 'web-test');
  assert.equal(values[1].definition, '');
  assert.deepEqual(values[1].sources, []);
});
