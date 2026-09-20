# Extraction correctness review

Reviewed 2026-09-20. Actual runtime diff: the Web3Icons mask is imported and applied before raw EVM address extraction. The latency optimizations remain plans; they have not changed runtime behavior.

## Verdict

Do not claim complete capture or no false negatives. The eight committed/working-tree tests pass and targeted lint passes, but additional in-memory differential tests reproduced the issues below. No source changes were made during this review.

## Introduced by Web3Icons filtering

1. **P1: Schema-only masking also hides visible/app metadata.** `src/web3IconCatalog.js:23-26` accepts any object containing the seven fields and a token/network filePath. It does not verify icon variant values or library provenance. `src/contentscript.js:293-294` applies this to the serialized DOM, including visible text. A record with `variants:["vault"]` in a `<pre>` or a standalone application `activeToken` variable returned its address before the change and returns none afterward. Fix scope/provenance before declaring the filter behavior-preserving. A real visible reference must take precedence over library-noise suppression; do not infer library origin solely from shared token data shape.

## Pre-existing capture gaps

2. **P1: Global blacklist suppresses real page addresses.** `src/contentscript.js:169` applies the viem/l2beat list to all raw addresses. Visible text and a `data-contract` attribute containing Ethereum USDC or WETH each returned zero records in the actual scanner fixture. This is unrelated to the new Web3Icons mask. Preserve explicit page/application references while limiting library suppression to known source context.
3. **P2: Embedded endpoint formats are omitted.** Same-origin absolute `https://site.test/api/tokens`, relative `/api/tokens?chain=1`, and slash-escaped absolute strings all returned no endpoint. Plain external `https://api.project.test/v1/tokens?chain=1` was preserved before and after the change. Evidence: `src/contentscript.js:219`, `:226`, `:303`, `:336`. This concerns script strings; equivalent anchor tags use a separate path.
4. **P2: Address deduplication removes distinct URLs.** Two anchors `/token/<address>` and `/address/<address>` on the same hostname produce only the first URL because `addLink` deduplicates address+domain before retaining URL differences, `src/contentscript.js:135-140`. This may be an intentional display policy, but is incompatible with a claim that every distinct link is preserved.
5. **Coverage limit: cross-origin scripts are not crawled.** A CDN-hosted app script containing a unique address was not fetched by the fixture. `src/javascriptResources.js:7` explicitly restricts JavaScript discovery to the page origin. Any expansion needs browser permission/CORS verification, bounds, and duplicate handling; do not simply fetch all network traffic.

## Verified preservation cases

- An ordinary non-blacklisted address in visible DOM text/attributes remains captured.
- An address used outside a masked catalog remains captured. Its label correctly comes from that surviving application reference, rather than the removed library record.
- Plain external endpoints keep their query strings and complete record values.
- Existing tests cover inline/fetched catalogs, JSON and reordered fields, escaped names, repeated addresses outside the catalog, and network artwork/exponential rank forms.

## Verification limits

Tests executed the actual bundled source in Node VM with mocked DOM/fetch, comparing masking disabled with the current implementation. No live Chrome browser or network-capture guarantee. Dynamically assembled URLs, encrypted/runtime-fetched values, unfetched scripts, and resource/deadline limits prevent a universal 100% guarantee.

Prioritize the introduced false-negative case and clarify blacklist/dedup policy before executing the latency plans. Do not lower scan bounds or weaken exclusions just to make speed or count assertions pass.

## Resolution after implementation

The issues above describe the pre-fix state. The working implementation now scopes Web3Icons filtering to script catalogs with lookup/runtime evidence; removes global token blacklisting per user preference; expands literal endpoint capture; and keeps URL identities distinct through extraction, worker aggregation and results UI. Readable cross-origin script discovery was added without bypassing CORS. New tests cover the reported cases. Runtime-generated endpoints and bounded/inaccessible resources remain explicit coverage limits.
