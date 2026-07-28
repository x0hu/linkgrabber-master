const JAVASCRIPT_PATH = /\.(?:c|m)?js(?:$|[?#])/i;

function toSameOriginUrl(value, baseUrl, origin) {
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return '';
  try {
    const url = new URL(value, baseUrl);
    return url.origin === origin && /^https?:$/.test(url.protocol) ? url.href : '';
  } catch (e) {
    return '';
  }
}

export function discoverJavaScriptResourceUrls(document, performance, pageUrl) {
  const origin = new URL(pageUrl).origin;
  const urls = new Set();
  const add = value => {
    const url = toSameOriginUrl(value, pageUrl, origin);
    if (url) urls.add(url);
  };

  document.querySelectorAll('script[src]').forEach(element => add(element.src));
  document.querySelectorAll('link[rel~="modulepreload"][href]').forEach(element => add(element.href));
  document.querySelectorAll('link[rel~="preload"][as="script"][href]').forEach(element => add(element.href));

  if (performance && typeof performance.getEntriesByType === 'function') {
    performance.getEntriesByType('resource').forEach(entry => {
      if (entry.initiatorType === 'script' || JAVASCRIPT_PATH.test(entry.name)) {
        add(entry.name);
      }
    });
  }

  return [...urls];
}

export function extractJavaScriptDependencyUrls(text, resourceUrl, pageOrigin) {
  const urls = new Set();
  const patterns = [
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\bimport\s*(?:[^"'`]*?\s+from\s*)?["'`]([^"'`]+)["'`]/g,
    /\bexport\s+[^"'`]*?\s+from\s*["'`]([^"'`]+)["'`]/g,
  ];

  patterns.forEach(pattern => {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const url = toSameOriginUrl(match[1], resourceUrl, pageOrigin);
      if (url) urls.add(url);
    }
  });

  return [...urls];
}
