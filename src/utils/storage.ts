export function readStorage(key: string): string | null {
  // Safely reads a string value from localStorage by key, returning null when the window object is unavailable or when storage access is blocked. Used throughout the app as the read-side wrapper that protects callers from SSR and disabled-storage exceptions.
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function readStorageWithLegacy(
  key: string,
  legacyKey: string,
): string | null {
  // Reads the value stored under `key` and falls back to `legacyKey` if missing. Used during one-shot key-rename migrations so existing user data keeps loading after a storage key has been renamed.
  return readStorage(key) ?? readStorage(legacyKey)
}

export function writeStorage(key: string, value: string): void {
  // Safely writes a string value to localStorage, silently ignoring SSR and quota-exceeded errors. Used as the write-side wrapper for every persistent setting (selected build, profile, configuration flags, etc.).
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    return
  }
}
