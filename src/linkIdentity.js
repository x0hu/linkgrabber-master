// A raw address is a value; a URL is a destination. Do not merge different
// routes, query strings or protocols merely because they contain one address.
export function getLinkIdentity(link) {
  if (link.source === 'evm') {
    return `evm:${(link.evmAddress || link.address || link.href).toLowerCase()}:${(link.evmReferenceDomain || link.hostname || '').toLowerCase()}${link.evmSourceKind ? `:${link.evmSourceKind}:${link.evmSourceUrl || ''}` : ''}`;
  }
  return link.href;
}

// Prefer a real destination over a raw address, without merging different URLs.
// Preserve each occurrence so the preferred row still explains all its sources.
export function mergeAddressOccurrences(links) {
  const seen = new Map();
  const destinations = new Map();
  const result = [];
  const addressOf = link => {
    const value = link.evmAddress || link.address;
    if (/^0x[0-9a-f]{40}$/i.test(value || '')) return value.toLowerCase();
    try {
      const tail = new URL(link.href).pathname.split('/').filter(Boolean).pop();
      return /^0x[0-9a-f]{40}$/i.test(tail || '') ? tail.toLowerCase() : '';
    } catch (e) { return ''; }
  };
  const occurrenceOf = link => ({url: link.evmSourceUrl || '', context: link.context || link.text || '', kind: link.evmSourceKind, package: link.evmPackage});
  const appendOccurrence = (target, occurrence) => {
    if (!target.evmOccurrences.some(item => item.url === occurrence.url && item.context === occurrence.context && item.kind === occurrence.kind && item.package === occurrence.package)) {
      target.evmOccurrences.push(occurrence);
    }
  };
  // Build this map first so preference does not depend on extraction order.
  for (const link of links) {
    if (link.source === 'evm' || !/^https?:\/\//i.test(link.href)) continue;
    const address = addressOf(link);
    if (!address) continue;
    const existing = destinations.get(address);
    if (!existing || (link.source === 'a' && existing.original.source !== 'a')) {
      destinations.set(address, {original: link, merged: {...link, evmOccurrences: [occurrenceOf(link)]}});
    }
  }
  for (const link of links) {
    const destination = destinations.get(addressOf(link));
    if (link.source !== 'evm') {
      result.push(destination?.original === link ? destination.merged : link);
      continue;
    }
    const occurrence = occurrenceOf(link);
    if (destination) {
      appendOccurrence(destination.merged, occurrence);
      continue;
    }
    const key = getLinkIdentity({...link, evmSourceUrl: ''}) + ':' + (link.evmPackage || '');
    const existing = seen.get(key);
    if (existing) appendOccurrence(existing, occurrence);
    else {
      const merged = {...link, evmOccurrences: [occurrence]};
      seen.set(key, merged);
      result.push(merged);
    }
  }
  return result;
}
