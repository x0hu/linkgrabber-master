import {isExcludedAddress} from './excludedAddresses.js';
import fallbackCatalog from './chainRpcFallback.js';

export const CHAINS = [
  [56, 'BNB'], [1, 'Ethereum'], [8453, 'Base'], [143, 'Monad'],
  [43114, 'Avalanche'], [42161, 'Arbitrum'], [999, 'HyperEVM'],
  [4663, 'Robinhood'], [11155111, 'Ethereum Sepolia'], [84532, 'Base Sepolia'],
  [57073, 'Ink'], [196, 'X Layer'],
].map(([id, name]) => ({id, name}));
export const RPC_TIMEOUT_MS = 2500;
export const LOOKUP_BUDGET_MS = 15000;
export const ADDRESS_CACHE_TTL_MS = 5 * 60 * 1000;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function publicRpcUrls(rpcs = []) {
  return [...new Set(rpcs.map(rpc => typeof rpc === 'string' ? rpc : rpc?.url).filter(value => {
    if (typeof value !== 'string' || /[{}$<>]|api[_-]?key|YOUR_|%7b/i.test(value)) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.search &&
        !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.)/.test(url.hostname);
    } catch (e) { return false; }
  }))];
}

async function fetchJson(url, options, timeout, fetcher, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetcher(url, {...options, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
    if (!response.ok) throw new Error('RPC HTTP error');
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function loadRpcCatalog(storage, fetcher = fetch, signal) {
  let saved;
  try { saved = (await storage.get('rpcCatalog')).rpcCatalog; } catch (e) { /* Use bundled endpoints. */ }
  if (saved && Date.now() - saved.at < CACHE_TTL_MS) return saved.chains;
  try {
    const catalog = await fetchJson('https://chainlist.org/rpcs.json', {}, RPC_TIMEOUT_MS, fetcher, signal);
    if (!Array.isArray(catalog)) throw new Error('Invalid catalog');
    const chains = Object.fromEntries(CHAINS.map(chain => {
      const entry = catalog.find(item => item.chainId === chain.id);
      const urls = publicRpcUrls(entry?.rpc);
      return [chain.id, urls.length ? urls : fallbackCatalog[chain.id]];
    }));
    try { await storage.set({rpcCatalog: {at: Date.now(), chains}}); } catch (e) { /* Cache is optional. */ }
    return chains;
  } catch (e) { return saved?.chains || fallbackCatalog; }
}

// Some older tokens return bytes32 rather than an ABI string.
export function decodeTokenText(hex) {
  if (typeof hex !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(hex)) return '';
  const body = hex.slice(2);
  let bytes;
  if (body.length === 64) bytes = body;
  else {
    const offset = Number.parseInt(body.slice(0, 64), 16) * 2;
    if (!Number.isSafeInteger(offset) || offset < 64 || offset + 64 > body.length) return '';
    const length = Number.parseInt(body.slice(offset, offset + 64), 16);
    if (!Number.isSafeInteger(length) || length > 256 || offset + 64 + length * 2 > body.length) return '';
    bytes = body.slice(offset + 64, offset + 64 + length * 2);
  }
  return new TextDecoder().decode(Uint8Array.from(bytes.match(/../g) || [], byte => parseInt(byte, 16)))
    .replace(/\0+$/g, '').split('').filter(char => char.charCodeAt(0) >= 32 && !(char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159))
    .join('').replace(/[\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 128);
}

export function createRpcClient({fetcher = fetch, random = Math.random, now = Date.now, timeoutMs = RPC_TIMEOUT_MS} = {}) {
  const preferred = new Map();
  const cooling = new Map();
  return async function lookup(chainId, addresses, urls, {signal, deadline = now() + LOOKUP_BUDGET_MS} = {}) {
    const candidates = publicRpcUrls(urls);
    const start = Math.floor(random() * candidates.length);
    const rotated = [...candidates.slice(start), ...candidates.slice(0, start)];
    const ordered = [...new Set([preferred.get(chainId), ...rotated].filter(Boolean))]
      .filter(url => (cooling.get(url) || 0) <= now()).slice(0, 3);
    const calls = [{jsonrpc: '2.0', id: 0, method: 'eth_chainId', params: []}];
    addresses.forEach((address, index) => {
      calls.push({jsonrpc: '2.0', id: index * 5 + 1, method: 'eth_getCode', params: [address, 'latest']});
      ['eth_getBalance', 'eth_getTransactionCount'].forEach((method, field) => calls.push({jsonrpc: '2.0', id: index * 5 + 4 + field, method, params: [address, 'latest']}));
      ['0x06fdde03', '0x95d89b41'].forEach((data, field) => calls.push({jsonrpc: '2.0', id: index * 5 + 2 + field, method: 'eth_call', params: [{to: address, data}, 'latest']}));
    });
    for (const url of ordered) {
      if (signal?.aborted || now() >= deadline) break;
      try {
        const response = await fetchJson(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(calls)}, Math.min(timeoutMs, deadline - now()), fetcher, signal);
        if (!Array.isArray(response)) throw new Error('Batch unsupported');
        const byId = new Map(response.map(item => [item.id, item]));
        if (byId.size !== calls.length || Number(byId.get(0)?.result) !== chainId) throw new Error('Wrong chain or incomplete batch');
        const result = addresses.map((address, index) => {
          const code = byId.get(index * 5 + 1)?.result;
          if (typeof code !== 'string' || !/^0x(?:[a-f0-9]{2})*$/i.test(code)) throw new Error('Code lookup failed');
          const fields = [2, 3].map(field => {
            const response = byId.get(index * 5 + field);
            // A contract revert is valid missing metadata; provider errors need another RPC.
            if (response?.error && response.error.code !== 3 && !/revert/i.test(response.error.message || '')) throw new Error('Metadata RPC failure');
            return decodeTokenText(response?.result);
          });
          const quantities = [4, 5].map(field => {
            const value = byId.get(index * 5 + field)?.result;
            if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new Error('Balance or nonce lookup failed');
            return value;
          });
          return {version: 2, balance: quantities[0], transactionCount: quantities[1], address, chainId, hasCode: code !== '0x', name: fields[0], symbol: fields[1], checkedAt: now()};
        });
        preferred.set(chainId, url);
        return result;
      } catch (e) {
        cooling.set(url, now() + 60000);
        preferred.delete(chainId);
      }
    }
    throw new Error(signal?.aborted ? 'Lookup cancelled' : 'RPC unavailable or timed out');
  };
}

// Web Locks serialize the read/merge/write across extension result tabs.
// The promise queue also serializes callers in environments without Web Locks.
let cacheWrites = Promise.resolve();
export function persistAddressMetadata(storage, entries) {
  const save = async () => {
    const {addressMetadata = {}} = await storage.get('addressMetadata');
    for (const entry of entries) {
      const key = `${entry.chainId}:${entry.address}`;
      if (!addressMetadata[key] || addressMetadata[key].checkedAt <= entry.checkedAt) addressMetadata[key] = entry;
    }
    const bounded = Object.fromEntries(Object.entries(addressMetadata).sort((a, b) => b[1].checkedAt - a[1].checkedAt).slice(0, 5000));
    await storage.set({addressMetadata: bounded});
  };
  const run = () => typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('linkgrabber-address-cache', save) : save();
  cacheWrites = cacheWrites.catch(() => {}).then(run);
  return cacheWrites;
}

export async function enrichAddresses(addresses, chains, {storage, onResults, signal, fetcher = fetch, budgetMs = LOOKUP_BUDGET_MS, forceRefresh = false, resolver = null}) {
  const deadline = Date.now() + budgetMs;
  const unique = [...new Set(addresses.filter(address => /^0x[0-9a-f]{40}$/i.test(address) && !isExcludedAddress(address)).map(address => address.toLowerCase()))];
  const selected = unique.slice(0, 100);
  let cache = {};
  try { cache = (await storage.get('addressMetadata')).addressMetadata || {}; } catch (e) { /* Continue without cache. */ }
  const jobs = [];
  const results = [];
  for (const chain of chains) {
    const missing = [];
    for (const address of selected) {
      const entry = cache[`${chain.id}:${address}`];
      if (!forceRefresh && entry?.version === 2 && Date.now() - entry.checkedAt < ADDRESS_CACHE_TTL_MS) results.push(entry);
      else missing.push(address);
    }
    for (let i = 0; i < missing.length; i += 10) jobs.push({chain, offset: i, addresses: missing.slice(i, i + 10)});
  }
  if (resolver && jobs.length && !forceRefresh && !signal?.aborted) {
    try {
      const cached = await resolver.lookup([...new Set(jobs.flatMap(job => job.addresses))], chains.map(chain => chain.id));
      const present = new Set(results.map(entry => `${entry.chainId}:${entry.address}`));
      for (const entry of cached) {
        const key = `${entry.chainId}:${entry.address}`;
        if (!present.has(key)) { results.push(entry); present.add(key); }
      }
      for (const job of jobs) job.addresses = job.addresses.filter(address => !present.has(`${job.chain.id}:${address}`));
      for (let i = jobs.length - 1; i >= 0; i--) if (!jobs[i].addresses.length) jobs.splice(i, 1);
      try { await persistAddressMetadata(storage, cached); } catch (e) { /* Local cache optional. */ }
    } catch (e) { /* RPC fallback remains available. */ }
  }
  jobs.sort((a, b) => a.offset - b.offset);
  onResults(results.slice());
  if (!jobs.length) return {failed: 0, skipped: Math.max(0, unique.length - selected.length)};
  const catalog = await loadRpcCatalog(storage, fetcher, signal);
  const lookup = createRpcClient({fetcher});
  let failed = 0;
  const remoteWrites = [];
  async function worker() {
    while (jobs.length && !signal?.aborted && Date.now() < deadline) {
      const job = jobs.shift();
      try {
        const entries = await lookup(job.chain.id, job.addresses, catalog[job.chain.id], {signal, deadline});
        results.push(...entries);
        if (resolver) remoteWrites.push(resolver.store(entries).catch(() => {}));
        if (!signal?.aborted) onResults(results.slice());
        try { await persistAddressMetadata(storage, entries); } catch (e) { /* Keep displaying results if storage is full. */ }
      } catch (e) { failed++; }
    }
  }
  await Promise.all(Array.from({length: 4}, worker));
  await Promise.all(remoteWrites);
  return {failed: failed + jobs.length, skipped: Math.max(0, unique.length - selected.length)};
}
