import assert from 'node:assert/strict';
import test from 'node:test';
import {scanJavaScriptResources} from '../src/javascriptScan.js';
const tick = () => new Promise(resolve => setImmediate(resolve));

test('starts a seventh request when a slot frees, without waiting for the slowest', async () => {
  const started = [], resolve = new Map(), results = [];
  let active = 0, peak = 0;
  const done = scanJavaScriptResources(Array.from({length: 12}, (_, i) => String(i)), {
    fetchText: url => {
      started.push(url); peak = Math.max(peak, ++active);
      return new Promise(r => resolve.set(url, () => { active--; r(url); }));
    },
    inspect: text => results.push(text), dependencies: () => [],
  });
  assert.equal(started.length, 6);
  resolve.get('1')(); await tick();
  assert.equal(started.length, 7);
  assert.equal(started[6], '6');
  while (results.length < 12) {
    for (const [url, finish] of resolve) { resolve.delete(url); finish(); }
    await tick();
  }
  await done;
  assert.equal(peak, 6);
  assert.deepEqual(results.sort((a, b) => +a - +b), Array.from({length: 12}, (_, i) => String(i)));
});

test('handles dependencies from the last worker, duplicates, cycles and failures', async () => {
  const fetched = [], inspected = [];
  await scanJavaScriptResources(['a', 'bad', 'a'], {
    fetchText: async url => { fetched.push(url); if (url === 'bad') throw new Error('offline'); return url; },
    inspect: text => inspected.push(text), dependencies: text => text === 'a' ? ['b'] : ['a'],
  });
  assert.deepEqual(fetched, ['a', 'bad', 'b']);
  assert.deepEqual(inspected, ['a', 'b']);
});

test('retains resource and character bounds, including an oversized response', async () => {
  const fetched = [], inspected = [];
  await scanJavaScriptResources(['large', 'a', 'b', 'c'], {
    maxResources: 3, maxCharacters: 2, concurrency: 1,
    fetchText: async url => { fetched.push(url); return url; },
    inspect: text => inspected.push(text), dependencies: () => [],
  });
  assert.deepEqual(fetched, ['large', 'a', 'b']);
  assert.deepEqual(inspected, ['a', 'b']);
});

test('stops launching after the deadline but retains in-flight results', async () => {
  let now = 0; const inspected = [], fetched = [];
  await scanJavaScriptResources(['a', 'b'], {
    concurrency: 1, budgetMs: 10, now: () => now,
    fetchText: async url => { fetched.push(url); now = 11; return url; },
    inspect: text => inspected.push(text), dependencies: () => [],
  });
  assert.deepEqual(fetched, ['a']); assert.deepEqual(inspected, ['a']);
});

test('fills all slots when a single entry discovers a wide dependency graph', async () => {
  const children = Array.from({length: 6}, (_, i) => 'child' + i);
  const pending = [];
  const inspected = [];
  const done = scanJavaScriptResources(['root'], {
    fetchText: url => url === 'root' ? Promise.resolve('root') : new Promise(resolve => pending.push(() => resolve(url))),
    inspect: text => inspected.push(text),
    dependencies: text => text === 'root' ? children : [],
  });
  await tick();
  assert.equal(pending.length, 6);
  pending.forEach(resolve => resolve());
  await done;
  assert.deepEqual(inspected.sort(), [...children, 'root'].sort());
});

test('new cross-origin resources cannot displace the existing same-origin graph at the cap', async () => {
  const inspected = [];
  await scanJavaScriptResources(['cdn', 'root'], {
    maxResources: 2, defer: url => url === 'cdn',
    fetchText: async url => url, inspect: text => inspected.push(text),
    dependencies: text => text === 'root' ? ['child'] : [],
  });
  assert.deepEqual(inspected, ['root', 'child']);
});

test('uses spare budget for deferred resources after the primary graph finishes', async () => {
  const inspected = [];
  await scanJavaScriptResources(['cdn', 'root'], {
    defer: url => url === 'cdn', fetchText: async url => url,
    inspect: text => inspected.push(text), dependencies: () => [],
  });
  assert.deepEqual(inspected, ['root', 'cdn']);
});
