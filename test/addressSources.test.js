import assert from 'node:assert/strict';
import test from 'node:test';
import {scan} from './helpers/scan.js';
import {getLinkIdentity} from '../src/linkIdentity.js';

const address = '0x5a3e6a77ba2f983ec0d371ea3b475f8bc0811ad5';
test('retains separate page, inline and package occurrences of an address', async () => {
  const url = 'https://cdn.jsdelivr.net/npm/viem@2.0.0/index.js';
  const {links} = await scan({html: `<div>${address}</div>`, inline: `const vault="${address}"`, resources: {[url]: `const contract="${address}"`}});
  const matches = links.filter(link => link.source === 'evm');
  assert.deepEqual(matches.map(link => link.evmSourceKind), ['page', 'inline', 'package']);
  assert.equal(matches[2].evmSourceUrl, url);
  assert.equal(matches[2].evmPackage, 'viem');
  assert.equal(new Set(matches.map(getLinkIdentity)).size, 3);
});

test('does not infer a package from a generic external bundle', async () => {
  const url = 'https://cdn.project.test/app.js';
  const {links} = await scan({resources: {[url]: `const vault="${address}"`}});
  assert.equal(links[0].evmSourceKind, 'script');
  assert.equal(links[0].evmSourceUrl, url);
  assert.equal(links[0].evmPackage, '');
});
