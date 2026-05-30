type SectionTone = 'default' | 'satanic' | 'angelic' | 'set' | 'warning'

const SECTION_TONE: Record<
  SectionTone,
  {
    border: string
    dot: string
    label: string
    bg: string
  }
> = {
  default: {
    border: 'border-border',
    dot: 'bg-accent',
    label: 'text-text',
    bg: 'var(--color-panel-2)',
  },
  satanic: {
    border: 'border-stat-red/25',
    dot: 'bg-stat-red',
    label: 'text-stat-red/90',
    bg: 'color-mix(in srgb, var(--color-stat-red) 6%, var(--color-panel-2))',
  },
  angelic: {
    border: 'border-yellow-200/25',
    dot: 'bg-yellow-200',
    label: 'text-yellow-200/90',
    bg: 'color-mix(in srgb, #ece59a 6%, var(--color-panel-2))',
  },
  set: {
    border: 'border-stat-green/25',
    dot: 'bg-stat-green',
    label: 'text-stat-green/90',
    bg: 'color-mix(in srgb, var(--color-stat-green) 6%, var(--color-panel-2))',
  },
  warning: {
    border: 'border-amber-500/25',
    dot: 'bg-amber-400',
    label: 'text-amber-200/90',
    bg: 'color-mix(in srgb, #f5b450 6%, var(--color-panel-2))',
  },
}

export function SectionCard({
  label,
  tone = 'default',
  rightSlot,
  bodyClassName = 'p-3',
  children,
}: {
  label: string
  tone?: SectionTone
  rightSlot?: React.ReactNode
  bodyClassName?: string
  children?: React.ReactNode
}) {
  // Shared editor-block frame for the GearSlotModal config column: a flat,
  // hairline-bordered panel with a sentence-case title (small tone dot + label
  // + optional right-slot) and a configurable body. Quiet-modern styling —
  // gold/tone colour is reserved for the dot and semantic tones, not the frame.
  const t = SECTION_TONE[tone]
  return (
    <div
      className={`relative overflow-hidden rounded-lg border ${t.border}`}
      style={{ background: t.bg }}
    >
      <header
        className={`flex items-center justify-between gap-2 border-b ${t.border} px-4 py-2.5`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${t.dot}`}
            aria-hidden="true"
          />
          <span className={`text-[12px] font-medium tracking-[0.01em] ${t.label}`}>
            {label}
          </span>
        </div>
        {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
      </header>
      {children !== undefined && (
        <div className={bodyClassName}>{children}</div>
      )}
    </div>
  )
}

export function ConfigSectionHeader({
  label,
  accent,
}: {
  label: string
  accent?: string
}) {
  // Sticky header at the top of the GearSlotModal config column.
  return (
    <div
      className="sticky top-0 z-1 flex items-center gap-2 border-b border-border px-4 py-2.5"
      style={{ background: 'var(--color-panel-2)' }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
        aria-hidden="true"
      />
      <span className="text-[12px] font-medium text-text">{label}</span>
      {accent && (
        <>
          <span className="text-faint">·</span>
          <span className="truncate text-[12px] text-accent-hot">{accent}</span>
        </>
      )}
    </div>
  )
}

export function ConfigEmptyState({
  title,
  hint,
  tone = 'default',
}: {
  title: string
  hint: string
  tone?: 'default' | 'warning'
}) {
  // Centered empty/locked state for the GearSlotModal config column.
  const isWarning = tone === 'warning'
  const ring = isWarning ? 'border-amber-400/40' : 'border-border-2'
  const iconColor = isWarning ? 'bg-amber-400' : 'bg-accent'
  const titleColor = isWarning ? 'text-amber-200' : 'text-text'

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div className="flex flex-col items-center">
        <div
          className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full border ${ring}`}
        >
          <span
            className={`block h-2 w-2 rounded-full ${iconColor}`}
            aria-hidden="true"
          />
        </div>
        <div className={`mb-1.5 text-[14px] font-semibold tracking-[0.01em] ${titleColor}`}>
          {title}
        </div>
        <div className="max-w-[28ch] text-[12px] leading-relaxed text-muted">
          {hint}
        </div>
      </div>
    </div>
  )
}
