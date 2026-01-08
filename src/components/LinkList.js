import React from 'react';
import {useEffect, useRef, useState} from 'react';
import cx from 'classnames';
import debounce from 'lodash.debounce';
import LinkListEmpty from './LinkListEmpty';
import LinkListExpired from './LinkListExpired';
import './LinkList.css';

function copyLinks(element) {
  const selection = window.getSelection();
  const prevRange = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const tmp = document.createElement('div');
  const links = element.querySelectorAll('a');
  for (let i = 0; i < links.length; i++) {
    const clone = links[i].cloneNode(true);
    delete (clone.dataset.reactid);
    tmp.appendChild(clone);
    tmp.appendChild(document.createElement('br'));
  }
  document.body.appendChild(tmp);
  const copyFrom = document.createRange();
  copyFrom.selectNodeContents(tmp);
  selection.removeAllRanges();
  selection.addRange(copyFrom);
  document.execCommand('copy');
  document.body.removeChild(tmp);
  selection.removeAllRanges();
  if (prevRange) {
    selection.addRange(prevRange);
  }
}

function groupLinksByDomain(links, sourceUrl) {
  // Extract current domain from source URL
  let currentDomain = '';
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      currentDomain = url.hostname.toLowerCase();
    } catch (e) {}
  }

  const indexes = new Array(links.length);
  const rh = new Array(links.length);
  const isCurrentDomain = new Array(links.length);
  for (let i = 0; i < links.length; i++) {
    indexes[i] = i;
    const hostname = links[i].hostname.toLowerCase();
    rh[i] = hostname.split('.').reverse().join('.');
    // Check if link belongs to current domain (exact match or subdomain)
    isCurrentDomain[i] = hostname === currentDomain ||
                         hostname.endsWith('.' + currentDomain) ||
                         currentDomain.endsWith('.' + hostname);
  }
  indexes.sort((i, j) => {
    // Current domain links come first
    if (isCurrentDomain[i] && !isCurrentDomain[j]) return -1;
    if (!isCurrentDomain[i] && isCurrentDomain[j]) return 1;
    // Then sort alphabetically by reversed hostname
    if (rh[i] < rh[j]) return -1;
    if (rh[i] > rh[j]) return 1;
    return i - j;
  });
  return indexes.map(i => links[i]);
}

function mapBlocked(links, blockedDomains) {
  blockedDomains = new Set(blockedDomains);
  return links.map(link => {
    let hostname = link.hostname.toLowerCase();
    const dots = [];
    for (let i = 0; i < hostname.length; i++) {
      if (hostname[i] === '.') {
        dots.push(i);
      }
    }
    if (blockedDomains.has(hostname)) {
      return true;
    }
    for (const dot of dots) {
      if (blockedDomains.has(hostname.substr(dot + 1))) {
        blockedDomains.add(hostname);
        return true;
      }
    }
    return false;
  });
}

function mapDuplicates(links) {
  const uniq = new Set();
  return links.map(link => {
    if (uniq.has(link.href)) {
      return true;
    }
    uniq.add(link.href);
    return false;
  });
}

function rejectSameOrigin(links, sourceUrl) {
  if (!sourceUrl) {
    return links;
  }
  if (!sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://')) {
    return links;
  }
  const parser = document.createElement('a');
  parser.href = sourceUrl;
  if (!parser.origin) {
    return links;
  }
  return links.filter(link => link.origin !== parser.origin);
}

function isTwitterLink(hostname) {
  const lowerHostname = hostname.toLowerCase();
  return lowerHostname === 'x.com' || lowerHostname === 'twitter.com';
}

function isSolanaAddress(href) {
  const address = href.split('/').pop();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) || 
         /^(So|sol)[1-9A-HJ-NP-Za-km-z]{32,44}$/i.test(address);
}

function isEthAddress(href) {
  const lastUrlPart = href.split('/').pop();
  return /^(0x)?[0-9a-fA-F]{40}$/.test(lastUrlPart);
}

function isDocumentationLink(hostname) {
  const lowerHostname = hostname.toLowerCase();
  return lowerHostname.includes('github.com') || 
         lowerHostname.includes('gitbook') || 
         lowerHostname.includes('docs.') || 
         lowerHostname.includes('whitepaper');
}

function isTelegramLink(hostname) {
  const lowerHostname = hostname.toLowerCase();
  return lowerHostname === 't.me';
}

function isDiscordLink(hostname) {
  const lowerHostname = hostname.toLowerCase();
  return lowerHostname.includes('discord.com') || lowerHostname === 'discord.gg';
}

