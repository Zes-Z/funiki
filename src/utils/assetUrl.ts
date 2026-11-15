/**
 * Prefix a public/ asset path with Astro's configured base.
 *
 * The site is published under /funiki on GitHub Pages, so a raw "/avatar.webp"
 * would resolve to the domain root and 404. Absolute external URLs and data
 * URLs are returned untouched.
 */
const base = import.meta.env.BASE_URL || '/';
const prefix = base.endsWith('/') ? base : `${base}/`;

export function assetUrl(path: string): string {
  if (!path) return path;
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('#')) {
    return path;
  }
  if (path.startsWith(prefix)) return path;
  return prefix + path.replace(/^\//, '');
}
