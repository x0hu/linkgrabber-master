import {createAddressResolver} from '../addressResolver';
import React, {useEffect, useRef, useState} from 'react';
import LinkList from './LinkList';
import {CHAINS, enrichAddresses} from '../chainRpc';

export default function AddressResults(props) {
  const [enabled, setEnabled] = useState(null);
  const [metadata, setMetadata] = useState([]);
  const [resolverUrl, setResolverUrl] = useState(null);
  const [observations, setObservations] = useState([]);
  const [historyStatus, setHistoryStatus] = useState('');
  const [status, setStatus] = useState('');
  const lastRefresh = useRef(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    chrome.storage.sync.get('addressResolverUrl').then(saved => setResolverUrl(saved.addressResolverUrl || '')).catch(() => setResolverUrl(''));
    const changed = (changes, area) => { if (area === 'sync' && changes.addressResolverUrl) setResolverUrl(changes.addressResolverUrl.newValue || ''); };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);
  useEffect(() => {
    chrome.storage.local.get('metadataChains').then(saved => {
      setEnabled(Array.isArray(saved.metadataChains) ? saved.metadataChains : CHAINS.map(chain => chain.id));
    }).catch(() => setEnabled(CHAINS.map(chain => chain.id)));
  }, []);
  useEffect(() => {
    if (!enabled || resolverUrl === null) return;
    const controller = new AbortController();
    const resolver = createAddressResolver(resolverUrl, {signal: controller.signal});
    const addresses = props.links.map(link => link.evmAddress || link.address || '').filter(Boolean);
    setMetadata([]);
    if (!enabled.length || !addresses.length) {
      setStatus('');
      return () => controller.abort();
    }
    const forceRefresh = revision !== lastRefresh.current;
    lastRefresh.current = revision;
    setStatus('Checking contract locations, native balances and sent transactions…');
    enrichAddresses(addresses, CHAINS.filter(chain => enabled.includes(chain.id)), {
      resolver, forceRefresh, storage: chrome.storage.local, signal: controller.signal, onResults: values => { if (!controller.signal.aborted) setMetadata(values); },
    }).then(({failed, skipped}) => {
      if (!controller.signal.aborted) setStatus(`${failed ? 'Some lookups timed out or were unavailable.' : 'Lookup complete.'}${resolver?.failed ? ' Resolver unavailable; using local/RPC results.' : ''}${skipped ? ` Checked the first 100 unique addresses; ${skipped} were not checked.` : ''}`);
    }).catch(() => { if (!controller.signal.aborted) setStatus('Metadata lookup unavailable.'); });
    return () => controller.abort();
  }, [props.links, enabled, revision, resolverUrl]);
  useEffect(() => {
    setObservations([]);
    setHistoryStatus('');
    if (!resolverUrl || !props.scanId) return;
    const controller = new AbortController();
    const resolver = createAddressResolver(resolverUrl, {signal: controller.signal});
    if (!resolver) return;
    resolver.scan({scanId: props.scanId, source: props.source, links: props.links}).then(values => {
      if (!controller.signal.aborted) setObservations(values);
    }).catch(() => { if (!controller.signal.aborted) setHistoryStatus('Site history could not be saved. Reopen these results to retry without double-counting.'); });
    return () => controller.abort();
  }, [props.scanId, props.source, props.links, resolverUrl]);
  const toggle = id => {
    const next = enabled.includes(id) ? enabled.filter(value => value !== id) : [...enabled, id];
    setEnabled(next);
    chrome.storage.local.set({metadataChains: next}).catch(() => {});
  };
  return (<>
    <div className="LinkMetadataOptions"><button type="button" onClick={() => chrome.runtime.openOptionsPage()}>Resolver settings</button> {resolverUrl ? 'Remote cache and site history enabled' : 'Local cache only'}</div>
    <details className="LinkMetadataOptions">
      <summary>Address lookup chains</summary>
      <p>Public RPCs receive address lookups. Checks use a shared local cache for five minutes across sites. Refresh bypasses it. Activity checks cover sent transactions, not complete history or token balances.</p>
      {CHAINS.map(chain => (<label key={chain.id}>
        <input type="checkbox" disabled={!enabled} checked={!!enabled?.includes(chain.id)} onChange={() => toggle(chain.id)} /> {chain.name}
      </label>))}
    </details>
    <div className="LinkMetadataStatus" role="status">{status} {status && <button type="button" onClick={() => setRevision(value => value + 1)}>Refresh chain checks</button>}</div>
    {historyStatus && <div className="LinkMetadataStatus" role="status">{historyStatus}</div>}
    <LinkList {...props} metadata={metadata} observations={observations} />
  </>);
}
