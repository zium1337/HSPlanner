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
  getItemGrantedSkillByName,
  getItemSet,
  getRune,
  getSkillsByClass,
  isGearSlot,
  itemGrantedSkills,
} from '../data'
import type { ForgeKind } from '../data'
import { RAINBOW_MULTIPLIER, STAR_AFFIX_BONUS } from '../store/build'
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
import { parseTreeNodeMod, TREE_JEWELRY_IDS, TREE_NODE_INFO } from './treeStats'

export type SourceType =
  | 'class'
  | 'allocated'
  | 'level'
  | 'attribute'
  | 'item'
  | 'socket'
  | 'skill'
  | 'custom'
  | 'tree'

export const CUSTOM_SOURCE_LABEL = 'Custom Config'

export function normalizeSkillName(name: string): string {
  // Lowercases and trims a skill name to produce a stable lookup key. Used everywhere a skill or item-granted-skill name needs to be matched without caring about whitespace or casing.
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
  // Appends a SourceContribution to the list keyed by `key` in the source map, skipping zero values and lazily creating the list. Used by computeBuildStats to accumulate the per-stat or per-attribute breakdown that the UI later renders as a tooltip.
  if (isZero(source.value)) return
  const list = map.get(key)
  if (list) list.push(source)
  else map.set(key, [source])
}

function sumContributions(sources: SourceContribution[]): RangedValue {
  // Sums an array of SourceContributions into a single RangedValue, preserving min and max independently and collapsing identical bounds back to a number. Used to fold a per-stat source list into the final value displayed by the stats panel.
  let min = 0
  let max = 0
  for (const s of sources) {
    const [smin, smax] = typeof s.value === 'number' ? [s.value, s.value] : s.value
    min += smin
    max += smax
  }
  return min === max ? min : [min, max]
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
  // Routes a single contribution into either the attribute-source map or the stat-source map based on the StatDef's `modifiesAttribute` field, and skips item-only stats / zero values. Used as the workhorse helper inside computeBuildStats whenever a new value (item, skill, custom, etc.) needs to be added to the breakdown.
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
  // Computes an item's defense after applying any rolled `enhanced_defense` percentage, returning a RangedValue or null when the base item has no defense values. Used by computeBuildStats so the displayed defense reflects both the base roll and the multiplier.
  if (base.defenseMin === undefined || base.defenseMax === undefined) return null
  const ed = enhancedDefense
  const [edMin, edMax] =
    ed === undefined ? [0, 0] : typeof ed === 'number' ? [ed, ed] : ed
  const min = Math.floor(base.defenseMin * (1 + edMin / 100))
  const max = Math.floor(base.defenseMax * (1 + edMax / 100))
  return min === max ? min : [min, max]
}

