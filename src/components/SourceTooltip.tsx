import type { ReactNode } from 'react'
import { FORGE_KIND_LABEL } from '../data'
import type { ForgeKind } from '../data'
import { formatValue } from '../utils/stats'
import type { SourceContribution, SourceType } from '../utils/stats'

const SOURCE_COLOR: Record<SourceType, string> = {
  class: 'text-text/70',
  allocated: 'text-accent',
  level: 'text-muted',
  attribute: 'text-emerald-400',
  item: 'text-cyan-400',
  socket: 'text-pink-400',
  skill: 'text-yellow-300',
  custom: 'text-orange-400',
  tree: 'text-amber-400',
}

const SOURCE_LABEL: Record<SourceType, string> = {
  class: 'Class',
  allocated: 'Allocated',
  level: 'Level',
  attribute: 'Attribute',
  item: 'Item',
  socket: 'Socket',
  skill: 'Skill',
  custom: 'Config',
  tree: 'Tree',
}

const FORGE_COLOR: Record<ForgeKind, string> = {
  satanic_crystal: 'text-red-300',
}

interface Props {
  statKey: string
  sources: SourceContribution[]
  moreSources?: SourceContribution[]
  children: ReactNode
}

function orderSources(sources: SourceContribution[]): SourceContribution[] {
  // Reorders a flat list of source contributions so each item-source is immediately followed by its forged crystal mod children, with any orphaned forged mods appended at the end. Used by SourceTooltip to render the parent/child indented layout.
  const forgedByParent = new Map<string, SourceContribution[]>()
  for (const s of sources) {
    if (!s.forge) continue
    const list = forgedByParent.get(s.forge.itemName) ?? []
    list.push(s)
    forgedByParent.set(s.forge.itemName, list)
  }
  if (forgedByParent.size === 0) return sources

  const out: SourceContribution[] = []
  const consumed = new Set<SourceContribution>()
  for (const s of sources) {
    if (s.forge) continue
    out.push(s)
    if (s.sourceType !== 'item') continue
    const children = forgedByParent.get(s.label)
    if (!children) continue
    for (const c of children) {
      if (consumed.has(c)) continue
      out.push(c)
      consumed.add(c)
    }
  }
  for (const s of sources) {
    if (s.forge && !consumed.has(s)) out.push(s)
  }
  return out
}

function SourceItem({
  s,
  statKey,
  index,
}: {
  s: SourceContribution
  statKey: string
  index: number
}) {
  // Renders a single contribution row inside the tooltip: an indented "Forged modifier" entry when the source carries forge metadata, or a normal "tag · label · value" row for everything else. Used by SourceTooltip's list rendering.
  if (s.forge) {
    const color = FORGE_COLOR[s.forge.kind]
    return (
      <li
        key={index}
        className="flex items-baseline justify-between gap-2 leading-[1.5] pl-3"
      >
        <span className="flex items-baseline gap-1 min-w-0">
          <span className="text-text/40 shrink-0">⤷</span>
          <span className={`shrink-0 italic ${color}`}>Forged modifier</span>
          <span className="text-text/60 truncate">
            ({FORGE_KIND_LABEL[s.forge.kind]})
          </span>
        </span>
        <span className="font-mono tabular-nums shrink-0 text-accent-hot">
          {formatValue(s.value, statKey)}
        </span>
      </li>
    )
  }
  return (
    <li
      key={index}
      className="flex items-baseline justify-between gap-2 leading-[1.5]"
    >
      <span className="flex items-baseline gap-1.5 min-w-0">
        <span
          className={`text-[9px] uppercase tracking-wider shrink-0 ${SOURCE_COLOR[s.sourceType]}`}
        >
          {SOURCE_LABEL[s.sourceType]}
        </span>
        <span className="text-text/80 truncate">{s.label}</span>
      </span>
      <span className="font-mono tabular-nums shrink-0 text-accent-hot">
        {formatValue(s.value, statKey)}
      </span>
    </li>
  )
}

