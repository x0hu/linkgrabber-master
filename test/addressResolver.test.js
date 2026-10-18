import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
const code = buildSync({entryPoints: ['src/addressResolver.js'], bundle: true, platform: 'node', format: 'cjs', write: false}).outputFiles[0].text;
const module = {exports: {}};
vm.runInNewContext(code, {module, exports: module.exports, URL, AbortController, setTimeout, clearTimeout});
const {normalizeResolverUrl, createAddressResolver} = module.exports;
const address = '0x1111111111111111111111111111111111111111';

test('resolver configuration allows HTTPS and local development without embedded secrets', () => {
  assert.equal(normalizeResolverUrl(' https://resolver.test/prefix/ '), 'https://resolver.test/prefix');
  assert.equal(normalizeResolverUrl('http://localhost:8787'), 'http://localhost:8787');
  for (const value of ['http://remote.test', 'https://user:pass@remote.test', 'https://remote.test?secret=1', 'javascript:alert(1)']) assert.equal(normalizeResolverUrl(value), null);
});
test('site observations send hostname and unique addresses with a stable scan ID', async () => {
  const bodies = [];
  const resolver = createAddressResolver('https://resolver.test', {fetcher: async (url, options) => {
    assert.equal(url, 'https://resolver.test/linkgrabber/scans');
    bodies.push(JSON.parse(options.body));
    return {ok: true, json: async () => ({ok: true, observations: []})};
  }});
  const input = {scanId: 'same-id', source: 'https://site.test/private?token=secret', links: [{evmAddress: address}, {address: address.toUpperCase()}]};
  await resolver.scan(input);
  await resolver.scan(input);
  assert.deepEqual(bodies[0], {scanId: 'same-id', hostname: 'site.test', addresses: [address]});
  assert.deepEqual(bodies[0], bodies[1]);
});
test('remote metadata is restricted to requested keys and recent valid values', async () => {
  const entry = {version: 2, address, chainId: 1, hasCode: true, name: 'Token', symbol: 'TOK', balance: '0x0', transactionCount: '0x0', checkedAt: Date.now()};
  const resolver = createAddressResolver('https://resolver.test', {fetcher: async () => ({ok: true, json: async () => ({ok: true, entries: [{...entry, checkedAt: 1}]})})});
  assert.equal((await resolver.lookup([address], [1])).length, 0);
});

test('uses the canonical domain returned by the resolver for display', async () => {
  const resolver = createAddressResolver('https://resolver.test', {fetcher: async () => ({ok: true, json: async () => ({ok: true, siteDomain: 'example.co.uk', observations: [{address, seenCount: 2, siteCount: 1}]})})});
  const [observation] = await resolver.scan({scanId: 'same-id', source: 'https://app.example.co.uk/path', links: [{address}]});
  assert.equal(observation.siteDomain, 'example.co.uk');
  assert.equal(observation.siteCount, 1);
});

test('HTTP and HTTPS URLs with different ports and paths send the same hostname', async () => {
  const hosts = [];
  const resolver = createAddressResolver('https://resolver.test', {fetcher: async (url, options) => {
    hosts.push(JSON.parse(options.body).hostname);
    return {ok: true, json: async () => ({ok: true, observations: []})};
  }});
  for (const source of ['http://app.domain.com/path', 'https://app.domain.com:8443/other?x=1']) {
    await resolver.scan({scanId: 'same-id', source, links: [{address}]});
  }
  assert.deepEqual(hosts, ['app.domain.com', 'app.domain.com']);
});
