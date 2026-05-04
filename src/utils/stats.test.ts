import { describe, expect, it } from 'vitest'
import {
  combineAdditiveAndMore,
  computeBuildStats,
  computeSkillDamage,
} from './stats'
import { parseTreeNodeMod } from './treeStats'
import type { Inventory, Skill } from '../types'

const emptyInventory: Inventory = {}

describe('treeStats parser - Total / _more keys', () => {
  it('parses "Increased Total <Element> Skill Damage" into _more key', () => {
    expect(parseTreeNodeMod('+20% Increased Total Lightning Skill Damage'))
      .toEqual({ key: 'lightning_skill_damage_more', value: 20 })
    expect(parseTreeNodeMod('+25% Increased Total Magic Skill Damage'))
      .toEqual({ key: 'magic_skill_damage_more', value: 25 })
  })

  it('parses non-Total form into the additive key (unchanged)', () => {
    expect(parseTreeNodeMod('+8% Increased Lightning Skill Damage'))
      .toEqual({ key: 'lightning_skill_damage', value: 8 })
  })

  it('routes "Total Movement Speed" into _more', () => {
    expect(parseTreeNodeMod('+5% Increased Total Movement Speed'))
      .toEqual({ key: 'movement_speed_more', value: 5 })
  })
})

describe('_more stays separate; combineAdditiveAndMore handles compounding', () => {
  it('keeps movement_speed and movement_speed_more as separate keys', () => {
    const allocated = { strength: 0, dexterity: 0, intelligence: 0, energy: 0, vitality: 0, armor: 0 }
    const customStats = [
      { id: '1', value: '20', statKey: 'movement_speed' },
      { id: '2', value: '5', statKey: 'movement_speed_more' },
    ]
    const { stats } = computeBuildStats(
      null, 1, allocated, emptyInventory,
      undefined, undefined, undefined, customStats,
    )
    expect(stats.movement_speed).toBe(20)
    expect(stats.movement_speed_more).toBe(5)
  })

  it('combineAdditiveAndMore: (1 + B/100) × (1 + M/100) - 1 → additive equivalent', () => {
    // 20% additive × 5% Total = 26% effective
    expect(combineAdditiveAndMore(20, 5)).toBe(26)
    // 50% × 20% = 80% effective
    expect(combineAdditiveAndMore(50, 20)).toBe(80)
    // No more = unchanged additive
    expect(combineAdditiveAndMore(50, undefined)).toBe(50)
    // No additive = unchanged more
    expect(combineAdditiveAndMore(undefined, 20)).toBe(20)
  })

  it('applyMultiplier: base mana × (1 + add) × (1 + more)', () => {
    const allocated = { strength: 0, dexterity: 0, intelligence: 0, energy: 0, vitality: 0, armor: 0 }
    const baseOnly = computeBuildStats(
      null, 1, allocated, emptyInventory,
      undefined, undefined, undefined, [],
    )
    const baseMana = baseOnly.stats.mana
    expect(typeof baseMana).toBe('number')

    const withMore = computeBuildStats(
      null, 1, allocated, emptyInventory,
      undefined, undefined, undefined,
      [
        { id: '1', value: '50', statKey: 'increased_mana' },
        { id: '2', value: '20', statKey: 'increased_mana_more' },
      ],
    )
    // base × 1.5 × 1.2 = base × 1.80
    expect(withMore.stats.mana).toBe(Math.floor((baseMana as number) * 1.5 * 1.2))
  })
})

describe('computeSkillDamage - Total skill damage as multiplier', () => {
  const lightningSkill: Skill = {
    id: 'test_skill',
    classId: 'test',
    name: 'Test Lightning Bolt',
    kind: 'active',
    damageType: 'lightning',
    damageFormula: { base: 100, perLevel: 0 },
    ranks: [{ rank: 1 }],
  } as Skill

  it('multiplies by (1 + lightning_more/100) on top of additive', () => {
    // Base = 100, no additive lightning, +20% lightning_more
    const result = computeSkillDamage(
      lightningSkill, 1,
      { strength: 0, dexterity: 0, intelligence: 0, energy: 0, vitality: 0, armor: 0 },
      { lightning_skill_damage_more: 20 },
      {}, {},
    )
    // 100 * 1.20 = 120
    expect(result?.hitMin).toBe(120)
    expect(result?.hitMax).toBe(120)
  })

  it('combines additive and Total: base x (1+add/100) x (1+more/100)', () => {
    // Base 100, +50% additive lightning, +20% Total lightning -> 100 * 1.5 * 1.2 = 180
    const result = computeSkillDamage(
      lightningSkill, 1,
      { strength: 0, dexterity: 0, intelligence: 0, energy: 0, vitality: 0, armor: 0 },
      { lightning_skill_damage: 50, lightning_skill_damage_more: 20 },
      {}, {},
    )
    expect(result?.hitMin).toBe(180)
  })

  it('preserves existing additive-only behavior when no _more present', () => {
    // Base 100, +50% additive lightning -> 100 * 1.5 = 150
    const result = computeSkillDamage(
      lightningSkill, 1,
      { strength: 0, dexterity: 0, intelligence: 0, energy: 0, vitality: 0, armor: 0 },
      { lightning_skill_damage: 50 },
      {}, {},
    )
    expect(result?.hitMin).toBe(150)
  })
})
