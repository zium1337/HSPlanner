import { useMemo, useState } from 'react'
import { SkillIconImage } from '../components/SkillIconImage'
import SubtreeOverlay from '../components/SubtreeOverlay'
import { classes, getClass, skills } from '../data'
import { skillPointsFor, subskillKey, useBuild } from '../store/build'
import {
  aggregateItemSkillBonuses,
  computeBuildStats,
  formatValue,
  manaCostAtRank,
  normalizeSkillName,
  passiveStatsAtRank,
  rangedMax,
  rangedMin,
  statName,
} from '../utils/stats'
import { aggregateSubskillStats } from '../utils/subtree'
import type { AttributeKey, DamageType, RangedValue, Skill } from '../types'
import type { SubskillNode } from '../types/skill'

const DAMAGE_BORDER: Record<DamageType, string> = {
  physical: 'border-white/60',
  lightning: 'border-yellow-400',
  cold: 'border-sky-400',
  fire: 'border-red-400',
  poison: 'border-green-400',
  arcane: 'border-purple-400',
  explosion: 'border-orange-400',
  magic: 'border-pink-400',
}

const DAMAGE_GLOW: Record<DamageType, string> = {
  physical: 'shadow-[0_0_12px_rgba(255,255,255,0.3)]',
  lightning: 'shadow-[0_0_12px_rgba(250,204,21,0.45)]',
  cold: 'shadow-[0_0_12px_rgba(56,189,248,0.45)]',
  fire: 'shadow-[0_0_12px_rgba(248,113,113,0.45)]',
  poison: 'shadow-[0_0_12px_rgba(74,222,128,0.45)]',
  arcane: 'shadow-[0_0_12px_rgba(192,132,252,0.45)]',
  explosion: 'shadow-[0_0_12px_rgba(251,146,60,0.45)]',
  magic: 'shadow-[0_0_12px_rgba(244,114,182,0.45)]',
}

const CELL = 72
const GAP = 16

