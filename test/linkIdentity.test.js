import assert from 'node:assert/strict';
import test from 'node:test';
import {getLinkIdentity} from '../src/linkIdentity.js';

test('worker and results UI distinguish all address destinations', () => {
  const address = '0x5a3e6a77ba2f983ec0d371ea3b475f8bc0811ad5';
  const urls = [`https://site.test/token/${address}`, `https://site.test/address/${address}`, `https://site.test/token/${address}?tab=holders`, `http://site.test/token/${address}`];
  assert.equal(new Set(urls.map(href => getLinkIdentity({href, evmAddress: address, hostname: 'site.test', source: 'a'}))).size, 4);
  assert.equal(getLinkIdentity({source: 'evm', href: address, hostname: 'site.test'}), getLinkIdentity({source: 'evm', href: address.toUpperCase(), hostname: 'SITE.TEST'}));
});
