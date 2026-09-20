const JAVASCRIPT_PATH = /\.(?:c|m)?js(?:$|[?#])/i;

function toResourceUrl(value, baseUrl) {
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return '';
  try {
    const url = new URL(value, baseUrl);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch (e) {
    return '';
  }
}

export function discoverJavaScriptResourceUrls(document, performance, pageUrl) {
  const urls = new Set();
  const add = value => {
    const url = toResourceUrl(value, pageUrl);
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

export function extractJavaScriptDependencyUrls(text, resourceUrl) {
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
      if (!/^(?:\.{1,2}\/|\/|https?:\/\/)/.test(match[1]) || match[1].includes('${')) continue;
      const url = toResourceUrl(match[1], resourceUrl);
      if (url) urls.add(url);
    }
  });

  return [...urls];
}
