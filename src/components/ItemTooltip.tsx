import { useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  detectRuneword,
  getAffix,
  getGem,
  getItem,
  getItemSet,
  getRune,
} from '../data'
import { RAINBOW_MULTIPLIER, useBuild } from '../store/build'
import type {
  CustomStat,
  EquippedItem,
  Inventory,
  ItemBase,
  ItemRarity,
  SlotKey,
  StatMap,
} from '../types'
import {
  computeBuildStats,
  computeWeaponDamage,
  formatValue,
  isZero,
  rangedMax,
  rangedMin,
  rolledAffixValue,
  statName,
} from '../utils/stats'
import Tooltip, {
  TooltipFooter,
  TooltipHeader,
  TooltipSection,
} from './Tooltip'
import { TONE_BORDER, TONE_GLOW, TONE_RGB, TONE_TEXT } from './tooltip-tones'
import type { CSSProperties } from 'react'
import type { TooltipTone } from './tooltip-tones'

const RARITY_TONE: Record<ItemRarity, TooltipTone> = {
  common: 'common',
  uncommon: 'uncommon',
  rare: 'rare',
  mythic: 'mythic',
  satanic: 'satanic',
  heroic: 'heroic',
  angelic: 'angelic',
  satanic_set: 'satanic_set',
  unholy: 'unholy',
  relic: 'relic',
}

const RARITY_LABEL: Record<ItemRarity, string> = {
  common: 'Common',
  uncommon: 'Superior',
  rare: 'Rare',
  mythic: 'Mythic',
  satanic: 'Satanic',
  heroic: 'Heroic',
  angelic: 'Angelic',
  satanic_set: 'Satanic Set',
  unholy: 'Unholy',
  relic: 'Relic',
}

const TRIGGER_LABEL: Record<string, string> = {
  on_hit: 'on Hit',
  when_struck: 'when Struck',
  on_kill: 'on Kill',
  on_cast: 'on Cast',
  on_block: 'on Block',
  on_death: 'on Death',
  aura: 'Aura:',
  passive: '',
}

interface Props {
  equipped: EquippedItem
  children: ReactNode
  placement?: 'right' | 'left' | 'top' | 'bottom'
  className?: string
}

export default function ItemTooltip({
  equipped,
  children,
  placement = 'right',
  className,
}: Props) {
  const base = getItem(equipped.baseId)
  if (!base) return <>{children}</>

  const runeword = detectRuneword(base, equipped.socketed)
  const tone: TooltipTone = runeword ? 'rare' : RARITY_TONE[base.rarity]

  return (
    <Tooltip
      tone={tone}
      placement={placement}
      className={className}
      content={<ItemTooltipBody equipped={equipped} base={base} />}
    >
      {children}
    </Tooltip>
  )
}

