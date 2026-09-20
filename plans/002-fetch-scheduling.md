# Plan 002: Keep the existing six fetch slots occupied

## Status and drift check

- Priority P1; effort medium; risk medium; category performance; execute after 001.
- Planned at `7a9094a`, 2026-09-20, with the existing uncommitted Web3Icons filter.
- Run `git diff --stat 7a9094a..HEAD -- src/contentscript.js test` and inspect working-tree changes before editing. Expect plan 001's changes if already executed. Preserve all previous work.

## Purpose

`scanDiscoveredResources` currently removes six URLs and awaits `Promise.all(batch.map(scanResource))`. When five finish, those slots remain idle until the sixth finishes. An in-memory prototype reduced a controlled 12-resource workload from 311 ms to 170 ms with the same URL set. That experiment did not establish full equivalence at limits or with duplicate references; this plan must prove those before shipping.

## Current state

- `src/contentscript.js:318` sets the limits: 100 resources, 12 * 1024 * 1024 JavaScript characters, concurrency six, and a 12-second scheduling budget.
- `enqueueResource` deduplicates resource URLs and enforces the resource count limit.
- `scanResource` fetches text, checks the shared character budget, extracts results, and discovers same-origin imports via `extractJavaScriptDependencyUrls`.
- `scanDiscoveredResources` processes fixed batches and checks deadline/character budget between batches.
- Completion sends one `links-found` message to the worker.
- `src/javascriptResources.js` defines static/re-export/dynamic-import discovery. Do not alter it in this plan.
- Integration testing pattern: `test/web3IconCatalog.test.js` bundles the real content script in memory and runs it in `node:vm` with mocked APIs. Use deferred promises to control fetch completion instead of real sleeps.
- Follow existing ES module, single quote, semicolon style; add no dependency.

## Scope

Only `src/contentscript.js`, `test/javascriptScheduling.test.js`, and an optional shared helper under `test/helpers/`. No UI, manifest, storage, blacklist, URL filtering, Web3Icons filtering, timeout duration, or resource-limit changes.

No commit, push, or PR without a request. Optional isolated branch prefix `codex/`.

## Steps

1. Write deterministic characterization tests for the current scan's graph discovery and outputs. Capture all link fields and precedence-sensitive duplicates. Record the boundary behavior when the character/resource/deadline limits are reached.
   - Verify: `npm test` passes baseline cases before edits.
2. Add a scheduling test that holds one of the first six fetches open, resolves another, and observes whether the seventh starts. Assert a maximum of six in-flight fetches. The idle-slot expectation should fail on the old scheduler.
3. Implement an explicit queue/in-flight scheduler, or equivalent bounded worker pool, that starts the next queued resource when a slot opens. Completion requires both an empty queue and zero in-flight operations. New dependencies discovered by the last running task must still be processed. Failed fetches free slots; duplicate URLs never refetch.
4. Preserve all limit constants and extraction rules. Explicitly evaluate changes in resource admission and first-reference precedence caused by timing. Do not silently discard previously found results or accept different labels. If capped or duplicate fixtures differ, stop and document the exact tradeoff before shipping; a faster partial answer is not a passing result.
5. Validate no-work, failures, dynamic discoveries, and deadline termination. Verify exactly one final message per scan. Maintain the existing full-result delivery behavior.
6. Run test/lint/build gates and benchmark the delayed-resource fixture. Browser-level timing on a representative large page is desirable; report whether it was performed.

## Required tests

- Empty queue and single resource complete once.
- Seventh request begins after one slot frees while another initial request remains pending.
- Maximum in-flight fetch count never exceeds six.
- Imports discovered by the last outstanding response are scanned.
- Repeated dependencies and graph cycles fetch once.
- Fetch rejection and HTTP failure do not hang or suppress successful results.
- More than 100 discovered resources and character-budget boundaries preserve required coverage; document any differences rather than concealing them.
- No new requests start after the existing deadline; existing completion behavior remains explicit.
- Duplicate addresses/URLs with differing source contexts retain expected metadata and order for controlled completion sequences.
- Web3Icons exclusions and real application-address preservation still pass.
- Final message fires exactly once, after all accepted work settles.

## Commands and done criteria

- `npm test`: exit zero, including the new scheduling assertions and all extraction tests.
- `npx eslint src/contentscript.js test/javascriptScheduling.test.js`: exit zero; include any helper files.
- `npm run build`: exit zero.
- `git diff --check`: exit zero.
- Deferred-promise tests verify overlap without relying on timing thresholds.
- Uncapped output fixtures compare full records and order. Capped fixtures must not hide missing baseline results.
- Report completion time and returned-result counts for baseline and candidate under the same simulated delays.
- Update `plans/README.md` only after verification.

## Stop conditions and maintenance

Stop if the change requires raising concurrency or reducing limits, alters first-reference labels, loses baseline resources at a boundary, or needs worker/message protocol changes. Do not extend this into timeout-policy changes: the current abort timer does not cover body reads, but changing it could omit late responses. Future changes to scan deadlines, response streaming, and result precedence require rerunning this suite.
