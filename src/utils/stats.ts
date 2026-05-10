import {
  detectRuneword,
  forgeKindFor,
  gameConfig,
  getAffix,
  getAugment,
  getClass,
  getCrystalMod,
  getGem,
  getItem,
  getItemSet,
  getRune,
  getSkillsByClass,
  isGearSlot,
  itemGrantedSkills,
} from '../data'
import type { ForgeKind } from '../data'
import { RAINBOW_MULTIPLIER } from '../store/build'
import {
  itemGrantedSkillRankFlatBonus,
  isStatStarImmune,
  statStarFlatBonus,
  statStarPercentMultiplier,
} from './starScaling'
import type {
  AttributeKey,
  CustomStat,
  Inventory,
  RangedStatMap,
  RangedValue,
  Skill,
  StatDef,
  StatMap,
  TreeSocketContent,
} from '../types'
import { parseCustomStatValue } from './parseCustomStat'
import { aggregateSubskillStats } from './subtree'
import {
  ELEMENTS,
  parseTreeNodeMeta,
  parseTreeNodeMod,
  TREE_JEWELRY_IDS,
  TREE_NODE_INFO,
  type DisableTarget,
  type ParsedConversion,
} from './treeStats'

export type SourceType =
  | 'class'
  | 'allocated'
  | 'level'
  | 'attribute'
  | 'item'
  | 'socket'
  | 'skill'
  | 'subskill'
  | 'custom'
  | 'tree'

export const CUSTOM_SOURCE_LABEL = 'Custom Config'

export function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase()
}

const STAT_DEFS_MAP = new Map<string, StatDef>(
  gameConfig.stats.map((s) => [s.key, s]),
)

const STAT_FAN_OUTS: ReadonlyArray<{ from: string; to: readonly string[] }> = [
  {
    from: 'all_resistances',
    to: [
      'fire_resistance',
      'cold_resistance',
      'lightning_resistance',
      'poison_resistance',
      'arcane_resistance',
    ],
  },
  {
    from: 'max_all_resistances',
    to: [
      'max_fire_resistance',
      'max_cold_resistance',
      'max_lightning_resistance',
      'max_poison_resistance',
      'max_arcane_resistance',
    ],
  },
]

export interface SourceContribution {
  label: string
  sourceType: SourceType
  value: RangedValue
  forge?: {
    itemName: string
    modName: string
    kind: ForgeKind
  }
}

export interface ComputedStats {
  attributes: Record<AttributeKey, RangedValue>
  stats: RangedStatMap
  attributeSources: Record<AttributeKey, SourceContribution[]>
  statSources: Record<string, SourceContribution[]>
}

type SourceMap = Map<string, SourceContribution[]>

function pushSource(map: SourceMap, key: string, source: SourceContribution) {
  if (isZero(source.value)) return
  const list = map.get(key)
  if (list) list.push(source)
  else map.set(key, [source])
}

function sumContributions(sources: SourceContribution[]): RangedValue {
  let min = 0
  let max = 0
  for (const s of sources) {
    const [smin, smax] = typeof s.value === 'number' ? [s.value, s.value] : s.value
    min += smin
    max += smax
  }
  return min === max ? min : [min, max]
}

function sumRangedFromMap(
  map: SourceMap,
  key: string,
): [number, number] {
  const list = map.get(key)
  if (!list || list.length === 0) return [0, 0]
  const v = sumContributions(list)
  if (typeof v === 'number') return [Math.floor(v), Math.floor(v)]
  return [Math.floor(v[0]), Math.floor(v[1])]
}

function applyContribution(
  attrSources: SourceMap,
  statSources: SourceMap,
  statKey: string,
  value: RangedValue,
  label: string,
  sourceType: SourceType,
  extra?: { forge?: SourceContribution['forge'] },
) {
  if (isZero(value)) return
  const def = statDef(statKey)
  if (def?.itemOnly) return
  const contribution: SourceContribution = { label, sourceType, value }
  if (extra?.forge) contribution.forge = extra.forge
  if (def?.modifiesAttribute) {
    if (def.modifiesAttribute === 'all') {
      for (const attr of gameConfig.attributes) {
        pushSource(attrSources, attr.key, contribution)
      }
    } else {
      pushSource(attrSources, def.modifiesAttribute, contribution)
    }
    return
  }
  pushSource(statSources, statKey, contribution)
}

function computeItemEffectiveDefense(
  base: { defenseMin?: number; defenseMax?: number },
  enhancedDefense: RangedValue | undefined,
): RangedValue | null {
  if (base.defenseMin === undefined || base.defenseMax === undefined) return null
  const ed = enhancedDefense
  const [edMin, edMax] =
    ed === undefined ? [0, 0] : typeof ed === 'number' ? [ed, ed] : ed
  const min = Math.floor(base.defenseMin * (1 + edMin / 100))
  const max = Math.floor(base.defenseMax * (1 + edMax / 100))
  return min === max ? min : [min, max]
}

export interface ComputeBuildStatsInput {
  classId: string | null
  level: number
  allocated: Record<AttributeKey, number>
  inventory: Inventory
  skillRanks?: Record<string, number>
  activeAuraId?: string | null
  activeBuffs?: Record<string, boolean>
  customStats?: CustomStat[]
  allocatedTreeNodes?: Set<number>
  treeSocketed?: Record<number, TreeSocketContent | null>
  playerConditions?: Record<string, boolean>
  subskillRanks?: Record<string, number>
  enemyConditions?: Record<string, boolean>
}

export function computeBuildStats(input: ComputeBuildStatsInput): ComputedStats {
  const baseline = computeBuildStatsCore(input)
  if (
    !input.playerConditions?.crit_chance_below_40 &&
    input.allocatedTreeNodes &&
    input.allocatedTreeNodes.size > 0
  ) {
    const crit = baseline.stats.crit_chance ?? 0
    if (rangedMin(crit) < 40) {
      return computeBuildStatsCore({
        ...input,
        playerConditions: {
          ...input.playerConditions,
          crit_chance_below_40: true,
        },
      })
    }
  }
  return baseline
}

