import { useMemo, useState } from 'react'
import SourceTooltip from '../components/SourceTooltip'
import { classes, gameConfig, skills } from '../data'
import { useBuild } from '../store/build'
import {
  aggregateItemSkillBonuses,
  combineAdditiveAndMore,
  computeBuildStats,
  computeSkillDamage,
  computeWeaponDamage,
  effectiveCap,
  formatValue,
  isZero,
  rangedMax,
  rangedMin,
  statDef,
  statName,
} from '../utils/stats'
import type {
  SkillDamageBreakdown,
  SourceContribution,
  WeaponDamageBreakdown,
} from '../utils/stats'
import type {
  AttributeKey,
  DamageType,
  RangedStatMap,
  RangedValue,
  Skill,
  StatDef,
} from '../types'

const DAMAGE_KEYS = [
  'attacks_per_second',
  'increased_attack_speed',
  'attack_damage',
  'enhanced_damage',
  'attack_rating',
  'attack_rating_pct',
  'crit_chance',
  'crit_damage',
]

const CATEGORY_ORDER: StatDef['category'][] = [
  'base',
  'offense',
  'defense',
  'resource',
  'utility',
]

const CATEGORY_LABEL: Record<StatDef['category'], string> = {
  base: 'Base Stats',
  offense: 'Offensive',
  defense: 'Defensive',
  resource: 'Resources',
  utility: 'Utility',
}

