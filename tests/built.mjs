// Exercise Astro's actual generated HTML and bundled client modules without a
// browser or preview server. Layout still needs a real-browser visual check.
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import { root, loadDataset } from '../scripts/dataset.mjs';

const directory = path.join(root, 'dist');
const original = await loadDataset();
const expectedCount = original.terms.length;
const html = await readFile(path.join(directory, 'index.html'), 'utf8');
const initial = new JSDOM(html);
const homeURL = new URL(initial.window.document.querySelector('link[rel="canonical"]').href);
const base = homeURL.pathname;
assert.equal(
  initial.window.document.querySelectorAll('#term-grid > a[data-term]').length,
  expectedCount,
);
assert.equal(
  initial.window.document.querySelector('.sidebar-title').textContent.trim(),
  'Find your corner',
);
assert.ok(initial.window.document.querySelector('#word-of-day'));
initial.window.close();

async function localFile(url) {
  assert.equal(url.origin, homeURL.origin);
  assert.ok(url.pathname.startsWith(base), `Link escaped site base: ${url}`);
  const file = path.resolve(directory, decodeURIComponent(url.pathname.slice(base.length)));
  assert.ok(file === directory || file.startsWith(directory + path.sep));
  return (await stat(file)).isDirectory() ? path.join(file, 'index.html') : file;
}
async function htmlFiles(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? htmlFiles(path.join(folder, entry.name))
        : entry.name.endsWith('.html')
          ? [path.join(folder, entry.name)]
          : [],
    ),
  );
  return nested.flat();
}
const pages = await htmlFiles(directory);
for (const file of pages) {
  const source = await readFile(file, 'utf8');
  const relative = path.relative(directory, file).replaceAll(path.sep, '/');
  const pageURL = new URL(relative.replace(/index\.html$/, ''), homeURL);
  for (const match of source.matchAll(/<(a|script|link)\b[^>]*>/g)) {
    const tag = match[0];
    if (/rel="canonical"/.test(tag)) continue;
    const attribute = /(?:href|src)="([^"]*)"/.exec(tag)?.[1];
    if (!attribute || attribute.startsWith('#')) continue;
    const url = new URL(attribute.replaceAll('&amp;', '&'), pageURL);
    if (url.origin !== homeURL.origin) continue;
    await localFile(url);
  }
}
const exported = JSON.parse(await readFile(path.join(directory, 'data/v1/terms.json'), 'utf8'));
assert.deepEqual(exported.categories, original.categories);
assert.deepEqual(
  [...exported.terms].sort((a, b) => a.id.localeCompare(b.id)),
  [...original.terms].sort((a, b) => a.id.localeCompare(b.id)),
);
assert.equal(
  pages.filter((file) => file.includes(`${path.sep}terms${path.sep}`)).length,
  expectedCount,
);
const apiHTML = await readFile(path.join(directory, 'terms/api/index.html'), 'utf8');
assert.ok(apiHTML.includes('/edit/master/data/terms/web.yaml'));
const apiDOM = new JSDOM(apiHTML);
assert.equal(apiDOM.window.document.querySelectorAll('h1').length, 1);
assert.equal(
  JSON.parse(
    apiDOM.window.document.querySelector('script[type="application/ld+json"]').textContent,
  )['@type'],
  'DefinedTerm',
);
apiDOM.window.close();

