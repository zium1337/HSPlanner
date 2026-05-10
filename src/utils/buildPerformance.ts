import { gameConfig, getSkillsByClass } from '../data'
import { subskillKey } from '../store/build'
import {
  aggregateItemSkillBonuses,
  combineAdditiveAndMore,
  computeBuildStats,
  computeSkillDamage,
  normalizeSkillName,
  rangedMax,
  rangedMin,
  statDef,
  statName,
} from './stats'
import type { SkillDamageBreakdown } from './stats'
import { aggregateSubskillStats } from './subtree'
import type {
  AttributeKey,
  CustomStat,
  Inventory,
  RangedValue,
  Skill,
  TreeSocketContent,
} from '../types'

export interface BuildPerformance {
  attributes: Record<AttributeKey, RangedValue>
  stats: Record<string, RangedValue>
  damage: SkillDamageBreakdown | null
  hitDpsMin: number | undefined
  hitDpsMax: number | undefined
  avgHitDpsMin: number | undefined
  avgHitDpsMax: number | undefined
  procDpsMin: number
  procDpsMax: number
  combinedDpsMin: number | undefined
  combinedDpsMax: number | undefined
  activeSkillName: string | null
}

export interface BuildPerformanceDeps {
  classId: string | null
  level: number
  allocatedAttrs: Record<AttributeKey, number>
  inventory: Inventory
  skillRanks: Record<string, number>
  subskillRanks: Record<string, number>
  activeAuraId: string | null
  activeBuffs: Record<string, boolean>
  customStats: CustomStat[]
  allocatedTreeNodes: Set<number>
  treeSocketed: Record<number, TreeSocketContent | null>
  mainSkillId: string | null
  enemyConditions: Record<string, boolean>
  playerConditions: Record<string, boolean>
  skillProjectiles: Record<string, number>
  enemyResistances: Record<string, number>
  procToggles: Record<string, boolean>
  killsPerSec: number
}

const skillsByNameCache = new Map<string, Record<string, Skill>>()

function skillsByNameFor(classId: string | null): Record<string, Skill> {
  const key = classId ?? ''
  let cached = skillsByNameCache.get(key)
  if (cached) return cached
  cached = {}
  for (const s of getSkillsByClass(classId)) {
    cached[normalizeSkillName(s.name)] = s
  }
  skillsByNameCache.set(key, cached)
  return cached
}

