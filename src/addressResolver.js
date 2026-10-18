import {CHAINS, ADDRESS_CACHE_TTL_MS} from './chainRpc';
import {isExcludedAddress} from './excludedAddresses';

export function normalizeResolverUrl(value) {
  if (!value.trim()) return '';
  try {
    const url = new URL(value.trim());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.href.replace(/\/+$/, '');
  } catch (e) { return null; }
}

export function createAddressResolver(baseUrl, {fetcher = fetch, signal} = {}) {
  const base = normalizeResolverUrl(baseUrl || '');
  if (!base) return null;
  const resolver = {failed: false};
  async function request(path, body) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, 2500);
    try {
      const response = await fetcher(base + '/linkgrabber/' + path, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
        credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Resolver unavailable');
      const data = await response.json();
      if (data?.ok !== true) throw new Error('Invalid resolver response');
      return data;
    } catch (e) { resolver.failed = true; throw e; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  resolver.lookup = async (addresses, chainIds) => {
    const data = await request('lookup', {addresses, chainIds});
    if (!Array.isArray(data.entries) || data.entries.length > addresses.length * chainIds.length) throw new Error('Invalid entries');
    return data.entries.filter(entry => entry && addresses.includes(entry.address) && chainIds.includes(entry.chainId) &&
      CHAINS.some(chain => chain.id === entry.chainId) && entry.version === 2 && typeof entry.hasCode === 'boolean' &&
      ['name', 'symbol'].every(field => typeof entry[field] === 'string' && entry[field].length <= 128) &&
      ['balance', 'transactionCount'].every(field => typeof entry[field] === 'string' && /^0x[0-9a-f]{1,64}$/i.test(entry[field])) &&
      Number.isSafeInteger(entry.checkedAt) && entry.checkedAt <= Date.now() && Date.now() - entry.checkedAt < ADDRESS_CACHE_TTL_MS);
  };
  resolver.store = entries => request('metadata', {entries});
  resolver.scan = async ({scanId, source, links}) => {
    if (!scanId) return []; // Older saved results do not create a new scan on reopen.
    const addresses = [...new Set(links.map(link => (link.evmAddress || link.address || '').toLowerCase())
      .filter(address => /^0x[0-9a-f]{40}$/.test(address) && !isExcludedAddress(address)))];
    if (addresses.length > 10000) throw new Error('Site history scan limit exceeded');
    const data = await request('scans', {scanId, hostname: new URL(source).hostname, addresses});
    if (!Array.isArray(data.observations)) throw new Error('Invalid site observations');
    return data.observations.filter(item => addresses.includes(item.address) && Number.isSafeInteger(item.seenCount) && item.seenCount > 0)
      .map(item => ({...item, siteDomain: typeof data.siteDomain === 'string' ? data.siteDomain : ''}));
  };
  return resolver;
}
