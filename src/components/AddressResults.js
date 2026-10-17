import React, {useEffect, useRef, useState} from 'react';
import LinkList from './LinkList';
import {CHAINS, enrichAddresses} from '../chainRpc';

export default function AddressResults(props) {
  const [enabled, setEnabled] = useState(null);
  const [metadata, setMetadata] = useState([]);
  const [status, setStatus] = useState('');
  const lastRefresh = useRef(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    chrome.storage.local.get('metadataChains').then(saved => {
      setEnabled(Array.isArray(saved.metadataChains) ? saved.metadataChains : CHAINS.map(chain => chain.id));
    }).catch(() => setEnabled(CHAINS.map(chain => chain.id)));
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
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
      forceRefresh, storage: chrome.storage.local, signal: controller.signal, onResults: values => { if (!controller.signal.aborted) setMetadata(values); },
    }).then(({failed, skipped}) => {
      if (!controller.signal.aborted) setStatus(`${failed ? 'Some lookups timed out or were unavailable.' : 'Lookup complete.'}${skipped ? ` Checked the first 100 unique addresses; ${skipped} were not checked.` : ''}`);
    }).catch(() => { if (!controller.signal.aborted) setStatus('Metadata lookup unavailable.'); });
    return () => controller.abort();
  }, [props.links, enabled, revision]);
  const toggle = id => {
    const next = enabled.includes(id) ? enabled.filter(value => value !== id) : [...enabled, id];
    setEnabled(next);
    chrome.storage.local.set({metadataChains: next}).catch(() => {});
  };
  return (<>
    <details className="LinkMetadataOptions">
      <summary>Address lookup chains</summary>
      <p>Public RPCs receive address lookups. Checks use a shared local cache for five minutes across sites. Refresh bypasses it. Activity checks cover sent transactions, not complete history or token balances.</p>
      {CHAINS.map(chain => (<label key={chain.id}>
        <input type="checkbox" disabled={!enabled} checked={!!enabled?.includes(chain.id)} onChange={() => toggle(chain.id)} /> {chain.name}
      </label>))}
    </details>
    <div className="LinkMetadataStatus" role="status">{status} {status && <button type="button" onClick={() => setRevision(value => value + 1)}>Refresh chain checks</button>}</div>
    <LinkList {...props} metadata={metadata} />
  </>);
}
