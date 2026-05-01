import { useMemo, useState } from 'react'
import { SUBTREE_TEMPLATE, getTemplateEdges } from '../data/subtree-template'
import {
  subskillKey,
  subskillPointsFor,
  useBuild,
} from '../store/build'
import type { Skill, SubskillNode } from '../types'
import { statDef, statName } from '../utils/stats'

const VIEWBOX = 600
const NODE_R: Record<string, number> = {
  minor: 16,
  notable: 24,
  keystone: 32,
}
const ROLE_COLOR: Record<string, string> = {
  minor: '#5a4528',
  notable: '#c48a3a',
  keystone: '#e94f37',
}

interface Props {
  skill: Skill
  onClose: () => void
}

export default function SubtreeOverlay({ skill, onClose }: Props) {
  const level = useBuild((s) => s.level)
  const subskillRanks = useBuild((s) => s.subskillRanks)
  const incSubskillRank = useBuild((s) => s.incSubskillRank)
  const decSubskillRank = useBuild((s) => s.decSubskillRank)
  const resetSubskillsFor = useBuild((s) => s.resetSubskillsFor)

  const totalPoints = subskillPointsFor(level)
  const spent = useMemo(
    () =>
      Object.entries(subskillRanks).reduce(
        (s, [, r]) => s + r,
        0,
      ),
    [subskillRanks],
  )
  const remaining = totalPoints - spent

  const subskillsByPos: Record<number, SubskillNode> = useMemo(() => {
    const out: Record<number, SubskillNode> = {}
    for (const ss of skill.subskills ?? []) {
      out[ss.positionIndex] = ss
    }
    return out
  }, [skill])

  const edges = getTemplateEdges()
  const px = (n: number) => n * VIEWBOX

  const [hover, setHover] = useState<{
    sub: SubskillNode
    x: number
    y: number
  } | null>(null)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-panel"
      >
        <header className="flex items-center justify-between border-b border-border bg-panel-2 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{!skill.icon || skill.icon.startsWith('http') ? '✦' : skill.icon}</span>
            <div>
              <div className="text-base font-semibold text-text">
                {skill.name}{' '}
                <span className="text-xs text-muted font-normal">subtree</span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted">
                Specialize, boost and change how this skill works
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted">
              Points <span className="text-text">{spent}</span>
              <span className="text-muted">/{totalPoints}</span>
              <span className={remaining > 0 ? ' text-accent' : ' text-muted'}>
                {' '}
                ({remaining} left)
              </span>
            </span>
            <button
              onClick={() => resetSubskillsFor(skill.id)}
              className="rounded border border-border bg-panel-2 px-2 py-1 text-muted hover:text-text"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="rounded border border-border bg-panel-2 px-2 py-1 text-muted hover:text-text"
            >
              Close
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4">
          <svg
            viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
            className="mx-auto block"
            style={{ width: '100%', maxWidth: 560 }}
          >
            <g stroke="#3a3f4a" strokeWidth={2}>
              {edges.map(([a, b], i) => {
                const na = SUBTREE_TEMPLATE[a]!
                const nb = SUBTREE_TEMPLATE[b]!
                const subA = subskillsByPos[a]
                const subB = subskillsByPos[b]
                const rankA =
                  subA != null
                    ? subskillRanks[subskillKey(skill.id, subA.id)] ?? 0
                    : 0
                const rankB =
                  subB != null
                    ? subskillRanks[subskillKey(skill.id, subB.id)] ?? 0
                    : 0
                const both = rankA > 0 && rankB > 0
                return (
                  <line
                    key={i}
                    x1={px(na.x)}
                    y1={px(na.y)}
                    x2={px(nb.x)}
                    y2={px(nb.y)}
                    stroke={both ? '#c48a3a' : '#3a3f4a'}
                    strokeWidth={both ? 3 : 2}
                  />
                )
              })}
            </g>
            <g>
              {SUBTREE_TEMPLATE.map((tn) => {
                const sub = subskillsByPos[tn.index]
                const r = NODE_R[tn.role]!
                const cx = px(tn.x)
                const cy = px(tn.y)
                const has = !!sub
                const isRoot = tn.role === 'keystone'
                const interactive = has && !isRoot
                const rank = sub
                  ? subskillRanks[subskillKey(skill.id, sub.id)] ?? 0
                  : 0
                const allocated = rank > 0
                const fill = !has
                  ? '#181c24'
                  : isRoot
                    ? ROLE_COLOR[tn.role]
                    : allocated
                      ? ROLE_COLOR[tn.role]
                      : '#20252f'
                const stroke = !has
                  ? '#2a2f3a'
                  : isRoot
                    ? ROLE_COLOR[tn.role]!
                    : allocated
                      ? '#e6e8ee'
                      : ROLE_COLOR[tn.role]!
                return (
                  <g key={tn.index}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={2}
                      style={interactive ? { cursor: 'pointer' } : undefined}
                      onClick={() => {
                        if (interactive && sub)
                          incSubskillRank(skill.id, sub.id, sub.maxRank)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        if (interactive && sub) decSubskillRank(skill.id, sub.id)
                      }}
                      onMouseEnter={(e) => {
                        if (sub) {
                          const rect = (
                            e.currentTarget.ownerSVGElement as SVGSVGElement
                          ).getBoundingClientRect()
                          setHover({
                            sub,
                            x: rect.left + (cx / VIEWBOX) * rect.width,
                            y: rect.top + (cy / VIEWBOX) * rect.height,
                          })
                        }
                      }}
                      onMouseLeave={() => setHover(null)}
                    />
                    {has && sub.icon && !sub.icon.startsWith('http') && (
                      <text
                        x={cx}
                        y={cy + 6}
                        textAnchor="middle"
                        fontSize={r * 0.9}
                        pointerEvents="none"
                      >
                        {sub.icon}
                      </text>
                    )}
                    {has && !isRoot && (
                      <text
                        x={cx}
                        y={cy + r + 14}
                        textAnchor="middle"
                        fontSize={11}
                        fill={allocated ? '#c48a3a' : '#8a92a3'}
                        fontFamily="ui-monospace,monospace"
                        pointerEvents="none"
                      >
                        {rank}/{sub.maxRank}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
          {(skill.subskills?.length ?? 0) === 0 && (
            <p className="mt-4 text-center text-sm text-muted italic">
              No subskills defined for {skill.name} yet.
            </p>
          )}
        </div>
      </div>
      {hover && (
        <SubskillTooltip
          sub={hover.sub}
          rank={subskillRanks[subskillKey(skill.id, hover.sub.id)] ?? 0}
          x={hover.x}
          y={hover.y}
        />
      )}
    </div>
  )
}

function formatStatValue(key: string, value: number): string {
  const def = statDef(key)
  const suffix = def?.format === 'percent' ? '%' : ''
  const rounded = Number.isInteger(value)
    ? String(value)
    : (Math.round(value * 100) / 100).toString()
  return `${rounded}${suffix}`
}

function SubskillTooltip({
  sub,
  rank,
  x,
  y,
}: {
  sub: SubskillNode
  rank: number
  x: number
  y: number
}) {
  const nextRank = Math.min(rank + 1, sub.maxRank)
  const hasNext = nextRank > rank

  const statKeys = new Set<string>([
    ...Object.keys(sub.effects?.base ?? {}),
    ...Object.keys(sub.effects?.perRank ?? {}),
  ])

  const statRows = Array.from(statKeys).map((k) => {
    const base = sub.effects?.base?.[k] ?? 0
    const per = sub.effects?.perRank?.[k] ?? 0
    const current = base + per * rank
    const next = base + per * nextRank
    return { key: k, current, next }
  })

  const proc = sub.proc
  const procChanceCurrent =
    (proc?.chance.base ?? 0) + (proc?.chance.perRank ?? 0) * rank
  const procChanceNext =
    (proc?.chance.base ?? 0) + (proc?.chance.perRank ?? 0) * nextRank

  const procStatKeys = proc
    ? Array.from(
        new Set<string>([
          ...Object.keys(proc.effects?.base ?? {}),
          ...Object.keys(proc.effects?.perRank ?? {}),
        ]),
      )
    : []

  const procStatRows = procStatKeys.map((k) => {
    const base = proc?.effects?.base?.[k] ?? 0
    const per = proc?.effects?.perRank?.[k] ?? 0
    return {
      key: k,
      current: base + per * rank,
      next: base + per * nextRank,
    }
  })

  return (
    <div
      className="pointer-events-none fixed z-[60] w-72 overflow-hidden rounded-md border border-border bg-panel shadow-lg"
      style={{ left: x + 18, top: y + 18 }}
    >
      <div className="flex items-center gap-2 border-b border-border bg-panel-2 px-3 py-2">
        {sub.icon && !sub.icon.startsWith('http') && (
          <span className="text-lg">{sub.icon}</span>
        )}
        <div className="flex-1">
          <div className="text-sm font-semibold text-text">{sub.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Rank <span className="text-accent tabular-nums">{rank}</span>
            <span className="text-muted"> / {sub.maxRank}</span>
          </div>
        </div>
      </div>
      <div className="px-3 py-2">
        {sub.description && (
          <p className="mb-2 text-xs leading-relaxed text-text/85">
            {sub.description}
          </p>
        )}
        {statRows.length > 0 && (
          <div className="space-y-0.5 rounded border border-border bg-panel-2 p-2 text-xs tabular-nums">
            {statRows.map(({ key, current, next }) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-text/80">{statName(key)}</span>
                <span className="flex items-center gap-1">
                  <span className="text-muted">
                    {formatStatValue(key, current)}
                  </span>
                  {hasNext && current !== next && (
                    <>
                      <span className="text-muted">›››</span>
                      <span className="text-accent">
                        {formatStatValue(key, next)}
                      </span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        {proc && (
          <div
            className={`${statRows.length > 0 ? 'mt-2' : ''} space-y-0.5 rounded border border-border bg-panel-2 p-2 text-xs tabular-nums`}
          >
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted">
              <span>{proc.trigger.replace('_', ' ')} proc</span>
              {(proc.appliesStates?.length || proc.tags?.length) && (
                <span className="flex gap-1">
                  {proc.appliesStates?.map((s, i) => {
                    const name = typeof s === 'string' ? s : s.state
                    return (
                      <span key={`s-${name}-${i}`} className="text-accent/80">
                        applies {name.replace(/_/g, ' ')}
                      </span>
                    )
                  })}
                  {proc.tags?.map((t) => (
                    <span key={`t-${t}`} className="text-accent/80">
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text/80">Proc Chance</span>
              <span className="flex items-center gap-1">
                <span className="text-muted">{procChanceCurrent}%</span>
                {hasNext && procChanceCurrent !== procChanceNext && (
                  <>
                    <span className="text-muted">›››</span>
                    <span className="text-accent">{procChanceNext}%</span>
                  </>
                )}
              </span>
            </div>
            {procStatRows.map(({ key, current, next }) => {
              const avg = (procChanceCurrent / 100) * current
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-text/80">{statName(key)}</span>
                  <span className="flex items-center gap-1">
                    <span className="text-muted">
                      {formatStatValue(key, current)}
                    </span>
                    {hasNext && current !== next && (
                      <>
                        <span className="text-muted">›››</span>
                        <span className="text-accent">
                          {formatStatValue(key, next)}
                        </span>
                      </>
                    )}
                    {avg > 0 && (
                      <span className="ml-1 text-[10px] text-muted">
                        (avg {formatStatValue(key, avg)})
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
            {proc.appliesStates?.map((s, i) => {
              if (typeof s === 'string') return null
              const cur =
                (s.amount?.base ?? 0) + (s.amount?.perRank ?? 0) * rank
              const nxt =
                (s.amount?.base ?? 0) + (s.amount?.perRank ?? 0) * nextRank
              return (
                <div
                  key={`state-${s.state}-${i}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-text/80 capitalize">
                    {s.state.replace(/_/g, ' ')}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-muted">{cur}%</span>
                    {hasNext && cur !== nxt && (
                      <>
                        <span className="text-muted">›››</span>
                        <span className="text-accent">{nxt}%</span>
                      </>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
