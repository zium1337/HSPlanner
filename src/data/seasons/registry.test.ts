import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEASON_ID,
  SEASONS,
  SEASON_STORAGE_KEY,
  getSeason,
  isKnownSeasonId,
  resolveActiveSeasonId,
  setStoredSeasonId,
} from './registry'

describe('season registry', () => {
  it('contains s9 and s10 with s9 as default', () => {
    expect(SEASONS.map((s) => s.id)).toEqual(['s9', 's10'])
    expect(DEFAULT_SEASON_ID).toBe('s9')
  })

  it('falls back to default when storage is empty', () => {
    expect(resolveActiveSeasonId()).toBe(DEFAULT_SEASON_ID)
  })

  it('returns stored season when valid', () => {
    window.localStorage.setItem(SEASON_STORAGE_KEY, 's10')
    expect(resolveActiveSeasonId()).toBe('s10')
  })

  it('ignores unknown stored season', () => {
    window.localStorage.setItem(SEASON_STORAGE_KEY, 's99')
    expect(resolveActiveSeasonId()).toBe(DEFAULT_SEASON_ID)
  })

  it('setStoredSeasonId rejects unknown ids and persists known ones', () => {
    expect(setStoredSeasonId('s99')).toBe(false)
    expect(setStoredSeasonId('s10')).toBe(true)
    expect(window.localStorage.getItem(SEASON_STORAGE_KEY)).toBe('s10')
  })

  it('returns true for known season ids and false otherwise', () => {
    expect(isKnownSeasonId('s9')).toBe(true)
    expect(isKnownSeasonId('')).toBe(false)
  })

  it('getSeason returns the season entry or undefined', () => {
    expect(getSeason('s10')?.name).toBe('Season 10')
    expect(getSeason('nope')).toBeUndefined()
  })
})
