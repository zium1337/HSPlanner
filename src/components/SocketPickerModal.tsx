import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { gems, runes } from '../data'
import { RAINBOW_MULTIPLIER } from '../store/build'
import { formatValue, statName } from '../utils/stats'
import Tooltip, {
  TooltipFooter,
  TooltipHeader,
  TooltipSection,
  TooltipSectionHeader,
} from './Tooltip'
import type { Gem, Rune, SocketType, StatMap } from '../types'

const SOCKETABLE_ICONS = import.meta.glob<string>(
  '../assets/socketable/*.png',
  { eager: true, query: '?url', import: 'default' },
)
const ICON_BY_NAME: Record<string, string> = {}
for (const [p, url] of Object.entries(SOCKETABLE_ICONS)) {
  const file = p.split('/').pop() ?? ''
  const key = file.replace(/_spr\.png$/i, '').replace(/_/g, ' ')
  ICON_BY_NAME[key.toLowerCase()] = url
}
function iconForName(name: string): string | undefined {
  return ICON_BY_NAME[name.toLowerCase()]
}

const GEM_COLOR: Record<string, string> = {
  amethyst: '#c97acc',
  diamond: '#d4cfbf',
  emerald: '#74c98a',
  ruby: '#d96b5a',
  sapphire: '#5a8fc9',
  topaz: '#e0b864',
  skull: '#7a6a5a',
}
function gemColorForName(name: string): string {
  const last = name.split(' ').slice(-1)[0]?.toLowerCase() ?? ''
  return GEM_COLOR[last] ?? '#5a5448'
}

interface Row {
  id: string
  kind: 'gem' | 'rune'
  kindLabel: string
  name: string
  tier: number
  data: Gem | Rune
}

const ALL_ROWS: Row[] = (() => {
  const out: Row[] = []
  for (const g of gems as Gem[]) {
    out.push({
      id: g.id,
      kind: 'gem',
      kindLabel: g.name.toLowerCase().includes('jewel') ? 'Jewel' : 'Gem',
      name: g.name,
      tier: g.tier,
      data: g,
    })
  }
  for (const r of runes as Rune[]) {
    out.push({
      id: r.id,
      kind: 'rune',
      kindLabel: 'Rune',
      name: r.name,
      tier: r.tier,
      data: r,
    })
  }
  return out.sort(
    (a, b) =>
      a.kindLabel.localeCompare(b.kindLabel) ||
      a.tier - b.tier ||
      a.name.localeCompare(b.name),
  )
})()

interface Props {
  socketIndex: number
  totalSockets: number
  currentId: string | null
  socketType: SocketType
  onClose: () => void
  onSelect: (id: string | null) => void
}

