// Decode URL escapes without evaluating page JavaScript. Leave interpolation
// unresolved; it is not a concrete endpoint and may execute arbitrary code.
export function normalizeUrlEscapes(text) {
  return text.replace(/\\u([0-9a-f]{4})|\\x([0-9a-f]{2})|\\\//gi, (match, unicode, hex) => {
    if (!unicode && !hex) return '/';
    const character = String.fromCharCode(parseInt(unicode || hex, 16));
    return /[\x21-\x7e]/.test(character) ? character : match;
  });
}

export function extractScriptUrls(text, pageUrl) {
  const normalized = normalizeUrlEscapes(text);
  const urls = new Set();
  const add = value => {
    if (value.includes('${')) return;
    try {
      const url = new URL(value, pageUrl);
      if (/^https?:$/.test(url.protocol)) urls.add(url.href);
    } catch (e) {
      // Ignore incomplete URL literals.
    }
  };
  for (const match of normalized.matchAll(/https?:\/\/[^\s"'`<>\\]+/g)) add(match[0]);
  // Include query strings, hashes, dotted route names and JSON/HTML endpoints.
  // Keep the existing static-asset exclusions for images, fonts and code.
  const staticAsset = /\.(?:[cm]?js|jsx|tsx?|css|scss|less|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|map|xml|txt|md)$/i;
  for (const match of normalized.matchAll(/(["'`])(\/(?![\s*])[^\s"'`<>\\]*)\1/g)) {
    const path = match[2];
    if (path === '/' || staticAsset.test(path.split(/[?#]/)[0])) continue;
    add(path);
  }
  return [...urls];
}