export default function LinkList(props) {
  const linkListRef = useRef(null);

  const [filter, setFilter] = useState('');
  const [nextFilter, setNextFilter] = useState('');
  const [groupByDomain, setGroupByDomain] = useState(true);
  const [hideBlockedDomains, setHideBlockedDomains] = useState(true);
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [hideSameOrigin, setHideSameOrigin] = useState(false);

  const applyFilter = debounce(() => setFilter(nextFilter), 100, {trailing: true});
  const filterChanged = (event) => setNextFilter(event.target.value);
  const toggleBlockedLinks = () => setHideBlockedDomains(x => !x);
  const toggleDedup = () => setHideDuplicates(x => !x);
  const toggleGroupByDomain = () => setGroupByDomain(x => !x);
  const toggleHideSameOrigin = () => setHideSameOrigin(x => !x);

  useEffect(() => {
    const h = (event) => {
      const selection = window.getSelection();
      if (selection.type === 'None' || selection.type === 'Caret') {
        copyLinks();
      }
    };
    window.document.addEventListener('copy', h);
    return () => {
      window.document.removeEventListener('copy', h);
    };
  }, []);

  useEffect(applyFilter, [nextFilter]);

  if (props.expired) {
    return (<LinkListExpired />);
  }

  let links = props.links.slice(0);
  if (links.length === 0) {
    return (<LinkListEmpty source={props.source} />);
  }

  if (hideSameOrigin) {
    links = rejectSameOrigin(links, props.source);
  }
  if (groupByDomain) {
    links = groupLinksByDomain(links, props.source);
  }

  const blocked = mapBlocked(links, props.blockedDomains);
  const duplicates = mapDuplicates(links);
  const filterLowerCase = filter.trim().toLowerCase();

  const aTagItems = [];
  const scriptItems = [];
  const imageItems = [];

  // Image file extensions
  const imageExtensions = /\.(jpe?g|png|gif|webp|svg|ico|bmp|tiff?|avif)(\?|#|$)/i;

  links.forEach((link, index) => {
    if (hideDuplicates && duplicates[index]) return;
    if (hideBlockedDomains && blocked[index]) return;
    if (filterLowerCase) {
      const lowerHref = link.href.toLowerCase();
      if (lowerHref.indexOf(filterLowerCase) < 0) return;
    }
    const itemClassName = cx('LinkListItem', {
      'LinkListItem--blocked': blocked[index],
      'LinkListItem--duplicate': duplicates[index],
      'LinkListItem--twitter': isTwitterLink(link.hostname),
      'LinkListItem--solana': isSolanaAddress(link.href),
      'LinkListItem--eth': isEthAddress(link.href),
      'LinkListItem--docs': isDocumentationLink(link.hostname),
      'LinkListItem--telegram': isTelegramLink(link.hostname),
      'LinkListItem--discord': isDiscordLink(link.hostname),
    });
    const item = (
      <li key={index} className={itemClassName}>
        <a href={link.href} target="_blank">{link.href}</a>
      </li>
    );
    // Categorize by source and type
    const isImage = link.source === 'image' || imageExtensions.test(link.href);
    if (isImage) {
      imageItems.push(item);
    } else if (link.source === 'script') {
      scriptItems.push(item);
    } else {
      aTagItems.push(item);
    }
  });

  const items = [...aTagItems, ...imageItems, ...scriptItems];

  const aTagListRef = useRef(null);
  const scriptListRef = useRef(null);
  const imageListRef = useRef(null);

  return (
    <div className="container-fluid">
      <h1 className="LinkPageHeader">{props.source}</h1>
      <div className="clearfix">
        <div className="form-inline LinkPageOptionsForm">
          <div className="form-group">
            <label className="checkbox-inline">
              <input type="checkbox" checked={hideDuplicates} onChange={toggleDedup} /> Hide duplicate links
            </label>
            <label className="checkbox-inline">
              <input type="checkbox" checked={hideBlockedDomains} onChange={toggleBlockedLinks} /> Hide blocked links
            </label>
            <label className="checkbox-inline">
              <input type="checkbox" checked={hideSameOrigin} onChange={toggleHideSameOrigin} /> Hide same origin
            </label>
            <label className="checkbox-inline">
              <input type="checkbox" checked={groupByDomain} onChange={toggleGroupByDomain} /> Group by domain
            </label>
          </div>
          <div className="form-group">
            <input type="text" className="form-control" placeholder="substring filter" autoFocus value={nextFilter} onChange={filterChanged} />
          </div>
          <div className="form-group LinkPageStatus">
            <button className="btn btn-default" disabled={items.length === 0} onClick={() => copyLinks(linkListRef.current)}>
              Copy All {items.length} / {props.links.length}
            </button>
          </div>
        </div>
      </div>
      <div ref={linkListRef} className="LinkListColumns">
        <div className="LinkListColumnGroup">
          <div className="LinkListColumn">
            <h3 className="LinkListColumnHeader">
              HTML Links ({aTagItems.length})
              <button className="btn btn-xs btn-default" disabled={aTagItems.length === 0} onClick={() => copyLinks(aTagListRef.current)}>Copy</button>
            </h3>
            <ul ref={aTagListRef} className="LinkList">
              {aTagItems}
            </ul>
          </div>
          <div className="LinkListColumn">
            <h3 className="LinkListColumnHeader">
              Images ({imageItems.length})
              <button className="btn btn-xs btn-default" disabled={imageItems.length === 0} onClick={() => copyLinks(imageListRef.current)}>Copy</button>
            </h3>
            <ul ref={imageListRef} className="LinkList">
              {imageItems}
            </ul>
          </div>
        </div>
        <div className="LinkListColumn">
          <h3 className="LinkListColumnHeader">
            Embedded Links ({scriptItems.length})
            <button className="btn btn-xs btn-default" disabled={scriptItems.length === 0} onClick={() => copyLinks(scriptListRef.current)}>Copy</button>
          </h3>
          <ul ref={scriptListRef} className="LinkList">
            {scriptItems}
          </ul>
        </div>
      </div>
    </div>
  );
}
