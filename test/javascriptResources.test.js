import assert from 'node:assert/strict';
import test from 'node:test';

import {
  discoverJavaScriptResourceUrls,
  extractJavaScriptDependencyUrls,
} from '../src/javascriptResources.js';

function fakeDocument(selectors) {
  return {
    querySelectorAll(selector) {
      return selectors[selector] || [];
    },
  };
}

test('discovers Oddlot-style module preloads when there are no external scripts', () => {
  const document = fakeDocument({
    'script[src]': [],
    'link[rel~="modulepreload"][href]': [
      {href: 'https://oddlot.tech/assets/AppShell-CBbOwLf5.js'},
    ],
    'link[rel~="preload"][as="script"][href]': [],
  });

  assert.deepEqual(
    discoverJavaScriptResourceUrls(document, null, 'https://oddlot.tech/deposit'),
    ['https://oddlot.tech/assets/AppShell-CBbOwLf5.js'],
  );
});

test('deduplicates script, preload, and performance resource discoveries', () => {
  const resource = 'https://example.com/assets/app.js';
  const document = fakeDocument({
    'script[src]': [{src: resource}],
    'link[rel~="modulepreload"][href]': [{href: resource}],
    'link[rel~="preload"][as="script"][href]': [{href: '/assets/lazy.js'}],
  });
  const performance = {
    getEntriesByType: () => [
      {name: resource, initiatorType: 'script'},
      {name: 'https://example.com/assets/observed.mjs', initiatorType: 'link'},
      {name: 'https://cdn.example.net/external.js', initiatorType: 'script'},
      {name: 'https://example.com/image.png', initiatorType: 'img'},
    ],
  };

  assert.deepEqual(
    discoverJavaScriptResourceUrls(document, performance, 'https://example.com/page'),
    [
      resource,
      'https://example.com/assets/lazy.js',
      'https://example.com/assets/observed.mjs',
      'https://cdn.example.net/external.js',
    ],
  );
});

test('discovers HTTP static, re-exported, and dynamic dependencies', () => {
  const source = [
    'import "./side-effect.js";',
    'import value from "./static.js";',
    'export {other} from "../shared.mjs";',
    'const lazy = import("./lazy.js");',
    'import("https://cdn.example.net/external.js");',
  ].join('\n');

  assert.deepEqual(
    extractJavaScriptDependencyUrls(
      source,
      'https://example.com/assets/entry.js',
      'https://example.com',
    ),
    [
      'https://example.com/assets/lazy.js',
      'https://cdn.example.net/external.js',
      'https://example.com/assets/side-effect.js',
      'https://example.com/assets/static.js',
      'https://example.com/shared.mjs',
    ],
  );
});

test('does not fetch package names, data URLs, credentials or unresolved imports', () => {
  const source = 'import "react"; import("data:text/javascript,hello"); import("https://user:password@cdn.test/app.js"); import(`./${name}.js`);';
  assert.deepEqual(extractJavaScriptDependencyUrls(source, 'https://site.test/app.js'), []);
});