export default function StatsView() {
  const {
    classId,
    level,
    allocated,
    inventory,
    skillRanks,
    activeAuraId,
    activeBuffs,
    enemyConditions,
    enemyResistances,
    customStats,
    allocatedTreeNodes,
  } = useBuild()
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const matches = (label: string) =>
    normalizedQuery.length > 0 &&
    label.toLowerCase().includes(normalizedQuery)
  const { attributes, stats, attributeSources, statSources } = useMemo(
    () =>
      computeBuildStats(
        classId,
        level,
        allocated,
        inventory,
        skillRanks,
        activeAuraId,
        activeBuffs,
        customStats,
        allocatedTreeNodes,
      ),
    [
      classId,
      level,
      allocated,
      inventory,
      skillRanks,
      activeAuraId,
      activeBuffs,
      customStats,
      allocatedTreeNodes,
    ],
  )
  const fcrRange = stats.faster_cast_rate ?? 0
  const mcrRange = stats.mana_cost_reduction ?? 0
  const itemSkillBonuses = aggregateItemSkillBonuses(inventory)
  const weaponDamage = useMemo(
    () => computeWeaponDamage(inventory, stats, enemyConditions),
    [inventory, stats, enemyConditions],
  )

  const grouped = useMemo(() => {
    const out: Record<string, string[]> = {
      base: [],
      offense: [],
      defense: [],
      resource: [],
      utility: [],
    }
    for (const def of gameConfig.stats) {
      if (def.modifiesAttribute) continue
      if (def.itemOnly) continue
      if (def.skillScoped) continue
      const bucket = out[def.category]
      if (bucket) bucket.push(def.key)
    }
    return out
  }, [])

  return (
    <div className="max-w-5xl space-y-4">
      <header className="flex items-end justify-between">
        <h2 className="text-2xl font-semibold">Stats</h2>
        {classes.length === 0 && (
          <span className="text-xs text-muted">Add a class JSON to begin</span>
        )}
      </header>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stats or attributes…"
          data-search-input
          className="w-full bg-panel border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text text-xs px-1.5 py-0.5 rounded"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {(() => {
        const visibleAttrs = gameConfig.attributes.filter(
          (attr) => normalizedQuery.length === 0 || matches(attr.name),
        )
        if (visibleAttrs.length === 0) return null
        return (
          <Panel title="Attributes">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {visibleAttrs.map((attr) => {
                const final: RangedValue = attributes[attr.key] ?? 0
                const sources = attributeSources[attr.key] ?? []
                const [fmin, fmax] =
                  typeof final === 'number' ? [final, final] : final
                const highlighted = matches(attr.name)
                return (
                  <SourceTooltip
                    key={attr.key}
                    statKey={attr.key}
                    sources={sources}
                  >
                    <div
                      className={`flex items-center justify-between border rounded px-3 py-2 transition-colors ${
                        highlighted
                          ? 'bg-accent/15 border-accent'
                          : 'bg-panel-2 border-border hover:border-accent/50'
                      }`}
                    >
                      <span className="text-sm text-muted">{attr.name}</span>
                      <div className="text-base font-semibold tabular-nums">
                        {displayRange(fmin, fmax)}
                      </div>
                    </div>
                  </SourceTooltip>
                )
              })}
            </div>
          </Panel>
        )
      })()}

      {(() => {
        const visibleDamageKeys =
          normalizedQuery.length === 0
            ? DAMAGE_KEYS
            : DAMAGE_KEYS.filter((key) => matches(statName(key)))
        const showWeaponPanel = normalizedQuery.length === 0
        if (visibleDamageKeys.length === 0 && !showWeaponPanel) return null
        return (
          <Panel title="Damage">
            <ul className="space-y-1">
              {visibleDamageKeys.map((key) => (
                <StatRow
                  key={key}
                  statKey={key}
                  value={stats[key] ?? 0}
                  sources={statSources[key] ?? []}
                  moreValue={stats[`${key}_more`]}
                  moreSources={statSources[`${key}_more`]}
                  highlighted={matches(statName(key))}
                  stats={stats}
                />
              ))}
            </ul>
            {showWeaponPanel && <WeaponDamagePanel breakdown={weaponDamage} />}
          </Panel>
        )
      })()}

      {(() => {
        const skillsForClass = classId
          ? skills.filter(
              (s) => s.classId === classId && s.kind === 'active',
            )
          : []
        const allClassSkills = classId
          ? skills.filter((s) => s.classId === classId)
          : []
        const visibleSkills =
          normalizedQuery.length === 0
            ? skillsForClass
            : skillsForClass.filter((s) => matches(s.name))
        if (normalizedQuery.length > 0 && visibleSkills.length === 0)
          return null
        return (
          <Panel title="Per-Skill Damage">
            {skillsForClass.length === 0 ? (
              <div className="text-sm text-muted italic text-center py-2">
                No skills defined for this class yet.
                <br />
                Add JSON files in{' '}
                <code className="text-accent">src/data/skills/</code>.
              </div>
            ) : (
              <ul className="space-y-2">
                {(() => {
                  const skillRanksByName: Record<string, number> = {}
                  for (const s of allClassSkills) {
                    skillRanksByName[s.name.toLowerCase()] =
                      skillRanks[s.id] ?? 0
                  }
                  return visibleSkills.map((skill) => (
                    <SkillRow
                      key={skill.id}
                      skill={skill}
                      fcrRange={fcrRange}
                      mcrRange={mcrRange}
                      attributes={attributes}
                      stats={stats}
                      skillRanksByName={skillRanksByName}
                      itemSkillBonuses={itemSkillBonuses}
                      currentRank={skillRanks[skill.id] ?? 0}
                      enemyConditions={enemyConditions}
                      enemyResistances={enemyResistances}
                    />
                  ))
                })()}
              </ul>
            )}
          </Panel>
        )
      })()}

      {CATEGORY_ORDER.map((cat) => {
        const keys = grouped[cat]
        if (!keys || keys.length === 0) return null
        const visibleKeys =
          normalizedQuery.length === 0
            ? keys
            : keys.filter((key) => matches(statName(key)))
        if (visibleKeys.length === 0) return null
        return (
          <Panel key={cat} title={CATEGORY_LABEL[cat]}>
            <ul className="space-y-1">
              {visibleKeys.map((key) => (
                <StatRow
                  key={key}
                  statKey={key}
                  value={stats[key] ?? 0}
                  sources={statSources[key] ?? []}
                  moreValue={stats[`${key}_more`]}
                  moreSources={statSources[`${key}_more`]}
                  highlighted={matches(statName(key))}
                  stats={stats}
                />
              ))}
            </ul>
          </Panel>
        )
      })}
    </div>
  )
}

