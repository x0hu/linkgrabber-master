import React from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';
import cx from 'classnames';
import debounce from 'lodash.debounce';
import LinkListEmpty from './LinkListEmpty';
import LinkListExpired from './LinkListExpired';
import './LinkList.css';

// Image file extensions (moved outside component to avoid re-creation)
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|ico|bmp|tiff?|avif)(\?|#|$)/i;

function copyLinks(element) {
  if (!element) {
    return;
  }
  const selection = window.getSelection();
  const prevRange = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const tmp = document.createElement('div');
  const items = element.querySelectorAll('a, [data-copy-value]');
  for (let i = 0; i < items.length; i++) {
    const copyValue = items[i].dataset.copyValue;
    if (copyValue) {
      tmp.appendChild(document.createTextNode(copyValue));
    } else {
      const clone = items[i].cloneNode(true);
      delete (clone.dataset.reactid);
      tmp.appendChild(clone);
    }
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

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  return Promise.resolve(copied);
}

// Extract base domain (e.g., app.lighter.xyz -> lighter.xyz)
function getBaseDomain(hostname) {
  const parts = hostname.toLowerCase().split('.');
  // Handle common TLDs - keep last 2 parts, or 3 for co.uk style
  if (parts.length <= 2) return hostname.toLowerCase();
  // Check for two-part TLDs like co.uk, com.au, etc.
  const lastTwo = parts.slice(-2).join('.');
  const twoPartTlds = ['co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.kr'];
  if (twoPartTlds.includes(lastTwo) && parts.length > 2) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

// Get priority tier for a highlighted link (lower = higher priority)
function getHighlightPriority(link) {
  const hostname = link.hostname.toLowerCase();
  if (isTwitterLink(hostname)) return 1;
  if (isTelegramLink(hostname)) return 2;
  if (isDiscordLink(hostname)) return 3;
  if (isInstagramLink(hostname)) return 4;
  if (isDocumentationLink(hostname)) return 5;
  if (isEvmAddressLink(link.href)) return 6;
  if (isSolanaAddress(link.href)) return 7;
  return 8;
}

function groupLinksByDomain(links, sourceUrl) {
  // Extract current base domain from source URL
  let currentBaseDomain = '';
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      currentBaseDomain = getBaseDomain(url.hostname);
    } catch (e) {
      // Leave the current domain empty when the source URL is malformed.
    }
  }

  const indexes = new Array(links.length);
  const rh = new Array(links.length);
  const isCurrentDomain = new Array(links.length);
  const highlightPriority = new Array(links.length);
  for (let i = 0; i < links.length; i++) {
    indexes[i] = i;
    const hostname = links[i].hostname.toLowerCase();
    rh[i] = hostname.split('.').reverse().join('.');
    // Check if link shares the same base domain
    const linkBaseDomain = getBaseDomain(hostname);
    isCurrentDomain[i] = linkBaseDomain === currentBaseDomain;
    highlightPriority[i] = getHighlightPriority(links[i]);
  }
  indexes.sort((i, j) => {
    // Highlighted links come first in the requested order.
    if (highlightPriority[i] !== highlightPriority[j]) {
      return highlightPriority[i] - highlightPriority[j];
    }
    // Then prefer the current site for uncategorized links.
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
    const key = getDuplicateKey(link);
    if (uniq.has(key)) {
      return true;
    }
    uniq.add(key);
    return false;
  });
}

function getDuplicateKey(link) {
  const evmAddress = getEvmAddress(link);
  if (evmAddress) {
    return `evm:${evmAddress.toLowerCase()}:${(link.evmReferenceDomain || link.hostname || '').toLowerCase()}`;
  }
  return link.href;
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
  return links.filter(link => link.source === 'evm' || link.origin !== parser.origin);
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

function getPathTail(href) {
  try {
    const url = new URL(href);
    const segments = url.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || '';
  } catch (e) {
    return href.split(/[?#]/)[0].split('/').pop();
  }
}

function isEvmAddressLink(href) {
  return /^0x[0-9a-fA-F]{40}$/.test(getPathTail(href));
}

function getEvmAddress(link) {
  if (link.evmAddress) return link.evmAddress;
  if (link.address && /^0x[0-9a-fA-F]{40}$/.test(link.address)) return link.address;
  if (isEvmAddressLink(link.href)) return getPathTail(link.href);
  return '';
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

function isInstagramLink(hostname) {
  return hostname.toLowerCase().includes('instagram.com');
}

export default function LinkList(props) {
  const linkListRef = useRef(null);
  const aTagListRef = useRef(null);
  const scriptListRef = useRef(null);
  const evmListRef = useRef(null);
  const imageListRef = useRef(null);
  const copiedTimeoutRef = useRef(null);

  const [filter, setFilter] = useState('');
  const [nextFilter, setNextFilter] = useState('');
  const [groupByDomain, setGroupByDomain] = useState(true);
  const [hideBlockedDomains, setHideBlockedDomains] = useState(true);
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [hideSameOrigin, setHideSameOrigin] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState('');

  const applyFilter = debounce(() => setFilter(nextFilter), 100, {trailing: true});
  const filterChanged = (event) => setNextFilter(event.target.value);
  const toggleBlockedLinks = () => setHideBlockedDomains(x => !x);
  const toggleDedup = () => setHideDuplicates(x => !x);
  const toggleGroupByDomain = () => setGroupByDomain(x => !x);
  const toggleHideSameOrigin = () => setHideSameOrigin(x => !x);
  const copyAddress = (address) => {
    copyText(address).then(copied => {
      if (!copied) return;
      setCopiedAddress(address);
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = setTimeout(() => {
        setCopiedAddress('');
        copiedTimeoutRef.current = null;
      }, 1200);
    });
  };

  useEffect(() => {
    const h = (event) => {
      const selection = window.getSelection();
      if (selection.type === 'None' || selection.type === 'Caret') {
        copyLinks(linkListRef.current);
      }
    };
    window.document.addEventListener('copy', h);
    return () => {
      window.document.removeEventListener('copy', h);
    };
  }, []);

  useEffect(applyFilter, [nextFilter]);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  if (props.expired) {
    return (<LinkListExpired />);
  }

  // Memoize expensive link processing to avoid recalculation on every render
  const processedLinks = useMemo(() => {
    let result = props.links.slice(0);
    if (hideSameOrigin) {
      result = rejectSameOrigin(result, props.source);
    }
    if (groupByDomain) {
      result = groupLinksByDomain(result, props.source);
    }
    return result;
  }, [props.links, props.source, hideSameOrigin, groupByDomain]);

  if (processedLinks.length === 0 && props.links.length === 0) {
    return (<LinkListEmpty source={props.source} />);
  }

  // Memoize blocked/duplicate maps
  const blocked = useMemo(() => mapBlocked(processedLinks, props.blockedDomains), [processedLinks, props.blockedDomains]);
  const duplicates = useMemo(() => mapDuplicates(processedLinks), [processedLinks]);

  // Memoize categorized items
  const { aTagItems, scriptItems, evmItems, imageItems } = useMemo(() => {
    const filterLowerCase = filter.trim().toLowerCase();
    const aTag = [];
    const script = [];
    const evmFromHtml = [];
    const evmFromEmbedded = [];
    const image = [];

    processedLinks.forEach((link, index) => {
      if (hideDuplicates && duplicates[index]) return;
      if (hideBlockedDomains && blocked[index]) return;
      if (filterLowerCase) {
        const lowerHref = link.href.toLowerCase();
        const lowerContext = `${link.context || ''} ${link.text || ''}`.toLowerCase();
        if (lowerHref.indexOf(filterLowerCase) < 0 && lowerContext.indexOf(filterLowerCase) < 0) return;
      }
      const itemClassName = cx('LinkListItem', {
        'LinkListItem--blocked': blocked[index],
        'LinkListItem--duplicate': duplicates[index],
        'LinkListItem--twitter': isTwitterLink(link.hostname),
        'LinkListItem--solana': isSolanaAddress(link.href),
        'LinkListItem--eth': isEvmAddressLink(link.href),
        'LinkListItem--docs': isDocumentationLink(link.hostname),
        'LinkListItem--telegram': isTelegramLink(link.hostname),
        'LinkListItem--discord': isDiscordLink(link.hostname),
        'LinkListItem--instagram': isInstagramLink(link.hostname),
      });
      // Categorize by source and type
      const isImage = link.source === 'image' || IMAGE_EXTENSIONS.test(link.href);
      if (isEvmAddressLink(link.href)) {
        if (link.source === 'evm') {
          const address = link.address || link.evmAddress || getPathTail(link.href);
          const context = link.context || link.text || '';
          const isCopied = copiedAddress === address;
          const item = (
            <li key={index} className={itemClassName}>
              {context ? <span className="LinkListItemContext">{context}: </span> : null}
              <button
                type="button"
                className={cx('LinkListCopyButton', {'LinkListCopyButton--copied': isCopied})}
                data-copy-value={address}
                onClick={() => copyAddress(address)}
                title={isCopied ? 'Copied' : 'Copy address'}
                aria-label={isCopied ? `Copied ${address}` : `Copy ${address}`}>
                <span className="LinkListCopyAddress">{address}</span>
                <span className="LinkListCopyStatus" aria-hidden="true">✓</span>
              </button>
            </li>
          );
          evmFromEmbedded.push(item);
        } else {
          const item = (
            <li key={index} className={itemClassName}>
              <a href={link.href} target="_blank">{link.href}</a>
            </li>
          );
          evmFromHtml.push(item);
        }
      } else if (isImage) {
        const item = (
          <li key={index} className={itemClassName}>
            <a href={link.href} target="_blank">{link.href}</a>
          </li>
        );
        image.push(item);
      } else if (link.source === 'script') {
        const item = (
          <li key={index} className={itemClassName}>
            <a href={link.href} target="_blank">{link.href}</a>
          </li>
        );
        script.push(item);
      } else {
        const item = (
          <li key={index} className={itemClassName}>
            <a href={link.href} target="_blank">{link.href}</a>
          </li>
        );
        aTag.push(item);
      }
    });

    return {
      aTagItems: aTag,
      scriptItems: script,
      evmItems: [...evmFromHtml, ...evmFromEmbedded],
      imageItems: image,
    };
  }, [processedLinks, blocked, duplicates, filter, hideDuplicates, hideBlockedDomains, copiedAddress]);

  const renderSection = (title, items, ref) => {
    if (items.length === 0) {
      return null;
    }
    return (
      <div className="LinkListColumn">
        <h3 className="LinkListColumnHeader">
          {title} ({items.length})
          <button className="btn btn-xs btn-default" onClick={() => copyLinks(ref.current)}>Copy</button>
        </h3>
        <ul ref={ref} className="LinkList">
          {items}
        </ul>
      </div>
    );
  };

  const hasSecondarySections = evmItems.length > 0 || imageItems.length > 0;

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
        </div>
      </div>
      <div ref={linkListRef} className="LinkListColumns">
        {renderSection('HTML Links', aTagItems, aTagListRef)}
        {renderSection('Embedded Links', scriptItems, scriptListRef)}
        {hasSecondarySections && (
          <div className="LinkListColumnGroup">
            {renderSection('EVM Addresses', evmItems, evmListRef)}
            {renderSection('Images', imageItems, imageListRef)}
          </div>
        )}
      </div>
    </div>
  );
}
