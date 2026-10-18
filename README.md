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

Results separate addresses found in page HTML, scripts, and identifiable package paths. Source URLs remain visible. Repeated raw addresses share a row, and a matching hyperlink takes priority over the raw address. Different destination URLs remain separate. The zero address, native-token placeholder `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`, and `0x000000000000000000000000000000000000dead` are excluded case-insensitively.

Chain checks support BNB, Ethereum, Base, Monad, Avalanche, Arbitrum, HyperEVM, Robinhood mainnet, Ethereum Sepolia, Base Sepolia, Ink, and X Layer. All supported chains are checked automatically. Names and symbols appear when available; unnamed contracts are grouped by chain. Native balances and sent-transaction counts are checked too. These checks do not provide full activity history, token balances, or proof of which chain a site intends to use.

Lookups use public HTTPS endpoints from Chainlist with a bundled fallback catalog. JSON-RPC batches validate the returned chain ID and try up to three endpoints, with 2.5 seconds per attempt, four concurrent batches, and a 15-second overall RPC budget. Up to 100 unique addresses are checked per scan. Addresses are sent to RPC providers; page URLs are not included in those requests. Provider failures remain unknown, rather than being cached as absent contracts.

Successful batches are saved to `chrome.storage.local` as they complete. The cache is shared across sites, expires for reuse after five minutes, and retains at most 5,000 chain/address entries. Reloading the extension preserves this storage. “Refresh chain checks” bypasses cached address results. Web Locks serialize cache updates across results tabs. The Chainlist catalog refreshes daily. An optional evmoleSIG resolver adds a shared cache and site sighting history.


## Optional evmoleSIG resolver

Open **Resolver settings** from the results page and save the base URL of the updated evmoleSIG service. HTTPS is required for remote services; localhost also supports HTTP. Leave the setting blank to retain local-only behavior. The service must include the `/linkgrabber/health`, `/linkgrabber/lookup`, `/linkgrabber/metadata`, and `/linkgrabber/scans` routes.

Metadata lookup order is fresh local cache, fresh remote cache, then RPCs. Refresh bypasses both caches. RPC results are uploaded in batches. Resolver failures do not prevent RPC lookups or local results. All metadata lookups remain limited to all supported chains and first 100 unique addresses.

Saving a resolver URL enables sending found addresses, chain metadata and the source hostname to that service. Page paths, query strings, and script contents are not uploaded. Each extraction gets a stable UUID stored with its results. Reopening results or refreshing metadata reuses the UUID and does not increment site counts; scanning a page again creates a new UUID. Each address is counted once per scan regardless of duplicate HTML or script occurrences. New addresses are marked “New on this site”; this does not imply recent deployment. Older result pages without a scan ID are not posted to history. Site histories accept up to 10,000 addresses per scan and report an error rather than silently truncating larger scans.

The resolver uses the same PostgreSQL database as the signature service, with separate Link Grabber tables. Deploy/restart the updated service to initialize them before entering its URL. The resolver retains its existing private/trusted deployment model.


Site counts group all paths and subdomains under the registrable domain, such as `example.com` or `example.co.uk`. The backend performs normalization with the Public Suffix List and migrates existing hostname records on startup. All subdomains count together, including hosted tenants: `alice.github.io` and `bob.github.io` count as `github.io`. HTTP/HTTPS, ports and paths do not affect site identity. Install the backend dependency update with `npm ci` and restart the updated resolver before using these domain-level counts. Reopening results returns the current counts without creating another scan.

Address badges show the distinct-domain count only when it exceeds one. Within each EVM source section, addresses with a contract name or symbol come first, then addresses sort by ascending distinct-domain count. Unknown counts follow known counts within each group. This applies to both raw addresses and address hyperlinks.

Duplicate hiding and blocked-domain filtering are always enabled; their toolbar toggles have been removed.