function computeBuildStatsCore(input: ComputeBuildStatsInput): ComputedStats {
  const {
    classId,
    level,
    allocated,
    inventory,
    skillRanks,
    activeAuraId,
    activeBuffs,
    customStats,
    allocatedTreeNodes,
    treeSocketed,
    playerConditions,
    subskillRanks,
    enemyConditions,
  } = input
  const cls = classId ? getClass(classId) : undefined
  const attrSources: SourceMap = new Map()
  const statSources: SourceMap = new Map()
  const className = cls?.name ?? 'Class'

  for (const attr of gameConfig.attributes) {
    const defaultBase = gameConfig.defaultBaseAttributes?.[attr.key] ?? 0
    if (defaultBase !== 0) {
      pushSource(attrSources, attr.key, {
        label: 'Base character',
        sourceType: 'class',
        value: defaultBase,
      })
    }
    const classBase = cls?.baseAttributes[attr.key] ?? 0
    if (classBase !== 0) {
      pushSource(attrSources, attr.key, {
        label: `${className} base`,
        sourceType: 'class',
        value: classBase,
      })
    }
    const added = allocated[attr.key] ?? 0
    if (added > 0) {
      pushSource(attrSources, attr.key, {
        label: 'Allocated points',
        sourceType: 'allocated',
        value: added,
      })
    }
  }

  let weaponHasAttackSpeed = false
  for (const [slotKey, item] of Object.entries(inventory)) {
    if (!item) continue
    const base = getItem(item.baseId)
    if (!base) continue
    const itemName = base.name
    const runeword = detectRuneword(base, item.socketed)
    const scaleImplicit = shouldScaleImplicit(!!runeword)
    const isGear = isGearSlot(slotKey)
    const effectiveStars = isGear ? item.stars : undefined
    if (
      slotKey === 'weapon' &&
      (base.implicit?.attacks_per_second !== undefined ||
        base.attackSpeed !== undefined)
    ) {
      weaponHasAttackSpeed = true
    }

    const edRaw = base.implicit?.enhanced_defense
    const edScaled =
      edRaw !== undefined && scaleImplicit
        ? applyStarsToRangedValue(edRaw, 'enhanced_defense', effectiveStars)
        : edRaw
    const effectiveDef = computeItemEffectiveDefense(base, edScaled)
    if (effectiveDef !== null && !isZero(effectiveDef)) {
      pushSource(statSources, 'defense', {
        label: itemName,
        sourceType: 'item',
        value: effectiveDef,
      })
    }

    if (base.implicit) {
      for (const [statKey, value] of Object.entries(base.implicit)) {
        const scaled = scaleImplicit
          ? applyStarsToRangedValue(value, statKey, effectiveStars)
          : value
        applyContribution(attrSources, statSources, statKey, scaled, itemName, 'item')
      }
    }

    if (
      base.slot === 'weapon' &&
      base.attackSpeed !== undefined &&
      base.implicit?.attacks_per_second === undefined
    ) {
      applyContribution(
        attrSources,
        statSources,
        'attacks_per_second',
        base.attackSpeed,
        itemName,
        'item',
      )
    }

    for (const eq of item.affixes) {
      const affix = getAffix(eq.affixId)
      if (!affix || !affix.statKey) continue
      const signed = rolledAffixValueWithStars(affix, eq.roll, effectiveStars)
      if (signed === 0) continue
      const label = `${affix.name} (${itemName})`
      applyContribution(
        attrSources,
        statSources,
        affix.statKey,
        signed,
        label,
        'item',
      )
    }

    if (isGear) {
      const forgeKind = forgeKindFor(base.rarity)
      if (forgeKind) {
        for (const eq of item.forgedMods ?? []) {
          const mod = getCrystalMod(eq.affixId)
          if (!mod || !mod.statKey) continue
          const ranged = rolledAffixRange(mod)
          if (isZero(ranged)) continue
          applyContribution(
            attrSources,
            statSources,
            mod.statKey,
            ranged,
            mod.name,
            'item',
            { forge: { itemName, modName: mod.name, kind: forgeKind } },
          )
        }
      }
    }

    if (runeword) {
      const rwLabel = `${runeword.name} (${itemName})`
      for (const [statKey, value] of Object.entries(runeword.stats)) {
        applyContribution(attrSources, statSources, statKey, value, rwLabel, 'item')
      }
    } else {
      for (let i = 0; i < item.socketed.length; i++) {
        const id = item.socketed[i]
        if (!id) continue
        const source = getGem(id) ?? getRune(id)
        if (!source) continue
        const isRainbow = item.socketTypes[i] === 'rainbow'
        const mult = isRainbow ? RAINBOW_MULTIPLIER : 1
        const transform = base.socketTransforms?.[id]
        const stats = transform ?? source.stats
        const socketLabel =
          `${source.name} in ${itemName} #${i + 1}` +
          (isRainbow ? ' (Rainbow)' : '') +
          (transform ? ' (Transform)' : '')
        for (const [statKey, rawValue] of Object.entries(stats)) {
          applyContribution(
            attrSources,
            statSources,
            statKey,
            rawValue * mult,
            socketLabel,
            'socket',
          )
        }
      }
    }

    if (item.augment) {
      const aug = getAugment(item.augment.id)
      if (aug) {
        const lvl = Math.max(1, Math.min(aug.levels.length, item.augment.level))
        const tier = aug.levels[lvl - 1]
        if (tier) {
          const augLabel = `Augment: ${aug.name} Lv ${lvl} (${itemName})`
          for (const [statKey, value] of Object.entries(tier.stats)) {
            applyContribution(
              attrSources,
              statSources,
              statKey,
              value,
              augLabel,
              'item',
            )
          }
        }
      }
    }
  }

  const treeConversions: Array<{ conv: ParsedConversion; sourceLabel: string }> = []
  const treeDisables = new Set<DisableTarget>()

  if (allocatedTreeNodes && allocatedTreeNodes.size > 0) {
    for (const nodeId of allocatedTreeNodes) {
      const info = TREE_NODE_INFO[String(nodeId)]
      if (!info?.l) continue
      if (TREE_JEWELRY_IDS.has(nodeId)) continue
      for (const line of info.l) {
        const parsed = parseTreeNodeMod(line)
        if (parsed) {
          if (
            parsed.selfCondition &&
            !playerConditions?.[parsed.selfCondition]
          ) {
            continue
          }
          const label = parsed.selfCondition
            ? `Tree: ${info.t} (conditional)`
            : `Tree: ${info.t}`
          applyContribution(
            attrSources,
            statSources,
            parsed.key,
            parsed.value,
            label,
            'tree',
          )
          continue
        }
        const meta = parseTreeNodeMeta(line)
        if (!meta) continue
        if (meta.kind === 'convert') {
          treeConversions.push({ conv: meta, sourceLabel: `Tree: ${info.t}` })
        } else if (meta.kind === 'disable') {
          treeDisables.add(meta.target)
        }
      }
    }
  }

  if (allocatedTreeNodes && treeSocketed) {
    for (const nodeId of allocatedTreeNodes) {
      if (!TREE_JEWELRY_IDS.has(nodeId)) continue
      const content = treeSocketed[nodeId]
      if (!content) continue
      const socketLabel = `Tree Socket #${nodeId}`
      if (content.kind === 'item') {
        const source = getGem(content.id) ?? getRune(content.id)
        if (!source) continue
        for (const [statKey, value] of Object.entries(source.stats)) {
          if (value === 0) continue
          applyContribution(
            attrSources,
            statSources,
            statKey,
            value,
            `${source.name} (${socketLabel})`,
            'tree',
          )
        }
      } else {
        for (const eq of content.affixes) {
          const affix = getAffix(eq.affixId)
          if (!affix || !affix.statKey) continue
          const signed = rolledAffixValue(affix, eq.roll)
          if (signed === 0) continue
          applyContribution(
            attrSources,
            statSources,
            affix.statKey,
            signed,
            `${affix.name} (${socketLabel})`,
            'tree',
          )
        }
      }
    }
  }

  const setCounts = new Map<string, number>()
  for (const item of Object.values(inventory)) {
    if (!item) continue
    const base = getItem(item.baseId)
    if (!base?.setId) continue
    setCounts.set(base.setId, (setCounts.get(base.setId) ?? 0) + 1)
  }
  for (const [setId, count] of setCounts) {
    const set = getItemSet(setId)
    if (!set) continue
    for (const bonus of set.bonuses) {
      if (count < bonus.pieces) continue
      const label = `${set.name} (${bonus.pieces}-set)`
      for (const [statKey, value] of Object.entries(bonus.stats)) {
        if (value === 0) continue
        applyContribution(
          attrSources,
          statSources,
          statKey,
          value,
          label,
          'item',
        )
      }
    }
  }

  if (gameConfig.defaultBaseStats) {
    for (const [statKey, value] of Object.entries(gameConfig.defaultBaseStats)) {
      if (value !== 0) {
        if (statKey === 'attacks_per_second' && weaponHasAttackSpeed) continue
        pushSource(statSources, statKey, {
          label: 'Base character',
          sourceType: 'class',
          value,
        })
      }
    }
  }

  if (cls?.baseStats) {
    for (const [statKey, value] of Object.entries(cls.baseStats)) {
      if (value !== 0) {
        pushSource(statSources, statKey, {
          label: `${className} base`,
          sourceType: 'class',
          value,
        })
      }
    }
  }

  if (cls?.statsPerLevel) {
    for (const [statKey, perLevel] of Object.entries(cls.statsPerLevel)) {
      const total = perLevel * level
      if (total !== 0) {
        pushSource(statSources, statKey, {
          label: `Per level × ${level}`,
          sourceType: 'level',
          value: total,
        })
      }
    }
  }

  for (const cs of customStats ?? []) {
    if (!cs.statKey) continue
    const parsed = parseCustomStatValue(cs.value)
    if (parsed === null) continue
    applyContribution(
      attrSources,
      statSources,
      cs.statKey,
      parsed,
      CUSTOM_SOURCE_LABEL,
      'custom',
    )
  }

  if (skillRanks && classId) {
    const attrKeySet = new Set(gameConfig.attributes.map((a) => a.key))
    const classSkillList = getSkillsByClass(classId)
    const itemSkillRankBonuses = aggregateItemSkillBonuses(inventory)
    const allSkillsBonus = sumRangedFromMap(statSources, 'all_skills')
    for (const skill of classSkillList) {
      const baseRank = skillRanks[skill.id] ?? 0
      if (baseRank <= 0 || !skill.passiveStats) continue
      if (skill.kind === 'aura' && activeAuraId !== skill.id) continue
      const isBuff =
        skill.kind === 'buff' || (skill.tags?.includes('Buff') ?? false)
      if (isBuff && !(activeBuffs?.[skill.id])) continue
      const elemBonus = skill.damageType
        ? sumRangedFromMap(statSources, `${skill.damageType}_skills`)
        : ([0, 0] as [number, number])
      const itemBonus =
        itemSkillRankBonuses[normalizeSkillName(skill.name)] ?? [0, 0]
      const effMin = Math.max(
        1,
        baseRank + allSkillsBonus[0] + elemBonus[0] + itemBonus[0],
      )
      const effMax = Math.max(
        1,
        baseRank + allSkillsBonus[1] + elemBonus[1] + itemBonus[1],
      )
      const { base, perRank } = skill.passiveStats
      const combined: Record<string, RangedValue> = {}
      if (base) for (const [k, v] of Object.entries(base)) combined[k] = v
      if (perRank) {
        for (const [k, v] of Object.entries(perRank)) {
          const baseVal = combined[k] ?? 0
          const min =
            (typeof baseVal === 'number' ? baseVal : baseVal[0]) +
            v * (effMin - 1)
          const max =
            (typeof baseVal === 'number' ? baseVal : baseVal[1]) +
            v * (effMax - 1)
          combined[k] = min === max ? min : [min, max]
        }
      }
      const rankLabel = effMin === effMax ? `${effMin}` : `${effMin}-${effMax}`
      for (const [key, value] of Object.entries(combined)) {
        if (isZero(value)) continue
        const rounded: RangedValue =
          typeof value === 'number'
            ? Math.round(value * 1000) / 1000
            : [
                Math.round(value[0] * 1000) / 1000,
                Math.round(value[1] * 1000) / 1000,
              ]
        const label = `${skill.name} (rank ${rankLabel})`
        if (attrKeySet.has(key)) {
          pushSource(attrSources, key, {
            label,
            sourceType: 'skill',
            value: rounded,
          })
        } else {
          pushSource(statSources, key, {
            label,
            sourceType: 'skill',
            value: rounded,
          })
        }
      }
    }
  }

  const incrAttrSources = statSources.get('increased_all_attributes') ?? []
  if (incrAttrSources.length > 0) {
    for (const attr of gameConfig.attributes) {
      const flatSum = sumContributions(attrSources.get(attr.key) ?? [])
      const [fMin, fMax] =
        typeof flatSum === 'number' ? [flatSum, flatSum] : flatSum
      for (const pctSrc of incrAttrSources) {
        const [pMin, pMax] =
          typeof pctSrc.value === 'number'
            ? [pctSrc.value, pctSrc.value]
            : pctSrc.value
        const bonusMin = Math.floor((fMin * pMin) / 100)
        const bonusMax = Math.floor((fMax * pMax) / 100)
        if (bonusMin === 0 && bonusMax === 0) continue
        pushSource(attrSources, attr.key, {
          label: pctSrc.label,
          sourceType: pctSrc.sourceType,
          value: bonusMin === bonusMax ? bonusMin : [bonusMin, bonusMax],
        })
      }
    }
  }

  for (const attr of gameConfig.attributes) {
    const addList = statSources.get(`increased_${attr.key}`) ?? []
    const moreList = statSources.get(`increased_${attr.key}_more`) ?? []
    if (addList.length === 0 && moreList.length === 0) continue
    const flatSum = sumContributions(attrSources.get(attr.key) ?? [])
    const [fMin, fMax] =
      typeof flatSum === 'number' ? [flatSum, flatSum] : flatSum
    if (fMin === 0 && fMax === 0) continue
    const addSum = sumContributions(addList)
    const [aMin, aMax] =
      typeof addSum === 'number' ? [addSum, addSum] : addSum
    const moreSum = sumContributions(moreList)
    const [mMin, mMax] =
      typeof moreSum === 'number' ? [moreSum, moreSum] : moreSum
    const finalMin = Math.floor(fMin * (1 + aMin / 100) * (1 + mMin / 100))
    const finalMax = Math.floor(fMax * (1 + aMax / 100) * (1 + mMax / 100))
    const bonusMin = finalMin - fMin
    const bonusMax = finalMax - fMax
    if (bonusMin === 0 && bonusMax === 0) continue
    const labelParts: string[] = []
    if (aMin !== 0 || aMax !== 0) {
      labelParts.push(
        aMin === aMax ? `+${aMin}%` : `+${aMin}-${aMax}%`,
      )
    }
    if (mMin !== 0 || mMax !== 0) {
      labelParts.push(
        mMin === mMax ? `Total +${mMin}%` : `Total +${mMin}-${mMax}%`,
      )
    }
    pushSource(attrSources, attr.key, {
      label: `Increased ${attr.name} (${labelParts.join(', ')})`,
      sourceType: 'tree',
      value: bonusMin === bonusMax ? bonusMin : [bonusMin, bonusMax],
    })
  }

  const attrContributionMaps: Array<Record<AttributeKey, StatMap>> = []
  if (gameConfig.defaultStatsPerAttribute) {
    attrContributionMaps.push(gameConfig.defaultStatsPerAttribute)
  }
  if (cls?.statsPerAttribute) {
    attrContributionMaps.push(cls.statsPerAttribute)
  }

  if (attrContributionMaps.length > 0) {
    const tempAttrs: Record<string, RangedValue> = {}
    for (const attr of gameConfig.attributes) {
      tempAttrs[attr.key] = sumContributions(attrSources.get(attr.key) ?? [])
    }
    for (const map of attrContributionMaps) {
      for (const [attrKey, statsMap] of Object.entries(map)) {
        const attrVal = tempAttrs[attrKey] ?? 0
        const [amin, amax] =
          typeof attrVal === 'number' ? [attrVal, attrVal] : attrVal
        const attrName =
          gameConfig.attributes.find((a) => a.key === attrKey)?.name ?? attrKey
        for (const [statKey, perPoint] of Object.entries(statsMap)) {
          const value: RangedValue =
            amin === amax
              ? amin * perPoint
              : [amin * perPoint, amax * perPoint]
          if (!isZero(value)) {
            pushSource(statSources, statKey, {
              label: `From ${attrName}`,
              sourceType: 'attribute',
              value,
            })
          }
        }
      }
    }
  }

  if (subskillRanks && classId) {
    const classSubskillSkills = getSkillsByClass(classId)
    for (const ownerSkill of classSubskillSkills) {
      if (!ownerSkill.subskills?.length) continue
      const agg = aggregateSubskillStats(
        ownerSkill,
        subskillRanks,
        enemyConditions,
      )
      for (const [key, value] of Object.entries(agg.stats)) {
        if (value === 0) continue
        const def = STAT_DEFS_MAP.get(key)
        if (def?.skillScoped) continue
        applyContribution(
          attrSources,
          statSources,
          key,
          value,
          `${ownerSkill.name} subtree`,
          'subskill',
        )
      }
    }
  }

  const attributes: Record<AttributeKey, RangedValue> = {}
  const attributeSourcesOut: Record<AttributeKey, SourceContribution[]> = {}
  for (const attr of gameConfig.attributes) {
    const list = attrSources.get(attr.key) ?? []
    attributes[attr.key] = sumContributions(list)
    attributeSourcesOut[attr.key] = list
  }

  if (gameConfig.attributeDividedStats) {
    for (const [attrKey, statsMap] of Object.entries(
      gameConfig.attributeDividedStats,
    )) {
      const attrVal = attributes[attrKey] ?? 0
      const [amin, amax] =
        typeof attrVal === 'number' ? [attrVal, attrVal] : attrVal
      const attrName =
        gameConfig.attributes.find((a) => a.key === attrKey)?.name ?? attrKey
      for (const [statKey, divisor] of Object.entries(statsMap)) {
        if (!divisor || divisor <= 0) continue
        const contribMin = Math.floor(amin / divisor)
        const contribMax = Math.floor(amax / divisor)
        if (contribMin === 0 && contribMax === 0) continue
        const value: RangedValue =
          contribMin === contribMax
            ? contribMin
            : [contribMin, contribMax]
        pushSource(statSources, statKey, {
          label: `From ${attrName} (÷${divisor})`,
          sourceType: 'attribute',
          value,
        })
      }
    }
  }

  const itemGrantedRanks = aggregateItemSkillBonuses(inventory)
  for (const granted of itemGrantedSkills) {
    const key = normalizeSkillName(granted.name)
    const [rankMin, rankMax] = itemGrantedRanks[key] ?? [0, 0]
    if (rankMax <= 0) continue
    if (!granted.passiveStats) continue
    const { base, perRank } = granted.passiveStats
    const out: Record<string, RangedValue> = {}
    if (base) {
      for (const [k, v] of Object.entries(base)) {
        out[k] = v
      }
    }
    if (perRank) {
      for (const [k, v] of Object.entries(perRank)) {
        const min = (out[k] !== undefined ? rangedMin(out[k]) : 0) + v * rankMin
        const max = (out[k] !== undefined ? rangedMax(out[k]) : 0) + v * rankMax
        out[k] = min === max ? min : [min, max]
      }
    }
    const label = `${granted.name} (rank ${
      rankMin === rankMax ? rankMin : `${rankMin}-${rankMax}`
    })`
    for (const [k, v] of Object.entries(out)) {
      if (isZero(v)) continue
      applyContribution(attrSources, statSources, k, v, label, 'item')
    }
  }

  for (const { from, to } of STAT_FAN_OUTS) {
    for (const variant of ['', '_more'] as const) {
      const sources = statSources.get(from + variant)
      if (!sources || sources.length === 0) continue
      for (const targetKey of to) {
        for (const src of sources) {
          pushSource(statSources, targetKey + variant, src)
        }
      }
    }
  }

  const stats: RangedStatMap = {}
  const statSourcesOut: Record<string, SourceContribution[]> = {}
  for (const [key, list] of statSources) {
    stats[key] = sumContributions(list)
    statSourcesOut[key] = list
  }

  applyMultiplier(stats, 'life', 'increased_life', 'increased_life_more')
  applyMultiplier(stats, 'mana', 'increased_mana', 'increased_mana_more')
  applyMultiplier(stats, 'mana_replenish', undefined, 'mana_replenish_more', { floor: false })
  applyMultiplier(stats, 'life_replenish', undefined, 'life_replenish_more', { floor: false })

  const touchedConvertTargets = new Set<string>()
  for (const granted of itemGrantedSkills) {
    if (!granted.passiveConverts) continue
    const key = normalizeSkillName(granted.name)
    const [rankMin, rankMax] = itemGrantedRanks[key] ?? [0, 0]
    if (rankMax <= 0) continue
    for (const conv of granted.passiveConverts.perRank) {
      const effective = combineAdditiveAndMore(
        stats[conv.from],
        stats[`${conv.from}_more`],
      )
      const fromMin = rangedMin(effective)
      const fromMax = rangedMax(effective)
      const addMin = ((conv.pct * rankMin) / 100) * fromMin
      const addMax = ((conv.pct * rankMax) / 100) * fromMax
      if (addMin === 0 && addMax === 0) continue
      const value: RangedValue = addMin === addMax ? addMin : [addMin, addMax]
      const label = `Converted from ${statName(conv.from)} (${granted.name}, rank ${
        rankMin === rankMax ? rankMin : `${rankMin}-${rankMax}`
      })`
      pushSource(statSources, conv.to, {
        label,
        sourceType: 'item',
        value,
      })
      const outList = statSourcesOut[conv.to]
      if (!outList) {
        statSourcesOut[conv.to] = statSources.get(conv.to)!
      }
      touchedConvertTargets.add(conv.to)
    }
  }
  for (const { conv, sourceLabel } of treeConversions) {
    const sourceValue: RangedValue =
      conv.fromKind === 'attribute'
        ? (attributes[conv.fromKey as AttributeKey] ?? 0)
        : combineAdditiveAndMore(
            stats[conv.fromKey],
            stats[`${conv.fromKey}_more`],
          )
    const fromMin = rangedMin(sourceValue)
    const fromMax = rangedMax(sourceValue)
    const addMin = (conv.pct / 100) * fromMin
    const addMax = (conv.pct / 100) * fromMax
    if (addMin === 0 && addMax === 0) continue
    const value: RangedValue =
      addMin === addMax ? addMin : [addMin, addMax]
    const label = `${sourceLabel}: ${conv.pct}% of ${statName(conv.fromKey)}`
    if (conv.toKind === 'attribute') {
      pushSource(attrSources, conv.toKey, {
        label,
        sourceType: 'tree',
        value,
      })
      const list = attrSources.get(conv.toKey)
      if (list) {
        attributes[conv.toKey as AttributeKey] = sumContributions(list)
        attributeSourcesOut[conv.toKey as AttributeKey] = list
      }
    } else {
      pushSource(statSources, conv.toKey, {
        label,
        sourceType: 'tree',
        value,
      })
      if (!statSourcesOut[conv.toKey]) {
        statSourcesOut[conv.toKey] = statSources.get(conv.toKey)!
      }
      touchedConvertTargets.add(conv.toKey)
    }
  }
  for (const k of touchedConvertTargets) {
    const list = statSources.get(k)
    if (list) stats[k] = sumContributions(list)
  }

  if (treeDisables.has('life_replenish')) {
    stats.life_replenish = 0
    stats.life_replenish_pct = 0
  }

  return {
    attributes,
    stats,
    attributeSources: attributeSourcesOut,
    statSources: statSourcesOut,
  }
}

