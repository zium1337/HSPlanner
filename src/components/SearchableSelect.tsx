import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

export interface SearchableOption {
  id: string
  label: string
  hint?: string
  accent?: string
}

interface Props {
  value: string | null
  options: SearchableOption[]
  placeholder?: string
  onChange: (id: string | null) => void
  emptyLabel?: string
  clearLabel?: string
  sidePanel?: (hoveredId: string | null) => ReactNode
}

export default function SearchableSelect({
  value,
  options,
  placeholder = 'Select…',
  onChange,
  emptyLabel = 'No results',
  clearLabel = '— none —',
  sidePanel,
}: Props) {
  // Lighter-weight searchable select used by ConfigView for things like classes and skills. Filters by label and hint, supports a "clear" entry, and an optional left-anchored portal side panel that previews the hovered option.
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setHoveredId(null)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  const selected = options.find((o) => o.id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.hint?.toLowerCase().includes(q),
    )
  }, [options, query])

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          setHoveredId(null)
        }}
        className="w-full flex items-center justify-between bg-panel-2 border border-border rounded-md px-3 py-2 text-sm text-left hover:border-accent"
      >
        <span className={selected ? 'text-text' : 'text-muted'}>
          {selected?.label ?? placeholder}
        </span>
        <span className="text-muted text-xs">▾</span>
      </button>

      {open && (
        <>
          <div className="absolute z-50 mt-1 w-full bg-panel border border-border rounded-md shadow-lg overflow-hidden">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full px-3 py-2 bg-panel border-b border-border text-sm focus:outline-none"
            />
            <div
              className="max-h-64 overflow-auto"
              onMouseLeave={() => setHoveredId(null)}
            >
              {value !== null && (
                <button
                  type="button"
                  onClick={() => {
                    onChange(null)
                    setOpen(false)
                    setQuery('')
                    setHoveredId(null)
                  }}
                  onMouseEnter={() => setHoveredId(null)}
                  className="w-full text-left px-3 py-2 text-sm text-muted hover:bg-panel-2 border-b border-border"
                >
                  {clearLabel}
                </button>
              )}
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted">{emptyLabel}</div>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      onChange(o.id)
                      setOpen(false)
                      setQuery('')
                      setHoveredId(null)
                    }}
                    onMouseEnter={() => setHoveredId(o.id)}
                    onFocus={() => setHoveredId(o.id)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-2 ${
                      o.id === value
                        ? 'border-accent bg-panel-2 text-text'
                        : 'border-transparent hover:bg-panel-2 text-text'
                    } ${o.accent ?? ''}`}
                  >
                    <div>{o.label}</div>
                    {o.hint && (
                      <div className="text-xs text-muted mt-0.5">{o.hint}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {sidePanel && (
            <HoverPortal anchorRef={boxRef}>
              {sidePanel(hoveredId)}
            </HoverPortal>
          )}
        </>
      )}
    </div>
  )
}

function HoverPortal({
  anchorRef,
  children,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>
  children: ReactNode
}) {
  // Renders `children` into a portal pinned to the left of the anchor element with conservative width clamping, kept in sync with window resize/scroll. Used by SearchableSelect's optional `sidePanel` preview to keep the panel visually attached to the dropdown.
  const [pos, setPos] = useState<{
    left: number
    top: number
    maxWidth: number
  } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    function recompute() {
      // Reads the anchor's viewport rectangle and writes the resulting (left, top, maxWidth) into local state. Used both on mount and as a window resize/scroll listener so the portal tracks its anchor.
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const margin = 12
      const desiredMaxWidth = Math.min(640, rect.left - margin * 2)
      const left = Math.max(margin, rect.left - margin)
      setPos({
        left,
        top: rect.top,
        maxWidth: Math.max(220, desiredMaxWidth),
      })
    }
    recompute()
    window.addEventListener('resize', recompute)
    window.addEventListener('scroll', recompute, true)
    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('scroll', recompute, true)
    }
  }, [anchorRef])

  if (!pos) return null
  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[1000] pointer-events-none"
      style={{
        left: pos.left,
        top: pos.top,
        transform: 'translateX(-100%)',
        maxWidth: `${pos.maxWidth}px`,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
