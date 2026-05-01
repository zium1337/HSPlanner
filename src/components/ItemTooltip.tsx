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
import type { EquippedItem, ItemBase, ItemRarity, StatMap } from '../types'
import {
  formatValue,
  isZero,
  rolledAffixValue,
  statName,
} from '../utils/stats'
import Tooltip, {
  TooltipFooter,
  TooltipHeader,
  TooltipSection,
} from './Tooltip'
import { TONE_TEXT } from './tooltip-tones'
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
  const inventory = useBuild((s) => s.inventory)
  const base = getItem(equipped.baseId)
  if (!base) return <>{children}</>

  const runeword = detectRuneword(base, equipped.socketed)
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

  const socketStats = collectSocketStats(equipped)

  const requiresLevel = runeword?.requiresLevel ?? base.requiresLevel
  const footerBits: string[] = []
  if (requiresLevel !== undefined) footerBits.push(`Req Level ${requiresLevel}`)
  if (base.itemLevel) footerBits.push(`iLvl ${base.itemLevel}`)
  if (base.grade) footerBits.push(`Tier ${base.grade}`)

  return (
    <Tooltip
      tone={tone}
      placement={placement}
      className={className}
      content={
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

          {equipped.affixes.length > 0 && (
            <TooltipSection>
              <ul className="space-y-0.5 text-[12px]">
                {equipped.affixes.map((eq, idx) => {
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
              <ul className="space-y-0.5 text-[12px]">
                {base.uniqueEffects.map((effect, idx) => (
                  <li key={idx} className={TONE_TEXT.angelic}>
                    {effect}
                  </li>
                ))}
              </ul>
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

          {footerBits.length > 0 && (
            <TooltipFooter>{footerBits.join(' · ')}</TooltipFooter>
          )}
        </>
      }
    >
      {children}
    </Tooltip>
  )
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
