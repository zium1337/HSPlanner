import { gameConfig, getItem } from '../../data'
import type { Inventory } from '../../types'
import type { BuildPerformanceDeps } from './buildPerformance'
import { defaultEnemyResistances } from './shareBuild'

export function mercOnlyDeps(mercInventory: Inventory): BuildPerformanceDeps {
  const allocatedAttrs = Object.fromEntries(
    gameConfig.attributes.map((a) => [a.key, 0]),
  )
  return {
    classId: null,
    level: 1,
    allocatedAttrs,
    inventory: mercInventory,
    skillRanks: {},
    subskillRanks: {},
    activeAuraId: null,
    activeBuffs: {},
    customStats: [],
    allocatedTreeNodes: new Set<number>(),
    treeSocketed: {},
    activeSkillIds: [],
    enemyConditions: {},
    playerConditions: {},
    skillProjectiles: {},
    enemyResistances: defaultEnemyResistances(),
    procToggles: {},
    killsPerSec: 1,
  }
}

export interface MercSharedEffect {
  itemName: string
  effect: string
}

export function mercSharedEffects(mercInventory: Inventory): MercSharedEffect[] {
  const out: MercSharedEffect[] = []
  for (const equipped of Object.values(mercInventory)) {
    if (!equipped) continue
    const base = getItem(equipped.baseId)
    if (!base) continue
    for (const effect of base.uniqueEffects ?? []) {
      out.push({ itemName: base.name, effect })
    }
  }
  return out
}

export function hasMercGear(mercInventory: Inventory): boolean {
  return Object.values(mercInventory).some((item) => item != null)
}
