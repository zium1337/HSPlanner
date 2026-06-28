import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractGistId,
  isGistReference,
  isGistSharingConfigured,
} from './gistShare'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const HEX = 'a'.repeat(32)

describe('isGistSharingConfigured', () => {
  it('is false when the token env var is empty', () => {
    vi.stubEnv('VITE_GIST_TOKEN', '')
    expect(isGistSharingConfigured()).toBe(false)
  })

  it('is true when the token env var is set', () => {
    vi.stubEnv('VITE_GIST_TOKEN', 'ghp_test')
    expect(isGistSharingConfigured()).toBe(true)
  })
})

describe('extractGistId / isGistReference', () => {
  it('accepts a bare hex id', () => {
    expect(extractGistId(HEX)).toBe(HEX)
    expect(isGistReference(HEX)).toBe(true)
  })

  it('extracts the id from a gist.github.com URL', () => {
    expect(extractGistId(`https://gist.github.com/someuser/${HEX}`)).toBe(HEX)
  })

  it('extracts the id from a raw gist URL', () => {
    expect(
      extractGistId(`https://gist.githubusercontent.com/u/${HEX}/raw/abc/file`),
    ).toBe(HEX)
  })

  it('rejects non-gist hosts', () => {
    expect(extractGistId(`https://example.com/${HEX}`)).toBeNull()
    expect(isGistReference(`https://example.com/${HEX}`)).toBe(false)
  })

  it('rejects an arbitrary build code', () => {
    expect(isGistReference('N4Ig1234-not-a-gist+code$$')).toBe(false)
  })
})
