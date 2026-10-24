import { Document, isMap, isScalar, isSeq, parseDocument } from 'yaml';

export const yamlOptions = { indent: 2, lineWidth: 90, simpleKeys: true };
const proseFields = new Set(['definition', 'analogy', 'example', 'caveat', 'description']);

export function parseYamlDocument(source, filename = 'YAML') {
  const document = parseDocument(source, {
    version: '1.2',
    schema: 'core',
    uniqueKeys: true,
    stringKeys: true,
    strict: true,
  });
  const problems = [...document.errors, ...document.warnings];
  if (problems.length)
    throw new Error(`${filename}: ${problems.map((problem) => problem.message).join('\n')}`);
  return document;
}

export function parseYaml(source, filename) {
  return parseYamlDocument(source, filename).toJS({ maxAliasCount: 100 });
}

export function readableNode(document, value) {
  const node = document.createNode(value);
  function format(item) {
    if (isMap(item)) {
      for (const pair of item.items) {
        if (
          proseFields.has(pair.key.value) &&
          isScalar(pair.value) &&
          typeof pair.value.value === 'string' &&
          pair.value.value
        ) {
          pair.value.type = 'BLOCK_FOLDED';
        }
        format(pair.value);
      }
    } else if (isSeq(item)) item.items.forEach(format);
  }
  format(node);
  return node;
}

export function stringifyYaml(value) {
  const document = new Document(undefined, { version: '1.2', schema: 'core' });
  document.contents = readableNode(document, value);
  return document.toString(yamlOptions);
}