async function setup({ failFirst = false, source = html, url = homeURL } = {}) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', (error) => {
    if (!error.message.includes('navigation')) errors.push(error);
  });
  const dom = new JSDOM(source, {
    url: url.href,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  const window = dom.window;
  let calls = 0;
  window.fetch = async (input) => {
    if (failFirst && calls++ === 0) return { ok: false };
    const target = new URL(String(input), url);
    return {
      ok: true,
      json: async () => JSON.parse(await readFile(await localFile(target), 'utf8')),
    };
  };
  const modules = new Map();
  const context = dom.getInternalVMContext();
  async function moduleFor(file) {
    if (!modules.has(file)) {
      const module = new vm.SourceTextModule(await readFile(file, 'utf8'), {
        context,
        identifier: file,
      });
      modules.set(file, module);
    }
    return modules.get(file);
  }
  for (const script of window.document.querySelectorAll('script[type="module"][src]')) {
    const module = await moduleFor(await localFile(new URL(script.src)));
    if (module.status === 'unlinked')
      await module.link((specifier, parent) =>
        moduleFor(path.resolve(path.dirname(parent.identifier), specifier)),
      );
    if (module.status === 'linked') await module.evaluate();
  }
  const $ = (id) => window.document.getElementById(id);
  const click = (node) =>
    node.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
  const until = async (condition) => {
    for (let i = 0; i < 200; i++) {
      if (condition()) {
        assert.deepEqual(errors, []);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      `Timed out waiting for dictionary state. ${errors.map((error) => error.message).join('\n')}`,
    );
  };
  return { dom, window, $, click, until, errors };
}

const ui = await setup();
try {
  const { window, $, click, until } = ui;
  const visible = () => [...$('term-grid').children].filter((card) => !card.hidden);
  const lookup = (query) => {
    $('search').value = query;
    $('search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  };
  await until(() => !$('search').disabled);
  assert.equal(visible().length, expectedCount);
  lookup('API');
  assert.equal(visible()[0].dataset.term, 'api');
  assert.equal(new URL(window.location.href).searchParams.get('q'), 'API');
  click($('clear-search'));
  assert.equal(visible().length, expectedCount);
  click(window.document.querySelector('[data-category="ai"]'));
  click(window.document.querySelector('[data-letter="T"]'));
  $('level').value = 'beginner';
  $('level').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.ok(visible().some((card) => card.dataset.term === 'token'));
  assert.ok(visible().some((card) => card.dataset.term === 'training'));
  click($('reset-filters'));
  assert.equal(visible().length, expectedCount);
  lookup('algoritm');
  assert.equal(visible().length, 0);
  assert.ok($('suggestions').querySelector('[data-term="algorithm"]'));
  click($('reset-filters'));
  $('sort').value = 'za';
  $('sort').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.notEqual(visible()[0].dataset.term, 'ab-test');
  let shown = false;
  $('term-modal').addEventListener('shown.bs.modal', () => {
    shown = true;
  });
  $('term-modal').addEventListener('hidden.bs.modal', () => {
    shown = false;
  });
  const dailyID = $('word-of-day').dataset.term;
  click($('word-of-day'));
  await until(() => shown);
  assert.equal(new URL(window.location.href).searchParams.get('term'), dailyID);
  assert.equal(
    $('modal-detail').querySelector('[data-field="term"]').textContent,
    $('daily-term').textContent,
  );
  const related = $('modal-detail').querySelector('a[data-term]');
  click(related);
  assert.equal(new URL(window.location.href).searchParams.get('term'), related.dataset.term);
  assert.equal(window.document.activeElement.classList.contains('btn-close'), true);
  window.history.back();
  await until(() => new URL(window.location.href).searchParams.get('term') === dailyID);
  click($('term-modal').querySelector('.btn-close'));
  await until(() => !shown);
  assert.equal(window.document.activeElement, $('word-of-day'));
  assert.equal(new URL(window.location.href).searchParams.has('term'), false);
  click(window.document.querySelector('#term-grid [data-term="api"]'));
  await until(() => shown);
  assert.equal($('modal-detail').querySelector('[data-field="term"]').textContent, 'API');
  assert.ok(
    $('modal-detail').querySelector('[data-field="edit"]').href.endsWith('/data/terms/web.yaml'),
  );
  $('modal-detail').querySelector('[data-copy-term]').click();
  await until(() =>
    $('modal-detail').querySelector('.copy-status').textContent.includes('Copy this link:'),
  );
  $('term-modal').dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await until(() => !shown);
  assert.equal(window.document.activeElement.dataset.term, 'api');
  assert.deepEqual(ui.errors, []);
} finally {
  ui.dom.window.close();
}

const retry = await setup({ failFirst: true });
try {
  await retry.until(() => !retry.$('retry-load').hidden);
  assert.equal(retry.$('search').disabled, true);
  assert.equal(retry.$('term-grid').children.length, expectedCount);
  retry.click(retry.$('retry-load'));
  await retry.until(() => !retry.$('search').disabled);
  assert.equal(retry.$('load-status').hidden, true);
} finally {
  retry.dom.window.close();
}

const permalink = await setup({ source: apiHTML, url: new URL('terms/api/', homeURL) });
try {
  assert.equal(permalink.window.document.querySelector('[data-copy-term]').hidden, false);
} finally {
  permalink.dom.window.close();
}

console.log(
  `Built-site checks passed: ${pages.length} HTML pages, all local links, ${expectedCount} unchanged terms, search/combined filters/suggestions/sort, daily and term modals, history/focus/Escape, clipboard fallback, retry, and standalone pages. Base path: ${base}`,
);
