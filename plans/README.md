# Scan latency review

Reviewed 2026-09-20 at commit `7a9094a`, including the existing uncommitted Web3Icons filter. Scope: time from extension invocation to complete link/address results. The initial review was read-only. The fixes were subsequently implemented at the user's request; see the completion notes below.

| Plan | Priority | Effort | Risk | Status |
|---|---|---|---|---|
| [001: Avoid unnecessary address context work](001-address-context.md) | P1 | Small | Low | DONE |
| [002: Keep fetch slots occupied](002-fetch-scheduling.md) | P1 | Medium | Medium | DONE |

Execute 001 first, then 002. Both require full-output regression checks, including labels, provenance, ordering, and the Web3Icons exclusion. Do not lower the 100-resource, 12 MiB-character, or 12-second limits to manufacture a speedup.

## Evidence

Benchmarks used the actual content script bundled in memory with esbuild and executed in Node's VM. Fetch and DOM were mocked; these are controlled experiments, not Chrome end-to-end timings.

- Twelve resources, six concurrent requests, two 150 ms responses and ten 5 ms responses: current batches completed in 311 ms, an in-memory rolling-fetch prototype in 170 ms. The sorted resulting URLs matched. This does not establish ordering/metadata equivalence or coverage at limits.
- 10,000 duplicate address occurrences: baseline runs 22/21/21 ms, candidate 5/4/5 ms. Context computations dropped from 10,000 to one. Complete result objects matched.
- 10,000 blacklisted occurrences: baseline 24/15/16 ms, candidate 10/3/4 ms. Context computations dropped to zero. Complete result objects matched.
- 10,000 distinct addresses: baseline 29/24/24 ms, candidate 27/26/26 ms. All 10,000 complete result objects matched. There was no consistent performance improvement on this case.
- Existing `npm test`: eight tests pass.

## Deferred findings

- The four-second fetch abort timer clears at response headers, before `response.text()`. Fixing this can drop slow responses that currently complete; treat it as a separate timeout policy decision, not a behavior-preserving optimization.
- Frame accounting uses discovered-frame count rather than successful injection and unique scan/frame completion. A missing response can force the 30-second collection fallback. Needs a worker lifecycle test harness before changes, including navigation and overlapping scans.
- Results-page debounce and copy-feedback work affect interaction after collection, not time to fetch. Out of scope for this scan-focused pass.

## Considered and rejected

- Shorter timeouts or lower resource limits: risks missing links and addresses.
- Skipping vendor bundles or all external scripts: app addresses can live there.
- Global token-address blacklists: suppresses real page references as well as metadata.
- Persistent script-text caches without validation: can serve stale addresses at unchanged asset URLs.
- DOM virtualization: existing copy-all and native selection depend on rendered rows.
- Raising concurrency above six: unnecessary for the demonstrated scheduling bottleneck and adds load.

## Coverage limits

No live Chrome trace on the user's other slow sites, no security/dependency audit, no filesystem source changes. No claims of a universal percentage speedup.

## Completion notes

Implemented after the user explicitly requested fixes and selected preservation of every explicit page/application address reference. The old blacklist is no longer consulted; plan 001's early rejection now only drops duplicate occurrences. Its blacklist-specific steps are superseded by that decision.

The scheduler uses a shared pump so newly discovered children can refill all six slots even when the scan starts with one entry. Same-origin discovery finishes before cross-origin work is admitted to the shared cap. The worker obtains asynchronous scan results from document-bound injections; failed frames finish immediately and stale overlapping scans are ignored.

Additional correctness fixes preserve distinct URL destinations in both aggregation and rendering, capture same-origin/query/escaped endpoints, retain quoted script attributes, and restrict Web3Icons masking by script scope, valid variants, runtime markers, array structure and metadata-lookup usage. The result-page debounce now cancels superseded timers.

Validation: 31 Node test-runner checks pass, targeted lint and build pass. The public OpenForge bundle retains six raw address occurrences after catalog masking, down from 2,820. Latest synthetic 12-resource benchmark: old batches 303/303/301 ms, shared pump 157/156/156 ms, identical returned values. Bundle comparison with the original HEAD: 1,596,476 bytes to 19,756 bytes. These are controlled measurements, not browser end-to-end guarantees.

Browser extension-management access was blocked by the browser tool's URL security policy, so installed-extension reload testing was not performed. Cross-origin scanning retains browser CORS restrictions; no privileged fetch proxy was added. The body timeout now uses the overall collection window, preserving slow bodies beyond the four-second header timeout.
