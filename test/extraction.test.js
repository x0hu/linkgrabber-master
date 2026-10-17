import assert from 'node:assert/strict';
import test from 'node:test';
import {scan} from './helpers/scan.js';

const address = '0x5a3e6a77ba2f983ec0d371ea3b475f8bc0811ad5';

test('preserves known token addresses in HTML and standalone application configuration', async () => {
  for (const token of ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2']) {
    for (const input of [{html: `<div data-contract="${token}">${token}</div>`}, {inline: `const vault="${token}";`}]) {
      const {links} = await scan(input);
      assert.equal(links.filter(link => link.evmAddress === token).length, 1);
    }
  }
});

test('distinct address destinations, queries and protocols survive deduplication', async () => {
  const anchors = [`https://site.test/token/${address}`, `https://site.test/address/${address}`, `https://site.test/token/${address}?tab=holders`, `http://site.test/token/${address}`];
  const {links} = await scan({anchors: [...anchors, anchors[0]]});
  assert.deepEqual(links.map(link => link.href), anchors);
});

test('preserves full same-origin, relative, escaped and external endpoint URLs', async () => {
  const inline = String.raw`const a="https://site.test/api/tokens"; const b="/api/tokens?chain=1#active"; const c="https:\/\/api.project.test\/v1?chain=1"; const d="/api/token.json"; const e="/v1.2/pools"; const f="//api.project.test/prices";`;
  const {links} = await scan({inline});
  assert.deepEqual(new Set(links.map(link => link.href)), new Set(['https://site.test/api/tokens', 'https://site.test/api/tokens?chain=1#active', 'https://api.project.test/v1?chain=1', 'https://site.test/api/token.json', 'https://site.test/v1.2/pools', 'https://api.project.test/prices']));
});

test('deduplicates repeated raw addresses without losing first casing or label', async () => {
  const mixed = '0x5A3e6A77ba2f983ec0d371ea3b475f8bc0811ad5';
  const {links} = await scan({inline: `const vault="${mixed}"; const duplicate="${address}";`});
  assert.equal(links.length, 1);
  assert.equal(links[0].address, mixed);
  assert.equal(links[0].context, 'vault');
});

test('discovers readable cross-origin scripts and nested dependencies', async () => {
  const resources = {'https://cdn.project.test/app.js': 'import "./nested.js";', 'https://cdn.project.test/nested.js': `const vault="${address}";`};
  const {links, requests} = await scan({resources, scriptUrls: ['https://cdn.project.test/app.js']});
  assert.deepEqual(requests, Object.keys(resources));
  assert.ok(links.some(link => link.evmAddress === address));
});

test('keeps Dexscreener suppression and does not return interpolated endpoints', async () => {
  const {links} = await scan({inline: `const ignored="https://dexscreener.com/ethereum/${address}"; const dynamic="https://api.project.test/\u0024{token}";`});
  assert.deepEqual(links, []);
});

test('keeps script attributes containing > and references in HTML comments', async () => {
  for (const html of [`<script data-label=">" data-contract="${address}"></script>`, `<!-- <script>${address}</script> -->`]) {
    const {links} = await scan({html});
    assert.ok(links.some(link => link.evmAddress === address));
  }
});

test('retains inline body references even on script elements with a src attribute', async () => {
  const body = `const fallback="${address}";`;
  const {links} = await scan({html: `<script src="/unavailable.js">${body}</script>`, scriptBodies: [body]});
  assert.ok(links.some(link => link.evmAddress === address));
});

test('excludes placeholder and burn addresses in HTML, scripts and linked destinations regardless of case', async () => {
  const excluded = ['0x0000000000000000000000000000000000000000', '0xeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeE', '0x000000000000000000000000000000000000dEaD'];
  const {links} = await scan({
    html: excluded.join(' '),
    inline: JSON.stringify([...excluded, address]),
    anchors: excluded.map(value => `https://explorer.test/address/${value}`),
    resources: {'https://site.test/app.js': JSON.stringify(excluded)},
  });
  assert.deepEqual(links.map(link => link.evmAddress), [address]);
});