function StatRow({
  statKey,
  value,
  sources,
  moreValue,
  moreSources,
  highlighted,
  stats,
}: {
  statKey: string
  value: RangedValue
  sources: SourceContribution[]
  moreValue?: RangedValue
  moreSources?: SourceContribution[]
  highlighted: boolean
  stats: RangedStatMap
}) {
  const hasMore = !!moreSources && moreSources.length > 0
  const displayValue: RangedValue = hasMore
    ? combineAdditiveAndMore(value, moreValue)
    : value
  const zero = isZero(displayValue) && (!hasMore || isZero(moreValue ?? 0))
  const bg = highlighted
    ? 'bg-accent/15 ring-1 ring-accent/40'
    : 'hover:bg-panel-2/60'
  const opacity = zero && !highlighted ? 'opacity-35' : ''
  const def = statDef(statKey)
  const cap = effectiveCap(statKey, stats)
  const overflow =
    cap !== undefined &&
    !zero &&
    typeof displayValue === 'number' &&
    displayValue > cap
  const suffix = def?.format === 'percent' ? '%' : ''
  return (
    <li>
      <SourceTooltip
        statKey={statKey}
        sources={sources}
        moreSources={moreSources}
      >
        <div
          className={`flex items-baseline justify-between gap-2 text-sm py-0.5 px-1 -mx-1 rounded transition-colors ${bg} ${opacity}`}
        >
          <span className="text-text/90">{statName(statKey)}</span>
          <span
            className={`font-medium tabular-nums ${
              zero ? 'text-muted' : 'text-accent'
            }`}
          >
            {zero ? (
              '—'
            ) : overflow ? (
              <>
                +{cap}
                {suffix}{' '}
                <span className="text-muted font-normal">
                  ({displayValue as number}
                  {suffix})
                </span>
              </>
            ) : (
              formatValue(displayValue, statKey)
            )}
          </span>
        </div>
      </SourceTooltip>
    </li>
  )
}

const DAMAGE_TYPE_ACCENT: Record<DamageType, string> = {
  physical: 'text-white',
  lightning: 'text-yellow-300',
  cold: 'text-sky-300',
  fire: 'text-red-400',
  poison: 'text-green-400',
  arcane: 'text-purple-300',
  explosion: 'text-orange-300',
  magic: 'text-pink-300',
}

const DAMAGE_TYPE_CLASS: Record<DamageType, string> = {
  physical: 'bg-white/10 text-white border-white/30',
  lightning: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  cold: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  fire: 'bg-red-500/15 text-red-400 border-red-500/40',
  poison: 'bg-green-500/15 text-green-400 border-green-500/40',
  arcane: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
  explosion: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  magic: 'bg-pink-500/15 text-pink-300 border-pink-500/40',
}