export function computeBuildPerformance(
  deps: BuildPerformanceDeps,
): BuildPerformance {
  const computed = computeBuildStats({
    classId: deps.classId,
    level: deps.level,
    allocated: deps.allocatedAttrs,
    inventory: deps.inventory,
    skillRanks: deps.skillRanks,
    activeAuraId: deps.activeAuraId,
    activeBuffs: deps.activeBuffs,
    customStats: deps.customStats,
    allocatedTreeNodes: deps.allocatedTreeNodes,
    treeSocketed: deps.treeSocketed,
    playerConditions: deps.playerConditions,
    subskillRanks: deps.subskillRanks,
    enemyConditions: deps.enemyConditions,
  })

  const allClassSkills = getSkillsByClass(deps.classId)
  const classSkills = allClassSkills.filter((s) => s.kind === 'active')
  const activeSkill = deps.mainSkillId
    ? classSkills.find((s) => s.id === deps.mainSkillId)
    : null
  const activeRank = activeSkill ? (deps.skillRanks[activeSkill.id] ?? 0) : 0

  const itemSkillBonuses = aggregateItemSkillBonuses(deps.inventory)
  const skillsByNormalizedName = skillsByNameFor(deps.classId)
  const skillRanksByName: Record<string, number> = {}
  for (const s of allClassSkills) {
    skillRanksByName[normalizeSkillName(s.name)] = deps.skillRanks[s.id] ?? 0
  }

  const activeSubAgg = activeSkill
    ? aggregateSubskillStats(
        activeSkill,
        deps.subskillRanks,
        deps.enemyConditions,
      )
    : null
  const activeProjectileBoost = activeSubAgg?.stats.projectile_count ?? 0
  const effectiveProjectiles = activeSkill
    ? (deps.skillProjectiles[activeSkill.id] ?? 1) + activeProjectileBoost
    : undefined

  const damage =
    activeSkill && activeRank > 0
      ? computeSkillDamage(
          activeSkill,
          activeRank,
          computed.attributes,
          computed.stats,
          skillRanksByName,
          itemSkillBonuses,
          deps.enemyConditions,
          deps.enemyResistances,
          skillsByNormalizedName,
          effectiveProjectiles,
        )
      : null

  const fcrCombined = combineAdditiveAndMore(
    computed.stats.faster_cast_rate,
    computed.stats.faster_cast_rate_more,
  )
  const fcrMin = rangedMin(fcrCombined)
  const fcrMax = rangedMax(fcrCombined)
  const effCastMin = activeSkill?.baseCastRate
    ? activeSkill.baseCastRate * (1 + fcrMin / 100)
    : undefined
  const effCastMax = activeSkill?.baseCastRate
    ? activeSkill.baseCastRate * (1 + fcrMax / 100)
    : undefined
  const hitDpsMin =
    damage && effCastMin !== undefined ? damage.finalMin * effCastMin : undefined
  const hitDpsMax =
    damage && effCastMax !== undefined ? damage.finalMax * effCastMax : undefined
  const avgHitDpsMin =
    damage && effCastMin !== undefined ? damage.avgMin * effCastMin : undefined
  const avgHitDpsMax =
    damage && effCastMax !== undefined ? damage.avgMax * effCastMax : undefined

  let procDpsMin = 0
  let procDpsMax = 0
  for (const procSkill of allClassSkills) {
    if (!procSkill.proc) continue
    if (!deps.procToggles[procSkill.id]) continue
    const procRank = deps.skillRanks[procSkill.id] ?? 0
    if (procRank === 0) continue
    const targetName = normalizeSkillName(procSkill.proc.target)
    const target = skillsByNormalizedName[targetName]
    if (!target) continue
    const targetRank = deps.skillRanks[target.id] ?? 0
    if (targetRank === 0) continue
    const targetDmg = computeSkillDamage(
      target,
      targetRank,
      computed.attributes,
      computed.stats,
      skillRanksByName,
      itemSkillBonuses,
      deps.enemyConditions,
      deps.enemyResistances,
      skillsByNormalizedName,
      deps.skillProjectiles[target.id],
    )
    if (!targetDmg) continue
    const rate = procSkill.proc.trigger === 'on_kill' ? deps.killsPerSec : 1
    const factor = rate * (procSkill.proc.chance / 100)
    procDpsMin += factor * targetDmg.avgMin
    procDpsMax += factor * targetDmg.avgMax
  }

  for (const ownerSkill of allClassSkills) {
    for (const sub of ownerSkill.subskills ?? []) {
      if (!sub.proc?.target) continue
      const toggleKey = subskillKey(ownerSkill.id, sub.id)
      if (!deps.procToggles[toggleKey]) continue
      const subRank = deps.subskillRanks[toggleKey] ?? 0
      if (subRank === 0) continue
      const targetName = normalizeSkillName(sub.proc.target)
      const target = skillsByNormalizedName[targetName]
      if (!target) continue
      const targetRank = deps.skillRanks[target.id] ?? 0
      if (targetRank === 0) continue
      const targetDmg = computeSkillDamage(
        target,
        targetRank,
        computed.attributes,
        computed.stats,
        skillRanksByName,
        itemSkillBonuses,
        deps.enemyConditions,
        deps.enemyResistances,
        skillsByNormalizedName,
        deps.skillProjectiles[target.id],
      )
      if (!targetDmg) continue
      const chance =
        (sub.proc.chance.base ?? 0) +
        (sub.proc.chance.perRank ?? 0) * subRank
      const rate = sub.proc.trigger === 'on_kill' ? deps.killsPerSec : 1
      const factor = rate * (chance / 100)
      procDpsMin += factor * targetDmg.avgMin
      procDpsMax += factor * targetDmg.avgMax
    }
  }

  const combinedDpsMin =
    avgHitDpsMin !== undefined ? avgHitDpsMin + procDpsMin : undefined
  const combinedDpsMax =
    avgHitDpsMax !== undefined ? avgHitDpsMax + procDpsMax : undefined

  return {
    attributes: computed.attributes,
    stats: computed.stats,
    damage,
    hitDpsMin,
    hitDpsMax,
    avgHitDpsMin,
    avgHitDpsMax,
    procDpsMin,
    procDpsMax,
    combinedDpsMin,
    combinedDpsMax,
    activeSkillName: activeSkill?.name ?? null,
  }
}

