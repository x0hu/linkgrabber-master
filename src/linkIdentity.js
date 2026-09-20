// A raw address is a value; a URL is a destination. Do not merge different
// routes, query strings or protocols merely because they contain one address.
export function getLinkIdentity(link) {
  if (link.source === 'evm') {
    return `evm:${(link.evmAddress || link.address || link.href).toLowerCase()}:${(link.evmReferenceDomain || link.hostname || '').toLowerCase()}`;
  }
  return link.href;
}
