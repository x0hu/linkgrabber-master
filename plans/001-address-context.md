# Plan 001: Reject discarded address occurrences before parsing context

## Status and drift check

- Priority P1; effort small; risk low; category performance; dependencies none.
- Planned at `7a9094a`, 2026-09-20, plus the existing uncommitted Web3Icons filter.
- Run `git diff --stat 7a9094a..HEAD -- src/contentscript.js test` and `git diff -- src/contentscript.js` before edits. Preserve the user's uncommitted filter and tests. Compare the excerpts below with live code; stop on unexplained changes.

## Purpose

The extractor computes context for every address occurrence before `addEvmAddress` drops blacklisted or already-seen addresses. Context parsing performs several regex searches over up to 500 preceding characters. Avoid work whose output is discarded, without changing the first accepted occurrence, original casing, labels, or reference domain.

## Current state

- `src/contentscript.js:273` defines `extractEvmAddresses`. It calls `maskWeb3IconCatalog`, removes ignored Dexscreener URLs, and matches addresses.
- Its loop currently constructs `{address: match[0], context: getEvmAddressContext(searchableText, match.index)}` for every match.
- `src/contentscript.js:163` defines `addEvmAddress`. It lowercases the address, constructs an address/domain key, checks `viemEvmAddressBlacklist` and `seenEvmAddressReferences`, then records the accepted address.
- Serialized HTML is scanned first, then inline scripts, then fetched scripts. Preserve this precedence.
- `test/web3IconCatalog.test.js` demonstrates integration tests using `node:test`, `node:vm`, and esbuild `buildSync` with `write:false`; model new tests on it.
- JavaScript uses ES module imports, single quotes, semicolons, and no new runtime dependencies.

## Scope

Modify only `src/contentscript.js`, add `test/addressExtraction.test.js`, and optionally add `test/helpers/contentScriptHarness.js` if sharing the existing harness is necessary. Preserve existing tests. Do not modify the blacklist, Web3Icons schema, URL rules, service worker, results UI, or fetch scheduling.

No commit, push, or PR without an explicit request. If an isolated branch is needed, use `codex/optimize-address-context`.

## Steps

1. Capture current behavior in integration fixtures before changing extraction. Run the actual bundled content script with mocked DOM/fetch and record complete links, not just counts.
   - Verify: `npm test` exits zero, including the new baseline tests.
2. Add an exact `text.includes('0x')` fast return before masking if useful. The existing matcher only accepts lowercase `0x`; do not broaden or narrow it.
3. During matching, normalize for lookup only. Skip addresses already in the blacklist, a per-extraction set, or the existing per-frame address/domain reference set before calling `getEvmAddressContext`. Keep original casing and context for the first accepted match. Do not mutate the global reference set until `addEvmAddress` accepts a result. Do not cache a rejection across future documents or scans.
4. Retain final acceptance checks in `addEvmAddress` initially. Confirm that all complete output fixtures match. If the extra lookups materially regress unique-address inputs, revise the design rather than claiming an unconditional speedup.
5. Run tests, lint, and build. Compare the built extension on the same page before/after with identical resources if browser access is available; state any missing live validation.

## Required tests

- Repeated mixed-case addresses retain first occurrence casing and context.
- A blacklisted address is never returned.
- Distinct addresses retain distinct labels.
- The same raw address and URL-derived reference obey current domain-key precedence.
- An address in Web3Icons metadata remains excluded, but a real DOM or application reference is preserved.
- Dexscreener filtering stays unchanged.
- HTML, inline scripts, and fetched scripts preserve existing first-reference precedence.
- Address-free input returns the same links/images/routes.

## Commands and done criteria

- `npm test`: exit zero; all existing and new tests pass.
- `npx eslint src/contentscript.js test/addressExtraction.test.js`: exit zero. Include any added helper in this command.
- `npm run build`: exit zero; generated extension uses the new code.
- Complete output objects match baseline fixtures, including `source`, `frameUrl`, `text`, `context`, casing, and order.
- Benchmark duplicate, blacklisted, and unique-address fixtures in repeated runs; report medians separately. No timing assertions against noisy wall-clock thresholds in unit tests.
- `git diff --check`: exit zero.
- Update this plan's status in `plans/README.md` only after verification.

## Stop conditions and maintenance

Stop if preservation requires changing dedup semantics, if context from the first accepted occurrence changes, or if the blacklist does not contain the chosen blacklist test fixture. Do not loosen tests to accept changed outputs. Future provenance or dedup-key changes must update both early rejection and final acceptance checks together.
