import { beforeEach, describe, expect, it } from 'vitest'
import {
  convertSavedBuildToSeason,
  createBuild,
  getActiveProfile,
  getSavedBuild,
  setBuildSeason,
} from './savedBuilds'
import {
  decodeShareToBuild,
  defaultEnemyResistances,
  type BuildSnapshot,
} from './shareBuild'

const GHOST_NODE_ID = 999_999

function snapshotWithGhostNode(): BuildSnapshot {
  return {
    classId: 'amazon',
    level: 5,
    allocated: {
      strength: 0,
      dexterity: 0,
      intelligence: 0,
      energy: 0,
      vitality: 0,
      armor: 0,
    },
    inventory: {},
    skillRanks: {},
    subskillRanks: {},
    allocatedTreeNodes: new Set([GHOST_NODE_ID]),
    mainSkillId: null,
    activeAuraId: null,
    activeBuffs: {},
    enemyConditions: {},
    playerConditions: {},
    skillProjectiles: {},
    enemyResistances: defaultEnemyResistances(),
    procToggles: {},
    killsPerSec: 1,
    customStats: [],
    treeSocketed: {},
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('convertSavedBuildToSeason', () => {
  it('converts every profile, restamps season and returns the active profile report', () => {
    const build = createBuild('Conv', snapshotWithGhostNode())
    setBuildSeason(build.id, 's10')

    const result = convertSavedBuildToSeason(build.id)

    expect(result).not.toBeNull()
    expect(result!.report.removedTreeNodes).toEqual([GHOST_NODE_ID])
    const stored = getSavedBuild(build.id)
    expect(stored?.season).toBe('s9')
    // The persisted profile code must decode without the ghost node.
    const profile = stored ? getActiveProfile(stored) : null
    const decoded = profile ? decodeShareToBuild(profile.code) : null
    expect(decoded).not.toBeNull()
    expect(decoded!.snapshot.allocatedTreeNodes.has(GHOST_NODE_ID)).toBe(false)
  })

  it('returns null for already-converted or missing builds', () => {
    const build = createBuild('Same', snapshotWithGhostNode())
    expect(convertSavedBuildToSeason(build.id)).toBeNull()
    expect(convertSavedBuildToSeason('missing')).toBeNull()
  })
})
