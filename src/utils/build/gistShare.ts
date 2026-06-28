const GIST_API = 'https://api.github.com/gists'
const GIST_FILENAME = 'hsplanner-build.hsp'
const GIST_ID_RE = /^[0-9a-f]{20,40}$/i
const GIST_HOSTS = new Set(['gist.github.com', 'gist.githubusercontent.com'])

export type GistErrorKind =
  | 'no-token'
  | 'auth'
  | 'rate-limit'
  | 'not-found'
  | 'too-large'
  | 'network'
  | 'unknown'

export class GistShareError extends Error {
  readonly kind: GistErrorKind
  constructor(kind: GistErrorKind, message: string) {
    super(message)
    this.name = 'GistShareError'
    this.kind = kind
  }
}

export interface GistShareResult {
  id: string
  url: string
}

function getGistToken(): string | null {
  const raw = import.meta.env.VITE_GIST_TOKEN
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

export function isGistSharingConfigured(): boolean {
  return getGistToken() !== null
}

export function extractGistId(input: string): string | null {
  const trimmed = input.trim()
  if (GIST_ID_RE.test(trimmed)) return trimmed.toLowerCase()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (!GIST_HOSTS.has(url.hostname)) return null
  const seg = url.pathname.split('/').find((s) => GIST_ID_RE.test(s))
  return seg ? seg.toLowerCase() : null
}

export function isGistReference(input: string): boolean {
  return extractGistId(input) !== null
}