function applyMultiplier(
  stats: RangedStatMap,
  flatKey: string,
  pctKey: string | undefined,
  morePctKey?: string,
  options?: { floor?: boolean },
): void {
  const flat = stats[flatKey]
  if (flat === undefined) return
  const pct = pctKey ? (stats[pctKey] ?? 0) : 0
  const more = morePctKey ? (stats[morePctKey] ?? 0) : 0
  if (isZero(pct) && isZero(more)) return
  const [fmin, fmax] =
    typeof flat === 'number' ? [flat, flat] : flat
  const [pmin, pmax] = typeof pct === 'number' ? [pct, pct] : pct
  const [mmin, mmax] = typeof more === 'number' ? [more, more] : more
  const rawMin = fmin * (1 + pmin / 100) * (1 + mmin / 100)
  const rawMax = fmax * (1 + pmax / 100) * (1 + mmax / 100)
  const floorIt = options?.floor !== false
  const min = floorIt ? Math.floor(rawMin) : rawMin
  const max = floorIt ? Math.floor(rawMax) : rawMax
  stats[flatKey] = min === max ? min : [min, max]
}

export function combineAdditiveAndMore(
  additive: RangedValue | undefined,
  more: RangedValue | undefined,
): RangedValue {
  const [aMin, aMax] =
    additive === undefined
      ? [0, 0]
      : typeof additive === 'number'
        ? [additive, additive]
        : additive
  const [mMin, mMax] =
    more === undefined
      ? [0, 0]
      : typeof more === 'number'
        ? [more, more]
        : more
  const round = (n: number) => Math.round(n * 1e6) / 1e6
  const min = round(((1 + aMin / 100) * (1 + mMin / 100) - 1) * 100)
  const max = round(((1 + aMax / 100) * (1 + mMax / 100) - 1) * 100)
  return min === max ? min : [min, max]
}

