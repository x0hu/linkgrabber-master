import vm from 'node:vm';
import {buildSync} from 'esbuild';

const code = buildSync({entryPoints: ['src/contentscript.js'], bundle: true, write: false}).outputFiles[0].text;
export function scan({inline = '', scriptBodies = [inline], html = '', anchors = [], resources = {}, scriptUrls = Object.keys(resources), pageUrl = 'https://site.test/', fetch: fetchOverride} = {}) {
  const requests = [];
  return new Promise((resolve, reject) => {
    try {
      const result = vm.runInNewContext(code + '\nwindow.__linkGrabberScan();', {
        URL, AbortController, setTimeout, clearTimeout,
        window: {location: new URL(pageUrl)},
        document: {
          documentElement: {outerHTML: html + `<script>${inline}</script>`},
          querySelectorAll(selector) {
            if (selector === 'script') return scriptBodies.map(textContent => ({textContent}));
            if (selector === 'script[src]') return scriptUrls.map(src => ({src}));
            if (selector === 'a:link:not([href^=javascript])') return anchors.map(href => ({href, text: 'Link'}));
            return [];
          },
        },
        performance: {getEntriesByType: () => []},
        fetch: async (url, options) => {
          requests.push(url);
          if (fetchOverride) return fetchOverride(url, options);
          return {ok: url in resources, text: async () => resources[url]};
        },
      });
      result.then(links => resolve({links: JSON.parse(JSON.stringify(links)), requests}), reject);
    } catch (error) { reject(error); }
  });
}
