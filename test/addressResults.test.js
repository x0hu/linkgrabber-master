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
  assert.match(html, /Contract on:.*Base/);
  assert.match(html, /Native balance on:.*Ethereum/);
  assert.match(html, /Sent transactions on:.*Ethereum/);
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
  assert.match(html, /Contract on:.*Base, Arbitrum/);
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