function sectionLabel(text: string, trailing?: string) {
  // Renders the gold sub-section bar inside the tooltip with an optional right-aligned trailing string (e.g. a subtotal). Used by SourceTooltip to separate the "Additive" and "Multiplicative (Total)" groups.
  return (
    <div className="flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-hot/80 bg-accent-deep/10 border-b border-border/40">
      <span>{text}</span>
      {trailing && (
        <span className="font-mono normal-case text-text/70 tracking-normal">
          {trailing}
        </span>
      )}
    </div>
  )
}

function sumRangePct(sources: SourceContribution[]): [number, number] {
  // Sums a list of source contributions into a single `[min, max]` percentage range. Used to compute the additive and multiplicative subtotals shown in the tooltip's section bars.
  let min = 0
  let max = 0
  for (const s of sources) {
    const [smin, smax] =
      typeof s.value === 'number' ? [s.value, s.value] : s.value
    min += smin
    max += smax
  }
  return [min, max]
}

function fmtSubtotal([min, max]: [number, number]): string {
  // Formats an additive subtotal range as a signed percentage (e.g. "+12%" or "+12–18%"). Used by SourceTooltip's "Additive" section header.
  const round = (n: number) =>
    Number.isInteger(n) ? n : Math.round(n * 100) / 100
  if (min === max) return `${min >= 0 ? '+' : ''}${round(min)}%`
  return `${min >= 0 ? '+' : ''}${round(min)}–${round(max)}%`
}

function fmtMult([min, max]: [number, number]): string {
  // Formats a Total / multiplicative range as a `×N` (or `×A–B`) multiplier string. Used by SourceTooltip's "Multiplicative" section header so the user can see the effective multiplier at a glance.
  const round = (n: number) => Math.round(n * 1000) / 1000
  const a = round(1 + min / 100)
  const b = round(1 + max / 100)
  if (a === b) return `×${a}`
  return `×${a}–${b}`
}

export default function SourceTooltip({
  statKey,
  sources,
  moreSources,
  children,
}: Props) {
  // Renders a hover-only popover next to its child element that breaks down a stat into its individual contributions, optionally split into Additive vs Multiplicative (Total) sections with subtotals. Used by the StatsView and weapon-damage panels to explain how each displayed value is computed.
  const hasMore = !!moreSources && moreSources.length > 0
  if (sources.length === 0 && !hasMore) return <>{children}</>
  const orderedAdd = orderSources(sources)
  const orderedMore = hasMore ? orderSources(moreSources!) : []
  const addSubtotal = sumRangePct(sources)
  const moreSubtotal = hasMore ? sumRangePct(moreSources!) : ([0, 0] as [number, number])
  return (
    <div className="relative group">
      <div className="cursor-help">{children}</div>
      <div
        className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity absolute right-0 top-full mt-1 z-50 w-80 bg-panel border border-accent-deep/60 rounded-[4px] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.8)] text-xs pointer-events-none"
      >
        <div
          className="px-3 py-1.5 border-b border-border/70"
          style={{
            background:
              'linear-gradient(180deg, rgba(201,165,90,0.14), rgba(201,165,90,0.04))',
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-hot">
            Sources
          </div>
        </div>
        {hasMore ? (
          <>
            {sectionLabel('Additive (+)', fmtSubtotal(addSubtotal))}
            <ul className="px-3 py-2 space-y-1">
              {orderedAdd.length === 0 ? (
                <li className="text-text/40 italic">No additive sources</li>
              ) : (
                orderedAdd.map((s, i) => (
                  <SourceItem key={i} s={s} statKey={statKey} index={i} />
                ))
              )}
            </ul>
            {sectionLabel('Multiplicative (Total)', fmtMult(moreSubtotal))}
            <ul className="px-3 py-2 space-y-1">
              {orderedMore.map((s, i) => (
                <SourceItem key={i} s={s} statKey={statKey} index={i} />
              ))}
            </ul>
          </>
        ) : (
          <ul className="px-3 py-2 space-y-1">
            {orderedAdd.map((s, i) => (
              <SourceItem key={i} s={s} statKey={statKey} index={i} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
