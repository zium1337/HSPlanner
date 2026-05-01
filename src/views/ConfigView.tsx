import { useMemo } from 'react'
import SearchableSelect from '../components/SearchableSelect'
import { SkillIconImage } from '../components/SkillIconImage'
import { gameConfig, skills } from '../data'
import { useBuild } from '../store/build'
import { parseCustomStatValue } from '../utils/parseCustomStat'
import { formatValue, statDef } from '../utils/stats'

const ENEMY_CONDITIONS: { key: string; label: string }[] = [
  { key: 'burning', label: 'Enemy is Burning' },
  { key: 'poisoned', label: 'Enemy is Poisoned' },
  { key: 'frozen', label: 'Enemy is Frozen' },
  { key: 'stunned', label: 'Enemy is Stunned' },
  { key: 'bleeding', label: 'Enemy is Bleeding' },
  { key: 'shocked', label: 'Enemy is Shocked' },
  { key: 'low_life', label: 'Enemy is Low Life (<35%)' },
  { key: 'is_boss', label: 'Target is Boss' },
]

export default function ConfigView() {
  const classId = useBuild((s) => s.classId)
  const skillRanks = useBuild((s) => s.skillRanks)
  const activeBuffs = useBuild((s) => s.activeBuffs)
  const setBuffActive = useBuild((s) => s.setBuffActive)
  const enemyConditions = useBuild((s) => s.enemyConditions)
  const setEnemyCondition = useBuild((s) => s.setEnemyCondition)
  const customStats = useBuild((s) => s.customStats)
  const addCustomStat = useBuild((s) => s.addCustomStat)
  const updateCustomStat = useBuild((s) => s.updateCustomStat)
  const removeCustomStat = useBuild((s) => s.removeCustomStat)
  const commitActiveProfile = useBuild((s) => s.commitActiveProfile)

  const buffSkills = useMemo(() => {
    if (!classId) return []
    return skills.filter(
      (s) =>
        s.classId === classId &&
        (s.kind === 'buff' || (s.tags?.includes('Buff') ?? false)),
    )
  }, [classId])

  const statOptions = useMemo(
    () =>
      gameConfig.stats
        .filter((s) => !s.itemOnly && !s.skillScoped)
        .map((s) => ({
          id: s.key,
          label: s.name,
          hint: s.format === 'percent' ? '%' : 'flat',
        })),
    [],
  )

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Configuration</h2>
      </header>

      <Panel
        title="Active Buffs"
        subtitle="Enable buffs you have cast and are currently active."
      >
        {buffSkills.length === 0 ? (
          <p className="text-sm text-muted italic">
            No buffs available for this class.
          </p>
        ) : (
          <ul className="space-y-2">
            {buffSkills.map((s) => {
              const rank = skillRanks[s.id] ?? 0
              const ready = rank > 0
              return (
                <li key={s.id}>
                  <label
                    className={`flex items-center justify-between gap-3 rounded border border-border bg-panel-2 px-3 py-2 ${
                      ready
                        ? 'cursor-pointer hover:border-accent/50'
                        : 'opacity-60'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!activeBuffs[s.id]}
                        onChange={(e) => setBuffActive(s.id, e.target.checked)}
                        disabled={!ready}
                        className="accent-accent"
                      />
                      <SkillIconImage icon={s.icon} size={32} className="text-2xl" />
                      <span>
                        <div className="text-sm font-medium text-text">
                          {s.name}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-muted">
                          {ready ? `rank ${rank}` : 'not learned'} ·{' '}
                          {s.tags?.join(', ')}
                        </div>
                      </span>
                    </span>
                    {s.effectDuration !== undefined && (
                      <span className="text-xs text-muted tabular-nums">
                        {s.effectDuration}s duration
                      </span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title="Enemy Conditions"
        subtitle="Conditions on the target — used by stat modifiers like “+X% damage to burning enemies”."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ENEMY_CONDITIONS.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-center gap-2 rounded border border-border bg-panel-2 px-3 py-2 text-sm hover:border-accent/50"
            >
              <input
                type="checkbox"
                checked={!!enemyConditions[c.key]}
                onChange={(e) => setEnemyCondition(c.key, e.target.checked)}
                className="accent-accent"
              />
              <span className="text-text/90">{c.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted italic">
          Future stat modifiers can reference these flags (currently UI-only).
        </p>
      </Panel>

      <Panel
        title="Custom Config"
        subtitle="Add stats the engine doesn't compute yet. Pick a stat, enter a value — it stacks with regular sources and shows up in tooltips. Per-profile."
      >
        {customStats.length === 0 ? (
          <p className="text-sm text-muted italic">
            No custom stats yet. Click “Add stat” to override or supplement a
            calculated stat (e.g. Faster Cast Rate from a buff the engine
            doesn't know).
          </p>
        ) : (
          <ul className="space-y-2">
            {customStats.map((cs, i) => {
              const parsed = parseCustomStatValue(cs.value)
              const def = cs.statKey ? statDef(cs.statKey) : undefined
              const willApply = !!cs.statKey && parsed !== null
              const previewText =
                willApply && parsed !== null
                  ? `→ ${formatValue(parsed, cs.statKey)} ${def?.name ?? cs.statKey}`
                  : cs.statKey
                    ? 'unparseable value'
                    : 'pick a stat to apply'
              return (
                <li
                  key={i}
                  className="space-y-1.5 rounded border border-border bg-panel-2 px-2 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <SearchableSelect
                        value={cs.statKey || null}
                        options={statOptions}
                        placeholder="Pick stat…"
                        onChange={(id) => {
                          updateCustomStat(i, { statKey: id ?? '' })
                          commitActiveProfile()
                        }}
                      />
                    </div>
                    <input
                      value={cs.value}
                      placeholder="Value (e.g. 100, 100%, 12-18)"
                      onChange={(e) =>
                        updateCustomStat(i, { value: e.target.value })
                      }
                      onBlur={() => commitActiveProfile()}
                      className="w-40 shrink-0 rounded border border-border bg-panel px-2 py-1 text-sm tabular-nums"
                    />
                    <button
                      onClick={() => {
                        removeCustomStat(i)
                        commitActiveProfile()
                      }}
                      className="rounded border border-border bg-panel px-2 py-1 text-xs text-muted hover:border-red-500/50 hover:text-red-400"
                      title="Remove"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                  <div
                    className={`text-[10px] ${
                      willApply
                        ? 'text-emerald-400'
                        : cs.statKey
                          ? 'text-amber-400'
                          : 'text-muted italic'
                    }`}
                  >
                    {previewText}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <button
          onClick={() => addCustomStat()}
          className="mt-3 rounded border border-accent/50 bg-accent/10 px-3 py-1 text-xs text-accent hover:bg-accent/20"
        >
          + Add stat
        </button>
      </Panel>
    </div>
  )
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-panel border border-border rounded-lg p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-wider uppercase text-muted">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-muted/80 mt-1">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  )
}
