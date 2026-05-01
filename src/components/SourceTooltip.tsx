import type { ReactNode } from 'react'
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
}

interface Props {
  statKey: string
  sources: SourceContribution[]
  children: ReactNode
}

export default function SourceTooltip({ statKey, sources, children }: Props) {
  if (sources.length === 0) return <>{children}</>
  return (
    <div className="relative group">
      <div className="cursor-help">{children}</div>
      <div
        className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity absolute right-0 top-full mt-1 z-50 w-72 bg-panel border border-accent-deep/60 rounded-[4px] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.8)] text-xs pointer-events-none"
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
        <ul className="px-3 py-2 space-y-1">
          {sources.map((s, i) => (
            <li
              key={i}
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
          ))}
        </ul>
      </div>
    </div>
  )
}
