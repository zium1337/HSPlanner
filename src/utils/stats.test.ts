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

describe('computeSkillDamage - Spell vs Melee crit', () => {
  const zeroAttrs = { strength: 0, dexterity: 0, intelligence: 0, energy: 0, vitality: 0, armor: 0 }

  const spellSkill: Skill = {
    id: 'fb', classId: 'test', name: 'Fireball', kind: 'active',
    damageType: 'fire', damageFormula: { base: 100, perLevel: 0 },
    tags: ['Cast', 'Active', 'Spell'],
    ranks: [{ rank: 1 }],
  } as Skill

  const meleeSkill: Skill = {
    id: 'cleave', classId: 'test', name: 'Cleave', kind: 'active',
    damageType: 'physical', damageFormula: { base: 100, perLevel: 0 },
    tags: ['Attack', 'Melee'],
    ranks: [{ rank: 1 }],
  } as Skill

  it('spell uses spell_crit_chance + spell_crit_damage, ignores melee crit stats', () => {
    const result = computeSkillDamage(
      spellSkill, 1, zeroAttrs,
      {
        crit_chance: 50, crit_damage: 200, crit_damage_more: 50,
        spell_crit_chance: 20, spell_crit_damage: 100,
      },
      {}, {},
    )
    // critMultOnCrit = (1 + 100/100) * 1 = 2
    // critMultAvg = (1 - 0.20) + 0.20 * 2 = 1.20
    // hitMin=100, critMin = 100 * 2 = 200, avgMin = 100 * 1.2 = 120
    expect(result?.critChance).toBe(20)
    expect(result?.critDamagePct).toBe(100)
    expect(result?.critMin).toBe(200)
    expect(result?.avgMin).toBe(120)
  })

  it('melee uses crit_chance + crit_damage (+ crit_damage_more), ignores spell crit stats', () => {
    const result = computeSkillDamage(
      meleeSkill, 1, zeroAttrs,
      {
        crit_chance: 50, crit_damage: 200, crit_damage_more: 50,
        spell_crit_chance: 99, spell_crit_damage: 999,
      },
      {}, {},
    )
    // critMultOnCrit = (1 + 200/100) * 1.5 = 4.5
    // critMultAvg = (1 - 0.50) + 0.50 * 4.5 = 2.75
    expect(result?.critChance).toBe(50)
    expect(result?.critDamagePct).toBe(200)
    expect(result?.critMin).toBe(450)
    expect(result?.avgMin).toBe(275)
  })

  it('spell with no spell crit stats → 0% crit (does not fall back to melee crit)', () => {
    const result = computeSkillDamage(
      spellSkill, 1, zeroAttrs,
      { crit_chance: 50, crit_damage: 200 },
      {}, {},
    )
    expect(result?.critChance).toBe(0)
    expect(result?.critDamagePct).toBe(0)
    expect(result?.avgMin).toBe(100) // no crit, just hit
  })
})

describe('computeSkillDamage - enemy resistance and ignore_*_res', () => {
  const lightningSkill: Skill = {
    id: 'test_skill',
    classId: 'test',
    name: 'Test Bolt',
    kind: 'active',
    damageType: 'lightning',
    damageFormula: { base: 100, perLevel: 0 },
    ranks: [{ rank: 1 }],
  } as Skill

  const zeroAttrs = { strength: 0, dexterity: 0, intelligence: 0, energy: 0, vitality: 0, armor: 0 }

  it('applies enemy resistance: 50% lightning res → ×0.5 damage', () => {
    const result = computeSkillDamage(
      lightningSkill, 1, zeroAttrs, {}, {}, {},
      undefined, { lightning: 50 },
    )
    expect(result?.hitMin).toBe(50) // 100 × 0.5
    expect(result?.effectiveResistancePct).toBe(50)
    expect(result?.resistanceMultiplier).toBe(0.5)
  })

  it('multiplicative ignore: 50% res with 25% ignore → effective 37.5%, ×0.625', () => {
    // formula: 1 − (0.50 × (1 − 0.25)) = 1 − 0.375 = 0.625
    const result = computeSkillDamage(
      lightningSkill, 1, zeroAttrs,
      { ignore_lightning_res: 25 },
      {}, {},
      undefined, { lightning: 50 },
    )
    expect(result?.hitMin).toBe(62) // floor(100 × 0.625) = 62
    expect(result?.effectiveResistancePct).toBeCloseTo(37.5)
    expect(result?.resistanceIgnoredPct).toBe(25)
    expect(result?.resistanceMultiplier).toBeCloseTo(0.625)
  })

  it('100% ignore fully bypasses resistance even against immune target', () => {
    // 100% res, 100% ignore → effective 0%, full damage
    const result = computeSkillDamage(
      lightningSkill, 1, zeroAttrs,
      { ignore_lightning_res: 100 },
      {}, {},
      undefined, { lightning: 100 },
    )
    expect(result?.hitMin).toBe(100)
    expect(result?.effectiveResistancePct).toBe(0)
    expect(result?.resistanceMultiplier).toBe(1)
  })

  it('partial ignore vs immune target still scales: 100% res, 50% ignore → ×0.5', () => {
    const result = computeSkillDamage(
      lightningSkill, 1, zeroAttrs,
      { ignore_lightning_res: 50 },
      {}, {},
      undefined, { lightning: 100 },
    )
    expect(result?.hitMin).toBe(50)
    expect(result?.effectiveResistancePct).toBe(50)
    expect(result?.resistanceMultiplier).toBe(0.5)
  })

  it('clamps ignore at 100% (over-ignore stat has no effect)', () => {
    const result = computeSkillDamage(
      lightningSkill, 1, zeroAttrs,
      { ignore_lightning_res: 150 },
      {}, {},
      undefined, { lightning: 50 },
    )
    expect(result?.hitMin).toBe(100) // ignore capped at 100% → full bypass
    expect(result?.resistanceIgnoredPct).toBe(100)
  })

  it('no enemy resistance config → defaults to 0% (full damage)', () => {
    const result = computeSkillDamage(
      lightningSkill, 1, zeroAttrs, {}, {}, {},
    )
    expect(result?.hitMin).toBe(100)
    expect(result?.effectiveResistancePct).toBe(0)
  })

  it('only matching damage type is affected', () => {
    const result = computeSkillDamage(
      lightningSkill, 1, zeroAttrs, {}, {}, {},
      undefined, { fire: 75 },
    )
    expect(result?.hitMin).toBe(100)
    expect(result?.effectiveResistancePct).toBe(0)
  })

  it('combines with all other multipliers correctly', () => {
    // 100 base × 1.5 (additive) × 1.2 (Total) × 0.625 (50% res, 25% ignore) = 112.5
    const result = computeSkillDamage(
      lightningSkill, 1, zeroAttrs,
      {
        lightning_skill_damage: 50,
        lightning_skill_damage_more: 20,
        ignore_lightning_res: 25,
      },
      {}, {},
      undefined, { lightning: 50 },
    )
    expect(result?.hitMin).toBe(112) // floor(112.5)
  })
})
