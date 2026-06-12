import { beforeEach, describe, expect, it } from 'vitest'
import { type BuildSnapshot } from './shareBuild'
import {
  createBuild,
  getSavedBuild,
  readLibrary,
  setBuildSeason,
  writeLibrary,
} from './savedBuilds'

function makeSnapshot(overrides: Partial<BuildSnapshot> = {}): BuildSnapshot {
  return {
    classId: 'stormweaver',
    level: 50,
    allocated: { strength: 10 },
    inventory: {},
    skillRanks: { fireball: 5 },
    subskillRanks: {},
    allocatedTreeNodes: new Set([1, 2, 3]),
    mainSkillId: 'fireball',
    activeAuraId: null,
    activeBuffs: {},
    enemyConditions: {},
    playerConditions: {},
    skillProjectiles: {},
    enemyResistances: {},
    procToggles: {},
    killsPerSec: 1,
    customStats: [],
    treeSocketed: {},
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('saved build season field', () => {
  it('new builds are stamped with the active season', () => {
    const build = createBuild('Test', makeSnapshot())
    expect(getSavedBuild(build.id)?.season).toBe('s9')
  })

  it('legacy builds without season are stamped s9 on read', () => {
    const build = createBuild('Legacy', makeSnapshot())
    const lib = readLibrary()
    const raw = lib.builds.map((b) => {
      if (b.id !== build.id) return b
      const { season: _drop, ...rest } = b as typeof b & { season?: string }
      return rest as typeof b
    })
    writeLibrary({ ...lib, builds: raw as typeof lib.builds })
    expect(getSavedBuild(build.id)?.season).toBe('s9')
  })

  it('setBuildSeason persists', () => {
    const build = createBuild('Conv', makeSnapshot())
    expect(setBuildSeason(build.id, 's10')).toBe(true)
    expect(getSavedBuild(build.id)?.season).toBe('s10')
    expect(setBuildSeason('missing', 's10')).toBe(false)
  })
})
