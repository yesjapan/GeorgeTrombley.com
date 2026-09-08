/**
 * Prepare an SVG file's text for inlining into a page.
 *
 * Inlining (rather than an <img>) lets the drawing take the page's ink colour
 * through `currentColor`, so a lockup drawn in flat black or white follows the
 * colour scheme like the text around it. The trade-offs: the markup ships in
 * every page that uses it, so keep this to small, flat artwork — a title
 * lockup, not an illustration.
 *
 * Lives in its own module so pages stay free of the `import.meta.glob` call
 * below, whose options object trips the Astro compiler (see the note there).
 */
export function inlineSvg(src: string | undefined, name: string, label: string): string {
  if (!src) throw new Error(`SVG "${name}" was not found`);
  return (
    src
      // Prolog, doctype and comments have no place inside HTML.
      .replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, '')
      // Size comes from CSS; the drawing keeps its viewBox for proportion.
      .replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
        const kept = attrs.replace(/\s(?:width|height)="[^"]*"/g, '');
        return `<svg${kept} role="img" aria-label="${escapeAttr(label)}" focusable="false">`;
      })
      // Whatever flat ink the artwork was drawn in becomes the page's ink.
      .replace(/fill:\s*(?:white|black|#fff(?:fff)?|#000(?:000)?)\b/gi, 'fill:currentColor')
      .replace(/fill="(?:white|black|#fff(?:fff)?|#000(?:000)?)"/gi, 'fill="currentColor"')
      .trim()
  );
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Every SVG under src/assets/, as text, resolved at build time. Kept here
// rather than in a page: the options object has a key named `import`, which
// the Astro compiler's frontmatter scanner reads as an import statement and
// then loses the page's Props type.
const assets = import.meta.glob('/src/assets/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Inline an SVG from src/assets/ by file name. */
export function assetSvg(name: string, label: string): string {
  return inlineSvg(assets[`/src/assets/${name}`], name, label);
}
