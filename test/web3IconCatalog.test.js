import assert from 'node:assert/strict';
import test from 'node:test';
import {maskWeb3IconCatalog} from '../src/web3IconCatalog.js';
import {scan} from './helpers/scan.js';

const address = '0x5a3e6a77ba2f983ec0d371ea3b475f8bc0811ad5';
const record = {id: 'example', filePath: 'token:EXAMPLE', symbol: 'EXAMPLE', name: 'Example', marketCapRank: 10, addresses: {ethereum: address}, variants: ['branded', 'mono']};
const markers = 'TokenIcon.displayName="TokenIcon"; const load = () => import("./dynamicIconImports.js");';
const library = value => markers + `const tokens=[${value},${JSON.stringify({...record, addresses: {}})}]; const findToken=symbol=>findMetadata(tokens,{symbol});`;
const catalog = library(JSON.stringify(record));

test('ignores confirmed Web3Icons arrays in inline and fetched scripts', async () => {
  for (const input of [{inline: catalog}, {resources: {'https://site.test/app.js': catalog}}]) {
    const {links} = await scan(input);
    assert.equal(links.filter(link => link.source === 'evm').length, 0);
  }
});

test('preserves the same address in visible text, attributes and application code', async () => {
  for (const outside of [{html: `<div data-contract="${address}">${address}</div>`}, {resources: {'https://site.test/app.js': `const vault="${address}";`}}, {inline: catalog + `const vault="${address}";`}]) {
    const {links} = await scan({inline: catalog, ...outside});
    assert.equal(links.filter(link => link.evmAddress === address).length, 1);
  }
});

test('never filters visible metadata, standalone records, or unconfirmed arrays', async () => {
  for (const input of [
    {html: `<pre>${JSON.stringify(record)}</pre>`},
    {inline: markers + `const activeToken=${JSON.stringify(record)};`},
    {inline: JSON.stringify([record, record])},
    {inline: markers + 'const applicationTokens=' + JSON.stringify([record, record]) + ';'},
    {inline: library(JSON.stringify({...record, variants: ['vault']}))},
  ]) {
    const {links} = await scan(input);
    assert.equal(links.filter(link => link.evmAddress === address).length, 1);
  }
});

test('supports reordered JSON fields, escaped names, literal dollars and network artwork', async () => {
  const reordered = {variants: ['branded'], addresses: {ethereum: address}, name: 'Example "quoted" {name}', symbol: 'EXAMPLE', marketCapRank: null, filePath: 'token:EXAMPLE', id: 'example'};
  for (const value of [JSON.stringify(reordered), JSON.stringify(record).replace('"Example"', '`$Example`'), JSON.stringify(record).replace('token:EXAMPLE', 'network:example').replace(':10', ':2e3')]) {
    const {links} = await scan({inline: library(value)});
    assert.equal(links.filter(link => link.source === 'evm').length, 0);
  }
});

test('interpolation and unknown schemas fail open, preserving addresses', () => {
  const input = library(JSON.stringify(record).replace('"Example"', '`Example ${runtime}`'));
  assert.equal(maskWeb3IconCatalog(input), input);
});

test('only masks address maps, preserving offsets, lines, URLs and neighboring context', () => {
  const input = library(JSON.stringify({...record, name: 'https://api.project.test/v1'})) + '\nconst vault = "' + address + '";';
  const output = maskWeb3IconCatalog(input);
  assert.equal(output.length, input.length);
  assert.equal(output.indexOf('\n'), input.indexOf('\n'));
  assert.ok(output.includes('https://api.project.test/v1'));
  assert.ok(output.endsWith('\nconst vault = "' + address + '";'));
});
