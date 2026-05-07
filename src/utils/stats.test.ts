import { describe, expect, it } from 'vitest'
import {
  combineAdditiveAndMore,
  computeBuildStats,
  computeSkillDamage,
  rangedMax,
  rangedMin,
} from './stats'
import { parseTreeNodeMod } from './treeStats'
import type { Inventory, RangedValue, Skill } from '../types'

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
    expect(combineAdditiveAndMore(20, 5)).toBe(26)
    expect(combineAdditiveAndMore(50, 20)).toBe(80)
    expect(combineAdditiveAndMore(50, undefined)).toBe(50)
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
    const result = computeSkillDamage(
      lightningSkill, 1,
      { strength: 0, dexterity: 0, intelligence: 0, energy: 0, vitality: 0, armor: 0 },
      { lightning_skill_damage_more: 20 },
      {}, {},
    )
    expect(result?.hitMin).toBe(120)
    expect(result?.hitMax).toBe(120)
  })

  it('combines additive and Total: base x (1+add/100) x (1+more/100)', () => {
    const result = computeSkillDamage(
      lightningSkill, 1,
      { strength: 0, dexterity: 0, intelligence: 0, energy: 0, vitality: 0, armor: 0 },
      { lightning_skill_damage: 50, lightning_skill_damage_more: 20 },
      {}, {},
    )
    expect(result?.hitMin).toBe(180)
  })

  it('preserves existing additive-only behavior when no _more present', () => {
    const result = computeSkillDamage(
      lightningSkill, 1,
      { strength: 0, dexterity: 0, intelligence: 0, energy: 0, vitality: 0, armor: 0 },
      { lightning_skill_damage: 50 },
      {}, {},
    )
    expect(result?.hitMin).toBe(150)
  })
})

describe('Item-granted skills (passiveConverts)', () => {
  const zeroAttrs = { strength: 0, dexterity: 0, intelligence: 0, energy: 0, vitality: 0, armor: 0 }

  it('Fallen God\'s Bloodlust on equipped Gabriel\'s Broken Wings adds FCR = 10% × rank × Attack Speed', () => {
    const inventory: Inventory = {
      armor: {
        baseId: 'armors_heroic_gabriels_broken_wings',
        affixes: [],
        socketed: [],
        socketTypes: [],
        forgedMods: [],
        stars: 0,
      },
    }
    const { stats } = computeBuildStats(null, 1, zeroAttrs, inventory)
    const fcr = stats.faster_cast_rate
    expect(typeof fcr === 'object').toBe(true)
    expect(rangedMin(fcr as RangedValue)).toBeCloseTo(4)
    expect(rangedMax(fcr as RangedValue)).toBeCloseTo(50)
    const ias = stats.increased_attack_speed
    expect(rangedMin(ias as RangedValue)).toBe(40)
    expect(rangedMax(ias as RangedValue)).toBe(50)
  })

  it('Stars scale the rolled rank (and rounded to int)', () => {
    const inventory: Inventory = {
      armor: {
        baseId: 'armors_heroic_gabriels_broken_wings',
        affixes: [],
        socketed: [],
        socketTypes: [],
        forgedMods: [],
        stars: 5,
      },
    }
    const { stats } = computeBuildStats(
      null, 1, zeroAttrs, inventory,
    )
    // 5* applies the documented ITEM SPECIFIC staircase (+3 to skill ranks):
    //   Fallen God's Bloodlust rank [1,10] -> [4,13]
    // increased_attack_speed scales 3% per star and is rounded to int:
    //   [40,50] * 1.15 -> [46,57] (floating-point edge: 57.499... rounds to 57)
    // FCR = 10% × rank × IAS  =>  min 0.1 × 4 × 46 = 18.4,
    //                              max 0.1 × 13 × 57 = 74.1
    const fcr = stats.faster_cast_rate
    expect(rangedMin(fcr as RangedValue)).toBeCloseTo(18.4)
    expect(rangedMax(fcr as RangedValue)).toBeCloseTo(74.1)
  })

  it('Convert reads final value of `from` (sees additive sum, not raw item contribution)', () => {
    const customStats = [
      { id: '1', value: '50', statKey: 'increased_attack_speed' },
    ]
    const { stats } = computeBuildStats(
      null, 1, zeroAttrs, {},
      undefined, undefined, undefined, customStats,
    )
    expect(stats.increased_attack_speed).toBe(50)
    expect(stats.faster_cast_rate).toBeUndefined()
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
    expect(result?.avgMin).toBe(100)
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
    expect(result?.hitMin).toBe(50)
    expect(result?.effectiveResistancePct).toBe(50)
    expect(result?.resistanceMultiplier).toBe(0.5)
  })

  it('multiplicative ignore: 50% res with 25% ignore → effective 37.5%, ×0.625', () => {
    const result = computeSkillDamage(
      lightningSkill, 1, zeroAttrs,
      { ignore_lightning_res: 25 },
      {}, {},
      undefined, { lightning: 50 },
    )
    expect(result?.hitMin).toBe(62)
    expect(result?.effectiveResistancePct).toBeCloseTo(37.5)
    expect(result?.resistanceIgnoredPct).toBe(25)
    expect(result?.resistanceMultiplier).toBeCloseTo(0.625)
  })

  it('100% ignore fully bypasses resistance even against immune target', () => {
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
    expect(result?.hitMin).toBe(100)
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
    expect(result?.hitMin).toBe(112)
  })
})
