// New discoveries must refill idle slots, even when the scan starts with only
// one entry point. Completion waits for an empty queue and no in-flight work.
export function scanJavaScriptResources(initialUrls, {fetchText, inspect, dependencies, maxResources = 100, maxCharacters = 12 * 1024 * 1024, concurrency = 6, budgetMs = 12000, now = Date.now, defer = () => false}) {
  const queue = [];
  const seen = new Set();
  const deferred = new Set();
  let scanningDeferred = false;
  let characters = 0;
  let active = 0;
  const deadline = now() + budgetMs;
  const enqueue = url => {
    if (!scanningDeferred && defer(url)) {
      if (deferred.size < maxResources) deferred.add(url);
      return;
    }
    if (seen.has(url) || seen.size >= maxResources) return;
    seen.add(url);
    queue.push(url);
  };
  initialUrls.forEach(enqueue);
  return new Promise(resolve => {
    async function scan(url) {
      try {
        const text = await fetchText(url);
        if (typeof text !== 'string' || characters + text.length > maxCharacters) return;
        characters += text.length;
        inspect(text, url);
        dependencies(text, url).forEach(enqueue);
      } catch (e) {
        // One unavailable resource does not invalidate the remaining scan.
      }
    }
    function pump() {
      // New cross-origin coverage must not consume slots in the resource cap
      // before the existing same-origin dependency graph has been explored.
      if (!active && !queue.length && !scanningDeferred) {
        scanningDeferred = true;
        deferred.forEach(enqueue);
      }
      while (active < concurrency && queue.length && characters < maxCharacters && now() < deadline) {
        const url = queue.shift();
        active++;
        scan(url).finally(() => {
          active--;
          pump();
        });
      }
      if (!active) resolve();
    }
    pump();
  });
}
