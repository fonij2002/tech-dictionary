import test from 'node:test';
import assert from 'node:assert/strict';
import { joinBase } from '../src/lib/urls.ts';

test('term and export URLs retain a repository base path without double slashes', () => {
  assert.equal(joinBase('terms/api/', '/tech-dictionary/'), '/tech-dictionary/terms/api/');
  assert.equal(
    joinBase('/data/v1/terms.json', '/tech-dictionary'),
    '/tech-dictionary/data/v1/terms.json',
  );
  assert.equal(joinBase('', '/tech-dictionary/'), '/tech-dictionary/');
  assert.equal(joinBase('terms/api/', '/'), '/terms/api/');
});
