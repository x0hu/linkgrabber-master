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
