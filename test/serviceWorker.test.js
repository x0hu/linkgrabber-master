import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
const code = buildSync({entryPoints: ['src/service_worker.js'], bundle: true, write: false}).outputFiles[0].text;
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup({frames = [{frameId: 0}, {frameId: 1}], inject} = {}) {
  let start, close, counter = 0;
  const opened = [], timers = new Map();
  const session = {tabData: {}};
  const chrome = {
    runtime: {onInstalled: {addListener() {}}, getURL: value => 'chrome-extension://test/' + value},
    action: {onClicked: {addListener: fn => { start = fn; }}},
    contextMenus: {onClicked: {addListener() {}}},
    tabs: {onRemoved: {addListener: fn => { close = fn; }}, create: data => opened.push(data)},
    webNavigation: {getAllFrames: async () => frames},
    scripting: {executeScript: inject},
    storage: {session: {get: async () => session, set: async value => Object.assign(session, value)}},
  };
  vm.runInNewContext(code, {chrome, window: {}, crypto: {randomUUID: () => String(++counter)}, setTimeout: fn => { const id = ++counter; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id)});
  return {start, close, opened, timers, session};
}
const link = href => ({source: 'script', href});

test('failed injections do not hold successful frame results until timeout', async () => {
  const state = setup({inject: async options => {
    if (options.target.frameIds?.[0] === 1) throw new Error('frame removed');
    if (options.files) return [{frameId: 0, documentId: 'doc0'}];
    assert.deepEqual(Array.from(options.target.documentIds), ['doc0']);
    return [{frameId: 0, result: [link('https://project.test/api')]}];
  }});
  state.start({id: 7, url: 'https://site.test/', index: 0}); await tick();
  assert.equal(state.opened.length, 1);
  assert.equal(state.timers.size, 0);
  assert.equal(state.session.tabData[7].links[0].href, 'https://project.test/api');
});

test('overlapping scans ignore stale completion and create only the latest result tab', async () => {
  let finishOld, calls = 0;
  const state = setup({frames: [{frameId: 0}], inject: async options => {
    if (options.files) return [{frameId: 0, documentId: 'doc0'}];
    if (++calls === 1) return new Promise(resolve => { finishOld = resolve; });
    return [{result: [link('https://project.test/new')]}];
  }});
  const tab = {id: 7, url: 'https://site.test/', index: 0};
  state.start(tab); await tick();
  state.start(tab); await tick();
  finishOld([{result: [link('https://project.test/old')]}]); await tick();
  assert.equal(state.opened.length, 1);
  assert.equal(state.session.tabData[7].links[0].href, 'https://project.test/new');
});

test('fallback retains completed frames and ignores later completion', async () => {
  let finishSlow;
  const state = setup({inject: async options => {
    if (options.files) return [{documentId: String(options.target.frameIds[0])}];
    if (options.target.documentIds[0] === '1') return new Promise(resolve => { finishSlow = resolve; });
    return [{result: [link('https://project.test/fast')]}];
  }});
  state.start({id: 7, url: 'https://site.test/', index: 0}); await tick();
  assert.equal(state.opened.length, 0);
  [...state.timers.values()][0](); await tick();
  assert.equal(state.opened.length, 1);
  finishSlow([{result: [link('https://project.test/slow')]}]); await tick();
  assert.equal(state.opened.length, 1);
  assert.equal(state.session.tabData[7].links.length, 1);
});

test('installs and invokes the real asynchronous content script through the worker', async () => {
  const contentCode = buildSync({entryPoints: ['src/contentscript.js'], bundle: true, write: false}).outputFiles[0].text;
  const address = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const page = vm.createContext({URL, AbortController, setTimeout, clearTimeout,
    window: {location: new URL('https://site.test/')},
    document: {documentElement: {outerHTML: `<main>${address}</main>`}, querySelectorAll: () => []},
    performance: {getEntriesByType: () => []},
  });
  const state = setup({frames: [{frameId: 0}], inject: async options => {
    if (options.files) {
      vm.runInContext(contentCode, page);
      return [{frameId: 0, documentId: 'doc0'}];
    }
    const result = await vm.runInContext('(' + options.func.toString() + ')()', page);
    return [{frameId: 0, result: JSON.parse(JSON.stringify(result))}];
  }});
  state.start({id: 7, url: 'https://site.test/', index: 0}); await tick();
  assert.equal(state.opened.length, 1);
  assert.equal(state.session.tabData[7].links[0].evmAddress, address);
});
