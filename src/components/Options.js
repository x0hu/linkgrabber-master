import {normalizeResolverUrl} from '../addressResolver';
import React, {useState} from 'react';
import './Options.css';

export default function Options(props) {
  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-sm-6">
          <ResolverEditor key={props.resolverUrl} url={props.resolverUrl} save={props.setResolverUrl} />
          <h2>Blocked Domains</h2>

          <BlockedDomainsEditor
            blockedDomains={props.blockedDomains}
            setBlockedDomains={props.setBlockedDomains}
            />

        </div>
      </div>
    </div>
  );
}

function BlockedDomainsEditor(props) {
  const [saved, setSaved] = useState(false);

  const onSubmit = (event) => {
    event.preventDefault();
    setSaved(false);
    const formData = new FormData(event.target);
    props.setBlockedDomains(formData.get('blockedDomains').split('\n'));
    setSaved(true);
  };

  const blockedDomainsText = props.blockedDomains.join('\n');

  return (
    <form onSubmit={onSubmit}>
      <p>
        Links from blocked domains will be hidden by default
        <br /> Enter one domain per line
        <br /> Lines starting with <strong>#</strong> will be ignored
        <br /> <code>example.com</code> will also block <code>www.example.com</code>
      </p>
      <div className="form-group">
        <textarea
          className="form-control"
          name="blockedDomains"
          rows="15"
          defaultValue={blockedDomainsText}
          />
      </div>
      <div className="d-flex align-items-center">
        <div className="flex-grow-1">
          {
            saved ? (
              <div className="text-success">
                Saved
              </div>
            ): null
          }
        </div>
        <div className="flex-grow-0">
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </div>
    </form>
  );
}

function ResolverEditor({url = '', save}) {
  const [value, setValue] = useState(url);
  const [status, setStatus] = useState('');
  const submit = async event => {
    event.preventDefault();
    const normalized = normalizeResolverUrl(value);
    if (normalized === null) { setStatus('Enter an HTTPS resolver URL, or HTTP for localhost. Do not include credentials, query parameters or a fragment.'); return; }
    try { await save(normalized); setStatus('Saved'); }
    catch (e) { setStatus('Could not save the resolver URL.'); }
  };
  return (<form onSubmit={submit}>
    <h2>Link Grabber resolver</h2>
    <p>Use your evmoleSIG service for a shared address cache and site history. Saving a URL enables sending address metadata, scanned hostnames and found addresses to that service. Full page URLs and script contents are not sent. Leave blank to use only local storage.</p>
    <label htmlFor="addressResolverUrl">Resolver URL</label>
    <input id="addressResolverUrl" className="form-control" type="url" value={value} onChange={event => setValue(event.target.value)} placeholder="https://your-resolver.example" />
    <button className="btn btn-primary" type="submit">Save resolver</button>
    <p role="status">{status}</p>
  </form>);
}
