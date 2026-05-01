import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Reset DOM between tests so each `render()` starts clean.
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
