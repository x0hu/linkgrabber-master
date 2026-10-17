const EXCLUDED_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000000',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0x000000000000000000000000000000000000dead',
]);

export function isExcludedAddress(address) {
  return typeof address === 'string' && EXCLUDED_ADDRESSES.has(address.toLowerCase());
}

export function hasExcludedAddress(value) {
  return typeof value === 'string' && (value.match(/\b0x[0-9a-f]{40}\b/gi) || []).some(isExcludedAddress);
}

export function isExcludedAddressLink(link) {
  return isExcludedAddress(link.evmAddress) || isExcludedAddress(link.address) || hasExcludedAddress(link.href);
}
