(function () {
  const seenUrls = new Set();
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
    /^https?:\/\/[^@\/]+@[^\/]+/,
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
  ];

  function isIgnoredUrl(url) {
    // Fast path: check common prefixes first
    for (let i = 0; i < ignoredPrefixes.length; i++) {
      if (url.startsWith(ignoredPrefixes[i])) return true;
    }
    // Slow path: regex patterns for complex matches
    return ignoredPatterns.some(pattern => pattern.test(url));
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
        source: source,
        frameUrl: frameUrl,
      });
    } catch (e) {}
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
  const currentHost = window.location.hostname;

  // Inline scripts
  document.querySelectorAll('script:not([src])').forEach(script => {
    const matches = script.textContent.match(urlRegex) || [];
    matches.forEach(url => {
      try {
        const parsed = new URL(url);
        if (parsed.hostname !== currentHost) {
          addLink(url, '', 'script');
        }
      } catch (e) {}
    });
  });

  // External scripts - fetch and parse (with timeout to prevent hangs)
  const fetchWithTimeout = (url, timeoutMs = 3000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal })
      .finally(() => clearTimeout(timeoutId));
  };

  const scriptPromises = Array.from(document.querySelectorAll('script[src]'))
    .filter(s => s.src.startsWith(window.location.origin))
    .map(script =>
      fetchWithTimeout(script.src)
        .then(r => r.text())
        .then(text => {
          const matches = text.match(urlRegex) || [];
          matches.forEach(url => {
            try {
              const parsed = new URL(url);
              if (parsed.hostname !== currentHost) {
                addLink(url, '', 'script');
              }
            } catch (e) {}
          });
        })
        .catch(() => {})
    );

  Promise.all(scriptPromises).then(() => {
    chrome.runtime.sendMessage(null, {type: 'links-found', links: links});
  });
})();