export function statName(key: string): string {
  const direct = STAT_DEFS_MAP.get(key)?.name
  if (direct) return direct
  if (key.endsWith('_more')) {
    const base = key.slice(0, -'_more'.length)
    const baseName = STAT_DEFS_MAP.get(base)?.name
    if (baseName) return `Total ${baseName}`
  }
  return key
}

export function statDef(key: string): StatDef | undefined {
  const direct = STAT_DEFS_MAP.get(key)
  if (direct) return direct
  if (key.endsWith('_more')) {
    const base = STAT_DEFS_MAP.get(key.slice(0, -'_more'.length))
    if (base) {
      return {
        ...base,
        key,
        name: `Total ${base.name}`,
        format: 'percent',
      }
    }
  }
  return undefined
}

export function effectiveCap(
  statKey: string,
  stats: RangedStatMap,
): number | undefined {
  const baseCap = statDef(statKey)?.cap
  if (baseCap === undefined) return undefined
  const mod = stats[`max_${statKey}`]
  if (mod === undefined) return baseCap
  return baseCap + rangedMax(mod)
}

export function isZero(v: RangedValue): boolean {
  if (typeof v === 'number') return v === 0
  return v[0] === 0 && v[1] === 0
}

export function rangedMin(v: RangedValue): number {
  return typeof v === 'number' ? v : v[0]
}

