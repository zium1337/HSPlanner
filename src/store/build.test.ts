import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBuild } from './build'

function failingSetItem() {
  // Simulates a browser that rejects every localStorage write once the origin
  // quota is full, so the store's persisting actions hit a StorageWriteError.
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota exceeded', 'QuotaExceededError')
  })
}

describe('build store — storage errors are surfaced, not swallowed', () => {
  beforeEach(() => {
    useBuild.setState({
      storageError: null,
      activeBuildId: null,
      activeProfileId: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useBuild.setState({
      storageError: null,
      activeBuildId: null,
      activeProfileId: null,
    })
  })

  it('records a storageError when a persisting action fails to write', () => {
    failingSetItem()
    expect(useBuild.getState().storageError).toBeNull()

    useBuild.getState().deleteSavedBuild('missing-build-id')

    expect(useBuild.getState().storageError).not.toBeNull()
  })

  it('saveCurrentAsNewBuild reports the failure and stays unbound when the write fails', () => {
    failingSetItem()

    const result = useBuild.getState().saveCurrentAsNewBuild('Quota Test')

    expect(result).toBeNull()
    expect(useBuild.getState().storageError).not.toBeNull()
    expect(useBuild.getState().activeBuildId).toBeNull()
  })

  it('saveCurrentAsNewBuild persists and binds the build when the write succeeds', () => {
    const result = useBuild.getState().saveCurrentAsNewBuild('Happy Path')

    expect(result).not.toBeNull()
    expect(useBuild.getState().storageError).toBeNull()
    expect(useBuild.getState().activeBuildId).not.toBeNull()
  })

  it('dismissStorageError clears a recorded error', () => {
    useBuild.setState({ storageError: 'something went wrong' })

    useBuild.getState().dismissStorageError()

    expect(useBuild.getState().storageError).toBeNull()
  })
})
