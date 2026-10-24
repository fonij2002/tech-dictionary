// Exercise Astro's real dev router: filesystem-only build checks cannot catch
// trailing-slash mismatches on the dynamic data endpoint.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dev } from 'astro';
import config from '../astro.config.mjs';
import { loadDataset } from '../scripts/dataset.mjs';

const expected = await loadDataset();
for (const base of new Set([config.base, '/'])) {
  const server = await dev({
    root: fileURLToPath(new URL('../', import.meta.url)),
    base,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  try {
    const origin = `http://127.0.0.1:${server.address.port}`;
    const root = `${origin}${base.replace(/\/*$/, '/')}`;
    const home = await fetch(root, { headers: { Connection: 'close' } });
    assert.equal(home.status, 200);
    assert.match(await home.text(), /data-dictionary/);
    for (const [file, count] of [
      ['data/v1/terms.json', null],
      ['data/terms.json', expected.terms.length],
      ['data/categories.json', expected.categories.length],
    ]) {
      const response = await fetch(new URL(file, root), { headers: { Connection: 'close' } });
      assert.equal(response.status, 200, `Dev endpoint failed: ${root}${file}`);
      assert.match(response.headers.get('content-type'), /^application\/json/);
      const data = await response.json();
      if (count !== null) assert.equal(data.length, count);
      else {
        assert.equal(data.terms.length, expected.terms.length);
        assert.equal(data.categories.length, expected.categories.length);
      }
    }
    console.log(`Dev search data passes at ${base}`);
  } finally {
    await server.stop();
  }
}