export function rangedMax(v: RangedValue): number {
  return typeof v === 'number' ? v : v[1]
}

export function formatValue(value: RangedValue, key: string): string {
  const def = statDef(key)
  const suffix = def?.format === 'percent' ? '%' : ''
  if (typeof value === 'number') {
    const sign = value >= 0 ? '+' : ''
    const num = Number.isInteger(value)
      ? value
      : Math.round(value * 100) / 100
    return `${sign}${num}${suffix}`
  }
  const [min, max] = value
  if (min === max) return formatValue(min, key)
  const sign = min >= 0 ? '+' : ''
  const minF = Number.isInteger(min) ? min : Math.round(min * 100) / 100
  const maxF = Number.isInteger(max) ? max : Math.round(max * 100) / 100
  return `${sign}[${minF}-${maxF}]${suffix}`
}

export function fmtStats(stats: RangedStatMap): string {
  return Object.entries(stats)
    .map(([k, v]) => `${formatValue(v, k)} ${statName(k)}`)
    .join(', ')
}

export interface SkillDamageBreakdown {
  effectiveRankMin: number
  effectiveRankMax: number
  baseMin: number
  baseMax: number
  flatMin: number
  flatMax: number
  synergyMinPct: number
  synergyMaxPct: number
  skillDamageMinPct: number
  skillDamageMaxPct: number
  extraDamagePct: number
  extraDamageSources: Array<{ label: string; pct: number }>
  critChance: number
  critDamagePct: number
  critMultiplierAvg: number
  multicastChancePct: number
  multicastMultiplier: number
  projectileCount: number
  elementalBreakPct: number
  elementalBreakMultiplier: number
  enemyResistancePct: number
  resistanceIgnoredPct: number
  effectiveResistancePct: number
  resistanceMultiplier: number
  hitMin: number
  hitMax: number
  critMin: number
  critMax: number
  finalMin: number
  finalMax: number
  avgMin: number
  avgMax: number
}