export interface BuildStatDiff {
  key: string
  label: string
  beforeMin: number
  beforeMax: number
  afterMin: number
  afterMax: number
  delta: number
  isPercent: boolean
  kind: 'up' | 'down'
}

export function rangedBounds(v: RangedValue | undefined): {
  min: number
  max: number
} {
  if (v === undefined) return { min: 0, max: 0 }
  return { min: rangedMin(v), max: rangedMax(v) }
}

export function diffRangePair(
  key: string,
  label: string,
  beforeMin: number,
  beforeMax: number,
  afterMin: number,
  afterMax: number,
  isPercent: boolean,
): BuildStatDiff | null {
  const beforeAvg = (beforeMin + beforeMax) / 2
  const afterAvg = (afterMin + afterMax) / 2
  const delta = afterAvg - beforeAvg
  if (Math.abs(delta) < 0.001) return null
  return {
    key,
    label,
    beforeMin,
    beforeMax,
    afterMin,
    afterMax,
    delta,
    isPercent,
    kind: delta > 0 ? 'up' : 'down',
  }
}

export function diffPerformanceStats(
  before: BuildPerformance,
  after: BuildPerformance,
): BuildStatDiff[] {
  const rows: BuildStatDiff[] = []
  const attrLabel = (key: string): string =>
    gameConfig.attributes.find((a) => a.key === key)?.name ?? statName(key)

  const allAttrKeys = new Set<string>([
    ...Object.keys(before.attributes),
    ...Object.keys(after.attributes),
  ])
  for (const key of allAttrKeys) {
    const b = rangedBounds(before.attributes[key])
    const a = rangedBounds(after.attributes[key])
    const diff = diffRangePair(
      key,
      attrLabel(key),
      b.min,
      b.max,
      a.min,
      a.max,
      false,
    )
    if (diff) rows.push(diff)
  }

  const allStatKeys = new Set<string>([
    ...Object.keys(before.stats),
    ...Object.keys(after.stats),
  ])
  for (const key of allStatKeys) {
    const b = rangedBounds(before.stats[key])
    const a = rangedBounds(after.stats[key])
    const diff = diffRangePair(
      key,
      statName(key),
      b.min,
      b.max,
      a.min,
      a.max,
      statDef(key)?.format === 'percent',
    )
    if (diff) rows.push(diff)
  }

  return rows
}

export function diffPerformanceDps(
  before: BuildPerformance,
  after: BuildPerformance,
): BuildStatDiff[] {
  const rows: BuildStatDiff[] = []
  const hit = diffRangePair(
    'hit_dps',
    'Hit DPS',
    before.hitDpsMin ?? 0,
    before.hitDpsMax ?? 0,
    after.hitDpsMin ?? 0,
    after.hitDpsMax ?? 0,
    false,
  )
  if (hit) rows.push(hit)

  const combined = diffRangePair(
    'combined_dps',
    'Combined DPS',
    before.combinedDpsMin ?? 0,
    before.combinedDpsMax ?? 0,
    after.combinedDpsMin ?? 0,
    after.combinedDpsMax ?? 0,
    false,
  )
  if (combined) rows.push(combined)

  const avgHit = diffRangePair(
    'avg_hit',
    'Average Hit',
    before.damage !== null ? before.damage.avgMin : 0,
    before.damage !== null ? before.damage.avgMax : 0,
    after.damage !== null ? after.damage.avgMin : 0,
    after.damage !== null ? after.damage.avgMax : 0,
    false,
  )
  if (avgHit) rows.push(avgHit)

  return rows
}