export function computeBuildStats(
  classId: string | null,
  level: number,
  allocated: Record<AttributeKey, number>,
  inventory: Inventory,
  skillRanks?: Record<string, number>,
  activeAuraId?: string | null,
  activeBuffs?: Record<string, boolean>,
  customStats?: CustomStat[],
  allocatedTreeNodes?: Set<number>,
  treeSocketed?: Record<number, TreeSocketContent | null>,
): ComputedStats {
  // Top-level aggregator that walks every input (class base, allocated attributes, inventory items, sockets/runewords, augments, allocated talent-tree nodes, set bonuses, default per-level stats, allocated active passive/aura/buff skills, custom stats, derived per-attribute stats and item-granted skill effects) and produces a single ComputedStats object containing both the summed values and the per-source breakdown. Used by the build store on every state change to refresh the stats panel and feed the damage calculators.
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

  if (allocatedTreeNodes && allocatedTreeNodes.size > 0) {
    for (const nodeId of allocatedTreeNodes) {
      const info = TREE_NODE_INFO[String(nodeId)]
      if (!info?.l) continue
      // Jewelry sockets contribute via their socketed content, not via the
      // "+1 Socketable Slot" line.
      if (TREE_JEWELRY_IDS.has(nodeId)) continue
      const label = `Tree: ${info.t}`
      for (const line of info.l) {
        const parsed = parseTreeNodeMod(line)
        if (!parsed) continue
        applyContribution(
          attrSources,
          statSources,
          parsed.key,
          parsed.value,
          label,
          'tree',
        )
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

  if (skillRanks && classId) {
    const attrKeySet = new Set(gameConfig.attributes.map((a) => a.key))
    const classSkillList = getSkillsByClass(classId)
    for (const skill of classSkillList) {
      const rank = skillRanks[skill.id] ?? 0
      if (rank <= 0 || !skill.passiveStats) continue
      if (skill.kind === 'aura' && activeAuraId !== skill.id) continue
      const isBuff =
        skill.kind === 'buff' || (skill.tags?.includes('Buff') ?? false)
      if (isBuff && !(activeBuffs?.[skill.id])) continue
      const { base, perRank } = skill.passiveStats
      const combined: Record<string, number> = {}
      if (base) for (const [k, v] of Object.entries(base)) combined[k] = v
      if (perRank) {
        for (const [k, v] of Object.entries(perRank)) {
          combined[k] = (combined[k] ?? 0) + v * (rank - 1)
        }
      }
      for (const [key, value] of Object.entries(combined)) {
        if (value === 0) continue
        const rounded = Math.round(value * 1000) / 1000
        const label = `${skill.name} (rank ${rank})`
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

  const touchedConvertTargets = new Set<string>()
  for (const granted of itemGrantedSkills) {
    if (!granted.passiveConverts) continue
    const key = normalizeSkillName(granted.name)
    const [rankMin, rankMax] = itemGrantedRanks[key] ?? [0, 0]
    if (rankMax <= 0) continue
    for (const conv of granted.passiveConverts.perRank) {
      const fromVal = stats[conv.from] ?? 0
      const fromMin = rangedMin(fromVal)
      const fromMax = rangedMax(fromVal)
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
  for (const k of touchedConvertTargets) {
    const list = statSources.get(k)
    if (list) stats[k] = sumContributions(list)
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
  pctKey: string,
  morePctKey?: string,
): void {
  // Mutates `stats[flatKey]` in place by multiplying it by `(1 + pct/100) × (1 + more/100)` from the supplied additive and Total percent stats. Used by computeBuildStats to fold life and mana percentages into their final flat values after every contributor has been counted.
  const flat = stats[flatKey]
  if (flat === undefined) return
  const pct = stats[pctKey] ?? 0
  const more = morePctKey ? (stats[morePctKey] ?? 0) : 0
  if (isZero(pct) && isZero(more)) return
  const [fmin, fmax] =
    typeof flat === 'number' ? [flat, flat] : flat
  const [pmin, pmax] = typeof pct === 'number' ? [pct, pct] : pct
  const [mmin, mmax] = typeof more === 'number' ? [more, more] : more
  const min = Math.floor(fmin * (1 + pmin / 100) * (1 + mmin / 100))
  const max = Math.floor(fmax * (1 + pmax / 100) * (1 + mmax / 100))
  stats[flatKey] = min === max ? min : [min, max]
}

export function combineAdditiveAndMore(
  additive: RangedValue | undefined,
  more: RangedValue | undefined,
): RangedValue {
  // Combines an additive percentage with its `_more` (Total) multiplier into a single equivalent additive percentage using `((1 + add/100) × (1 + more/100) - 1) × 100`. Used by the stats panel to display a single "effective" number when both the additive and Total bonuses exist for the same stat.
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
  // Returns the human-readable display name for a stat key, falling back to the key itself when no definition exists. Used by tooltips, formatters and breakdown labels throughout the UI.
  return STAT_DEFS_MAP.get(key)?.name ?? key
}

export function statDef(key: string): StatDef | undefined {
  // Looks up the StatDef metadata (category, format, cap, etc.) for a given stat key. Used internally by formatting and contribution helpers.
  return STAT_DEFS_MAP.get(key)
}

export function effectiveCap(
  statKey: string,
  stats: RangedStatMap,
): number | undefined {
  // Returns the effective cap for `statKey` after adding any `max_<statKey>` modifier present in the supplied stat map. Used by the stats panel to render correct max-resistance / max-block style caps.
  const baseCap = statDef(statKey)?.cap
  if (baseCap === undefined) return undefined
  const mod = stats[`max_${statKey}`]
  if (mod === undefined) return baseCap
  return baseCap + rangedMax(mod)
}

export function isZero(v: RangedValue): boolean {
  // Returns true when a RangedValue is zero (or [0, 0] for the tuple form). Used by helpers that need to short-circuit on no-op contributions.
  if (typeof v === 'number') return v === 0
  return v[0] === 0 && v[1] === 0
}

export function rangedMin(v: RangedValue): number {
  // Returns the minimum endpoint of a RangedValue (the value itself for a plain number). Used wherever a single representative low value is needed.
  return typeof v === 'number' ? v : v[0]
}

export function rangedMax(v: RangedValue): number {
  // Returns the maximum endpoint of a RangedValue (the value itself for a plain number). Used by formula code that wants the optimistic upper bound.
  return typeof v === 'number' ? v : v[1]
}

export function formatValue(value: RangedValue, key: string): string {
  // Formats a RangedValue as a signed display string respecting the stat's percent/flat format and collapsing identical bounds. Used by tooltips and stat lists to render human-friendly values such as "+25%" or "+[12-18]".
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
  // Renders an entire RangedStatMap as a comma-separated, human-readable string by formatting each entry through `formatValue` and `statName`. Used by tooltips and other places that want a single inline summary of a stat block.
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
  // Walks the EXTRA_DAMAGE_CONDITIONS table, sums every `extra_damage_<ailment>` whose enemy-condition flag is active, and additionally folds in `extra_damage_ailments` when at least one ailment is on. Used by computeSkillDamage and computeWeaponDamage to compute the conditional `+% extra damage` multiplier.
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
  // Interpolates a single affix's value at the given 0-1 roll, applying the sign and rounding flat (integer) values. Used wherever the system needs the deterministic value of a rolled affix at a known roll fraction.
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
  // Returns the full [min, max] RangedValue an affix can produce, applying sign and integer rounding for flat affixes. Used when the UI wants to show the possible roll window rather than a single committed roll.
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
  // Returns true when an affix's stat key should never be scaled by item stars (currently only `all_skills`). Used by every star-scaling helper to skip those unique affixes.
  return statKey === 'all_skills'
}

export function affixStarMultiplier(
  statKey: string | null,
  stars: number | undefined,
): number {
  // Returns the multiplier (1 + stars × STAR_AFFIX_BONUS) that an affix should be scaled by, or 1 when stars are absent or the affix is star-immune. Used by every code path that needs to compute the post-star value of an affix.
  if (!stars || stars <= 0) return 1
  if (isAffixStarImmune(statKey)) return 1
  return 1 + stars * STAR_AFFIX_BONUS
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
  // Combines `rolledAffixValue` with star scaling, rounding the result for flat affixes. Used by computeBuildStats when applying a rolled affix from inventory items.
  const base = rolledAffixValue(affix, roll)
  if (base === 0) return 0
  const mult = affixStarMultiplier(affix.statKey, stars)
  if (mult === 1) return base
  const scaled = base * mult
  return affix.format === 'flat' ? Math.round(scaled) : scaled
}

export function applyStarsToRangedValue(
  value: RangedValue,
  statKey: string,
  stars: number | undefined,
): RangedValue {
  // Scales a RangedValue by the star multiplier, preserving integer rounding when the original endpoints were integers and respecting the star-immune list. Used to scale implicit item stats and item-granted skill ranks by the equipped item's stars.
  if (!stars || stars <= 0) return value
  if (isAffixStarImmune(statKey)) return value
  const mult = 1 + stars * STAR_AFFIX_BONUS
  if (typeof value === 'number') {
    const scaled = value * mult
    return Number.isInteger(value) ? Math.round(scaled) : scaled
  }
  const [min, max] = value
  const sMin = min * mult
  const sMax = max * mult
  return [
    Number.isInteger(min) ? Math.round(sMin) : sMin,
    Number.isInteger(max) ? Math.round(sMax) : sMax,
  ]
}

export function shouldScaleImplicit(isRuneword: boolean): boolean {
  // Returns true when an item's implicit stats should be scaled by stars (i.e. it is not a runeword). Used by computeBuildStats to suppress double-scaling on runewords.
  return !isRuneword
}

export function aggregateItemSkillBonuses(
  inventory: Inventory,
): Record<string, [number, number]> {
  // Walks every equipped item and sums the rolled (and star-scaled) `+rank` skill bonuses by normalised skill name, returning a `[minRank, maxRank]` tuple per skill. Used by computeBuildStats and computeSkillDamage to know how much rank each skill gets from gear.
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

export function computeSkillDamage(
  skill: Skill,
  allocatedRank: number,
  attributes: Record<AttributeKey, RangedValue>,
  stats: RangedStatMap,
  skillRanksByName: Record<string, number>,
  itemSkillBonuses: Record<string, [number, number]>,
  enemyConditions?: Record<string, boolean>,
  enemyResistances?: Record<string, number>,
): SkillDamageBreakdown | null {
  // Computes the per-hit / crit / average / final damage breakdown for a single skill, factoring in effective rank (including +to-all-skills, element-skills, and item-granted bonuses), additive and Total skill damage, synergies, flat damage, ailment-conditional bonuses, spell vs melee crit pools, and enemy resistance / ignore-resistance. Returns null when the skill has neither a damage formula nor a per-rank table or has not been allocated. Used by SkillsView and the stat panel to render damage tooltips.
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
      const rank = skillRanksByName[sourceKey] ?? 0
      synergyMinPct += rank * b.value
      synergyMaxPct += rank * b.value
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

  const hitMin =
    (baseMin + flatMin) *
    (1 + synergyMinPct / 100) *
    (1 + skillDamageMinPct / 100) *
    skillMoreMultMin *
    extraMult *
    resistanceMult
  const hitMax =
    (baseMax + flatMax) *
    (1 + synergyMaxPct / 100) *
    (1 + skillDamageMaxPct / 100) *
    skillMoreMultMax *
    extraMult *
    resistanceMult

  const critMin = hitMin * critMultOnCrit
  const critMax = hitMax * critMultOnCrit
  const avgMin = hitMin * critMultAvg
  const avgMax = hitMax * critMultAvg

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
  // Computes the equipped weapon's hit / crit / average / DPS breakdown by combining base weapon damage, enhanced damage (additive + Total), additive physical damage, attack damage, ailment-conditional bonuses, crit chance/damage, and attack speed. Used by the stats panel and weapon tooltip to render the live weapon DPS.
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
  // Returns the merged base+perRank passive stats a skill provides at a given rank, rounded to three decimals. Used by skill tooltips that display per-rank stat contributions.
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
  // Returns the mana cost of casting a skill at the specified rank, preferring the explicit `manaCostFormula` and falling back to per-rank table entries. Used by SkillsView to display the cost next to each skill rank.
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
