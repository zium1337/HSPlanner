import { describe, expect, it } from 'vitest'
import {
  applyStarsToRangedValue,
  combineAdditiveAndMore,
  computeBuildStats,
  computeSkillDamage,
  rangedMax,
  rangedMin,
  rolledAffixValueWithStars,
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

describe('Tree-node Agile Wizard support', () => {
  const zeroAttrs = {
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    energy: 0,
    vitality: 0,
    armor: 0,
  }

  it('+75% of Increased Attack Speed is added as Magic Skill Damage', () => {
    const customStats = [
      { id: '1', value: '40', statKey: 'increased_attack_speed' },
      { id: '2', value: '20', statKey: 'increased_attack_speed_more' },
    ]
    // Allocate node 1838 (Agile Wizard).
    const { stats } = computeBuildStats(
      null, 1, zeroAttrs, emptyInventory,
      undefined, undefined, undefined, customStats,
      new Set([1838]),
    )
    // Effective IAS = (1.40 × 1.20 - 1) × 100 = 68%.  Conversion: 68 × 0.75 = 51.
    const msd = rangedMin(stats.magic_skill_damage ?? 0)
    expect(msd).toBeCloseTo(51)
  })

  it("Magister's Intellect: 5% of Intelligence converted to Magic Skill Damage + 25 to Intelligence", () => {
    const customStats = [
      { id: '1', value: '200', statKey: 'to_intelligence' },
    ]
    // node id 1634 is Magister's Intellect.
    const { stats, attributes } = computeBuildStats(
      null, 1, zeroAttrs, emptyInventory,
      undefined, undefined, undefined, customStats,
      new Set([1634]),
    )
    // Intelligence: 200 (custom) + 1 (default) + 25 (notable's "+25 to Intelligence") = 226.
    const intel = rangedMin(attributes.intelligence)
    expect(intel).toBe(226)
    // 5% of 226 = 11.3 -> rounded to magic_skill_damage as 11.3.
    const msd = rangedMin(stats.magic_skill_damage ?? 0)
    expect(msd).toBeCloseTo(11.3)
  })

  it('Vanguard of Lightning converts 40% of Lightning Resistance into Lightning Skill Damage', () => {
    const customStats = [
      { id: '1', value: '100', statKey: 'lightning_resistance' },
    ]
    // Allocate node 2720 (Vanguard of Lightning).
    const { stats } = computeBuildStats(
      null, 1, zeroAttrs, emptyInventory,
      undefined, undefined, undefined, customStats,
      new Set([2720]),
    )
    // 100 lightning resist × 0.40 = 40 lightning_skill_damage from the conversion.
    const lsd = rangedMin(stats.lightning_skill_damage ?? 0)
    expect(lsd).toBeCloseTo(40)
  })

  it('Agile Wizard zeroes life_replenish and life_replenish_pct', () => {
    const customStats = [
      { id: '1', value: '50', statKey: 'life_replenish' },
      { id: '2', value: '10', statKey: 'life_replenish_pct' },
    ]
    const without = computeBuildStats(
      null, 1, zeroAttrs, emptyInventory,
      undefined, undefined, undefined, customStats,
      new Set(),
    )
    // Without Agile Wizard, life_replenish is positive (custom 50 + class defaults).
    expect(rangedMin(without.stats.life_replenish ?? 0)).toBeGreaterThan(0)
    expect(rangedMin(without.stats.life_replenish_pct ?? 0)).toBeGreaterThan(0)

    const withAgile = computeBuildStats(
      null, 1, zeroAttrs, emptyInventory,
      undefined, undefined, undefined, customStats,
      new Set([1838]),
    )
    expect(withAgile.stats.life_replenish).toBe(0)
    expect(withAgile.stats.life_replenish_pct).toBe(0)
  })
})

describe('treeStats parser - per-attribute percentage', () => {
  it('parses "+3% Increased Intelligence" into increased_intelligence', () => {
    expect(parseTreeNodeMod('+3% Increased Intelligence')).toEqual({
      key: 'increased_intelligence',
      value: 3,
    })
  })

  it('parses "+8% Increased Total Strength" into increased_strength_more', () => {
    expect(parseTreeNodeMod('+8% Increased Total Strength')).toEqual({
      key: 'increased_strength_more',
      value: 8,
    })
  })
})

describe('computeBuildStats - per-attribute percentage application', () => {
  const zeroAttrs = {
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    energy: 0,
    vitality: 0,
    armor: 0,
  }

  it('applies +X% Increased <Attr> to the matching attribute only', () => {
    const baseline = computeBuildStats(
      null, 1, zeroAttrs, emptyInventory,
      undefined, undefined, undefined,
      [{ id: '1', value: '100', statKey: 'to_intelligence' }],
    )
    const baseInt = rangedMin(baseline.attributes.intelligence)

    const customStats = [
      { id: '1', value: '100', statKey: 'to_intelligence' },
      { id: '2', value: '100', statKey: 'to_strength' },
      { id: '3', value: '10', statKey: 'increased_intelligence' },
    ]
    const { attributes } = computeBuildStats(
      null, 1, zeroAttrs, emptyInventory,
      undefined, undefined, undefined, customStats,
    )
    // Intelligence: baseInt × (1 + 10%); strength gets no `increased_strength`, so unchanged.
    expect(rangedMin(attributes.intelligence)).toBe(Math.floor(baseInt * 1.1))
    const baseStr = rangedMin(
      computeBuildStats(
        null, 1, zeroAttrs, emptyInventory,
        undefined, undefined, undefined,
        [{ id: '1', value: '100', statKey: 'to_strength' }],
      ).attributes.strength,
    )
    expect(rangedMin(attributes.strength)).toBe(baseStr)
  })

  it('compounds Total (_more) with additive Increased', () => {
    const baseline = computeBuildStats(
      null, 1, zeroAttrs, emptyInventory,
      undefined, undefined, undefined,
      [{ id: '1', value: '100', statKey: 'to_intelligence' }],
    )
    const baseInt = rangedMin(baseline.attributes.intelligence)

    const customStats = [
      { id: '1', value: '100', statKey: 'to_intelligence' },
      { id: '2', value: '50', statKey: 'increased_intelligence' },
      { id: '3', value: '20', statKey: 'increased_intelligence_more' },
    ]
    const { attributes } = computeBuildStats(
      null, 1, zeroAttrs, emptyInventory,
      undefined, undefined, undefined, customStats,
    )
    expect(rangedMin(attributes.intelligence)).toBe(
      Math.floor(baseInt * 1.5 * 1.2),
    )
  })
})

describe('treeStats parser - self-conditional mods', () => {
  it('tags a "when Critical Strike Chance is below 40%" suffix with crit_chance_below_40', () => {
    expect(
      parseTreeNodeMod(
        '+15% Increased Total Attack Speed when Critical Strike Chance is below 40%',
      ),
    ).toEqual({
      key: 'increased_attack_speed_more',
      value: 15,
      selfCondition: 'crit_chance_below_40',
    })
  })

  it('tags "when below 40% Maximum Life" with life_below_40', () => {
    expect(
      parseTreeNodeMod('+10% Increased Attack Speed when below 40% Maximum Life'),
    ).toEqual({
      key: 'increased_attack_speed',
      value: 10,
      selfCondition: 'life_below_40',
    })
  })

  it('tags "while below 40% Maximum Life" with life_below_40 (Total Life Steal)', () => {
    expect(
      parseTreeNodeMod(
        '+15% Increased Total Life Steal while below 40% Maximum Life',
      ),
    ).toEqual({
      key: 'life_steal_more',
      value: 15,
      selfCondition: 'life_below_40',
    })
  })

  it('leaves selfCondition undefined for an unconditional mod', () => {
    expect(parseTreeNodeMod('+15% Increased Total Attack Speed')).toEqual({
      key: 'increased_attack_speed_more',
      value: 15,
    })
  })
})

describe('computeBuildStats - tree self-conditions', () => {
  const zeroAttrs = {
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    energy: 0,
    vitality: 0,
    armor: 0,
  }

  it('skips tree mods whose selfCondition is not active (high crit, no auto-trigger)', () => {
    const customStats = [
      { id: '1', value: '15', statKey: 'increased_attack_speed_more' },
      { id: '2', value: '60', statKey: 'crit_chance' },
    ]
    const without = computeBuildStats(
      null,
      1,
      zeroAttrs,
      emptyInventory,
      undefined,
      undefined,
      undefined,
      customStats,
      new Set([1802]),
      undefined,
      {},
    )
    expect(without.stats.increased_attack_speed_more).toBe(15)
  })

  it('applies tree mods when their selfCondition is explicitly toggled on', () => {
    const customStats = [
      { id: '1', value: '15', statKey: 'increased_attack_speed_more' },
      { id: '2', value: '60', statKey: 'crit_chance' },
    ]
    const withCondition = computeBuildStats(
      null,
      1,
      zeroAttrs,
      emptyInventory,
      undefined,
      undefined,
      undefined,
      customStats,
      new Set([1802]),
      undefined,
      { crit_chance_below_40: true },
    )
    expect(withCondition.stats.increased_attack_speed_more).toBe(30)
  })

  it('auto-activates crit_chance_below_40 when computed crit < 40%', () => {
    const customStats = [
      { id: '1', value: '15', statKey: 'increased_attack_speed_more' },
      { id: '2', value: '20', statKey: 'crit_chance' },
    ]
    const auto = computeBuildStats(
      null,
      1,
      zeroAttrs,
      emptyInventory,
      undefined,
      undefined,
      undefined,
      customStats,
      new Set([1802]),
      undefined,
      {},
    )
    expect(auto.stats.increased_attack_speed_more).toBe(30)
  })
})

describe('Star scaling rounds DOWN (Math.floor)', () => {
  it('percent affix with stars: floors the scaled value (e.g. 200 * 1.15 = 230, no decimals expected; 200.37 * 1.15 = 230.42 -> 230)', () => {
    // increased_attack_speed = 3% per star, 5 stars -> mult 1.15.
    const fcr = rolledAffixValueWithStars(
      {
        sign: '+',
        format: 'percent',
        valueMin: 200.37,
        valueMax: 200.37,
        statKey: 'increased_attack_speed',
      },
      0,
      5,
    )
    expect(fcr).toBe(230) // Math.floor(230.42)
  })

  it('percent affix WITHOUT stars: keeps decimal (no floor applied)', () => {
    const fcr = rolledAffixValueWithStars(
      {
        sign: '+',
        format: 'percent',
        valueMin: 200.37,
        valueMax: 200.37,
        statKey: 'increased_attack_speed',
      },
      0,
      0,
    )
    expect(fcr).toBe(200.37)
  })

  it('flat affix with stars floors the result instead of round-to-nearest', () => {
    // to_strength scales 5% per star. 5 stars -> mult 1.25.
    // 10 * 1.25 = 12.5 → previously Math.round = 13, now floor = 12.
    const str = rolledAffixValueWithStars(
      {
        sign: '+',
        format: 'flat',
        valueMin: 10,
        valueMax: 10,
        statKey: 'to_strength',
      },
      0,
      5,
    )
    expect(str).toBe(12)
  })

  it('applyStarsToRangedValue floors both endpoints when stars apply', () => {
    // increased_attack_speed scales 3% per star. 5 stars -> mult 1.15.
    // [40,50] * 1.15 = [46, 57.5] → floor = [46, 57]
    const out = applyStarsToRangedValue(
      [40, 50],
      'increased_attack_speed',
      5,
    )
    expect(out).toEqual([46, 57])
  })

  it('applyStarsToRangedValue without stars returns the value unchanged', () => {
    const out = applyStarsToRangedValue([40.5, 50.5], 'increased_attack_speed', 0)
    expect(out).toEqual([40.5, 50.5])
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

describe('Buff/aura passiveStats scale with effective rank', () => {
  const zeroAttrs = {
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    energy: 0,
    vitality: 0,
    armor: 0,
  }

  it('passiveStats use effective rank (base + +to-all-skills + +to-element-skills)', () => {
    // Pick a real class buff: stormweaver has Symphony of Thunder (id: symphony_of_thunder).
    // It's a Lightning buff with passiveStats.perRank.lightning_skill_damage.
    // We bypass the actual file by using customStats to inject all_skills and lightning_skills, plus rank-1 buff allocation.
    const baseline = computeBuildStats(
      'stormweaver',
      1,
      zeroAttrs,
      {},
      { symphony_of_thunder: 1 },
      undefined,
      { symphony_of_thunder: true },
      undefined,
    )
    const baselineLight = rangedMin(
      baseline.stats.lightning_skill_damage ?? 0,
    )

    const boosted = computeBuildStats(
      'stormweaver',
      1,
      zeroAttrs,
      {},
      { symphony_of_thunder: 1 },
      undefined,
      { symphony_of_thunder: true },
      // Inject +10 all_skills + +5 lightning_skills via customStats so effective rank becomes 1+10+5 = 16.
      [
        { id: '1', value: '10', statKey: 'all_skills' },
        { id: '2', value: '5', statKey: 'lightning_skills' },
      ],
    )
    const boostedLight = rangedMin(
      boosted.stats.lightning_skill_damage ?? 0,
    )
    // With effective rank > 1, perRank scales kick in, so boostedLight must EXCEED the baseline.
    expect(boostedLight).toBeGreaterThan(baselineLight)
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

  it('Convert uses the effective Attack Speed (additive folded with `_more` Total)', () => {
    // Bloodlust grants Attack Speed → FCR conversion at 10% × rank.
    // Gabriel's Broken Wings rolls IAS [40,50] (additive) at rank [1,10].
    // Adding +20% Total Attack Speed (`_more`) should compound:
    //   effective IAS = (1 + 0.40) × (1 + 0.20) − 1 = 0.68 → 68%
    //                   (1 + 0.50) × (1 + 0.20) − 1 = 0.80 → 80%
    // FCR min = 0.1 × 1 × 68 = 6.8;  max = 0.1 × 10 × 80 = 80
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
    const customStats = [
      { id: '1', value: '20', statKey: 'increased_attack_speed_more' },
    ]
    const { stats } = computeBuildStats(
      null, 1, zeroAttrs, inventory,
      undefined, undefined, undefined, customStats,
    )
    const fcr = stats.faster_cast_rate
    expect(rangedMin(fcr as RangedValue)).toBeCloseTo(6.8)
    expect(rangedMax(fcr as RangedValue)).toBeCloseTo(80)
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

  it('spell multicast inflates avg by (1 + multicast/100), leaves hit/crit alone', () => {
    const result = computeSkillDamage(
      spellSkill, 1, zeroAttrs,
      {
        spell_crit_chance: 0,
        multicast_chance: 50,
      },
      {}, {},
    )
    // hit = 100, no crit, multicast 50% -> avg = 100 * 1.5 = 150
    expect(result?.hitMin).toBe(100)
    expect(result?.multicastChancePct).toBe(50)
    expect(result?.multicastMultiplier).toBeCloseTo(1.5)
    expect(result?.avgMin).toBe(150)
  })

  it('multicast does not apply to melee skills', () => {
    const result = computeSkillDamage(
      meleeSkill, 1, zeroAttrs,
      {
        crit_chance: 0,
        multicast_chance: 50,
      },
      {}, {},
    )
    expect(result?.multicastChancePct).toBe(0)
    expect(result?.multicastMultiplier).toBe(1)
    expect(result?.avgMin).toBe(100)
  })

  it('elemental break multiplies elemental skill damage by (1 + EB%)', () => {
    const fireSpell: Skill = {
      id: 'fb', classId: 'test', name: 'Fireball', kind: 'active',
      damageType: 'fire', damageFormula: { base: 100, perLevel: 0 },
      tags: ['Cast', 'Active', 'Spell'],
      ranks: [{ rank: 1 }],
    } as Skill
    // Generic +30% Elemental Break + +20% spell-source Elemental Break = 50% total -> ×1.5
    const result = computeSkillDamage(
      fireSpell, 1, zeroAttrs,
      {
        elemental_break: 30,
        elemental_break_on_spell: 20,
        // strike-only key must be ignored for spells
        elemental_break_on_strike: 999,
      },
      {}, {},
    )
    expect(result?.elementalBreakPct).toBe(50)
    expect(result?.elementalBreakMultiplier).toBeCloseTo(1.5)
    expect(result?.hitMin).toBe(150)
  })

  it('elemental break does not apply to physical skills', () => {
    const physSkill: Skill = {
      id: 'cleave', classId: 'test', name: 'Cleave', kind: 'active',
      damageType: 'physical', damageFormula: { base: 100, perLevel: 0 },
      tags: ['Attack', 'Melee'],
      ranks: [{ rank: 1 }],
    } as Skill
    const result = computeSkillDamage(
      physSkill, 1, zeroAttrs,
      { elemental_break: 50, elemental_break_on_strike: 999 },
      {}, {},
    )
    expect(result?.elementalBreakPct).toBe(0)
    expect(result?.elementalBreakMultiplier).toBe(1)
    expect(result?.hitMin).toBe(100)
  })

  it('projectileCount multiplies per-cast (avg) damage but leaves single-hit numbers alone', () => {
    const result = computeSkillDamage(
      spellSkill, 1, zeroAttrs,
      { spell_crit_chance: 0 },
      {}, {},
      undefined, undefined, undefined,
      5,
    )
    expect(result?.hitMin).toBe(100)
    expect(result?.critMin).toBe(100)
    expect(result?.projectileCount).toBe(5)
    expect(result?.avgMin).toBe(500)
  })

  it('elemental break for melee elemental: uses generic + on_strike, ignores on_spell', () => {
    const fireMelee: Skill = {
      id: 'firep', classId: 'test', name: 'Fire Punch', kind: 'active',
      damageType: 'fire', damageFormula: { base: 100, perLevel: 0 },
      tags: ['Attack', 'Melee'],
      ranks: [{ rank: 1 }],
    } as Skill
    const result = computeSkillDamage(
      fireMelee, 1, zeroAttrs,
      {
        elemental_break: 10,
        elemental_break_on_strike: 40,
        elemental_break_on_spell: 999,
      },
      {}, {},
    )
    expect(result?.elementalBreakPct).toBe(50)
    expect(result?.hitMin).toBe(150)
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
