import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';
import {scan} from './helpers/scan.js';

const code = buildSync({stdin: {contents: 'import React from \'react\'; import {renderToStaticMarkup} from \'react-dom/server\'; import LinkList from \'./src/components/LinkList\'; export const render = props => renderToStaticMarkup(React.createElement(LinkList, props));', resolveDir: process.cwd()}, bundle: true, platform: 'node', format: 'cjs', write: false, loader: {'.js': 'jsx', '.css': 'empty'}}).outputFiles[0].text;
const module = {exports: {}};
vm.runInNewContext(code, {module, exports: module.exports, require: createRequire(import.meta.url), process, console, TextEncoder});

test('results page renders separate source groups with provenance and copy buttons', async () => {
  const address = '0x5a3e6a77ba2f983ec0d371ea3b475f8bc0811ad5';
  const url = 'https://unpkg.com/@example/sdk@1.0.0/index.js';
  const {links} = await scan({html: `<div>${address}</div>`, inline: `const vault="${address}"`, resources: {[url]: `const contract="${address}"`}});
  const html = module.exports.render({links, source: 'https://site.test/', blockedDomains: []});
  for (const label of ['EVM · Page HTML', 'EVM · Scripts / unattributed bundles', 'EVM · Package files', 'Package path: @example/sdk', url, 'Inline script']) assert.ok(html.includes(label), label);
  assert.equal((html.match(/data-copy-value=/g) || []).length, 3);
});

test('renders compact contract locations, wallet balance and activity chains', async () => {
  const address = '0x5a3e6a77ba2f983ec0d371ea3b475f8bc0811ad5';
  const {links} = await scan({inline: `const vault="${address}"`});
  const html = module.exports.render({links, source: 'https://site.test/', blockedDomains: [], metadata: [
    {address, chainId: 8453, hasCode: true, name: '', symbol: ''},
    {address, chainId: 1, hasCode: false, balance: '0x1', transactionCount: '0x2'},
  ]});
  assert.match(html, /Contract code found.*Base/);
  assert.ok(html.includes('Native balance found'));
  assert.ok(html.includes('Sent transactions found'));
  assert.ok(!html.includes('name unavailable'));
  assert.ok(!html.includes('TOK'));
  assert.ok(html.includes('Inline script'));
  assert.ok(!html.includes('Ethereum:'));
});

test('hides excluded addresses in older saved results and their copy controls', () => {
  const excluded = ['0x0000000000000000000000000000000000000000', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '0x000000000000000000000000000000000000dEaD'];
  const links = excluded.flatMap(address => [
    {href: address, address, source: 'evm', hostname: 'site.test'},
    {href: `https://explorer.test/address/${address}`, source: 'a', hostname: 'explorer.test'},
  ]);
  const html = module.exports.render({links, source: 'https://site.test/', blockedDomains: []});
  for (const address of excluded) assert.ok(!html.includes(address));
  assert.ok(!html.includes('data-copy-value'));
});

test('merges repeated inline addresses into one row while preserving both sources', async () => {
  const address = '0x0e024a4fad828e8f976fdccbeeaab72d4205be3c';
  const {links} = await scan({scriptBodies: [`const BUILDER="${address}";`, `const BUILDER="${address}";`]});
  assert.equal(links.length, 2);
  const html = module.exports.render({links, source: 'https://site.test/', blockedDomains: []});
  assert.equal((html.match(/data-copy-value=/g) || []).length, 1);
  assert.ok(html.includes('#inline-script-1'));
  assert.ok(html.includes('#inline-script-2'));
});


test('shows available contract names and symbols while grouping unnamed contracts', async () => {
  const address = '0x5a3e6a77ba2f983ec0d371ea3b475f8bc0811ad5';
  const {links} = await scan({inline: `const vault="${address}"`});
  const html = module.exports.render({links, source: 'https://site.test/', blockedDomains: [], metadata: [
    {address, chainId: 4663, hasCode: true, name: '<Token>', symbol: 'TOK'},
    {address, chainId: 1, hasCode: true, name: 'Name only', symbol: ''},
    {address, chainId: 999, hasCode: true, name: '', symbol: 'SYM'},
    {address, chainId: 8453, hasCode: true},
    {address, chainId: 42161, hasCode: true, name: '', symbol: ''},
  ]});
  assert.match(html, /Robinhood:.*&lt;Token&gt;.*\(TOK\)/);
  assert.match(html, /Ethereum:.*Name only/);
  assert.match(html, /HyperEVM:.*SYM/);
  assert.equal((html.match(/class="LinkListChainMatch"/g) || []).length, 5);
  assert.ok(html.includes('Base'));
  assert.ok(html.includes('Arbitrum'));
  assert.ok(!html.includes('name unavailable'));
  assert.ok(!html.includes('()'));
});

