// Only name a package when the resource path explicitly identifies it.
// A same-origin bundle can contain dependencies too; its origin is not proof.
export function addressSource(kind, url) {
  let packageName = '';
  if (kind === 'script') {
    try {
      const parsed = new URL(url);
      let path = parsed.pathname;
      if (parsed.hostname === 'unpkg.com') path = `/node_modules${path}`;
      if (parsed.hostname === 'cdn.jsdelivr.net' && path.startsWith('/npm/')) path = path.replace('/npm/', '/node_modules/');
      const match = path.match(/\/node_modules\/((?:@[^/@]+\/)?[^/@]+)(?:@[^/]+)?(?:\/|$)/);
      if (match) packageName = match[1];
    } catch (e) {
      // Unknown resource paths remain unattributed scripts.
    }
  }
  return {evmSourceKind: packageName ? 'package' : kind, evmSourceUrl: url, evmPackage: packageName};
}

export function addressSourceGroup(link) {
  if (link.evmSourceKind === 'package') return 'package';
  if (link.evmSourceKind === 'page' || link.source === 'a') return 'page';
  return 'script';
}
