import assert from 'node:assert/strict';
import test from 'node:test';
import {CHAINS, publicRpcUrls, createRpcClient, decodeTokenText, enrichAddresses, loadRpcCatalog, persistAddressMetadata} from '../src/chainRpc.js';

const address = '0x1111111111111111111111111111111111111111';
const urls = ['https://one.test', 'https://two.test', 'https://three.test'];
const word = n => n.toString(16).padStart(64, '0');
const string = text => '0x' + word(32) + word(text.length) + Buffer.from(text).toString('hex').padEnd(64, '0');
const storage = initial => ({data: initial || {}, async get(key) { return {[key]: this.data[key]}; }, async set(values) { Object.assign(this.data, values); }});
function response(body, chainId = 1) {
  return {ok: true, json: async () => JSON.parse(body).map(call => ({id: call.id, result: call.method === 'eth_chainId' ? '0x' + chainId.toString(16) : call.method === 'eth_getCode' ? '0x6000' : ['eth_getBalance', 'eth_getTransactionCount'].includes(call.method) ? '0x0' : string(call.params[0].data === '0x06fdde03' ? 'Token' : 'TOK')})).reverse()};
}

test('supports exactly the requested chains, with both Sepolia networks', () => {
  assert.deepEqual(CHAINS.map(chain => chain.id), [56, 1, 8453, 143, 43114, 42161, 999, 4663, 11155111, 84532, 57073, 196]);
});
test('filters unusable endpoints and deduplicates URLs', () => {
  assert.deepEqual(publicRpcUrls([...urls, urls[0], 'wss://one.test', 'https://one.test/${KEY}', 'https://one.test?apikey=secret', 'https://user:pass@one.test', 'https://127.0.0.1']), urls);
});
test('decodes ABI string and bytes32 metadata with bounded malformed inputs', () => {
  assert.equal(decodeTokenText(string('Token')), 'Token');
  assert.equal(decodeTokenText('0x' + Buffer.from('TOK').toString('hex').padEnd(64, '0')), 'TOK');
  for (const value of ['0x', '0xzz', '0x' + 'ff'.repeat(96), undefined]) assert.equal(decodeTokenText(value), '');
});
test('rotates after wrong-chain response and prefers successful endpoint', async () => {
  const called = [];
  const lookup = createRpcClient({random: () => 0, fetcher: async (url, options) => {
    called.push(url);
    return response(options.body, url === urls[0] ? 56 : 1);
  }});
  const entries = await lookup(1, [address], urls);
  assert.equal(entries[0].name, 'Token');
  assert.equal(entries[0].symbol, 'TOK');
  await lookup(1, [address], urls);
  assert.deepEqual(called, [urls[0], urls[1], urls[1]]);
});
test('times out and rotates without letting a stalled endpoint block completion', async () => {
  const called = [];
  const lookup = createRpcClient({random: () => 0, timeoutMs: 10, fetcher: async (url, options) => {
    called.push(url);
    if (url === urls[0]) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    return response(options.body);
  }});
  assert.equal((await lookup(1, [address], urls))[0].hasCode, true);
  assert.deepEqual(called, urls.slice(0, 2));
});
test('only attempts three endpoints and never trusts incomplete batches', async () => {
  let count = 0;
  const lookup = createRpcClient({random: () => 0, fetcher: async () => { count++; return {ok: true, json: async () => [{id: 0, result: '0x1'}]}; }});
  await assert.rejects(lookup(1, [address], [...urls, 'https://four.test']));
  assert.equal(count, 3);
});
test('fresh metadata avoids network requests, while failures never enter cache', async () => {
  const cached = {version: 2, balance: '0x0', transactionCount: '0x0', address, chainId: 1, hasCode: true, name: 'Token', checkedAt: Date.now()};
  const local = storage({addressMetadata: {['1:' + address]: cached}});
  let updates;
  const result = await enrichAddresses([address, address], [CHAINS[1]], {storage: local, onResults: values => { updates = values; }, fetcher: () => { throw new Error('must not fetch'); }});
  assert.equal(result.failed, 0);
  assert.deepEqual(updates, [cached]);
  local.data = {rpcCatalog: {at: Date.now(), chains: {1: urls}}};
  const failed = await enrichAddresses([address], [CHAINS[1]], {storage: local, onResults: () => {}, fetcher: async () => { throw new Error('offline'); }});
  assert.equal(failed.failed, 1);
  assert.equal(local.data.addressMetadata, undefined);
});
test('catalog falls back to bundled requested-chain endpoints when unavailable', async () => {
  const catalog = await loadRpcCatalog(storage(), async () => { throw new Error('offline'); });
  assert.ok(CHAINS.every(chain => publicRpcUrls(catalog[chain.id]).length > 0));
});

