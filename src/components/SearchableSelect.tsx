import { useEffect, useMemo, useRef, useState } from 'react'

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
}

export default function SearchableSelect({
  value,
  options,
  placeholder = 'Select…',
  onChange,
  emptyLabel = 'No results',
  clearLabel = '— none —',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
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
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-panel-2 border border-border rounded-md px-3 py-2 text-sm text-left hover:border-accent"
      >
        <span className={selected ? 'text-text' : 'text-muted'}>
          {selected?.label ?? placeholder}
        </span>
        <span className="text-muted text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-panel border border-border rounded-md shadow-lg overflow-hidden">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full px-3 py-2 bg-panel border-b border-border text-sm focus:outline-none"
          />
          <div className="max-h-64 overflow-auto">
            {value !== null && (
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                  setQuery('')
                }}
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
                  }}
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
      )}
    </div>
  )
}
