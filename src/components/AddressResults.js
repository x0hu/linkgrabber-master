import {createAddressResolver} from '../addressResolver';
import React, {useEffect, useRef, useState} from 'react';
import LinkList from './LinkList';
import {CHAINS, enrichAddresses} from '../chainRpc';

export default function AddressResults(props) {
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
    if (resolverUrl === null) return;
    const controller = new AbortController();
    const resolver = createAddressResolver(resolverUrl, {signal: controller.signal});
    const addresses = props.links.map(link => link.evmAddress || link.address || '').filter(Boolean);
    setMetadata([]);
    if (!addresses.length) {
      setStatus('');
      return () => controller.abort();
    }
    const forceRefresh = revision !== lastRefresh.current;
    lastRefresh.current = revision;
    setStatus('Checking contract locations, native balances and sent transactions…');
    enrichAddresses(addresses, CHAINS, {
      resolver, forceRefresh, storage: chrome.storage.local, signal: controller.signal, onResults: values => { if (!controller.signal.aborted) setMetadata(values); },
    }).then(({failed, skipped}) => {
      if (!controller.signal.aborted) setStatus(`${failed ? 'Some lookups timed out or were unavailable.' : 'Lookup complete.'}${resolver?.failed ? ' Resolver unavailable; using local/RPC results.' : ''}${skipped ? ` Checked the first 100 unique addresses; ${skipped} were not checked.` : ''}`);
    }).catch(() => { if (!controller.signal.aborted) setStatus('Metadata lookup unavailable.'); });
    return () => controller.abort();
  }, [props.links, revision, resolverUrl]);
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
  return (<LinkList {...props} metadata={metadata} observations={observations}
    toolbarControls={<>
      <button type="button" onClick={() => chrome.runtime.openOptionsPage()}>Resolver settings</button>
      <button type="button" title={status || 'Refresh chain checks'} onClick={() => setRevision(value => value + 1)}>Refresh chain checks</button>
    </>}
    toolbarStatus={historyStatus} />);
}
