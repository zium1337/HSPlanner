import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Tooltip from './Tooltip'
import type { TooltipTone } from './tooltip-tones'

interface Props<T> {
  // Header
  eyebrow: ReactNode
  title: string
  badge?: ReactNode
  // Search
  searchPlaceholder: string
  // Items
  items: T[]
  getId: (item: T) => string
  searchText: (item: T) => string
  currentId?: string | null
  // Rendering
  renderRow: (item: T, opts: { current: boolean }) => ReactNode
  renderTooltip?: (item: T) => ReactNode
  tooltipTone?: TooltipTone
  emptyText?: string
  // Footer
  statusText: ReactNode
  cancelLabel?: string
  // Optional none/clear option at top of the list (for "remove" semantics)
  noneRow?: { label: string; isCurrent: boolean }
  // Events
  onClose: () => void
  onSelect: (id: string | null) => void
}

export default function PickerModal<T>({
  eyebrow,
  title,
  badge,
  searchPlaceholder,
  items,
  getId,
  searchText,
  currentId,
  renderRow,
  renderTooltip,
  tooltipTone = 'rare',
  emptyText = 'No matches',
  statusText,
  cancelLabel = 'Cancel',
  noneRow,
  onClose,
  onSelect,
}: Props<T>) {
  // Generic searchable modal-list picker used by gear sub-pickers (affixes, crystal forge mods, angelic augments). Mirrors the SocketPickerModal/GearItemModal frame so all gear pickers feel cohesive. Click on a row commits + closes; Esc closes without selection. Used from ItemConfigurator's helper sections.
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
    if (!filter) return items
    return items.filter((it) => searchText(it).toLowerCase().includes(filter))
  }, [filter, items, searchText])

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
              {eyebrow}
              {badge}
            </div>
            <h2
              className="m-0 text-[18px] font-semibold tracking-[0.02em] text-accent-hot"
              style={{
                textShadow: '0 0 16px rgba(224,184,100,0.15)',
              }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-[3px] border border-border-2 bg-panel-2 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Close
          </button>
        </header>

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
              placeholder={searchPlaceholder}
              className="w-full rounded-[3px] border border-border-2 px-3 py-2 pl-9 text-text placeholder:text-faint focus:border-accent-deep focus:outline-none focus:ring-2 focus:ring-accent-hot/15"
              style={{
                background:
                  'linear-gradient(180deg, #0d0e12, var(--color-panel-2))',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {noneRow && (
            <button
              type="button"
              onClick={() => {
                onSelect(null)
                onClose()
              }}
              className={`group relative flex w-full cursor-pointer items-center gap-3.5 border-b border-dashed border-border px-4 py-2 text-left transition-colors hover:bg-stat-red/5 ${
                noneRow.isCurrent ? 'bg-stat-red/10' : ''
              }`}
            >
              <span
                className={`pointer-events-none absolute left-0 top-0 bottom-0 w-[2px] bg-stat-red transition-opacity ${
                  noneRow.isCurrent
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-50'
                }`}
              />
              <span className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-dashed border-border-2 text-faint">
                ∅
              </span>
              <span className="flex-1 text-[13px] italic text-muted">
                {noneRow.label}
                {noneRow.isCurrent && (
                  <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint not-italic">
                    · Current
                  </span>
                )}
              </span>
            </button>
          )}
          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted">
              {emptyText}
            </div>
          )}
          {rows.map((it) => {
            const id = getId(it)
            const current = currentId === id
            const rowEl = (
              <button
                type="button"
                key={id}
                onClick={() => {
                  onSelect(id)
                  onClose()
                }}
                className={`group relative w-full cursor-pointer border-b border-dashed border-border px-4 py-2 text-left transition-colors last:border-b-0 hover:bg-accent-hot/5 ${
                  current
                    ? 'bg-gradient-to-r from-accent-hot/10 to-transparent'
                    : ''
                }`}
              >
                <span
                  className={`pointer-events-none absolute left-0 top-0 bottom-0 w-[2px] bg-accent-hot transition-opacity ${
                    current
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-60'
                  }`}
                  style={
                    current
                      ? { boxShadow: '0 0 12px rgba(224,184,100,0.4)' }
                      : undefined
                  }
                />
                {renderRow(it, { current })}
              </button>
            )
            if (renderTooltip) {
              return (
                <Tooltip
                  key={id}
                  tone={tooltipTone}
                  placement="right"
                  content={renderTooltip(it)}
                >
                  {rowEl}
                </Tooltip>
              )
            }
            return rowEl
          })}
        </div>

        <footer className="flex items-center justify-between border-t border-border bg-black/30 px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-faint">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: 'var(--color-faint)',
                boxShadow: '0 0 6px var(--color-faint)',
              }}
            />
            <span className="truncate max-w-[460px]">{statusText}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-[3px] border border-border-2 bg-transparent px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            {cancelLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
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
