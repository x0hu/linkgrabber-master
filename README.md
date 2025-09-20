# Link Grabber - Modified Fork

This is a fork of the public Chrome extension [Link Grabber](https://chrome.google.com/webstore/detail/link-grabber/caodelkhipncidmoebgbbeemedohcdma).

## Original Extension

Link Grabber is an extension for Google Chrome that extracts links from an HTML page and displays them in another tab.

## Modifications

This fork includes the following enhancements:

- **Dark Mode**: Complete dark theme for better visual comfort
- **Discord Link Highlighting**: Discord URLs (discord.com and discord.gg) are highlighted with Discord's brand color (#5865f2)

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