test('deadline and cancellation prevent additional RPC work', async () => {
  let calls = 0;
  const lookup = createRpcClient({now: () => 100, fetcher: async () => { calls++; throw new Error('unexpected'); }});
  await assert.rejects(lookup(1, [address], urls, {deadline: 99}));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(lookup(1, [address], urls, {signal: controller.signal}));
  assert.equal(calls, 0);
});
test('contract reverts preserve contract status and do not trigger endpoint rotation', async () => {
  let calls = 0;
  const lookup = createRpcClient({fetcher: async (url, options) => {
    calls++;
    const batch = await response(options.body).json();
    return {ok: true, json: async () => batch.map(item => (item.id === 2 || item.id === 3) ? {id: item.id, error: {code: 3, message: 'execution reverted'}} : item)};
  }});
  const [entry] = await lookup(1, [address], urls);
  assert.equal(entry.hasCode, true);
  assert.equal(entry.name, '');
  assert.equal(entry.symbol, '');
  assert.equal(calls, 1);
});

test('detects funded and previously used wallets without contract code or token metadata', async () => {
  const lookup = createRpcClient({fetcher: async (url, options) => ({ok: true, json: async () => JSON.parse(options.body).map(call => ({id: call.id, result: {
    eth_chainId: '0x1', eth_getCode: '0x', eth_call: '0x', eth_getBalance: '0xffffffffffffffffffff', eth_getTransactionCount: '0x2',
  }[call.method]}))})});
  const [entry] = await lookup(1, [address], urls);
  assert.equal(entry.hasCode, false);
  assert.equal(entry.balance, '0xffffffffffffffffffff');
  assert.equal(entry.transactionCount, '0x2');
});

test('refresh bypasses the cross-site cache and old schema entries are refetched', async () => {
  const local = storage({rpcCatalog: {at: Date.now(), chains: {1: urls}}});
  let calls = 0;
  const options = {storage: local, onResults: () => {}, fetcher: async (url, opts) => { calls++; return response(opts.body); }};
  await enrichAddresses([address], [CHAINS[1]], options);
  await enrichAddresses([address.toUpperCase()], [CHAINS[1]], options);
  assert.equal(calls, 1);
  await enrichAddresses([address], [CHAINS[1]], {...options, forceRefresh: true});
  assert.equal(calls, 2);
  delete local.data.addressMetadata['1:' + address].version;
  await enrichAddresses([address], [CHAINS[1]], options);
  assert.equal(calls, 3);
});

test('excluded addresses never reach RPCs, including addresses from older saved scans', async () => {
  let calls = 0;
  const result = await enrichAddresses(['0x0000000000000000000000000000000000000000', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '0x000000000000000000000000000000000000dEaD'], CHAINS, {
    storage: storage(), onResults: values => assert.deepEqual(values, []), fetcher: async () => { calls++; throw new Error('unexpected'); },
  });
  assert.equal(calls, 0);
  assert.equal(result.failed, 0);
});


test('concurrent cache writes retain both scans and never replace newer entries', async () => {
  const local = storage();
  const first = {address, chainId: 1, checkedAt: 20};
  const second = {address, chainId: 56, checkedAt: 30};
  await Promise.all([persistAddressMetadata(local, [first]), persistAddressMetadata(local, [second])]);
  await persistAddressMetadata(local, [{...first, checkedAt: 10}]);
  assert.deepEqual(local.data.addressMetadata, {['1:' + address]: first, ['56:' + address]: second});
});

test('each completed batch is persisted before the remaining scan finishes', async () => {
  const local = storage({rpcCatalog: {at: Date.now(), chains: {1: urls}}});
  const addresses = Array.from({length: 50}, (_, index) => '0x' + (index + 1).toString(16).padStart(40, '0'));
  let calls = 0;
  await enrichAddresses(addresses, [CHAINS[1]], {storage: local, onResults: () => {}, fetcher: async (url, options) => {
    if (++calls === 5) assert.ok(Object.keys(local.data.addressMetadata || {}).length >= 10);
    return response(options.body);
  }});
  assert.equal(calls, 5);
  assert.equal(Object.keys(local.data.addressMetadata).length, 50);
});