export default function SkillsView() {
  // Top-level Skills view: lays out the active class's skill tree as a clickable grid, lets the user spend skill points (with prerequisite cascades), and renders a per-skill details side panel showing the current/next-rank stats, damage breakdown, mana cost, subtree bonuses, and the "Open subtree" entry point. Used as one of the main app tabs.
  const {
    classId,
    level,
    allocated,
    inventory,
    skillRanks,
    incSkillRank,
    decSkillRank,
    resetSkillRanks,
  } = useBuild()
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [openSubtree, setOpenSubtree] = useState<string | null>(null)

  const handleHover = (id: string | null) => {
    setHovered(id)
    if (id !== null) setPinned(id)
  }

  const selected = pinned

  const cls = classId ? getClass(classId) : undefined
  const skillsForClass = useMemo(
    () => (classId ? skills.filter((s) => s.classId === classId) : []),
    [classId],
  )

  const activeAuraId = useBuild((s) => s.activeAuraId)
  const activeBuffs = useBuild((s) => s.activeBuffs)
  const subskillRanks = useBuild((s) => s.subskillRanks)
  const enemyConditions = useBuild((s) => s.enemyConditions)
  const customStats = useBuild((s) => s.customStats)
  const treeAllocated = useBuild((s) => s.allocatedTreeNodes)
  const treeSocketed = useBuild((s) => s.treeSocketed)
  const { stats, attributes } = useMemo(
    () =>
      computeBuildStats(
        classId,
        level,
        allocated,
        inventory,
        skillRanks,
        activeAuraId,
        activeBuffs,
        customStats,
        treeAllocated,
        treeSocketed,
      ),
    [
      classId,
      level,
      allocated,
      inventory,
      skillRanks,
      activeAuraId,
      activeBuffs,
      customStats,
      treeAllocated,
      treeSocketed,
    ],
  )
  const itemSkillBonuses = useMemo(
    () => aggregateItemSkillBonuses(inventory),
    [inventory],
  )

  const trees = useMemo(() => {
    const byTree = new Map<string, Skill[]>()
    for (const s of skillsForClass) {
      const key = s.tree ?? 'Ungrouped'
      const list = byTree.get(key) ?? []
      list.push(s)
      byTree.set(key, list)
    }
    return [...byTree.entries()].map(([name, list]) => ({ name, list }))
  }, [skillsForClass])

  const totalPoints = skillPointsFor(level)
  const spent = Object.values(skillRanks).reduce((s, v) => s + v, 0)
  const remaining = totalPoints - spent
  const selectedSkill = selected
    ? skillsForClass.find((s) => s.id === selected) ?? null
    : null
  const openSubtreeSkill = openSubtree
    ? skillsForClass.find((s) => s.id === openSubtree) ?? null
    : null

  if (classes.length === 0) {
    return (
      <EmptyState message="No classes loaded. Add a file in src/data/classes/." />
    )
  }
  if (skillsForClass.length === 0) {
    return (
      <EmptyState
        message={`No skills defined for ${cls?.name ?? 'this class'}. Add JSON in src/data/skills/.`}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-2">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-text font-semibold">{cls?.name}</span>
          <span className="text-muted">·</span>
          <span className="text-muted">
            Points used <span className="text-text">{spent}</span>
            <span className="text-muted">/{totalPoints}</span>
          </span>
          <span className={`${remaining > 0 ? 'text-accent' : 'text-muted'}`}>
            {remaining} available
          </span>
        </div>
        <button
          onClick={resetSkillRanks}
          disabled={spent === 0}
          className="rounded border border-border bg-panel-2 px-3 py-1 text-xs text-muted hover:text-text disabled:opacity-40"
        >
          Reset
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-wrap gap-6">
            {trees.map((tree) => (
              <SkillTree
                key={tree.name}
                name={tree.name}
                list={tree.list}
                skillRanks={skillRanks}
                canIncrement={remaining > 0}
                selected={hovered}
                onHover={handleHover}
                onInc={incSkillRank}
                onDec={decSkillRank}
                onOpenSubtree={setOpenSubtree}
              />
            ))}
          </div>
        </div>
        <SkillDetailsPanel
          skill={selectedSkill}
          currentRank={selectedSkill ? skillRanks[selectedSkill.id] ?? 0 : 0}
          allSkillsBonus={[
            rangedMin(stats.all_skills ?? 0),
            rangedMax(stats.all_skills ?? 0),
          ]}
          elementSkillsBonus={
            selectedSkill?.damageType
              ? [
                  rangedMin(stats[`${selectedSkill.damageType}_skills`] ?? 0),
                  rangedMax(stats[`${selectedSkill.damageType}_skills`] ?? 0),
                ]
              : [0, 0]
          }
          itemBonus={
            selectedSkill
              ? (itemSkillBonuses[normalizeSkillName(selectedSkill.name)] ?? [
                  0, 0,
                ])
              : [0, 0]
          }
          allClassSkills={skillsForClass}
          skillRanks={skillRanks}
          attributes={attributes}
          subskillRanks={subskillRanks}
          enemyConditions={enemyConditions}
        />
      </div>
      {openSubtreeSkill && (
        <SubtreeOverlay
          skill={openSubtreeSkill}
          onClose={() => setOpenSubtree(null)}
        />
      )}
    </div>
  )
}

function SkillTree({
  name,
  list,
  skillRanks,
  canIncrement,
  selected,
  onHover,
  onInc,
  onDec,
  onOpenSubtree,
}: {
  name: string
  list: Skill[]
  skillRanks: Record<string, number>
  canIncrement: boolean
  selected: string | null
  onHover: (id: string | null) => void
  onInc: (id: string, maxRank: number) => void
  onDec: (id: string) => void
  onOpenSubtree: (id: string | null) => void
}) {
  // Renders one named tree of skills as a fixed-cell grid: draws prerequisite arrow lines, places each skill icon at its (row, col) position, and wires hover/inc/dec/open-subtree callbacks. Used by SkillsView once per tree (e.g. main tree, secondary tree).
  const maxRow = list.reduce((m, s) => Math.max(m, s.position?.row ?? 0), 0)
  const maxCol = list.reduce((m, s) => Math.max(m, s.position?.col ?? 0), 0)
  const cols = Math.max(maxCol + 1, 3)
  const rows = Math.max(maxRow + 1, 5)
  const width = cols * CELL + (cols - 1) * GAP
  const height = rows * CELL + (rows - 1) * GAP

  const byId = new Map(list.map((s) => [s.id, s]))
  const cellCenter = (pos: { row: number; col: number }) => ({
    x: pos.col * (CELL + GAP) + CELL / 2,
    y: pos.row * (CELL + GAP) + CELL / 2,
  })

  return (
    <section
      className="rounded-lg border border-border bg-panel/40 p-4"
      style={{ width: width + 32 }}
    >
      <h3 className="mb-3 border-b border-border pb-2 text-center text-lg font-semibold tracking-wide text-text">
        {name}
      </h3>
      <div className="relative" style={{ width, height }}>
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
        >
          {list.map((skill) => {
            if (!skill.requiresSkill || !skill.position) return null
            const parent = byId.get(skill.requiresSkill)
            if (!parent?.position) return null
            const a = cellCenter(parent.position)
            const b = cellCenter(skill.position)
            const parentRank = skillRanks[parent.id] ?? 0
            const satisfied = parentRank > 0
            return (
              <line
                key={`${parent.id}-${skill.id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={satisfied ? '#c48a3a' : '#7c2d2d'}
                strokeWidth={2.5}
              />
            )
          })}
        </svg>
        {list.map((skill) => {
          if (!skill.position) return null
          const locked =
            !!skill.requiresSkill &&
            (skillRanks[skill.requiresSkill] ?? 0) === 0
          const hasSubtree =
            skill.kind === 'active' && skill.id !== 'gateway'
          return (
            <SkillIcon
              key={skill.id}
              skill={skill}
              rank={skillRanks[skill.id] ?? 0}
              locked={locked}
              canIncrement={canIncrement}
              hovered={selected === skill.id}
              hasSubtree={hasSubtree}
              style={{
                position: 'absolute',
                left: skill.position.col * (CELL + GAP),
                top: skill.position.row * (CELL + GAP),
              }}
              onMouseEnter={() => onHover(skill.id)}
              onMouseLeave={() => onHover(null)}
              onInc={() => onInc(skill.id, skill.maxRank)}
              onDec={() => onDec(skill.id)}
              onOpenSubtree={() => onOpenSubtree(skill.id)}
            />
          )
        })}
      </div>
    </section>
  )
}

function SkillIcon({
  skill,
  rank,
  locked,
  canIncrement,
  hovered,
  hasSubtree,
  style,
  onMouseEnter,
  onMouseLeave,
  onInc,
  onDec,
  onOpenSubtree,
}: {
  skill: Skill
  rank: number
  locked: boolean
  canIncrement: boolean
  hovered: boolean
  hasSubtree: boolean
  style: React.CSSProperties
  onMouseEnter: () => void
  onMouseLeave: () => void
  onInc: () => void
  onDec: () => void
  onOpenSubtree: () => void
}) {
  // Renders a single clickable skill cell inside the SkillTree grid: shows the icon, current rank, locked state, hover ring, damage-type border colour, and exposes the small subtree button when the skill has subskills. Used by SkillTree for every skill in the grid.
  const allocated = rank > 0
  const border = skill.damageType
    ? DAMAGE_BORDER[skill.damageType]
    : 'border-accent'
  const glow = allocated && skill.damageType ? DAMAGE_GLOW[skill.damageType] : ''
  const canInc = canIncrement && rank < skill.maxRank && !locked

  return (
    <div
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={(e) => {
        e.preventDefault()
        if (rank > 0) onDec()
      }}
      className={`group relative flex items-center justify-center rounded-md border-2 transition-all ${
        locked
          ? 'border-red-900/50 bg-panel-2/30'
          : allocated
            ? `${border} bg-panel-2 ${glow}`
            : hovered
              ? 'border-accent/60 bg-panel-2'
              : 'border-border bg-panel-2/50'
      }`}
      title={locked ? `Requires ${skill.requiresSkill}` : undefined}
    >
      <button
        onClick={canInc ? onInc : undefined}
        disabled={!canInc}
        className={`flex items-center justify-center text-3xl transition-transform ${
          canInc ? 'hover:scale-110 cursor-pointer' : ''
        } ${locked ? 'grayscale opacity-30' : allocated ? '' : 'opacity-50'}`}
        style={{ width: CELL, height: CELL }}
      >
        <SkillIconImage icon={skill.icon} size={CELL} />
      </button>

      <div
        className={`absolute bottom-0.5 left-0.5 flex h-5 min-w-[18px] items-center justify-center rounded border px-1 text-[11px] font-semibold tabular-nums ${
          allocated
            ? 'border-accent bg-black/70 text-accent'
            : 'border-border bg-black/60 text-muted'
        }`}
      >
        {rank}
      </div>

      {canInc && (
        <button
          onClick={onInc}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-sm border border-orange-500 bg-orange-600 text-xs font-bold text-white shadow-md hover:bg-orange-500"
          aria-label={`Add point to ${skill.name}`}
        >
          +
        </button>
      )}
      {hasSubtree && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpenSubtree()
          }}
          className="absolute -bottom-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-sm border border-accent bg-panel text-[10px] text-accent shadow-md hover:bg-panel-2"
          aria-label={`Open ${skill.name} subtree`}
          title="Open subtree"
        >
          ⚙
        </button>
      )}
    </div>
  )
}

function SkillDetailsPanel({
  skill,
  currentRank,
  allSkillsBonus,
  elementSkillsBonus,
  itemBonus,
  allClassSkills,
  skillRanks,
  attributes,
  subskillRanks,
  enemyConditions,
}: {
  skill: Skill | null
  currentRank: number
  allSkillsBonus: [number, number]
  elementSkillsBonus: [number, number]
  itemBonus: [number, number]
  allClassSkills: Skill[]
  skillRanks: Record<string, number>
  attributes: Record<AttributeKey, RangedValue>
  subskillRanks: Record<string, number>
  enemyConditions: Record<string, boolean>
}) {
  // Renders the right-hand details panel for the hovered/selected skill: header, current vs next rank, mana cost, cooldown, damage breakdown (with synergies, total multipliers, crit, resistance), passive stats, subskill bonuses, and the "Open subtree" CTA. Falls back to a help message when no skill is selected.
  if (!skill) {
    return (
      <aside className="h-full min-h-0 w-80 shrink-0 overflow-y-auto border-l border-border bg-panel p-4 text-sm text-muted">
        Hover a skill to see details. Left-click to add a point, right-click to remove.
      </aside>
    )
  }
  const baseMana = skill.ranks[0]?.manaCost
  const allocated = currentRank > 0
  const totalBonusMin = allocated
    ? allSkillsBonus[0] + elementSkillsBonus[0] + itemBonus[0]
    : 0
  const totalBonusMax = allocated
    ? allSkillsBonus[1] + elementSkillsBonus[1] + itemBonus[1]
    : 0
  const effMin = currentRank + totalBonusMin
  const effMax = currentRank + totalBonusMax
  const effLabel =
    effMin === effMax ? String(effMin) : `${effMin}-${effMax}`
  const hasBonus = totalBonusMin !== 0 || totalBonusMax !== 0
  return (
    <aside className="h-full min-h-0 w-80 shrink-0 overflow-y-auto border-l border-border bg-panel p-4">
      <div className="mb-1 flex items-center gap-2">
        <SkillIconImage icon={skill.icon} size={48} className="text-3xl" />
        <div>
          <div className="text-base font-semibold text-text">{skill.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted">
            {skill.damageType ?? '—'} · {skill.kind}
          </div>
        </div>
      </div>
      <div className="mb-3 text-xs tabular-nums">
        <span className="text-accent">
          Rank {hasBonus ? effLabel : currentRank}
        </span>
        <span className="text-muted"> / {skill.maxRank}</span>
        {hasBonus && (
          <span className="text-muted">
            {' '}
            ({currentRank}
            {totalBonusMin === totalBonusMax
              ? totalBonusMin >= 0
                ? `+${totalBonusMin}`
                : totalBonusMin
              : ` +${totalBonusMin}-${totalBonusMax}`}
            )
          </span>
        )}
      </div>
      {hasBonus && (
        <div className="mb-3 space-y-0.5 rounded border border-border bg-panel-2 p-2 text-xs tabular-nums">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">
            Skill bonuses
          </div>
          {(allSkillsBonus[0] !== 0 || allSkillsBonus[1] !== 0) && (
            <div className="flex justify-between">
              <span className="text-text/80">+ to All Skills</span>
              <span className="text-accent">
                +{formatPair(allSkillsBonus)}
              </span>
            </div>
          )}
          {(elementSkillsBonus[0] !== 0 || elementSkillsBonus[1] !== 0) &&
            skill.damageType && (
              <div className="flex justify-between">
                <span className="text-text/80">
                  + to {skill.damageType[0]!.toUpperCase()}
                  {skill.damageType.slice(1)} Skills
                </span>
                <span className="text-accent">
                  +{formatPair(elementSkillsBonus)}
                </span>
              </div>
            )}
          {(itemBonus[0] !== 0 || itemBonus[1] !== 0) && (
            <div className="flex justify-between">
              <span className="text-text/80">+ to {skill.name}</span>
              <span className="text-accent">+{formatPair(itemBonus)}</span>
            </div>
          )}
        </div>
      )}
      <SkillEffectsBlock
        skill={skill}
        currentRank={currentRank}
        effRankMin={effMin}
        effRankMax={effMax}
        allClassSkills={allClassSkills}
        skillRanks={skillRanks}
        attributes={attributes}
      />
      <SubtreeBonusBlock
        skill={skill}
        subskillRanks={subskillRanks}
        enemyConditions={enemyConditions}
      />
      {skill.description && (
        <p className="mb-3 text-sm text-text/85 leading-relaxed">
          {skill.description}
        </p>
      )}
      <div className="space-y-1 text-xs text-muted">
        {baseMana !== undefined && (
          <div>
            <span className="text-sky-300 tabular-nums">{baseMana}</span> mana
          </div>
        )}
        {skill.baseCastRate !== undefined && (
          <div>
            Base cast rate{' '}
            <span className="text-text tabular-nums">{skill.baseCastRate}</span>/s
          </div>
        )}
        {skill.movementDuringUse !== undefined && (
          <div>
            Movement during use{' '}
            <span className="text-text tabular-nums">
              {skill.movementDuringUse}%
            </span>
          </div>
        )}
        {skill.range !== undefined && (
          <div>
            Range{' '}
            <span className="text-text tabular-nums">{skill.range}</span>
          </div>
        )}
        {skill.baseCooldown !== undefined && (
          <div>
            Cooldown{' '}
            <span className="text-text tabular-nums">
              {skill.baseCooldown}s
            </span>
          </div>
        )}
        {skill.effectDuration !== undefined && (
          <div>
            Effect duration{' '}
            <span className="text-text tabular-nums">
              {skill.effectDuration}s
            </span>
          </div>
        )}
        {skill.requiresLevel && (
          <div>
            Requires level{' '}
            <span className="text-text tabular-nums">{skill.requiresLevel}</span>
          </div>
        )}
        {skill.requiresSkill && (
          <div>Requires skill «{skill.requiresSkill}»</div>
        )}
      </div>
      {skill.tags && skill.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {skill.tags.map((t) => (
            <span
              key={t}
              className="rounded border border-border bg-panel-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </aside>
  )
}

function formatPair(pair: [number, number]): string {
  // Renders a `[min, max]` integer tuple as either a single number ("12") or a "min-max" range ("12-18"). Used by SkillDetailsPanel to show effective rank ranges.
  return pair[0] === pair[1] ? String(pair[0]) : `${pair[0]}-${pair[1]}`
}

function SubtreeBonusBlock({
  skill,
  subskillRanks,
  enemyConditions,
}: {
  skill: Skill
  subskillRanks: Record<string, number>
  enemyConditions: Record<string, boolean>
}) {
  // Renders the "Subtree bonuses" block inside SkillDetailsPanel: aggregates allocated subskill stats via `aggregateSubskillStats` (gated on enemy conditions) and lists them, plus a per-proc breakdown showing chance, trigger, effects and applied states. Shown only when at least one allocated subskill contributes.
  const agg = useMemo(
    () => aggregateSubskillStats(skill, subskillRanks, enemyConditions),
    [skill, subskillRanks, enemyConditions],
  )
  const statEntries = Object.entries(agg.stats)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))

  const activeProcs = useMemo(() => {
    const out: { sub: SubskillNode; rank: number }[] = []
    for (const sub of skill.subskills ?? []) {
      if (!sub.proc) continue
      const rank = subskillRanks[subskillKey(skill.id, sub.id)] ?? 0
      if (rank <= 0) continue
      out.push({ sub, rank })
    }
    return out
  }, [skill, subskillRanks])

  if (statEntries.length === 0 && activeProcs.length === 0) return null

  return (
    <div className="mb-3 rounded border border-border bg-panel-2 p-2 text-xs tabular-nums">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">
        Subtree bonuses
      </div>
      {statEntries.length > 0 && (
        <div className="space-y-0.5">
          {statEntries.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-text/80">{statName(k)}</span>
              <span className="text-accent">{formatValue(v, k)}</span>
            </div>
          ))}
        </div>
      )}
      {activeProcs.length > 0 && (
        <div
          className={`space-y-1.5 ${statEntries.length > 0 ? 'mt-2 border-t border-border pt-2' : ''}`}
        >
          {activeProcs.map(({ sub, rank }) => {
            const proc = sub.proc!
            const chance =
              (proc.chance.base ?? 0) + (proc.chance.perRank ?? 0) * rank
            const effectParts: string[] = []
            const baseMap: Record<string, number> = proc.effects?.base ?? {}
            const perRankMap: Record<string, number> = proc.effects?.perRank ?? {}
            for (const [k, base] of Object.entries(baseMap)) {
              const per = perRankMap[k] ?? 0
              const v = base + per * rank
              if (v === 0) continue
              effectParts.push(`${formatValue(v, k)} ${statName(k)}`)
            }
            for (const [k, per] of Object.entries(perRankMap)) {
              if (k in baseMap) continue
              const v = per * rank
              if (v === 0) continue
              effectParts.push(`${formatValue(v, k)} ${statName(k)}`)
            }
            for (const s of proc.appliesStates ?? []) {
              if (typeof s === 'string') {
                effectParts.push(`applies ${s.replace(/_/g, ' ')}`)
              } else {
                const amt =
                  (s.amount?.base ?? 0) + (s.amount?.perRank ?? 0) * rank
                effectParts.push(
                  amt
                    ? `applies ${s.state.replace(/_/g, ' ')} (${amt}%)`
                    : `applies ${s.state.replace(/_/g, ' ')}`,
                )
              }
            }
            return (
              <div key={sub.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-text/85">{sub.name}</span>
                  <span className="tabular-nums">
                    <span className="text-accent">{chance}%</span>{' '}
                    <span className="text-muted">
                      {proc.trigger.replace('_', ' ')}
                    </span>
                  </span>
                </div>
                <div className="text-text/60 leading-snug">
                  {effectParts.join(', ')}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


function SkillEffectsBlock({
  skill,
  currentRank,
  effRankMin,
  effRankMax,
  allClassSkills,
  skillRanks,
  attributes,
}: {
  skill: Skill
  currentRank: number
  effRankMin: number
  effRankMax: number
  allClassSkills: Skill[]
  skillRanks: Record<string, number>
  attributes: Record<AttributeKey, RangedValue>
}) {
  // Renders the per-skill numeric breakdown inside SkillDetailsPanel: damage tables / formulas, mana cost, area of effect, cast time, applied states, and the synergy contributions from other skills + attributes that scale this skill. Used by SkillDetailsPanel.
  const allocated = currentRank > 0
  const curMin = allocated ? effRankMin : 1
  const curMax = allocated ? effRankMax : 1
  const nextMin =
    allocated && curMin < skill.maxRank ? curMin + 1 : null
  const nextMax =
    allocated && curMax < skill.maxRank ? curMax + 1 : null

  const passiveCurMin = passiveStatsAtRank(skill, curMin)
  const passiveCurMax = passiveStatsAtRank(skill, curMax)
  const passiveNextMin =
    nextMin !== null ? passiveStatsAtRank(skill, nextMin) : null
  const passiveNextMax =
    nextMax !== null ? passiveStatsAtRank(skill, nextMax) : null

  const manaCurMin = manaCostAtRank(skill, curMin)
  const manaCurMax = manaCostAtRank(skill, curMax)
  const manaNextMin = nextMin !== null ? manaCostAtRank(skill, nextMin) : undefined
  const manaNextMax = nextMax !== null ? manaCostAtRank(skill, nextMax) : undefined

  const computeBaseDmg = (rank: number): [number, number] | null => {
    if (skill.damageFormula) {
      const v = skill.damageFormula.base + skill.damageFormula.perLevel * rank
      return [v, v]
    }
    if (skill.damagePerRank) {
      const idx = Math.min(rank, skill.damagePerRank.length) - 1
      if (idx >= 0) {
        const d = skill.damagePerRank[idx]!
        return [d.min, d.max]
      }
    }
    return null
  }
  const baseDmgCurMin = computeBaseDmg(curMin)
  const baseDmgCurMax = computeBaseDmg(curMax)
  const baseDmgNextMin = nextMin !== null ? computeBaseDmg(nextMin) : null
  const baseDmgNextMax = nextMax !== null ? computeBaseDmg(nextMax) : null

  const synergiesReceived: Array<{
    source: string
    perLabel: string
    sourceMin: number
    sourceMax: number
    pctMin: number
    pctMax: number
    stat: string
  }> = []
  if (allocated) {
    for (const bs of skill.bonusSources ?? []) {
      if (bs.per === 'skill_level') {
        const srcKey = normalizeSkillName(bs.source)
        const srcSkill = allClassSkills.find(
          (s) => normalizeSkillName(s.name) === srcKey,
        )
        if (!srcSkill) continue
        const rank = skillRanks[srcSkill.id] ?? 0
        if (rank === 0) continue
        synergiesReceived.push({
          source: bs.source,
          perLabel: `rank ${rank}`,
          sourceMin: rank,
          sourceMax: rank,
          pctMin: rank * bs.value,
          pctMax: rank * bs.value,
          stat: bs.stat,
        })
      } else if (bs.per === 'attribute_point') {
        const attrKey = (
          Object.keys(attributes) as AttributeKey[]
        ).find((k) => k.toLowerCase() === bs.source.trim().toLowerCase())
        if (!attrKey) continue
        const attr = attributes[attrKey] ?? 0
        const aMin = typeof attr === 'number' ? attr : attr[0]
        const aMax = typeof attr === 'number' ? attr : attr[1]
        if (aMin === 0 && aMax === 0) continue
        synergiesReceived.push({
          source: bs.source,
          perLabel: aMin === aMax ? `${aMin}` : `${aMin}-${aMax}`,
          sourceMin: aMin,
          sourceMax: aMax,
          pctMin: aMin * bs.value,
          pctMax: aMax * bs.value,
          stat: bs.stat,
        })
      }
    }
  }

  const synergiesProvided: Array<{
    target: string
    pctCurMin: number
    pctCurMax: number
    pctNextMin: number | null
    pctNextMax: number | null
    stat: string
  }> = []
  for (const other of allClassSkills) {
    for (const bs of other.bonusSources ?? []) {
      if (
        bs.per === 'skill_level' &&
        normalizeSkillName(bs.source) === normalizeSkillName(skill.name)
      ) {
        synergiesProvided.push({
          target: other.name,
          pctCurMin: bs.value * curMin,
          pctCurMax: bs.value * curMax,
          pctNextMin: nextMin !== null ? bs.value * nextMin : null,
          pctNextMax: nextMax !== null ? bs.value * nextMax : null,
          stat: bs.stat,
        })
      }
    }
  }

  const passiveKeys = new Set([
    ...Object.keys(passiveCurMin),
    ...Object.keys(passiveCurMax),
  ])
  const hasAnything =
    passiveKeys.size > 0 ||
    baseDmgCurMin !== null ||
    manaCurMin !== undefined ||
    synergiesProvided.length > 0 ||
    synergiesReceived.length > 0 ||
    (skill.bonusSources?.length ?? 0) > 0

  if (!hasAnything) return null

  const rankLabel =
    curMin === curMax ? String(curMin) : `${curMin}-${curMax}`
  const nextRankLabel =
    nextMin === null
      ? null
      : nextMin === nextMax
        ? String(nextMin)
        : `${nextMin}-${nextMax}`

  return (
    <div className="mb-3 rounded border border-border bg-panel-2 p-2 text-xs">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted">
          {allocated ? 'Effects' : 'Preview (not learned)'}
        </span>
        <span className="text-[10px] tabular-nums text-muted">
          rank {rankLabel}
          {nextRankLabel && ` → ${nextRankLabel}`}
        </span>
      </div>
      <div className="space-y-0.5 tabular-nums">
        {baseDmgCurMin && baseDmgCurMax && (
          <EffRow
            label="Base damage"
            cur={formatDmgRange(baseDmgCurMin, baseDmgCurMax)}
            next={
              baseDmgNextMin && baseDmgNextMax
                ? formatDmgRange(baseDmgNextMin, baseDmgNextMax)
                : undefined
            }
            color={allocated ? 'text-accent' : 'text-muted'}
          />
        )}
        {manaCurMin !== undefined && manaCurMax !== undefined && (
          <EffRow
            label="Mana cost"
            cur={formatPair([manaCurMin, manaCurMax])}
            next={
              manaNextMin !== undefined && manaNextMax !== undefined
                ? formatPair([manaNextMin, manaNextMax])
                : undefined
            }
            color={allocated ? 'text-sky-300' : 'text-muted'}
          />
        )}
        {[...passiveKeys].map((key) => {
          const vMin = passiveCurMin[key] ?? 0
          const vMax = passiveCurMax[key] ?? 0
          const nMin = passiveNextMin ? passiveNextMin[key] : undefined
          const nMax = passiveNextMax ? passiveNextMax[key] : undefined
          return (
            <EffRow
              key={key}
              label={statName(key)}
              cur={formatStatPair(key, vMin, vMax)}
              next={
                nMin !== undefined && nMax !== undefined
                  ? formatStatPair(key, nMin, nMax)
                  : undefined
              }
              color={allocated ? 'text-accent' : 'text-muted'}
            />
          )
        })}
        {synergiesProvided.map((s, i) => (
          <EffRow
            key={i}
            label={`→ ${s.target}`}
            cur={formatStatPair(s.stat, s.pctCurMin, s.pctCurMax)}
            next={
              s.pctNextMin !== null && s.pctNextMax !== null
                ? formatStatPair(s.stat, s.pctNextMin, s.pctNextMax)
                : undefined
            }
            color={allocated ? 'text-yellow-300' : 'text-muted'}
          />
        ))}
      </div>
      {(skill.bonusSources?.length ?? 0) > 0 && (
        <div className="mt-2 border-t border-border pt-1.5">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">
            Receives synergy from
          </div>
          {(skill.bonusSources ?? []).map((bs, i) => {
            const matched = synergiesReceived.find(
              (sr) => sr.source === bs.source && sr.stat === bs.stat,
            )
            return (
              <div
                key={i}
                className="flex items-baseline justify-between gap-2 tabular-nums"
              >
                <span className="text-text/80 truncate">
                  {bs.source}{' '}
                  <span className="text-muted text-[10px]">
                    ({bs.value}% per{' '}
                    {bs.per === 'skill_level' ? 'rank' : 'point'})
                  </span>
                </span>
                <span
                  className={
                    matched ? 'text-yellow-300' : 'text-muted'
                  }
                >
                  {matched
                    ? formatStatPair(bs.stat, matched.pctMin, matched.pctMax)
                    : '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatStatPair(key: string, min: number, max: number): string {
  // Renders a `[min, max]` stat range as either a single signed value or "min-max" with the per-stat unit suffix. Used by SkillEffectsBlock.
  if (min === max) return formatValue(min, key)
  return `${formatValue(min, key)}-${formatValue(max, key).replace(/^[+-]/, '')}`
}

function formatDmgRange(min: [number, number], max: [number, number]): string {
  // Renders a damage range that itself has min/max bounds. Collapses to a single tuple when both endpoints match. Used by SkillEffectsBlock for hit ranges.
  if (min[0] === max[0] && min[1] === max[1]) return formatRangeTuple(min)
  return `${formatRangeTuple(min)} … ${formatRangeTuple(max)}`
}

function formatRangeTuple([min, max]: [number, number]): string {
  // Renders a single `[min, max]` tuple as "min-max" (or just "min" when both ends match), rounding each end to two decimals. Used by formatDmgRange.
  const m = Math.round(min * 100) / 100
  const mx = Math.round(max * 100) / 100
  if (m === mx) return String(m)
  return `${m}-${mx}`
}

function EffRow({
  label,
  cur,
  next,
  color,
}: {
  label: string
  cur: string
  next?: string
  color: string
}) {
  // Renders a single label / current → next-rank value row inside SkillEffectsBlock. Used for every numeric line that benefits from showing the user the impact of taking the next rank.
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="text-text/80 truncate" title={label}>
        {label}
      </span>
      <span className="whitespace-nowrap shrink-0">
        <span className={color}>{cur}</span>
        {next && next !== cur && (
          <>
            <span className="text-muted"> → </span>
            <span className={color}>{next}</span>
          </>
        )}
      </span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  // Renders the centred "nothing to show" placeholder used by SkillsView when the active class has no skills (or no class is selected).
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted">
      {message}
    </div>
  )
}