export default function SocketPickerModal({
  socketIndex,
  totalSockets,
  currentId,
  socketType,
  onClose,
  onSelect,
}: Props) {
  // Picker modal for choosing a gem/rune to slot into a gear socket. Mirrors the GearItemModal layout (corner marks, search, scrolling list, hover tooltips) and exposes the rainbow multiplier in the tooltip when the socket is rainbow-typed. Used from ItemConfigurator's SocketsSection.
  const [q, setQ] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filter = q.trim().toLowerCase()
  const rows = useMemo(() => {
    if (!filter) return ALL_ROWS
    return ALL_ROWS.filter((r) => {
      if (r.name.toLowerCase().includes(filter)) return true
      if (r.kindLabel.toLowerCase().includes(filter)) return true
      for (const k of Object.keys(r.data.stats)) {
        if (statName(k).toLowerCase().includes(filter)) return true
        if (k.toLowerCase().includes(filter)) return true
      }
      return false
    })
  }, [filter])

  const isRainbow = socketType === 'rainbow'

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={onClose}
      style={{
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(201,165,90,0.06), rgba(0,0,0,0.78) 60%)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex h-[80vh] w-[640px] max-w-[94vw] flex-col overflow-hidden rounded-[6px] border border-border"
        style={{
          background:
            'linear-gradient(180deg, var(--color-panel-2), color-mix(in srgb, var(--color-bg) 80%, transparent))',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.02), 0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        <CornerMarks />

        <header
          className="flex items-start justify-between gap-3 border-b border-border px-5 py-4"
          style={{
            background:
              'linear-gradient(180deg, rgba(201,165,90,0.05), transparent)',
          }}
        >
          <div>
            <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              <span
                className="inline-block h-1.5 w-1.5 rotate-45 bg-accent-hot"
                style={{ boxShadow: '0 0 8px rgba(224,184,100,0.6)' }}
              />
              Socket{' '}
              <span className="text-accent-hot">
                #{socketIndex + 1}
                {totalSockets > 1 && ` / ${totalSockets}`}
              </span>
              {isRainbow && (
                <span
                  className="ml-1 rounded-[2px] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-bg"
                  style={{
                    background:
                      'linear-gradient(90deg, #f43f5e, #f59e0b, #38bdf8)',
                  }}
                >
                  Rainbow ×{RAINBOW_MULTIPLIER}
                </span>
              )}
            </div>
            <h2
              className="m-0 text-[18px] font-semibold tracking-[0.02em] text-accent-hot"
              style={{
                textShadow: '0 0 16px rgba(224,184,100,0.15)',
              }}
            >
              Insert Socketable
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-[3px] border border-border-2 bg-panel-2 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Close
          </button>
        </header>

        {/* Search */}
        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search gems / runes…"
              className="w-full rounded-[3px] border border-border-2 px-3 py-2 pl-9 text-text placeholder:text-faint focus:border-accent-deep focus:outline-none focus:ring-2 focus:ring-accent-hot/15"
              style={{
                background:
                  'linear-gradient(180deg, #0d0e12, var(--color-panel-2))',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <EmptyRow
            isCurrent={currentId == null}
            onPick={() => {
              onSelect(null)
              onClose()
            }}
          />
          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted">
              No matches
            </div>
          )}
          {rows.map((r) => (
            <SocketableRow
              key={r.id}
              row={r}
              isCurrent={currentId === r.id}
              isRainbow={isRainbow}
              onPick={() => {
                onSelect(r.id)
                onClose()
              }}
            />
          ))}
        </div>

        {/* Footer status */}
        <footer className="flex items-center justify-between border-t border-border bg-black/30 px-4 py-3">
          <div
            className={`flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] ${
              currentId ? 'text-accent-hot' : 'text-faint'
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: currentId
                  ? 'var(--color-accent-hot)'
                  : 'var(--color-faint)',
                boxShadow: currentId
                  ? '0 0 8px rgba(224,184,100,0.6)'
                  : '0 0 6px var(--color-faint)',
              }}
            />
            <span>
              {currentId
                ? `Currently socketed: ${
                    ALL_ROWS.find((r) => r.id === currentId)?.name ?? currentId
                  }`
                : 'Empty socket'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-[3px] border border-border-2 bg-transparent px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function EmptyRow({
  isCurrent,
  onPick,
}: {
  isCurrent: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`group relative flex w-full cursor-pointer items-center gap-3.5 border-b border-dashed border-border px-4 py-2 text-left transition-colors hover:bg-stat-red/5 ${
        isCurrent ? 'bg-stat-red/10' : ''
      }`}
    >
      <span
        className={`pointer-events-none absolute left-0 top-0 bottom-0 w-[2px] bg-stat-red transition-opacity ${
          isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
        }`}
      />
      <span className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-dashed border-border-2 text-faint">
        ∅
      </span>
      <span className="flex-1 text-[13px] italic text-muted">
        — empty —
        {isCurrent && (
          <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint not-italic">
            · Current
          </span>
        )}
      </span>
    </button>
  )
}

function SocketableRow({
  row,
  isCurrent,
  isRainbow,
  onPick,
}: {
  row: Row
  isCurrent: boolean
  isRainbow: boolean
  onPick: () => void
}) {
  const url = iconForName(row.name)
  const tierClass =
    row.tier >= 4
      ? 'text-stat-orange border-stat-orange'
      : row.tier === 3
      ? 'text-[#fff0c4] border-accent-hot'
      : row.tier === 2
      ? 'text-accent-hot border-accent-deep'
      : 'text-accent-deep border-accent-deep'

  const inlineStats = formatStatLine(row.data.stats)

  return (
    <Tooltip
      tone="rare"
      placement="right"
      content={
        <SocketableTooltipContent
          row={row}
          isRainbow={isRainbow}
        />
      }
    >
      <button
        type="button"
        onClick={onPick}
        className={`group relative grid w-full cursor-pointer items-center gap-3.5 border-b border-dashed border-border px-4 py-2 text-left transition-colors last:border-b-0 hover:bg-accent-hot/5 ${
          isCurrent ? 'bg-gradient-to-r from-accent-hot/10 to-transparent' : ''
        }`}
        style={{
          gridTemplateColumns: '36px 56px 1fr 56px 1fr',
        }}
      >
        <span
          className={`pointer-events-none absolute left-0 top-0 bottom-0 w-[2px] bg-accent-hot transition-opacity ${
            isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
          }`}
          style={
            isCurrent
              ? { boxShadow: '0 0 12px rgba(224,184,100,0.4)' }
              : undefined
          }
        />
        <span className="flex items-center justify-center">
          {url ? (
            <img
              src={url}
              alt=""
              width={24}
              height={24}
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <GemBadge kind={row.kind} name={row.name} />
          )}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          {row.kindLabel}
        </span>
        <span
          className={`truncate text-[13px] font-medium ${
            isCurrent
              ? 'text-accent-hot'
              : 'text-text group-hover:text-accent-hot'
          }`}
        >
          {row.name}
          {isCurrent && (
            <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
              · Current
            </span>
          )}
        </span>
        <span
          className={`w-max rounded-[2px] border px-2 py-0.5 text-center font-mono text-[11px] font-semibold tracking-[0.06em] ${tierClass}`}
          style={{
            background: 'linear-gradient(180deg, #3a2e18, #2a2418)',
          }}
        >
          T{row.tier}
        </span>
        <span
          className={`truncate font-mono text-[10px] tracking-[0.02em] ${
            inlineStats === '—' ? 'italic text-faint tracking-[0.1em]' : 'text-muted'
          }`}
        >
          {inlineStats}
        </span>
      </button>
    </Tooltip>
  )
}

function SocketableTooltipContent({
  row,
  isRainbow,
}: {
  row: Row
  isRainbow: boolean
}) {
  const stats = Object.entries(row.data.stats).filter(([, v]) => v !== 0)
  return (
    <>
      <TooltipHeader
        tone="rare"
        title={row.name}
        subtitle={`${row.kindLabel} · Tier ${row.tier}`}
      />
      {stats.length > 0 && (
        <TooltipSection>
          <TooltipSectionHeader tone="gold">
            {isRainbow ? `Effect (Rainbow ×${RAINBOW_MULTIPLIER})` : 'Effect'}
          </TooltipSectionHeader>
          <ul className="space-y-0.5 text-[12px]">
            {stats.map(([k, v]) => {
              const effective = isRainbow ? v * RAINBOW_MULTIPLIER : v
              return (
                <li key={k} className="text-accent-hot">
                  {formatValue(effective, k)} {statName(k)}
                  {isRainbow && (
                    <span className="ml-1 font-mono text-[10px] text-faint">
                      (base {formatValue(v, k)})
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </TooltipSection>
      )}
      {row.data.description && (
        <TooltipSection>
          <p className="text-[11px] italic text-muted">
            {row.data.description}
          </p>
        </TooltipSection>
      )}
      <TooltipFooter>
        {row.kindLabel} · T{row.tier}
      </TooltipFooter>
    </>
  )
}

function GemBadge({ kind, name }: { kind: 'gem' | 'rune'; name: string }) {
  if (kind === 'rune') {
    return (
      <span
        className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-border-2 font-mono text-[10px] text-faint"
        style={{
          background: 'linear-gradient(180deg, #1a1610, #0d0b07)',
        }}
      >
        ᚱ
      </span>
    )
  }
  const c = gemColorForName(name)
  return (
    <span
      className="block h-7 w-7 rotate-45 rounded-[3px]"
      style={{
        background: `linear-gradient(135deg, ${c}, #0d0b07)`,
        border: `1px solid color-mix(in srgb, ${c} 60%, #000)`,
        boxShadow: `inset 0 1px 0 color-mix(in srgb, ${c} 60%, transparent), 0 0 12px color-mix(in srgb, ${c} 50%, transparent)`,
      }}
    />
  )
}

function formatStatLine(stats: StatMap): string {
  const entries = Object.entries(stats).filter(([, v]) => v !== 0)
  if (entries.length === 0) return '—'
  return entries
    .map(([k, v]) => `${formatValue(v, k)} ${statName(k)}`)
    .join(', ')
}

function CornerMarks() {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 10,
    height: 10,
    border: '1px solid var(--color-accent-deep)',
    opacity: 0.55,
    pointerEvents: 'none',
  }
  return (
    <>
      <span
        style={{
          ...base,
          top: -1,
          left: -1,
          borderRight: 'none',
          borderBottom: 'none',
        }}
      />
      <span
        style={{
          ...base,
          top: -1,
          right: -1,
          borderLeft: 'none',
          borderBottom: 'none',
        }}
      />
      <span
        style={{
          ...base,
          bottom: -1,
          left: -1,
          borderRight: 'none',
          borderTop: 'none',
        }}
      />
      <span
        style={{
          ...base,
          bottom: -1,
          right: -1,
          borderLeft: 'none',
          borderTop: 'none',
        }}
      />
    </>
  )
}
