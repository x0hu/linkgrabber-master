import {isExcludedAddress, hasExcludedAddress} from './excludedAddresses';
import {addressSource} from './addressSource';
import { maskWeb3IconCatalog } from './web3IconCatalog';
import { extractScriptUrls } from './scriptUrls';
import { scanJavaScriptResources } from './javascriptScan';
import { withoutScriptBodies } from './pageMarkup';
import {
  discoverJavaScriptResourceUrls,
  extractJavaScriptDependencyUrls,
} from './javascriptResources';

window.__linkGrabberScan = async function () {
  const seenUrls = new Set();
  const seenEvmAddressReferences = new Set();
  const links = [];
  const frameUrl = window.location.href;
  const collectionDeadline = Date.now() + 30000;

  // Domains/patterns to ignore (library/framework noise)
  const ignoredPatterns = [
    // Template literal URLs (unresolved variables)
    /\$%7B.*%7D/,
    /\$\{/,
    // W3C/standards
    /^https?:\/\/(www\.)?w3\.org\//,
    // Documentation sites
    /^https?:\/\/developer\.mozilla\.org\//,
    /^https?:\/\/bugzilla\.mozilla\.org\//,
    /^https?:\/\/reactjs\.org\/docs\/error-decoder/,
    /^https?:\/\/react\.dev\/errors/,
    /^https?:\/\/prosemirror\.net\/docs\//,
    /^https?:\/\/webglfundamentals\.org\//,
    // Package registries
    /^https?:\/\/registry\.npmjs\.org\//,
    /\.tgz$/,
    // License/open source
    /^https?:\/\/(www\.)?opensource\.org\//,
    /^https?:\/\/feross\.org\//,
    /\/licenses?\//i,
    // Library repos/sites
    /^https?:\/\/(www\.)?github\.com\/facebook\/react/,
    /^https?:\/\/jedwatson\.github\.io\/classnames/,
    // CDNs and fonts
    /^https?:\/\/unpkg\.com\//,
    /^https?:\/\/cdn\.jsdelivr\.net\//,
    /^https?:\/\/cdnjs\.cloudflare\.com\//,
    /^https?:\/\/fonts\.googleapis\.com(\/|$)/,
    /^https?:\/\/fonts\.gstatic\.com(\/|$)/,
    /^https?:\/\/cdn\.growthbook\.io\//,
    /^https?:\/\/s\.w\.org\//,
    // Package manager docs
    /^https?:\/\/yarnpkg\.com\//,
    // Library/framework docs
    /^https?:\/\/formatjs\.io\//,
    /^https?:\/\/mozilla\.github\.io\//,
    /^https?:\/\/nextjs\.org\/docs\//,
    /^https?:\/\/(api\.)?jqueryui\.com\//,
    /^https?:\/\/jquery\.org\//,
    // SDK/init scripts
    /^https?:\/\/framer\.com\/edit\//,
    // Ad/tracking/internal services
    /^https?:\/\/(www\.)?aboutads\.info\//,
    /^https?:\/\/.*\.conde\.(digital|io)\//,
    /^https?:\/\/widget\.beop\.io\//,
    /^https?:\/\/connect\.facebook\.net\//,
    /^https?:\/\/(us\.i\.|us\.)?posthog\.com\//,
    /^https?:\/\/(app\.)?posthog\.com\//,
    /^https?:\/\/.*\.ingest\.(us\.)?sentry\.io\//,
    /^https?:\/\/sentry\.io\/organizations\//,
    /^https?:\/\/docs\.sentry\.io\//,
    /^https?:\/\/(www\.)?dexscreener\.com(\/|$)/,
    // URL shorteners
    /^https?:\/\/git\.io\//,
    // Docs/tutorials
    /^https?:\/\/tanstack\.com\//,
    // Bots/crawlers
    /^https?:\/\/(www\.)?yandex\.com\/bots/,
    // Localhost/dev
    /^https?:\/\/localhost(:\d+)?\//,
    /^https?:\/\/(www\.)?example\.com\//,
    // Vercel/React internal
    /^https?:\/\/vercel\.live\/_next-live\//,
    /^https?:\/\/reactjs\.org\/link\//,
    // Invalid/test URLs (single-letter domains, userinfo@host, punycode test)
    /^https?:\/\/[a-z](\/|#|\?|$)/i,
    /^https?:\/\/[^@/]+@[^/]+/,
    /^https?:\/\/xn--/i,
  ];

  // Fast string prefix checks for common ignored domains (avoids regex for ~80% of URLs)
  const ignoredPrefixes = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://cdn.jsdelivr.net',
    'https://unpkg.com',
    'https://cdnjs.cloudflare.com',
    'https://developer.mozilla.org',
    'https://reactjs.org',
    'https://react.dev/errors',
    'https://nextjs.org/docs',
    'https://www.w3.org',
    'http://www.w3.org',
    'https://registry.npmjs.org',
    'https://localhost',
    'http://localhost',
    'https://dexscreener.com',
    'https://www.dexscreener.com',
  ];

  function isIgnoredUrl(url) {
    // Fast path: check common prefixes first
    for (let i = 0; i < ignoredPrefixes.length; i++) {
      if (url.startsWith(ignoredPrefixes[i])) return true;
    }
    // Slow path: regex patterns for complex matches
    return ignoredPatterns.some(pattern => pattern.test(url));
  }

  function getEvmAddressFromPath(pathname) {
    const segments = pathname.split('/').filter(Boolean);
    const tail = segments[segments.length - 1] || '';
    const match = tail.match(/^0x[0-9a-fA-F]{40}$/);
    return match ? match[0].toLowerCase() : '';
  }

  function getEvmAddressReferenceKey(address, referenceDomain) {
    return `${address.toLowerCase()}|${(referenceDomain || '').toLowerCase()}`;
  }

  // Helper to parse URL and create link object
  function addLink(href, text = '', source = 'a', provenance = addressSource('page', frameUrl)) {
    if (isIgnoredUrl(href) || hasExcludedAddress(href)) return;
    try {
      const url = new URL(href);
      // Different destinations and protocols remain distinct links.
      const normalizedHref = url.href;
      const dedupKey = normalizedHref;
      if (seenUrls.has(dedupKey)) return;
      const evmAddress = getEvmAddressFromPath(url.pathname);
      if (evmAddress) {
        const evmReferenceDomain = url.hostname.toLowerCase();
        const evmReferenceKey = getEvmAddressReferenceKey(evmAddress, evmReferenceDomain);
        seenEvmAddressReferences.add(evmReferenceKey);
      }
      seenUrls.add(dedupKey);
      links.push({
        hash: url.hash,
        host: url.host,
        hostname: url.hostname,
        href: normalizedHref,
        origin: url.origin,
        pathname: url.pathname,
        search: url.search,
        text: text,
        address: evmAddress || '',
        evmAddress: evmAddress || '',
        evmReferenceDomain: evmAddress ? url.hostname.toLowerCase() : '',
        source: source,
        frameUrl: frameUrl,
        ...provenance,
      });
    } catch (e) {
      // Ignore malformed link candidates.
    }
  }

  function addEvmAddress(match, provenance) {
    const address = typeof match === 'string' ? match : match.address;
    const context = typeof match === 'string' ? '' : match.context;
    if (isExcludedAddress(address)) return;
    const normalizedAddress = address.toLowerCase();
    const evmReferenceDomain = currentHost.toLowerCase();
    const evmReferenceKey = getEvmAddressReferenceKey(normalizedAddress, evmReferenceDomain) + '|' + provenance.evmSourceKind + '|' + provenance.evmSourceUrl;
    if (seenEvmAddressReferences.has(evmReferenceKey)) return;
    seenEvmAddressReferences.add(evmReferenceKey);
    links.push({
      hash: '',
      host: evmReferenceDomain,
      hostname: evmReferenceDomain,
      href: normalizedAddress,
      origin: currentOrigin,
      pathname: normalizedAddress,
      search: '',
      text: context || '',
      address: address,
      evmAddress: normalizedAddress,
      evmReferenceDomain: evmReferenceDomain,
      context: context || '',
      source: 'evm',
      ...provenance,
      frameUrl: frameUrl,
    });
  }

  // 1. Extract from <a> tags (original behavior)
  const elements = document.querySelectorAll('a:link:not([href^=javascript])');
  for (let i = 0; i < elements.length; i++) {
    addLink(elements[i].href, elements[i].text);
  }

  // 2. Extract images from <img> tags
  const imgElements = document.querySelectorAll('img[src]');
  for (let i = 0; i < imgElements.length; i++) {
    const src = imgElements[i].src;
    if (src && src.startsWith('http')) {
      addLink(src, imgElements[i].alt || '', 'image');
    }
  }

  // Also check srcset
  document.querySelectorAll('[srcset]').forEach(el => {
    const srcset = el.getAttribute('srcset');
    if (srcset) {
      srcset.split(',').forEach(part => {
        const url = part.trim().split(/\s+/)[0];
        if (url && url.startsWith('http')) {
          addLink(url, '', 'image');
        }
      });
    }
  });

  // 3. Extract URLs from inline scripts and external script content
  const evmAddressRegex = /\b0x[0-9a-fA-F]{40}\b/g;
  const ignoredEvmAddressUrlPatterns = [
    /https?:\/\/(?:www\.)?dexscreener\.com\/[^\s"'`<>\\]+/gi,
    /https?:\\\/\\\/(?:www\.)?dexscreener\.com\\\/[^\s"'`<>]+/gi,
  ];
  const currentHost = window.location.hostname;
  const currentOrigin = window.location.origin;

  function getEvmAddressContext(text, index) {
    const before = text.slice(Math.max(0, index - 500), index);
    const propertyMatch = before.match(/(?:^|[,{;]\s*|[\s])["']?([A-Za-z_$][\w$-]*)["']?\s*:\s*["']?$/);
    if (propertyMatch) return propertyMatch[1];

    const assignmentMatch = before.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*["']?$/);
    if (assignmentMatch) return assignmentMatch[1];

    const memberMatch = before.match(/\.([A-Za-z_$][\w$]*)\s*=\s*["']?$/);
    if (memberMatch) return memberMatch[1];

    const propertyMatches = [...before.matchAll(/(?:^|[,{;]\s*)["']?([A-Za-z_$][\w$-]*)["']?\s*:/g)];
    if (propertyMatches.length > 0) {
      return propertyMatches[propertyMatches.length - 1][1];
    }

    const assignmentFallbackMatch = before.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;{}]*$/);
    if (assignmentFallbackMatch) return assignmentFallbackMatch[1];

    const memberFallbackMatch = before.match(/\.([A-Za-z_$][\w$]*)\s*=[^;{}]*$/);
    if (memberFallbackMatch) return memberFallbackMatch[1];

    return '';
  }

  function extractEvmAddresses(text, script = false) {
    const addresses = [];
    if (!text.includes('0x')) return addresses;
    const seenInText = new Set();
    let match;
    let searchableText = script ? maskWeb3IconCatalog(text) : text;
    for (let i = 0; i < ignoredEvmAddressUrlPatterns.length; i++) {
      ignoredEvmAddressUrlPatterns[i].lastIndex = 0;
      searchableText = searchableText.replace(ignoredEvmAddressUrlPatterns[i], ' ');
    }
    evmAddressRegex.lastIndex = 0;
    while ((match = evmAddressRegex.exec(searchableText)) !== null) {
      const normalized = match[0].toLowerCase();
      if (seenInText.has(normalized)) continue;
      seenInText.add(normalized);
      addresses.push({
        address: match[0],
        context: getEvmAddressContext(searchableText, match.index),
      });
    }
    return addresses;
  }

  // Scan explicit HTML references separately, retaining script-tag attributes.
  // Only script bodies are eligible for library catalog suppression.
  const serializedDocument = document.documentElement ? document.documentElement.outerHTML : '';
  const pageMarkup = withoutScriptBodies(serializedDocument);
  extractEvmAddresses(pageMarkup).forEach(match => addEvmAddress(match, addressSource('page', frameUrl)));

  function extractScriptContent(text, url, kind = 'script') {
    const provenance = addressSource(kind, url);
    extractScriptUrls(text, frameUrl).forEach(url => addLink(url, '', 'script', provenance));
    extractEvmAddresses(text, true).forEach(match => addEvmAddress(match, provenance));
  }

  const inlineScripts = [...document.querySelectorAll('script')].filter(script => script.textContent);
  inlineScripts.forEach((script, index) => extractScriptContent(script.textContent, `${frameUrl}#inline-script-${index + 1}`, 'inline'));
  const initialUrls = discoverJavaScriptResourceUrls(document, performance, frameUrl);
  inlineScripts.forEach(script => {
    initialUrls.push(...extractJavaScriptDependencyUrls(script.textContent, frameUrl));
  });

  async function fetchScriptText(url) {
    const controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
      // Content-script requests retain browser CORS rules. Never execute fetched code.
      const response = await fetch(url, {signal: controller.signal});
      if (!response.ok) return null;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), Math.max(1, collectionDeadline - Date.now()));
      return await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  await scanJavaScriptResources(initialUrls, {
    fetchText: fetchScriptText,
    inspect: extractScriptContent,
    defer: url => new URL(url).origin !== currentOrigin,
    dependencies: (text, url) => extractJavaScriptDependencyUrls(text, url),
  });
  return links;
};