export interface WeaponDamageBreakdown {
  hasWeapon: boolean
  weaponName?: string
  weaponDamageMin: number
  weaponDamageMax: number
  enhancedDamageMinPct: number
  enhancedDamageMaxPct: number
  additivePhysicalMin: number
  additivePhysicalMax: number
  attackDamageMinPct: number
  attackDamageMaxPct: number
  extraDamagePct: number
  extraDamageSources: Array<{ label: string; pct: number }>
  critChance: number
  critDamagePct: number
  critMultiplierAvg: number
  attacksPerSecondMin: number
  attacksPerSecondMax: number
  hitMin: number
  hitMax: number
  critMin: number
  critMax: number
  avgMin: number
  avgMax: number
  dpsMin: number
  dpsMax: number
}

const EXTRA_DAMAGE_CONDITIONS: Array<{
  stat: string
  condition: string
  label: string
}> = [
  { stat: 'extra_damage_stunned', condition: 'stunned', label: 'Stunned' },
  { stat: 'extra_damage_bleeding', condition: 'bleeding', label: 'Bleeding' },
  { stat: 'extra_damage_frozen', condition: 'frozen', label: 'Frozen' },
  { stat: 'extra_damage_poisoned', condition: 'poisoned', label: 'Poisoned' },
  { stat: 'extra_damage_burning', condition: 'burning', label: 'Burning' },
  { stat: 'extra_damage_stasis', condition: 'stasis', label: 'Stasis' },
  {
    stat: 'extra_damage_shadow_burning',
    condition: 'shadow_burning',
    label: 'Shadow Burning',
  },
  {
    stat: 'extra_damage_frost_bitten',
    condition: 'frost_bitten',
    label: 'Frost Bitten',
  },
]

function collectExtraDamage(
  stats: RangedStatMap,
  enemyConditions: Record<string, boolean> | undefined,
): { pct: number; sources: Array<{ label: string; pct: number }> } {
  const sources: Array<{ label: string; pct: number }> = []
  let total = 0
  if (!enemyConditions) return { pct: 0, sources }
  let anyAilmentActive = false
  for (const m of EXTRA_DAMAGE_CONDITIONS) {
    if (!enemyConditions[m.condition]) continue
    anyAilmentActive = true
    const v = stats[m.stat]
    if (v === undefined) continue
    const avg = (rangedMin(v) + rangedMax(v)) / 2
    if (avg === 0) continue
    sources.push({ label: m.label, pct: avg })
    total += avg
  }
  if (anyAilmentActive) {
    const v = stats['extra_damage_ailments']
    if (v !== undefined) {
      const avg = (rangedMin(v) + rangedMax(v)) / 2
      if (avg !== 0) {
        sources.push({ label: 'Afflicted with Ailments', pct: avg })
        total += avg
      }
    }
  }
  return { pct: total, sources }
}

export function rolledAffixValue(
  affix: {
    sign: '+' | '-'
    format: 'flat' | 'percent'
    valueMin: number | null
    valueMax: number | null
  },
  roll: number,
): number {
  if (affix.valueMin === null || affix.valueMax === null) return 0
  const raw =
    affix.valueMin === affix.valueMax
      ? affix.valueMax
      : affix.valueMin + (affix.valueMax - affix.valueMin) * roll
  const rounded = affix.format === 'flat' ? Math.round(raw) : raw
  return affix.sign === '-' ? -rounded : rounded
}

export function rolledAffixRange(affix: {
  sign: '+' | '-'
  format: 'flat' | 'percent'
  valueMin: number | null
  valueMax: number | null
}): RangedValue {
  if (affix.valueMin === null || affix.valueMax === null) return 0
  const round = (n: number) => (affix.format === 'flat' ? Math.round(n) : n)
  const min = round(affix.valueMin)
  const max = round(affix.valueMax)
  if (affix.sign === '-') {
    return min === max ? -max : [-max, -min]
  }
  return min === max ? min : [min, max]
}

export function isAffixStarImmune(statKey: string | null): boolean {
  return isStatStarImmune(statKey)
}

export function affixStarMultiplier(
  statKey: string | null,
  stars: number | undefined,
): number {
  return statStarPercentMultiplier(statKey, stars)
}

export function rolledAffixValueWithStars(
  affix: {
    sign: '+' | '-'
    format: 'flat' | 'percent'
    valueMin: number | null
    valueMax: number | null
    statKey: string | null
  },
  roll: number,
  stars: number | undefined,
): number {
  const base = rolledAffixValue(affix, roll)
  const mult = affixStarMultiplier(affix.statKey, stars)
  const flat = statStarFlatBonus(affix.statKey, stars)
  if (base === 0 && flat === 0) return 0
  const direction = affix.sign === '-' ? -1 : 1
  const scaled = base * mult + flat * direction
  const starsActive = (stars ?? 0) > 0 && (mult !== 1 || flat !== 0)
  if (starsActive) return Math.floor(scaled)
  return affix.format === 'flat' ? Math.round(scaled) : scaled
}

export function applyStarsToRangedValue(
  value: RangedValue,
  statKey: string,
  stars: number | undefined,
): RangedValue {
  if (!stars || stars <= 0) return value
  const flat =
    statKey === 'item_granted_skill_rank'
      ? itemGrantedSkillRankFlatBonus(stars)
      : statStarFlatBonus(statKey, stars)
  const mult = statStarPercentMultiplier(statKey, stars)
  if (mult === 1 && flat === 0) return value
  if (typeof value === 'number') {
    return Math.floor(value * mult + flat)
  }
  const [min, max] = value
  return [Math.floor(min * mult + flat), Math.floor(max * mult + flat)]
}

export function shouldScaleImplicit(isRuneword: boolean): boolean {
  return !isRuneword
}

export function aggregateItemSkillBonuses(
  inventory: Inventory,
): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {}
  for (const [slotKey, item] of Object.entries(inventory)) {
    if (!item) continue
    const base = getItem(item.baseId)
    if (!base?.skillBonuses) continue
    const stars = isGearSlot(slotKey) ? item.stars : undefined
    for (const [skillName, val] of Object.entries(base.skillBonuses)) {
      const scaled = applyStarsToRangedValue(val, 'item_granted_skill_rank', stars)
      const min = Math.round(rangedMin(scaled))
      const max = Math.round(rangedMax(scaled))
      const key = normalizeSkillName(skillName)
      const cur = out[key] ?? [0, 0]
      out[key] = [cur[0] + min, cur[1] + max]
    }
  }
  return out
}

export function effectiveRankRangeFor(
  skill: Skill,
  baseRank: number,
  stats: RangedStatMap,
  itemSkillBonuses: Record<string, [number, number]>,
): [number, number] {
  if (baseRank <= 0) return [0, 0]
  const all = stats.all_skills ?? 0
  const elem = skill.damageType
    ? (stats[`${skill.damageType}_skills`] ?? 0)
    : 0
  const item = itemSkillBonuses[normalizeSkillName(skill.name)] ?? [0, 0]
  return [
    baseRank + rangedMin(all) + rangedMin(elem) + item[0],
    baseRank + rangedMax(all) + rangedMax(elem) + item[1],
  ]
}

