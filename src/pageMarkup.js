// HTML serialization quotes attribute values. Respect those quotes (including
// > inside a value) and comments when excluding actual script bodies. Preserve
// script-tag attributes and offsets for context extraction.
export function withoutScriptBodies(html) {
  return html.replace(/<!--[\s\S]*?-->|(<script\b(?:[^"'<>]|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/script\s*>)/gi,
    (match, opening, body, closing) => opening ? opening + body.replace(/[^\r\n]/g, ' ') + closing : match);
}
