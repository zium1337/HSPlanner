export function isImageUrl(s: string | undefined): boolean {
  // Returns true when the supplied string looks like a usable image reference, either an http(s) URL or a path ending in a recognised image extension. Used by icon renderers to decide whether to render an <img> tag versus a placeholder/text fallback.
  if (!s) return false
  return /^https?:\/\//.test(s) || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(s)
}
