// TokenIcon loads this metadata through @web3icons/common. Require the library's
// runtime markers AND a catalog array; a token-shaped application object is not
// evidence of library provenance. Call only on script bodies, never visible HTML.
// https://github.com/0xa3k5/web3icons/tree/main/packages/react/src/dynamic
const stringLiteral = '"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\$]|\\$(?!\\{))*`';
const stringValue = `(?:${stringLiteral})`;
const key = name => `(?:(?:${name})|"(?:${name})"|'(?:${name})')`;
const stringArray = `\\[\\s*(?:${stringValue}(?:\\s*,\\s*${stringValue})*\\s*,?)?\\s*\\]`;
const addressKey = `(?:[A-Za-z_$][\\w$]*|${stringValue})`;
const addressPair = `${addressKey}\\s*:\\s*${stringValue}`;
const addressMap = `\\{\\s*(?:${addressPair}(?:\\s*,\\s*${addressPair})*\\s*,?)?\\s*\\}`;
const field = `(?:${key('id|filePath|symbol|name')}\\s*:\\s*${stringValue}|${key('marketCapRank')}\\s*:\\s*(?:null|[0-9]+(?:[eE][+-]?[0-9]+)?)|${key('addresses')}\\s*:\\s*${addressMap}|${key('variants')}\\s*:\\s*${stringArray})`;
const recordPattern = new RegExp(`\\{\\s*${field}(?:\\s*,\\s*${field})*\\s*,?\\s*\\}`, 'g');
const fieldPattern = new RegExp(field, 'g');
const requiredFields = ['id', 'filePath', 'symbol', 'name', 'marketCapRank', 'addresses', 'variants'];

export function maskWeb3IconCatalog(text) {
  if (!/\.displayName\s*=\s*["'`]TokenIcon["'`]/.test(text) || !text.includes('dynamicIconImports')) return text;
  const records = [];
  for (const match of text.matchAll(recordPattern)) {
    const fields = new Map();
    for (const property of match[0].matchAll(fieldPattern)) {
      const separator = property[0].indexOf(':');
      const name = property[0].slice(0, separator).trim().replace(/["']/g, '');
      fields.set(name, {value: property[0].slice(separator + 1).trim(), index: match.index + property.index + separator + 1});
    }
    if (!requiredFields.every(name => fields.has(name))) continue;
    if (!/^["'`](?:token|network):/.test(fields.get('filePath').value)) continue;
    const variants = fields.get('variants').value.match(new RegExp(stringLiteral, 'g')) || [];
    if (!variants.length || variants.some(value => !['branded', 'mono', 'background'].includes(value.slice(1, -1)))) continue;
    records.push({start: match.index, end: match.index + match[0].length, addresses: fields.get('addresses')});
  }
  // Only mask contiguous, complete arrays. Unexpected schema or syntax fails
  // open, preserving addresses rather than guessing that they are library noise.
  const ranges = [];
  for (let i = 0; i < records.length;) {
    let end = i;
    while (end + 1 < records.length && /^\s*,\s*$/.test(text.slice(records[end].end, records[end + 1].start))) end++;
    const binding = text.slice(0, records[i].start).match(/\b([A-Za-z_$][\w$]*)\s*=\s*\[\s*$/);
    const name = binding?.[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const usedForLookup = name && new RegExp(`\\b${name}\\s*,\\s*\\{\\s*(?:id|name|symbol|addresses)\\s*(?::|[,}])`).test(text);
    if (end > i && binding && usedForLookup && /^\s*,?\s*\]/.test(text.slice(records[end].end))) {
      for (let j = i; j <= end; j++) {
        const {index, value} = records[j].addresses;
        const start = index + text.slice(index).search(/\S/);
        ranges.push([start, start + value.length]);
      }
    }
    i = end + 1;
  }
  let cursor = 0;
  const pieces = [];
  for (const [start, end] of ranges) {
    pieces.push(text.slice(cursor, start), text.slice(start, end).replace(/[^\r\n]/g, ' '));
    cursor = end;
  }
  pieces.push(text.slice(cursor));
  return pieces.join('');
}