function SkillRow({
  skill,
  fcrRange,
  mcrRange,
  attributes,
  stats,
  skillRanksByName,
  itemSkillBonuses,
  currentRank,
  enemyConditions,
  enemyResistances,
}: {
  skill: Skill
  fcrRange: RangedValue
  mcrRange: RangedValue
  attributes: Record<AttributeKey, RangedValue>
  stats: RangedStatMap
  skillRanksByName: Record<string, number>
  itemSkillBonuses: Record<string, [number, number]>
  currentRank: number
  enemyConditions: Record<string, boolean>
  enemyResistances: Record<string, number>
}) {
  const rank1 = skill.ranks[0]
  const baseMana = rank1?.manaCost
  const mcrMin = rangedMin(mcrRange)
  const mcrMax = rangedMax(mcrRange)
  const effectiveManaMin =
    baseMana !== undefined
      ? Math.max(0, baseMana * (1 - mcrMax / 100))
      : undefined
  const effectiveManaMax =
    baseMana !== undefined
      ? Math.max(0, baseMana * (1 - mcrMin / 100))
      : undefined
  const fcrMin = rangedMin(fcrRange)
  const fcrMax = rangedMax(fcrRange)
  const effectiveCastRateMin =
    skill.baseCastRate !== undefined
      ? skill.baseCastRate * (1 + fcrMin / 100)
      : undefined
  const effectiveCastRateMax =
    skill.baseCastRate !== undefined
      ? skill.baseCastRate * (1 + fcrMax / 100)
      : undefined

  const hasDamage =
    !!skill.damageFormula ||
    (!!skill.damagePerRank && skill.damagePerRank.length > 0)
  const damageBreakdown =
    currentRank > 0 && hasDamage
      ? computeSkillDamage(
          skill,
          currentRank,
          attributes,
          stats,
          skillRanksByName,
          itemSkillBonuses,
          enemyConditions,
          enemyResistances,
        )
      : null
  const typeLabel = skill.damageType
    ? skill.damageType.charAt(0).toUpperCase() + skill.damageType.slice(1)
    : ''
  const dmgAccent = skill.damageType
    ? DAMAGE_TYPE_ACCENT[skill.damageType]
    : 'text-text'

  return (
    <li className="bg-panel-2 border border-border rounded px-3 py-2 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-text font-medium">
          {skill.name}{' '}
          <span className="text-xs text-muted font-normal">
            · rank {currentRank}/{skill.maxRank}
          </span>
        </div>
        {hasDamage && damageBreakdown ? (
          <div className={`text-sm tabular-nums font-medium ${dmgAccent}`}>
            {formatRangeInt(damageBreakdown.finalMin, damageBreakdown.finalMax)}{' '}
            <span className="text-xs text-muted font-normal">
              {typeLabel} damage
            </span>
          </div>
        ) : hasDamage ? (
          <div className="text-xs text-muted italic">not learned</div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider">
        {skill.damageType && (
          <span
            className={`px-1.5 py-0.5 rounded border font-semibold ${DAMAGE_TYPE_CLASS[skill.damageType]}`}
          >
            {skill.damageType}
          </span>
        )}
        {skill.tags?.map((tag) => (
          <span
            key={tag}
            className="px-1.5 py-0.5 rounded border border-border bg-panel text-muted"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
        {effectiveManaMin !== undefined && effectiveManaMax !== undefined && (
          <span>
            <span className="text-text/80">
              {formatRange(effectiveManaMin, effectiveManaMax)}
            </span>{' '}
            mana
            {baseMana !== undefined && mcrMax > 0 && (
              <span className="text-muted/70"> (base {baseMana})</span>
            )}
          </span>
        )}
        {effectiveCastRateMin !== undefined &&
          effectiveCastRateMax !== undefined && (
            <span>
              <span className="text-text/80">
                {formatRange(effectiveCastRateMin, effectiveCastRateMax)}
              </span>{' '}
              casts/s
              {fcrMax > 0 && (
                <span className="text-muted/70">
                  {' '}
                  (base {formatDecimal(skill.baseCastRate!)})
                </span>
              )}
            </span>
          )}
        {skill.movementDuringUse !== undefined && (
          <span>
            Move{' '}
            <span className="text-text/80">{skill.movementDuringUse}%</span>
          </span>
        )}
        <span>
          max rank <span className="text-text/80">{skill.maxRank}</span>
        </span>
      </div>
      {hasDamage && damageBreakdown && (
        <DamageBreakdown
          skill={skill}
          breakdown={damageBreakdown}
          currentRank={currentRank}
          attributes={attributes}
          skillRanksByName={skillRanksByName}
        />
      )}
    </li>
  )
}

function DamageBreakdown({
  skill,
  breakdown,
  currentRank,
  attributes,
  skillRanksByName,
}: {
  skill: Skill
  breakdown: SkillDamageBreakdown
  currentRank: number
  attributes: Record<AttributeKey, RangedValue>
  skillRanksByName: Record<string, number>
}) {
  const synergyLines: Array<{ label: string; pctMin: number; pctMax: number }> =
    []
  for (const b of skill.bonusSources ?? []) {
    if (b.per === 'skill_level') {
      const rank = skillRanksByName[b.source.trim().toLowerCase()] ?? 0
      if (rank === 0) continue
      synergyLines.push({
        label: `${b.source} (rank ${rank})`,
        pctMin: rank * b.value,
        pctMax: rank * b.value,
      })
    } else if (b.per === 'attribute_point') {
      const attrKey = Object.keys(attributes).find(
        (k) => k.toLowerCase() === b.source.trim().toLowerCase(),
      )
      const attr = attrKey ? (attributes[attrKey] ?? 0) : 0
      const amin = rangedMin(attr)
      const amax = rangedMax(attr)
      if (amin === 0 && amax === 0) continue
      synergyLines.push({
        label: `${b.source} (${amin === amax ? amin : `${amin}-${amax}`})`,
        pctMin: amin * b.value,
        pctMax: amax * b.value,
      })
    }
  }

  const effRankLabel =
    breakdown.effectiveRankMin === breakdown.effectiveRankMax
      ? String(breakdown.effectiveRankMin)
      : `${breakdown.effectiveRankMin}-${breakdown.effectiveRankMax}`
  const rankBonusMin = breakdown.effectiveRankMin - currentRank
  const rankBonusMax = breakdown.effectiveRankMax - currentRank
  const hasRankBonus = rankBonusMin !== 0 || rankBonusMax !== 0

  return (
    <div className="mt-1 rounded border border-border bg-panel px-2.5 py-1.5 text-xs tabular-nums">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">
        Breakdown
      </div>
      <div className="space-y-0.5">
        <BDLine
          label="Effective rank"
          value={
            <>
              <span className="text-text">{effRankLabel}</span>
              {hasRankBonus && (
                <span className="text-muted">
                  {' '}
                  ({currentRank}
                  {rankBonusMin === rankBonusMax
                    ? rankBonusMin >= 0
                      ? `+${rankBonusMin}`
                      : rankBonusMin
                    : ` +${rankBonusMin}-${rankBonusMax}`}
                  )
                </span>
              )}
            </>
          }
        />
        <BDLine
          label="Base damage"
          value={
            <span className="text-text">
              {formatRange(breakdown.baseMin, breakdown.baseMax)}
            </span>
          }
        />
        {(breakdown.flatMin > 0 || breakdown.flatMax > 0) && (
          <BDLine
            label="Flat added"
            value={
              <span className="text-text">
                {formatRange(breakdown.flatMin, breakdown.flatMax)}
              </span>
            }
          />
        )}
        {synergyLines.length > 0 && (
          <>
            <div className="pt-1 text-[10px] uppercase tracking-wider text-muted">
              Synergies
            </div>
            {synergyLines.map((line, i) => (
              <BDLine
                key={i}
                label={line.label}
                indent
                value={
                  <span className="text-yellow-300">
                    +
                    {line.pctMin === line.pctMax
                      ? formatDecimal(line.pctMin)
                      : `${formatDecimal(line.pctMin)}-${formatDecimal(line.pctMax)}`}
                    %
                  </span>
                }
              />
            ))}
            <BDLine
              label="Total synergy"
              value={
                <span className="text-yellow-300">
                  +
                  {breakdown.synergyMinPct === breakdown.synergyMaxPct
                    ? formatDecimal(breakdown.synergyMinPct)
                    : `${formatDecimal(breakdown.synergyMinPct)}-${formatDecimal(breakdown.synergyMaxPct)}`}
                  %
                </span>
              }
            />
          </>
        )}
        {(breakdown.skillDamageMinPct > 0 ||
          breakdown.skillDamageMaxPct > 0) && (
          <BDLine
            label="Skill damage %"
            value={
              <span className="text-accent">
                +
                {breakdown.skillDamageMinPct === breakdown.skillDamageMaxPct
                  ? formatDecimal(breakdown.skillDamageMinPct)
                  : `${formatDecimal(breakdown.skillDamageMinPct)}-${formatDecimal(breakdown.skillDamageMaxPct)}`}
                %
              </span>
            }
          />
        )}
        {breakdown.extraDamageSources.length > 0 && (
          <>
            <div className="pt-1 text-[10px] uppercase tracking-wider text-muted">
              Extra damage
            </div>
            {breakdown.extraDamageSources.map((s, i) => (
              <BDLine
                key={i}
                indent
                label={s.label}
                value={
                  <span className="text-orange-300">
                    +{formatDecimal(s.pct)}%
                  </span>
                }
              />
            ))}
          </>
        )}
        {(breakdown.enemyResistancePct !== 0 ||
          breakdown.resistanceIgnoredPct !== 0) && (
          <BDLine
            label="Enemy resistance"
            value={
              <span
                className={
                  breakdown.effectiveResistancePct > 0
                    ? 'text-stat-red'
                    : 'text-stat-green'
                }
              >
                ×{breakdown.resistanceMultiplier.toFixed(2)}
                <span className="text-muted ml-1">
                  ({formatDecimal(breakdown.enemyResistancePct)}%
                  {breakdown.resistanceIgnoredPct > 0 &&
                    ` × (1 − ${formatDecimal(breakdown.resistanceIgnoredPct)}%)`}
                  {' = '}
                  {formatDecimal(breakdown.effectiveResistancePct)}%)
                </span>
              </span>
            }
          />
        )}
        <BDLine
          label="Hit damage"
          value={
            <span className="text-text font-semibold">
              {formatRangeInt(breakdown.hitMin, breakdown.hitMax)}
            </span>
          }
        />
        {breakdown.critChance > 0 && (
          <>
            <BDLine
              label={`Crit (${formatDecimal(breakdown.critChance)}% × +${formatDecimal(breakdown.critDamagePct)}%)`}
              value={
                <span className="text-yellow-300">
                  {formatRangeInt(breakdown.critMin, breakdown.critMax)}
                </span>
              }
            />
            <BDLine
              label="Average hit"
              value={
                <span className="text-accent font-semibold">
                  {formatRangeInt(breakdown.avgMin, breakdown.avgMax)}
                </span>
              }
            />
          </>
        )}
      </div>
    </div>
  )
}

function WeaponDamagePanel({
  breakdown,
}: {
  breakdown: WeaponDamageBreakdown
}) {
  if (!breakdown.hasWeapon) {
    return (
      <div className="mt-3 pt-2 border-t border-border text-xs text-muted text-center italic">
        Equip a weapon to see physical attack damage
      </div>
    )
  }
  const b = breakdown
  const edRange =
    b.enhancedDamageMinPct === b.enhancedDamageMaxPct
      ? `${formatDecimal(b.enhancedDamageMinPct)}`
      : `${formatDecimal(b.enhancedDamageMinPct)}-${formatDecimal(b.enhancedDamageMaxPct)}`
  const atkDmgRange =
    b.attackDamageMinPct === b.attackDamageMaxPct
      ? `${formatDecimal(b.attackDamageMinPct)}`
      : `${formatDecimal(b.attackDamageMinPct)}-${formatDecimal(b.attackDamageMaxPct)}`
  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">
        Weapon Attack · {b.weaponName}
      </div>
      <div className="space-y-0.5 text-xs tabular-nums">
        <BDLine
          label="Weapon damage"
          value={
            <span className="text-text">
              {formatRangeInt(b.weaponDamageMin, b.weaponDamageMax)}
            </span>
          }
        />
        {(b.enhancedDamageMaxPct > 0) && (
          <BDLine
            label="Enhanced damage"
            value={<span className="text-yellow-300">+{edRange}%</span>}
          />
        )}
        {(b.additivePhysicalMax > 0) && (
          <BDLine
            label="Additive physical"
            value={
              <span className="text-text">
                +{formatRangeInt(b.additivePhysicalMin, b.additivePhysicalMax)}
              </span>
            }
          />
        )}
        {b.attackDamageMaxPct > 0 && (
          <BDLine
            label="Attack damage %"
            value={<span className="text-accent">+{atkDmgRange}%</span>}
          />
        )}
        {b.extraDamageSources.length > 0 && (
          <>
            <div className="pt-1 text-[10px] uppercase tracking-wider text-muted">
              Extra damage
            </div>
            {b.extraDamageSources.map((s, i) => (
              <BDLine
                key={i}
                indent
                label={s.label}
                value={
                  <span className="text-orange-300">
                    +{formatDecimal(s.pct)}%
                  </span>
                }
              />
            ))}
          </>
        )}
        <BDLine
          label="Hit damage"
          value={
            <span className="text-text font-semibold">
              {formatRangeInt(b.hitMin, b.hitMax)}
            </span>
          }
        />
        {b.critChance > 0 && (
          <>
            <BDLine
              label={`Crit (${formatDecimal(b.critChance)}% × +${formatDecimal(b.critDamagePct)}%)`}
              value={
                <span className="text-yellow-300">
                  {formatRangeInt(b.critMin, b.critMax)}
                </span>
              }
            />
            <BDLine
              label="Average hit"
              value={
                <span className="text-accent font-semibold">
                  {formatRangeInt(b.avgMin, b.avgMax)}
                </span>
              }
            />
          </>
        )}
        <BDLine
          label="Attacks / sec"
          value={
            <span className="text-text">
              {formatRange(b.attacksPerSecondMin, b.attacksPerSecondMax)}
            </span>
          }
        />
        <BDLine
          label="DPS"
          value={
            <span className="text-text font-semibold">
              {formatRangeInt(b.dpsMin, b.dpsMax)}
            </span>
          }
        />
      </div>
    </div>
  )
}

function BDLine({
  label,
  value,
  indent,
}: {
  label: string
  value: React.ReactNode
  indent?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-muted ${indent ? 'pl-3' : ''}`}>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function formatDecimal(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(2)
}

function formatRange(min: number, max: number): string {
  if (min === max) return formatDecimal(min)
  return `${formatDecimal(min)}-${formatDecimal(max)}`
}

function formatRangeInt(min: number, max: number): string {
  if (min === max) return String(min)
  return `${min}-${max}`
}

function displayRange(min: number, max: number): string {
  if (min === max) return String(min)
  return `${min}–${max}`
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <h3 className="text-sm font-semibold tracking-wider uppercase text-muted mb-3">
        {title}
      </h3>
      {children}
    </div>
  )
}
