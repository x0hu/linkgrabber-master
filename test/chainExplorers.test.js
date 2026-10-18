import assert from 'node:assert/strict';
import test from 'node:test';
import {CHAINS} from '../src/chainRpc.js';
import {getAddressExplorerUrl} from '../src/chainExplorers.js';

test('every supported chain has an address explorer without guessing unknown chains', () => {
  const address = '0x5a3e6a77ba2f983ec0d371ea3b475f8bc0811ad5';
  for (const chain of CHAINS) {
    const url = new URL(getAddressExplorerUrl(chain.id, address));
    assert.equal(url.protocol, 'https:');
    assert.ok(url.pathname.endsWith('/address/' + address));
  }
  assert.equal(getAddressExplorerUrl(4663, address), 'https://robin.etherscan.io/address/' + address);
  assert.equal(getAddressExplorerUrl(196, address), 'https://www.okx.com/web3/explorer/xlayer/address/' + address);
  assert.equal(getAddressExplorerUrl(11155111, address), 'https://sepolia.etherscan.io/address/' + address);
  assert.equal(getAddressExplorerUrl(84532, address), 'https://sepolia.basescan.org/address/' + address);
  assert.equal(getAddressExplorerUrl(987654321, address), '');
  assert.equal(getAddressExplorerUrl(1, 'javascript:alert(1)'), '');
});