export function computeSkillDamage(
  skill: Skill,
  allocatedRank: number,
  attributes: Record<AttributeKey, RangedValue>,
  stats: RangedStatMap,
  skillRanksByName: Record<string, number>,
  itemSkillBonuses: Record<string, [number, number]>,
  enemyConditions?: Record<string, boolean>,
  enemyResistances?: Record<string, number>,
  skillsByNormalizedName?: Record<string, Skill>,
  projectileCount?: number,
): SkillDamageBreakdown | null {
  if (allocatedRank === 0) return null
  const hasFormula = !!skill.damageFormula
  const hasTable =
    !!skill.damagePerRank && skill.damagePerRank.length > 0
  if (!hasFormula && !hasTable) return null

  const allSkills = stats.all_skills ?? 0
  const allSkillsMin = rangedMin(allSkills)
  const allSkillsMax = rangedMax(allSkills)
  let elementSkillsMin = 0
  let elementSkillsMax = 0
  if (skill.damageType) {
    const es = stats[`${skill.damageType}_skills`] ?? 0
    elementSkillsMin = rangedMin(es)
    elementSkillsMax = rangedMax(es)
  }
  const itemBonus =
    itemSkillBonuses[normalizeSkillName(skill.name)] ?? [0, 0]
  const effectiveRankMin =
    allocatedRank + allSkillsMin + elementSkillsMin + itemBonus[0]
  const effectiveRankMax =
    allocatedRank + allSkillsMax + elementSkillsMax + itemBonus[1]

  let baseMin: number
  let baseMax: number
  if (skill.damageFormula) {
    baseMin =
      skill.damageFormula.base +
      skill.damageFormula.perLevel * effectiveRankMin
    baseMax =
      skill.damageFormula.base +
      skill.damageFormula.perLevel * effectiveRankMax
  } else {
    const table = skill.damagePerRank!
    const idxMin = Math.min(Math.max(effectiveRankMin, 1), table.length) - 1
    const idxMax = Math.min(Math.max(effectiveRankMax, 1), table.length) - 1
    baseMin = table[idxMin]?.min ?? 0
    baseMax = table[idxMax]?.max ?? 0
  }

  const flatKeys: string[] = ['flat_skill_damage', 'flat_elemental_skill_damage']
  if (skill.damageType) flatKeys.push(`flat_${skill.damageType}_skill_damage`)
  let flatMin = 0
  let flatMax = 0
  for (const k of flatKeys) {
    const v = stats[k] ?? 0
    flatMin += rangedMin(v)
    flatMax += rangedMax(v)
  }

  let synergyMinPct = 0
  let synergyMaxPct = 0
  for (const b of skill.bonusSources ?? []) {
    const sourceKey = normalizeSkillName(b.source)
    if (b.per === 'attribute_point') {
      const attrKey = gameConfig.attributes.find(
        (a) =>
          a.name.toLowerCase() === sourceKey || a.key.toLowerCase() === sourceKey,
      )?.key
      if (attrKey) {
        const attr = attributes[attrKey] ?? 0
        synergyMinPct += rangedMin(attr) * b.value
        synergyMaxPct += rangedMax(attr) * b.value
      }
    } else if (b.per === 'skill_level') {
      const baseRank = skillRanksByName[sourceKey] ?? 0
      if (baseRank > 0) {
        const srcSkill = skillsByNormalizedName?.[sourceKey]
        if (srcSkill) {
          const [effMin, effMax] = effectiveRankRangeFor(
            srcSkill,
            baseRank,
            stats,
            itemSkillBonuses,
          )
          synergyMinPct += effMin * b.value
          synergyMaxPct += effMax * b.value
        } else {
          synergyMinPct += baseRank * b.value
          synergyMaxPct += baseRank * b.value
        }
      }
    }
  }

  const magicDmg = stats.magic_skill_damage ?? 0
  const elementKey = skill.damageType
    ? (`${skill.damageType}_skill_damage` as const)
    : null
  const elementDmg = elementKey ? (stats[elementKey] ?? 0) : 0
  const skillDamageMinPct = rangedMin(magicDmg) + rangedMin(elementDmg)
  const skillDamageMaxPct = rangedMax(magicDmg) + rangedMax(elementDmg)

  const magicMore = stats.magic_skill_damage_more ?? 0
  const elementMoreKey = elementKey ? (`${elementKey}_more` as const) : null
  const elementMore = elementMoreKey ? (stats[elementMoreKey] ?? 0) : 0
  const skillMoreMultMin =
    (1 + rangedMin(magicMore) / 100) * (1 + rangedMin(elementMore) / 100)
  const skillMoreMultMax =
    (1 + rangedMax(magicMore) / 100) * (1 + rangedMax(elementMore) / 100)

  const extra = collectExtraDamage(stats, enemyConditions)
  const extraMult = 1 + extra.pct / 100
  const isSpell = !!skill.tags?.includes('Spell')
  const critChance = isSpell
    ? rangedMax(stats.spell_crit_chance ?? 0)
    : rangedMax(stats.crit_chance ?? 0)
  const critDamagePct = isSpell
    ? rangedMax(stats.spell_crit_damage ?? 0)
    : rangedMax(stats.crit_damage ?? 0)
  const critDamageMore = isSpell ? 0 : rangedMax(stats.crit_damage_more ?? 0)
  const critMoreMult = 1 + critDamageMore / 100
  const critMultOnCrit = (1 + critDamagePct / 100) * critMoreMult
  const critChanceClamped = Math.max(0, Math.min(95, critChance)) / 100
  const critMultAvg =
    1 - critChanceClamped + critChanceClamped * critMultOnCrit

  const enemyResPct = skill.damageType
    ? (enemyResistances?.[skill.damageType] ?? 0)
    : 0
  const rawIgnorePct = skill.damageType
    ? rangedMax(stats[`ignore_${skill.damageType}_res`] ?? 0)
    : 0
  const ignoreResPct = Math.max(0, Math.min(100, rawIgnorePct))
  const effectiveResPct = enemyResPct * (1 - ignoreResPct / 100)
  const resistanceMult = 1 - effectiveResPct / 100

  const isElementalSkill =
    !!skill.damageType &&
    (ELEMENTS as readonly string[]).includes(skill.damageType)
  const elementalBreakPct = isElementalSkill
    ? Math.max(
        0,
        rangedMax(stats.elemental_break ?? 0) +
          (isSpell
            ? rangedMax(stats.elemental_break_on_spell ?? 0)
            : rangedMax(stats.elemental_break_on_strike ?? 0)),
      )
    : 0
  const elementalBreakMultiplier = 1 + elementalBreakPct / 100

  const lightningBreakPct =
    skill.damageType === 'lightning' && enemyConditions?.lightning_break
      ? Math.max(0, rangedMax(stats.lightning_break ?? 0))
      : 0
  const lightningBreakMultiplier = 1 + lightningBreakPct / 100

  const hitMin =
    (baseMin + flatMin) *
    (1 + synergyMinPct / 100) *
    (1 + skillDamageMinPct / 100) *
    skillMoreMultMin *
    extraMult *
    elementalBreakMultiplier *
    lightningBreakMultiplier *
    resistanceMult
  const hitMax =
    (baseMax + flatMax) *
    (1 + synergyMaxPct / 100) *
    (1 + skillDamageMaxPct / 100) *
    skillMoreMultMax *
    extraMult *
    elementalBreakMultiplier *
    lightningBreakMultiplier *
    resistanceMult

  const critMin = hitMin * critMultOnCrit
  const critMax = hitMax * critMultOnCrit
  const multicastChancePct = isSpell
    ? Math.max(0, rangedMax(stats.multicast_chance ?? 0))
    : 0
  const multicastMultiplier = 1 + multicastChancePct / 100
  const projectiles = Math.max(1, Math.floor(projectileCount ?? 1))
  const avgMin = hitMin * critMultAvg * multicastMultiplier * projectiles
  const avgMax = hitMax * critMultAvg * multicastMultiplier * projectiles

  const finalMin = Math.floor(hitMin)
  const finalMax = Math.floor(hitMax)

  return {
    effectiveRankMin,
    effectiveRankMax,
    baseMin,
    baseMax,
    flatMin,
    flatMax,
    synergyMinPct,
    synergyMaxPct,
    skillDamageMinPct,
    skillDamageMaxPct,
    extraDamagePct: extra.pct,
    extraDamageSources: extra.sources,
    critChance,
    critDamagePct,
    critMultiplierAvg: critMultAvg,
    multicastChancePct,
    multicastMultiplier,
    projectileCount: projectiles,
    elementalBreakPct,
    elementalBreakMultiplier,
    enemyResistancePct: enemyResPct,
    resistanceIgnoredPct: ignoreResPct,
    effectiveResistancePct: effectiveResPct,
    resistanceMultiplier: resistanceMult,
    hitMin: Math.floor(hitMin),
    hitMax: Math.floor(hitMax),
    critMin: Math.floor(critMin),
    critMax: Math.floor(critMax),
    finalMin,
    finalMax,
    avgMin: Math.floor(avgMin),
    avgMax: Math.floor(avgMax),
  }
}