test('prefers an address hyperlink over raw HTML and script matches and preserves sources', async () => {
  const address = '0x5a3e6a77ba2f983ec0d371ea3b475f8bc0811ad5';
  const href = `https://explorer.test/address/${address}#code`;
  const {links} = await scan({anchors: [href], html: address, inline: `const token="${address}";`});
  for (const ordered of [links, [...links].reverse()]) {
    const html = module.exports.render({links: ordered, source: 'https://site.test/', blockedDomains: []});
    assert.equal((html.match(/class="LinkListItem /g) || []).length, 1);
    assert.ok(html.includes(`href="${href}"`));
    assert.ok(!html.includes('data-copy-value'));
    assert.ok(html.includes('Inline script:'));
    assert.ok(html.includes('Page HTML:'));
  }
  const blocked = module.exports.render({links, source: 'https://site.test/', blockedDomains: ['explorer.test']});
  assert.ok(blocked.includes('data-copy-value'));
});


test('adds chain-specific explorer actions for named contracts, unnamed contracts and wallets', async () => {
  const address = '0x5a3e6a77ba2f983ec0d371ea3b475f8bc0811ad5';
  const {links} = await scan({inline: `const vault="${address}"`});
  const html = module.exports.render({links, source: 'https://site.test/', blockedDomains: [], metadata: [
    {address, chainId: 4663, hasCode: true, name: 'Token', symbol: 'TOK'},
    {address, chainId: 8453, hasCode: true},
    {address, chainId: 1, hasCode: false, balance: '0x1'},
  ]});
  for (const host of ['robin.etherscan.io', 'basescan.org', 'etherscan.io']) {
    assert.ok(html.includes(`href="https://${host}/address/${address}"`));
  }
  assert.equal((html.match(/data-copy-exclude="true"/g) || []).length, 3);
  assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, 3);
});

test('site counts appear once on the preferred hyperlink with a new-sighting label', async () => {
  const address = '0x1111111111111111111111111111111111111111';
  const {links} = await scan({html: address, anchors: [`https://explorer.test/address/${address}`]});
  const html = module.exports.render({links, source: 'https://site.test/', blockedDomains: [], observations: [{address, seenCount: 1, isNew: true}]});
  assert.equal((html.match(/New on this site/g) || []).length, 1);
  assert.ok(html.includes('Seen in 1 scan on this site'));
});


test('shows all matching chains once despite overlapping contract, balance and activity evidence', async () => {
  const address = '0x1111111111111111111111111111111111111111';
  const {links} = await scan({anchors: [`https://robin.etherscan.io/address/${address}#code`]});
  const html = module.exports.render({links, source: 'https://site.test/', blockedDomains: [], metadata: [
    {address, chainId: 1, hasCode: true, name: 'Ethereum token', symbol: 'ETH', balance: '0x1', transactionCount: '0x2'},
    {address, chainId: 4663, hasCode: true, balance: '0x1', transactionCount: '0x2'},
  ]});
  assert.equal((html.match(/data-copy-exclude="true"/g) || []).length, 2);
  assert.ok(!html.includes('<details class="LinkListOtherChains">'));
  assert.equal((html.match(/class="LinkListChainMatch"/g) || []).length, 2);
  assert.ok(html.includes('Robinhood'));
  assert.ok(html.includes('Ethereum token'));
  assert.ok(!html.includes('Native balance on:'));
  assert.ok(!html.includes('Sent transactions on:'));
});

test('distinct-site counts follow raw addresses and preferred hyperlinks without entering copied values', async () => {
  const address = '0x1111111111111111111111111111111111111111';
  for (const input of [{inline: `const token="${address}"`}, {html: address, anchors: [`https://explorer.test/address/${address}`]}]) {
    const {links} = await scan(input);
    const html = module.exports.render({links, source: 'https://site.test/', blockedDomains: [], observations: [{address, seenCount: 5, siteCount: 2, isNew: false}]});
    assert.equal((html.match(/class="LinkListSiteCount"/g) || []).length, 1);
    assert.ok(html.includes('Seen on 2 distinct sites'));
    assert.ok(html.includes(' (2)</span>'));
    assert.ok(html.includes('Seen in 5 scans on this site'));
    assert.ok(!html.includes(`data-copy-value="${address} (2)"`));
  }
});

test('prioritizes named addresses then ascending site counts for raw and linked results', () => {
  const addresses = [1, 2, 3, 4, 5].map(n => '0x' + String(n).repeat(40));
  for (const source of ['evm', 'a']) {
    const links = addresses.map(address => ({address, evmAddress: address, source, hostname: 'site.test', href: source === 'a' ? `https://explorer.test/address/${address}` : address}));
    const html = module.exports.render({links, source: 'https://site.test/', blockedDomains: [],
      observations: addresses.slice(0, 4).map((address, i) => ({address, siteCount: [3, 8, 1, 2][i], seenCount: 1})),
      metadata: [
        {address: addresses[1], chainId: 1, hasCode: true, name: 'Named', symbol: ''},
        {address: addresses[3], chainId: 1, hasCode: true, name: '', symbol: 'SYM'},
      ],
    });
    const order = [3, 1, 2, 0, 4].map(i => html.indexOf(addresses[i]));
    assert.ok(order.every(position => position >= 0));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.ok(!html.includes('Seen on 1 distinct site'));
  }
});
