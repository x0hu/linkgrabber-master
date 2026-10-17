# Link Grabber - Modified Fork

This is a fork of the public Chrome extension [Link Grabber](https://chrome.google.com/webstore/detail/link-grabber/caodelkhipncidmoebgbbeemedohcdma).

## Original Extension

Link Grabber is an extension for Google Chrome that extracts links from an HTML page and displays them in another tab.

## Modifications

This fork includes the following enhancements:

- **Dark Mode**: Complete dark theme for better visual comfort
- **Highlighting**: Discord URLs, Twitter URLs, Telegram URLs, Github URLs, docs subdomain, "whitepaper", ETH/SOL Addresses

## Installation

1. Clone or download this repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the extension
4. Load the extension in Chrome by going to `chrome://extensions/`, enabling Developer mode, and clicking "Load unpacked"
5. Select the root directory of this project

## Development

- `npm run build` - Build the extension
- `npm run watch` - Build and watch for changes during development

### Licenses ###

This project is open source software that also bundles other open source
software.

Unless otherwise noted, the MIT License applies.

Icon files in images/ are derived from icons by FatCow
(http://www.fatcow.com/free-icons) and licensed under the Creative Commons
Attribution 3.0 License

Files in vendor/bootstrap are licensed under the apache-2.0 license
(vendor/bootstrap/LICENSE)

## Extraction and limits

The scan collects anchors, images, raw EVM addresses, and literal URLs/endpoints from page markup and JavaScript. Distinct paths, query strings, and HTTP/HTTPS destinations remain distinct even when they contain the same address. Explicit token addresses are preserved; the old global viem/l2beat blacklist is no longer applied.

Web3Icons address metadata is suppressed only in script bodies containing the TokenIcon runtime markers and an assigned catalog array used by a metadata lookup. Standalone application records and visible page text remain eligible. Unknown catalog formats are preserved rather than guessed away.

JavaScript fetching uses up to six active requests and follows literal module dependencies. Same-origin resources have priority; readable cross-origin resources use the remaining budget. Limits remain 100 resources, 12 MiB of JavaScript characters, and a 12-second window for starting requests per frame. Headers have a four-second timeout; body reads are bounded by the 30-second collection window. Failed/unavailable frames do not hold completed frames until that fallback.

This is static extraction, not a guarantee of every possible endpoint. Browser CORS restrictions, scan limits, inaccessible frames, runtime-generated URLs and resources loaded after the scan can limit coverage. Existing library-domain/static-asset filters still apply.

## Verification

- `npm test` runs extraction, catalog-filter, scheduling, identity and worker integration regressions.
- `npx eslint src test` checks JavaScript style and common errors.
- `npm run build` rebuilds the unpacked extension. Reload it in the browser's extensions page after building.

## Address sources and chain lookups

Results separate addresses found in page HTML, scripts, and identifiable package paths. Source URLs remain visible. With duplicate hiding enabled, repeated raw addresses share a row, and a matching hyperlink takes priority over the raw address. Different destination URLs remain separate. The zero address, native-token placeholder `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`, and `0x000000000000000000000000000000000000dead` are excluded case-insensitively.

Chain checks support BNB, Ethereum, Base, Monad, Avalanche, Arbitrum, HyperEVM, Robinhood mainnet, Ethereum Sepolia, Base Sepolia, Ink, and X Layer. The results page lets you disable individual chains. Names and symbols appear when available; unnamed contracts are grouped by chain. Native balances and sent-transaction counts are checked too. These checks do not provide full activity history, token balances, or proof of which chain a site intends to use.

Lookups use public HTTPS endpoints from Chainlist with a bundled fallback catalog. JSON-RPC batches validate the returned chain ID and try up to three endpoints, with 2.5 seconds per attempt, four concurrent batches, and a 15-second overall RPC budget. Up to 100 unique addresses are checked per scan. Addresses are sent to RPC providers; page URLs are not included in those requests. Provider failures remain unknown, rather than being cached as absent contracts.

Successful batches are saved to `chrome.storage.local` as they complete. The cache is shared across sites, expires for reuse after five minutes, and retains at most 5,000 chain/address entries. Reloading the extension preserves this storage. “Refresh chain checks” bypasses cached address results. Web Locks serialize cache updates across results tabs. The Chainlist catalog refreshes daily. There is no remote database or shared sighting history.