export function computeWeaponDamage(
  inventory: Inventory,
  stats: RangedStatMap,
  enemyConditions?: Record<string, boolean>,
): WeaponDamageBreakdown {
  const weapon = inventory.weapon
  const base = weapon ? getItem(weapon.baseId) : undefined
  const hasWeapon =
    !!base && base.damageMin !== undefined && base.damageMax !== undefined

  const weaponDamageMin = hasWeapon ? base!.damageMin! : 0
  const weaponDamageMax = hasWeapon ? base!.damageMax! : 0

  const ed = stats.enhanced_damage ?? 0
  const enhancedDamageMinPct = rangedMin(ed)
  const enhancedDamageMaxPct = rangedMax(ed)
  const edMore = stats.enhanced_damage_more ?? 0
  const enhancedMoreMinMult = 1 + rangedMin(edMore) / 100
  const enhancedMoreMaxMult = 1 + rangedMax(edMore) / 100

  const addPhys = stats.additive_physical_damage ?? 0
  const additivePhysicalMin = rangedMin(addPhys)
  const additivePhysicalMax = rangedMax(addPhys)

  const atkDmg = stats.attack_damage ?? 0
  const attackDamageMinPct = rangedMin(atkDmg)
  const attackDamageMaxPct = rangedMax(atkDmg)

  const extra = collectExtraDamage(stats, enemyConditions)
  const extraMult = 1 + extra.pct / 100

  const critChance = rangedMax(stats.crit_chance ?? 0)
  const critDamagePct = rangedMax(stats.crit_damage ?? 0)
  const critDamageMore = rangedMax(stats.crit_damage_more ?? 0)
  const critMoreMult = 1 + critDamageMore / 100
  const critMultOnCrit = (1 + critDamagePct / 100) * critMoreMult
  const critChanceClamped = Math.max(0, Math.min(95, critChance)) / 100
  const critMultAvg =
    1 - critChanceClamped + critChanceClamped * critMultOnCrit

  const baseMin =
    weaponDamageMin * (1 + enhancedDamageMinPct / 100) * enhancedMoreMinMult +
    additivePhysicalMin
  const baseMax =
    weaponDamageMax * (1 + enhancedDamageMaxPct / 100) * enhancedMoreMaxMult +
    additivePhysicalMax

  const hitMinRaw =
    baseMin * (1 + attackDamageMinPct / 100) * extraMult
  const hitMaxRaw =
    baseMax * (1 + attackDamageMaxPct / 100) * extraMult

  const critMinRaw = hitMinRaw * critMultOnCrit
  const critMaxRaw = hitMaxRaw * critMultOnCrit
  const avgMinRaw = hitMinRaw * critMultAvg
  const avgMaxRaw = hitMaxRaw * critMultAvg

  const ias = stats.increased_attack_speed ?? 0
  const iasMore = stats.increased_attack_speed_more ?? 0
  const baseAps = rangedMax(stats.attacks_per_second ?? 0)
  const iasMin = rangedMin(ias)
  const iasMax = rangedMax(ias)
  const iasMoreMinMult = 1 + rangedMin(iasMore) / 100
  const iasMoreMaxMult = 1 + rangedMax(iasMore) / 100
  const apsMin = baseAps * (1 + iasMin / 100) * iasMoreMinMult
  const apsMax = baseAps * (1 + iasMax / 100) * iasMoreMaxMult

  const dpsMinRaw = avgMinRaw * apsMin
  const dpsMaxRaw = avgMaxRaw * apsMax

  return {
    hasWeapon,
    weaponName: base?.name,
    weaponDamageMin,
    weaponDamageMax,
    enhancedDamageMinPct,
    enhancedDamageMaxPct,
    additivePhysicalMin,
    additivePhysicalMax,
    attackDamageMinPct,
    attackDamageMaxPct,
    extraDamagePct: extra.pct,
    extraDamageSources: extra.sources,
    critChance,
    critDamagePct,
    critMultiplierAvg: critMultAvg,
    attacksPerSecondMin: apsMin,
    attacksPerSecondMax: apsMax,
    hitMin: Math.floor(hitMinRaw),
    hitMax: Math.floor(hitMaxRaw),
    critMin: Math.floor(critMinRaw),
    critMax: Math.floor(critMaxRaw),
    avgMin: Math.floor(avgMinRaw),
    avgMax: Math.floor(avgMaxRaw),
    dpsMin: Math.floor(dpsMinRaw),
    dpsMax: Math.floor(dpsMaxRaw),
  }
}

export function passiveStatsAtRank(
  skill: Skill,
  rank: number,
): Record<string, number> {
  if (!skill.passiveStats || rank <= 0) return {}
  const { base, perRank } = skill.passiveStats
  const out: Record<string, number> = {}
  if (base) for (const [k, v] of Object.entries(base)) out[k] = v
  if (perRank) {
    for (const [k, v] of Object.entries(perRank)) {
      out[k] = (out[k] ?? 0) + v * (rank - 1)
    }
  }
  for (const k of Object.keys(out)) {
    out[k] = Math.round(out[k]! * 1000) / 1000
  }
  return out
}

export function manaCostAtRank(skill: Skill, rank: number): number | undefined {
  if (rank <= 0) rank = 1
  if (skill.manaCostFormula) {
    return Math.floor(
      skill.manaCostFormula.base +
        skill.manaCostFormula.perLevel * (rank - 1),
    )
  }
  const exact = skill.ranks.find((r) => r.rank === rank)
  if (exact?.manaCost !== undefined) return exact.manaCost
  return skill.ranks[0]?.manaCost
}
