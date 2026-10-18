import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

test('options page resolves scripts and styles from the extension root', () => {
  const html = readFileSync('html/options.html', 'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(references.includes('/js/options.js'));
  for (const reference of references) {
    const resolved = new URL(reference, 'https://extension.test/html/options.html').pathname;
    assert.ok(!resolved.startsWith('/html/'), `Incorrect options asset path: ${resolved}`);
    // Build outputs are verified by npm run build; source assets must exist.
    if (!resolved.startsWith('/js/')) assert.ok(existsSync(resolve('.' + resolved)), `Missing asset: ${resolved}`);
  }
});
