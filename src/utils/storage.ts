// Tiny localStorage wrappers that swallow the SSR (no-window) and
// quota/disabled-storage cases that every caller had to re-implement.

export function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Read `key`, falling back to `legacyKey` for one-shot rename migrations. */
export function readStorageWithLegacy(
  key: string,
  legacyKey: string,
): string | null {
  return readStorage(key) ?? readStorage(legacyKey)
}

export function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* quota or disabled storage */
  }
}
