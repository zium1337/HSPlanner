import type { StatMap } from './game'

export type SkillKind = 'active' | 'passive' | 'aura' | 'buff'

export type DamageType =
  | 'physical'
  | 'lightning'
  | 'cold'
  | 'fire'
  | 'poison'
  | 'arcane'
  | 'explosion'
  | 'magic'

export interface SkillRank {
  rank: number
  description?: string
  stats?: StatMap
  manaCost?: number
  cooldown?: number
}

export interface DamageRange {
  min: number
  max: number
}

export interface DamageFormula {
  base: number
  perLevel: number
}

export interface ManaCostFormula {
  base: number
  perLevel: number
}

export interface BonusSource {
  source: string
  stat: string
  value: number
  per: 'skill_level' | 'attribute_point'
}

export interface SkillPosition {
  row: number
  col: number
}

export interface PassiveStats {
  base?: Record<string, number>
  perRank?: Record<string, number>
}

export type SkillProcTrigger = 'on_kill' | 'on_cast' | 'on_hit'

export interface SkillProc {
  chance: number
  trigger: SkillProcTrigger
  target: string
}

export interface Skill {
  id: string
  classId: string
  name: string
  kind: SkillKind
  description?: string
  maxRank: number
  requiresLevel?: number
  requiresSkill?: string
  ranks: SkillRank[]
  damageType?: DamageType
  tags?: string[]
  movementDuringUse?: number
  range?: number
  baseCastRate?: number
  baseCooldown?: number
  effectDuration?: number
  damagePerRank?: DamageRange[]
  damageFormula?: DamageFormula
  manaCostFormula?: ManaCostFormula
  bonusSources?: BonusSource[]
  passiveStats?: PassiveStats
  proc?: SkillProc
  subskills?: SubskillNode[]
  tree?: string
  position?: SkillPosition
  icon?: string
}

export interface Subskill {
  id: string
  parentSkillId: string
  name: string
  description?: string
  maxRank: number
  effect?: StatMap
}

export type SubskillRole = 'minor' | 'notable' | 'keystone'

export interface SubskillEffect {
  base?: Record<string, number>
  perRank?: Record<string, number>
}

export interface AppliedState {
  state: string
  amount?: { base?: number; perRank?: number }
}

export interface SubskillProc {
  trigger: SkillProcTrigger
  chance: { base?: number; perRank?: number }
  effects?: SubskillEffect
  tags?: string[]
  appliesStates?: (string | AppliedState)[]
}

export interface SubskillNode {
  id: string
  positionIndex: number
  name: string
  description?: string
  icon?: string
  maxRank: number
  effects?: SubskillEffect
  proc?: SubskillProc
  requiresSubskill?: string
}

/**
 * A skill that exists only as an item-granted affix (e.g. "Fallen God's
 * Bloodlust" rolled on heroic armor). It has no class, no damage, and is
 * never directly allocatable. Its rank comes from summing item bonus rolls
 * (scaled by stars). `+to All Skills` does NOT apply.
 */
export interface ItemGrantedSkill {
  id: string
  name: string
  description?: string
  /** Flat / per-rank passive stats (additive into the same buckets). */
  passiveStats?: {
    base?: Record<string, number>
    perRank?: Record<string, number>
  }
  /**
   * Per-rank conversion rules.
   * `stats[to] += (pct/100 × rank) × stats[from]` (final value of `from`).
   */
  passiveConverts?: {
    perRank: Array<{ from: string; to: string; pct: number }>
  }
}
