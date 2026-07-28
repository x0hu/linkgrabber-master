import { VIEM_EVM_ADDRESS_BLACKLIST } from './blacklists/viemEvmAddresses';
import {
  discoverJavaScriptResourceUrls,
  extractJavaScriptDependencyUrls,
} from './javascriptResources';

(function () {
  const seenUrls = new Set();
  const seenEvmAddressReferences = new Set();
  const viemEvmAddressBlacklist = new Set(VIEM_EVM_ADDRESS_BLACKLIST);
  const links = [];
  const frameUrl = window.location.href;

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
  function addLink(href, text = '', source = 'a') {
    if (isIgnoredUrl(href)) return;
    try {
      const url = new URL(href);
      // Use normalized href for deduplication (treat http/https as same)
      const normalizedHref = url.href;
      const dedupKey = normalizedHref.replace(/^https?:\/\//, '');
      if (seenUrls.has(dedupKey)) return;
      const evmAddress = getEvmAddressFromPath(url.pathname);
      if (evmAddress) {
        const evmReferenceDomain = url.hostname.toLowerCase();
        const evmReferenceKey = getEvmAddressReferenceKey(evmAddress, evmReferenceDomain);
        if (seenEvmAddressReferences.has(evmReferenceKey)) return;
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
      });
    } catch (e) {
      // Ignore malformed link candidates.
    }
  }

  function addEvmAddress(match) {
    const address = typeof match === 'string' ? match : match.address;
    const context = typeof match === 'string' ? '' : match.context;
    const normalizedAddress = address.toLowerCase();
    const evmReferenceDomain = currentHost.toLowerCase();
    const evmReferenceKey = getEvmAddressReferenceKey(normalizedAddress, evmReferenceDomain);
    if (viemEvmAddressBlacklist.has(normalizedAddress)) return;
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
  const urlRegex = /https?:\/\/[^\s"'`<>\\]+/g;
  const evmAddressRegex = /\b0x[0-9a-fA-F]{40}\b/g;
  const ignoredEvmAddressUrlPatterns = [
    /https?:\/\/(?:www\.)?dexscreener\.com\/[^\s"'`<>\\]+/gi,
    /https?:\\\/\\\/(?:www\.)?dexscreener\.com\\\/[^\s"'`<>]+/gi,
  ];
  // Match relative paths in string literals (e.g., "/dashboard/deposit")
  const relativePathRegex = /["'`](\/[a-zA-Z][a-zA-Z0-9_/-]*[a-zA-Z0-9])["'`]/g;
  // File extensions to ignore (static assets, not routes)
  const ignoredExtensions = /\.(js|jsx|ts|tsx|css|scss|less|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|json|xml|txt|md|html|htm)$/i;
  const currentHost = window.location.hostname;
  const currentOrigin = window.location.origin;

  // Helper to extract relative paths from script content
  function extractRelativePaths(text) {
    const paths = [];
    let match;
    // Reset regex state
    relativePathRegex.lastIndex = 0;
    while ((match = relativePathRegex.exec(text)) !== null) {
      const path = match[1];
      // Skip static asset paths
      if (!ignoredExtensions.test(path)) {
        paths.push(path);
      }
    }
    return paths;
  }

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

  function extractEvmAddresses(text) {
    const addresses = [];
    let match;
    let searchableText = text;
    for (let i = 0; i < ignoredEvmAddressUrlPatterns.length; i++) {
      ignoredEvmAddressUrlPatterns[i].lastIndex = 0;
      searchableText = searchableText.replace(ignoredEvmAddressUrlPatterns[i], ' ');
    }
    evmAddressRegex.lastIndex = 0;
    while ((match = evmAddressRegex.exec(searchableText)) !== null) {
      addresses.push({
        address: match[0],
        context: getEvmAddressContext(searchableText, match.index),
      });
    }
    return addresses;
  }

  // Catch addresses rendered into text, hydration state, and arbitrary element attributes.
  // Script content is included here too; addEvmAddress handles the resulting duplicates.
  const serializedDocument = document.documentElement ? document.documentElement.outerHTML : '';
  extractEvmAddresses(serializedDocument).forEach(addEvmAddress);

  // Inline scripts
  document.querySelectorAll('script:not([src])').forEach(script => {
    const text = script.textContent;
    // Extract full URLs (external only)
    const matches = text.match(urlRegex) || [];
    matches.forEach(url => {
      try {
        const parsed = new URL(url);
        if (parsed.hostname !== currentHost) {
          addLink(url, '', 'script');
        }
      } catch (e) {
        // Ignore malformed URL-like strings.
      }
    });
    // Extract relative paths and resolve to full URLs
    extractRelativePaths(text).forEach(path => {
      addLink(currentOrigin + path, '', 'script');
    });
    extractEvmAddresses(text).forEach(addEvmAddress);
  });

  // External scripts and modules - discover and crawl a bounded same-origin graph.
  const MAX_JAVASCRIPT_RESOURCES = 100;
  const MAX_JAVASCRIPT_CHARACTERS = 12 * 1024 * 1024;
  const JAVASCRIPT_FETCH_CONCURRENCY = 6;
  const JAVASCRIPT_SCAN_BUDGET_MS = 12000;

  const fetchWithTimeout = (url, timeoutMs = 4000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal })
      .finally(() => clearTimeout(timeoutId));
  };

  function extractScriptContent(text) {
    const matches = text.match(urlRegex) || [];
    matches.forEach(url => {
      try {
        const parsed = new URL(url);
        if (parsed.hostname !== currentHost) {
          addLink(url, '', 'script');
        }
      } catch (e) {
        // Ignore malformed URL-like strings.
      }
    });
    extractRelativePaths(text).forEach(path => {
      addLink(currentOrigin + path, '', 'script');
    });
    extractEvmAddresses(text).forEach(addEvmAddress);
  }

  const queuedResourceUrls = [];
  const seenResourceUrls = new Set();
  let scannedJavaScriptCharacters = 0;
  const javascriptScanDeadline = Date.now() + JAVASCRIPT_SCAN_BUDGET_MS;

  function enqueueResource(url) {
    if (seenResourceUrls.size >= MAX_JAVASCRIPT_RESOURCES || seenResourceUrls.has(url)) return;
    seenResourceUrls.add(url);
    queuedResourceUrls.push(url);
  }

  discoverJavaScriptResourceUrls(document, performance, frameUrl).forEach(enqueueResource);
  document.querySelectorAll('script:not([src])').forEach(script => {
    extractJavaScriptDependencyUrls(script.textContent, frameUrl, currentOrigin).forEach(enqueueResource);
  });

  async function scanResource(url) {
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) return;
      const text = await response.text();
      if (scannedJavaScriptCharacters + text.length > MAX_JAVASCRIPT_CHARACTERS) return;
      scannedJavaScriptCharacters += text.length;
      extractScriptContent(text);
      extractJavaScriptDependencyUrls(text, url, currentOrigin).forEach(enqueueResource);
    } catch (e) {
      // Individual resources may fail without invalidating the rest of the scan.
    }
  }

  async function scanDiscoveredResources() {
    while (
      queuedResourceUrls.length > 0 &&
      scannedJavaScriptCharacters < MAX_JAVASCRIPT_CHARACTERS &&
      Date.now() < javascriptScanDeadline
    ) {
      const batch = queuedResourceUrls.splice(0, JAVASCRIPT_FETCH_CONCURRENCY);
      await Promise.all(batch.map(scanResource));
    }
  }

  scanDiscoveredResources().then(() => {
    chrome.runtime.sendMessage(null, {type: 'links-found', links: links});
  });
})();