export function ItemTooltipBody({
  equipped,
  base,
  compareWith,
  compareSlotKey,
}: {
  equipped?: EquippedItem
  base: ItemBase
  compareWith?: EquippedItem
  compareSlotKey?: SlotKey
}) {
  const inventory = useBuild((s) => s.inventory)

  const runeword = equipped ? detectRuneword(base, equipped.socketed) : undefined
  const tone: TooltipTone = runeword ? 'rare' : RARITY_TONE[base.rarity]
  const set = base.setId ? getItemSet(base.setId) : undefined
  const setEquippedCount = base.setId
    ? Object.values(inventory).reduce((acc, eq) => {
        if (!eq) return acc
        const b = getItem(eq.baseId)
        return b?.setId === base.setId ? acc + 1 : acc
      }, 0)
    : 0

  const subtitle = runeword
    ? `Runeword · ${base.baseType}`
    : `${RARITY_LABEL[base.rarity]} · ${base.baseType}`

  const hasBaseStats =
    base.defenseMin !== undefined ||
    base.damageMin !== undefined ||
    base.blockChance !== undefined ||
    base.attackSpeed !== undefined

  const implicitEntries = base.implicit
    ? Object.entries(base.implicit).filter(([, v]) => !isZero(v))
    : []
  const skillBonusEntries = base.skillBonuses
    ? Object.entries(base.skillBonuses)
    : []
  const runewordEntries = runeword
    ? Object.entries(runeword.stats).filter(([, v]) => v !== 0)
    : []

  const socketStats = equipped ? collectSocketStats(equipped) : []

  const requiresLevel = runeword?.requiresLevel ?? base.requiresLevel
  const footerBits: string[] = []
  if (requiresLevel !== undefined) footerBits.push(`Req Level ${requiresLevel}`)
  if (base.itemLevel) footerBits.push(`iLvl ${base.itemLevel}`)
  if (base.grade) footerBits.push(`Tier ${base.grade}`)

  const equippedAffixes = equipped?.affixes ?? []

  return (
    <>
      <TooltipHeader
        tone={tone}
        title={runeword ? runeword.name : base.name}
        subtitle={subtitle}
      />

      {hasBaseStats && (
        <TooltipSection>
          <BaseStats base={base} />
        </TooltipSection>
      )}

      {(implicitEntries.length > 0 || skillBonusEntries.length > 0) && (
        <TooltipSection>
          <ul className="space-y-0.5 text-[12px]">
            {implicitEntries.map(([key, value]) => (
              <li key={`impl-${key}`} className="text-accent-hot">
                {formatValue(value, key)} {statName(key)}
              </li>
            ))}
            {skillBonusEntries.map(([skill, val]) => (
              <li key={`skill-${skill}`} className="text-accent-hot">
                {formatValue(val, '')} to {skill}
              </li>
            ))}
          </ul>
        </TooltipSection>
      )}

      {runewordEntries.length > 0 && (
        <TooltipSection>
          <ul className="space-y-0.5 text-[12px]">
            {runewordEntries.map(([key, val]) => (
              <li key={`rw-${key}`} className="text-accent-hot">
                {formatValue(val as number, key)} {statName(key)}
              </li>
            ))}
          </ul>
        </TooltipSection>
      )}

      {equippedAffixes.length > 0 && (
        <TooltipSection>
          <ul className="space-y-0.5 text-[12px]">
            {equippedAffixes.map((eq, idx) => {
              const affix = getAffix(eq.affixId)
              if (!affix) return null
              if (!affix.statKey) {
                return (
                  <li key={idx} className="text-yellow-300/90 italic">
                    {affix.description}
                  </li>
                )
              }
              const descNoValue = affix.description
                .replace(/^[+-]?\[?[^\]]*\]?\s*/, '')
                .replace(/\s+/g, ' ')
                .trim()
              return (
                <li key={idx} className="text-yellow-300">
                  {formatAffixValue(affix, eq.roll)} {descNoValue}
                </li>
              )
            })}
          </ul>
        </TooltipSection>
      )}

      {socketStats.length > 0 && (
        <TooltipSection>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted mb-1">
            From Sockets
          </div>
          <ul className="space-y-0.5 text-[12px]">
            {socketStats.map(([k, v]) => (
              <li key={k} className="text-accent">
                {formatValue(v, k)} {statName(k)}
              </li>
            ))}
          </ul>
        </TooltipSection>
      )}

      {set && set.bonuses.length > 0 && (
        <TooltipSection>
          <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.12em] mb-1">
            <span className="text-green-400">{set.name}</span>
            <span className="text-muted">
              {setEquippedCount}/{set.items.length} pieces
            </span>
          </div>
          <ul className="space-y-1">
            {set.bonuses.map((bonus, idx) => {
              const active = setEquippedCount >= bonus.pieces
              return (
                <li
                  key={idx}
                  className={`text-[11px] ${active ? 'text-green-300' : 'text-muted/70'}`}
                >
                  <div className="text-[10px] uppercase tracking-[0.12em]">
                    {bonus.pieces}-Set {active ? '(active)' : ''}
                  </div>
                  <ul className="ml-1 space-y-0.5">
                    {(bonus.descriptions ?? []).map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        </TooltipSection>
      )}

      {base.procs && base.procs.length > 0 && (
        <TooltipSection>
          <ul className="space-y-1.5 text-[12px]">
            {base.procs.map((p, idx) => (
              <li key={idx} className="text-emerald-300">
                {p.chance !== undefined && (
                  <span className="font-medium">{p.chance}% </span>
                )}
                <span>
                  {TRIGGER_LABEL[p.trigger]
                    ? `Chance ${TRIGGER_LABEL[p.trigger]} to `
                    : ''}
                  {p.description}
                </span>
                {p.details && (
                  <div className="text-[10px] text-muted uppercase tracking-[0.12em] leading-relaxed mt-0.5">
                    {p.details}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </TooltipSection>
      )}

      {base.uniqueEffects && base.uniqueEffects.length > 0 && (
        <TooltipSection>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted mb-1">
            Not Yet Supported
          </div>
          <ul className="space-y-0.5 text-[12px]">
            {base.uniqueEffects.map((effect, idx) => (
              <li key={idx} className={`${TONE_TEXT.angelic} opacity-70`}>
                {effect}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted/70 italic mt-1">
            These mods are not yet calculated by the planner.
          </p>
        </TooltipSection>
      )}

      {(base.description || base.flavor) && (
        <TooltipSection>
          {base.description && (
            <p className="text-[11px] text-muted italic">
              {base.description}
            </p>
          )}
          {base.flavor && (
            <p className="text-[11px] italic text-muted/70 leading-relaxed mt-1">
              {base.flavor}
            </p>
          )}
        </TooltipSection>
      )}

      {compareWith && (
        <NetChangeSection
          equipped={equipped}
          base={base}
          compareWith={compareWith}
          slotKey={compareSlotKey}
        />
      )}

      {footerBits.length > 0 && (
        <TooltipFooter>{footerBits.join(' · ')}</TooltipFooter>
      )}
    </>
  )
}

function aggregateItemStats(
  base: ItemBase,
  equipped: EquippedItem | undefined,
): Record<string, number> {
  const out: Record<string, number> = {}
  const add = (k: string, v: number) => {
    if (v === 0) return
    out[k] = (out[k] ?? 0) + v
  }

  if (base.implicit) {
    for (const [k, v] of Object.entries(base.implicit)) {
      add(k, (rangedMin(v) + rangedMax(v)) / 2)
    }
  }

  if (!equipped) return out

  for (const eq of equipped.affixes) {
    const affix = getAffix(eq.affixId)
    if (!affix?.statKey) continue
    add(affix.statKey, rolledAffixValue(affix, eq.roll))
  }

  const runeword = detectRuneword(base, equipped.socketed)
  if (runeword) {
    for (const [k, v] of Object.entries(runeword.stats)) add(k, v)
  } else {
    for (let i = 0; i < equipped.socketed.length; i++) {
      const id = equipped.socketed[i]
      if (!id) continue
      const source = getGem(id) ?? getRune(id)
      if (!source) continue
      const mult =
        equipped.socketTypes[i] === 'rainbow' ? RAINBOW_MULTIPLIER : 1
      for (const [k, v] of Object.entries(source.stats)) add(k, v * mult)
    }
  }

  return out
}

function DiffRow({
  diffKey,
  diff,
  direction,
}: {
  diffKey: string
  diff: number
  direction: 'up' | 'down'
}) {
  const colorClass = direction === 'up' ? 'text-stat-green' : 'text-stat-red'
  const arrow = direction === 'up' ? '▲' : '▼'
  return (
    <li className="flex items-baseline justify-between gap-2">
      <span className="text-muted min-w-0 break-words leading-tight">
        {statName(diffKey)}
      </span>
      <span
        className={`font-mono tabular-nums whitespace-nowrap shrink-0 ${colorClass}`}
      >
        {arrow} {formatValue(diff, diffKey)}
      </span>
    </li>
  )
}

function NetChangeSection({
  equipped,
  base,
  compareWith,
  slotKey,
}: {
  equipped: EquippedItem | undefined
  base: ItemBase
  compareWith: EquippedItem
  slotKey?: SlotKey
}) {
  const classId = useBuild((s) => s.classId)
  const level = useBuild((s) => s.level)
  const allocated = useBuild((s) => s.allocated)
  const inventory = useBuild((s) => s.inventory)
  const skillRanks = useBuild((s) => s.skillRanks)
  const activeAuraId = useBuild((s) => s.activeAuraId)
  const activeBuffs = useBuild((s) => s.activeBuffs)
  const enemyConditions = useBuild((s) => s.enemyConditions)
  const customStats = useBuild((s) => s.customStats)
  const allocatedTreeNodes = useBuild((s) => s.allocatedTreeNodes)

  const beforeBase = getItem(compareWith.baseId)

  const diffs = useMemo(() => {
    if (!beforeBase) return []
    const before = aggregateItemStats(beforeBase, compareWith)
    const after = aggregateItemStats(base, equipped)
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])
    const out: Array<{ key: string; diff: number }> = []
    for (const key of allKeys) {
      const d = (after[key] ?? 0) - (before[key] ?? 0)
      if (Math.abs(d) < 0.01) continue
      out.push({ key, diff: d })
    }
    out.sort((a, b) => b.diff - a.diff)
    return out
  }, [beforeBase, compareWith, base, equipped])

  const dpsRow = useMemo(() => {
    if (!slotKey) return null
    return computeDpsDelta(
      {
        classId,
        level,
        allocated,
        inventory,
        skillRanks,
        activeAuraId,
        activeBuffs,
        enemyConditions,
        customStats,
        allocatedTreeNodes,
      },
      slotKey,
      base,
    )
  }, [
    slotKey,
    base,
    classId,
    level,
    allocated,
    inventory,
    skillRanks,
    activeAuraId,
    activeBuffs,
    enemyConditions,
    customStats,
    allocatedTreeNodes,
  ])

  if (!beforeBase) return null

  const positives = diffs.filter((d) => d.diff > 0)
  const negatives = diffs.filter((d) => d.diff < 0)
  const hasDpsRow = dpsRow !== null && dpsRow.hasWeapon

  if (diffs.length === 0 && !hasDpsRow) {
    return (
      <TooltipSection>
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted mb-1">
          Net Change
        </div>
        <p className="text-[11px] text-faint italic">No stat changes</p>
      </TooltipSection>
    )
  }

  return (
    <TooltipSection>
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted mb-1">
        Net Change
      </div>
      {diffs.length > 0 && (
        <ul className="space-y-0.5 text-[12px]">
          {positives.map(({ key, diff }) => (
            <DiffRow
              key={`up-${key}`}
              diffKey={key}
              diff={diff}
              direction="up"
            />
          ))}
          {negatives.map(({ key, diff }) => (
            <DiffRow
              key={`dn-${key}`}
              diffKey={key}
              diff={diff}
              direction="down"
            />
          ))}
        </ul>
      )}
      {hasDpsRow && (
        <div className="mt-1.5 pt-1.5 border-t border-border/60">
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="text-muted">DPS</span>
            {Math.abs(dpsRow!.diffAvg) < 0.5 ? (
              <span className="font-mono tabular-nums whitespace-nowrap shrink-0 text-faint">
                = no change
              </span>
            ) : (
              <span
                className={`font-mono tabular-nums whitespace-nowrap shrink-0 ${
                  dpsRow!.diffAvg > 0 ? 'text-stat-green' : 'text-stat-red'
                }`}
              >
                {dpsRow!.diffAvg > 0 ? '▲' : '▼'}{' '}
                {formatDpsValue(Math.abs(dpsRow!.diffAvg))}
              </span>
            )}
          </div>
          <div className="text-[10px] text-faint tabular-nums mt-0.5 text-right">
            {formatDpsValue(dpsRow!.beforeAvg)} →{' '}
            {formatDpsValue(dpsRow!.afterAvg)}
          </div>
        </div>
      )}
    </TooltipSection>
  )
}

function formatDpsValue(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  const rounded = Math.round(n)
  return rounded.toLocaleString('en-US')
}

function computeDpsDelta(
  state: {
    classId: string | null
    level: number
    allocated: Record<string, number>
    inventory: Inventory
    skillRanks: Record<string, number>
    activeAuraId: string | null
    activeBuffs: Record<string, boolean>
    enemyConditions: Record<string, boolean>
    customStats: CustomStat[]
    allocatedTreeNodes: Set<number>
  },
  slotKey: SlotKey,
  prospectBase: ItemBase,
): { beforeAvg: number; afterAvg: number; diffAvg: number; hasWeapon: boolean } | null {
  const computeForInventory = (
    inv: Inventory,
  ): { avg: number; hasWeapon: boolean } => {
    const built = computeBuildStats(
      state.classId,
      state.level,
      state.allocated,
      inv,
      state.skillRanks,
      state.activeAuraId,
      state.activeBuffs,
      state.customStats,
      state.allocatedTreeNodes,
    )
    const dps = computeWeaponDamage(inv, built.stats, state.enemyConditions)
    return {
      avg: (dps.dpsMin + dps.dpsMax) / 2,
      hasWeapon: dps.hasWeapon,
    }
  }

  const synthetic: EquippedItem = {
    baseId: prospectBase.id,
    affixes: [],
    socketCount: prospectBase.sockets ?? 0,
    socketed: Array(prospectBase.sockets ?? 0).fill(null),
    socketTypes: Array(prospectBase.sockets ?? 0).fill('normal'),
  }

  const replaced: Inventory = { ...state.inventory, [slotKey]: synthetic }

  const before = computeForInventory(state.inventory)
  const after = computeForInventory(replaced)

  if (!before.hasWeapon && !after.hasWeapon) return null
  return {
    beforeAvg: before.avg,
    afterAvg: after.avg,
    diffAvg: after.avg - before.avg,
    hasWeapon: before.hasWeapon || after.hasWeapon,
  }
}

export type CompareState = 'equipped' | 'selected'

export function ItemCard({
  equipped,
  base,
  arcLabel,
  state,
  compareWith,
  compareSlotKey,
  className,
}: {
  equipped?: EquippedItem
  base: ItemBase | undefined
  /** Text shown inside the banner arc (e.g. "Equipped", "Upgrade"). */
  arcLabel?: ReactNode
  /** Visual state controlling banner arc + border color. */
  state?: CompareState
  /** When set, renders a Net Change section comparing this item to it. */
  compareWith?: EquippedItem
  /** Which inventory slot the comparison is for (drives DPS recompute). */
  compareSlotKey?: SlotKey
  className?: string
}) {
  const stateClass = state ? `compare-card is-${state}` : ''

  if (!base) {
    return (
      <div
        className={`relative bg-panel border border-dashed border-border rounded-[4px] ${stateClass} ${className ?? ''}`}
      >
        {state && arcLabel && (
          <div className="compare-arc" style={arcStyle('neutral')}>
            {arcLabel}
          </div>
        )}
        <div className="flex items-center justify-center text-center px-3 py-6">
          <p className="text-[11px] text-faint italic">empty slot</p>
        </div>
      </div>
    )
  }
  const runeword = equipped ? detectRuneword(base, equipped.socketed) : undefined
  const tone: TooltipTone = runeword ? 'rare' : RARITY_TONE[base.rarity]
  const overflow = state ? '' : 'overflow-hidden'

  return (
    <div
      className={`relative bg-panel border ${TONE_BORDER[tone]} ${TONE_GLOW[tone]} rounded-[4px] ${overflow} ${stateClass} ${className ?? ''}`}
    >
      {state && arcLabel && (
        <div className="compare-arc" style={arcStyle(tone)}>
          {arcLabel}
        </div>
      )}
      <ItemTooltipBody
        equipped={equipped}
        base={base}
        compareWith={compareWith}
        compareSlotKey={compareSlotKey}
      />
    </div>
  )
}

function arcStyle(tone: TooltipTone): CSSProperties {
  const rgb = TONE_RGB[tone]
  return {
    '--arc-text': `rgb(${rgb})`,
    '--arc-border': `rgba(${rgb}, 0.6)`,
    // Solid dark base + subtle rarity tint so text behind never bleeds through.
    '--arc-bg': `color-mix(in srgb, rgb(${rgb}) 18%, #14151b)`,
  } as CSSProperties
}

function BaseStats({ base }: { base: ItemBase }) {
  const rows: { label: string; value: string }[] = []
  if (base.defenseMin !== undefined && base.defenseMax !== undefined) {
    rows.push({
      label: 'Defense',
      value: `${base.defenseMin}–${base.defenseMax}`,
    })
  }
  if (base.damageMin !== undefined && base.damageMax !== undefined) {
    rows.push({
      label: 'Damage',
      value: `${base.damageMin}–${base.damageMax}`,
    })
  }
  if (base.blockChance !== undefined) {
    rows.push({ label: 'Block', value: `${base.blockChance}%` })
  }
  if (base.attackSpeed !== undefined) {
    rows.push({ label: 'Attacks / sec', value: `${base.attackSpeed}` })
  }
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] tabular-nums">
      {rows.map((r) => (
        <li key={r.label} className="contents">
          <span className="text-muted">{r.label}</span>
          <span className="text-text text-right font-medium">{r.value}</span>
        </li>
      ))}
    </ul>
  )
}

function collectSocketStats(equipped: EquippedItem): [string, number][] {
  const stats: StatMap = {}
  for (let i = 0; i < equipped.socketed.length; i++) {
    const id = equipped.socketed[i]
    if (!id) continue
    const source = getGem(id) ?? getRune(id)
    if (!source) continue
    const mult = equipped.socketTypes[i] === 'rainbow' ? RAINBOW_MULTIPLIER : 1
    for (const [k, v] of Object.entries(source.stats)) {
      stats[k] = (stats[k] ?? 0) + v * mult
    }
  }
  return Object.entries(stats).filter(([, v]) => v !== 0)
}

function formatAffixValue(
  affix: {
    sign: '+' | '-'
    format: 'flat' | 'percent'
    valueMin: number | null
    valueMax: number | null
  },
  roll: number,
): string {
  if (affix.valueMin === null || affix.valueMax === null) return affix.sign
  const signed = rolledAffixValue(affix, roll)
  const abs = Math.abs(signed)
  const num = Number.isInteger(abs) ? abs : Math.round(abs * 100) / 100
  const sign = signed < 0 ? '-' : '+'
  const suffix = affix.format === 'percent' ? '%' : ''
  return `${sign}${num}${suffix}`
}

export { RARITY_TONE, RARITY_LABEL }
