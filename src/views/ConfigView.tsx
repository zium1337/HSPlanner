import { useMemo, type ReactNode } from 'react'
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
  { key: 'shocked', label: 'Enemy is Stasis' },
  { key: 'deep_frozen', label: 'Enemy is Deep Frozen' },
  { key: 'is_boss', label: 'Target is Boss' },
]

const ENEMY_RESISTANCE_TYPES: { key: string; label: string }[] = [
  { key: 'fire', label: 'Fire' },
  { key: 'cold', label: 'Cold' },
  { key: 'lightning', label: 'Lightning' },
  { key: 'poison', label: 'Poison' },
  { key: 'arcane', label: 'Arcane' },
]

const RESIST_COLOR: Record<string, string> = {
  fire: 'text-stat-red',
  cold: 'text-stat-blue',
  lightning: 'text-stat-orange',
  poison: 'text-stat-green',
  arcane: 'text-stat-purple',
}

export default function ConfigView() {
  // Combat-context configuration view that lets the user toggle which class buffs are active, which enemy ailments / states the target has, the per-element enemy resistance values, and freeform "Custom Config" overrides that feed into the stats pipeline as additional contributions.
  const classId = useBuild((s) => s.classId)
  const skillRanks = useBuild((s) => s.skillRanks)
  const activeBuffs = useBuild((s) => s.activeBuffs)
  const setBuffActive = useBuild((s) => s.setBuffActive)
  const enemyConditions = useBuild((s) => s.enemyConditions)
  const setEnemyCondition = useBuild((s) => s.setEnemyCondition)
  const enemyResistances = useBuild((s) => s.enemyResistances)
  const setEnemyResistance = useBuild((s) => s.setEnemyResistance)
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

  const activeBuffCount = buffSkills.filter((s) => !!activeBuffs[s.id]).length
  const activeConditionCount = ENEMY_CONDITIONS.filter(
    (c) => !!enemyConditions[c.key],
  ).length
  const activeResistanceCount = ENEMY_RESISTANCE_TYPES.filter(
    (r) => enemyResistances[r.key] !== undefined && enemyResistances[r.key] !== null,
  ).length

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h2
          className="m-0 text-[22px] font-semibold tracking-[0.02em] text-accent-hot"
          style={{ textShadow: '0 0 16px rgba(224,184,100,0.18)' }}
        >
          Configuration
        </h2>
      </header>

      <Panel
        title="Active Buffs"
        subtitle="Enable buffs you have cast and are currently active."
        trailing={
          <CountBadge
            value={activeBuffCount}
            total={buffSkills.length}
            highlight={activeBuffCount > 0}
          />
        }
      >
        {buffSkills.length === 0 ? (
          <p className="font-mono text-[12px] tracking-[0.04em] text-muted italic">
            No buffs available for this class.
          </p>
        ) : (
          <ul className="space-y-2">
            {buffSkills.map((s) => {
              const rank = skillRanks[s.id] ?? 0
              const ready = rank > 0
              const checked = !!activeBuffs[s.id]
              return (
                <li key={s.id}>
                  <label
                    className={`flex items-center justify-between gap-3 rounded-[3px] border px-3 py-2 transition-colors ${
                      ready
                        ? checked
                          ? 'cursor-pointer border-accent-deep'
                          : 'cursor-pointer border-border-2 hover:border-accent-deep'
                        : 'border-border opacity-60'
                    }`}
                    style={{
                      background: checked
                        ? 'linear-gradient(180deg, rgba(58,46,24,0.5), rgba(28,29,36,0.5))'
                        : 'linear-gradient(180deg, var(--color-panel-2), color-mix(in srgb, var(--color-bg) 70%, transparent))',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setBuffActive(s.id, e.target.checked)
                        }
                        disabled={!ready}
                      />
                      <SkillIconImage
                        icon={s.icon}
                        size={32}
                        className="text-2xl"
                      />
                      <span className="min-w-0">
                        <div
                          className={`truncate text-sm font-medium ${checked ? 'text-accent-hot' : 'text-text'}`}
                        >
                          {s.name}
                        </div>
                        <div className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                          {ready ? `rank ${rank}` : 'not learned'}
                          {s.tags && s.tags.length > 0 && (
                            <>
                              {' · '}
                              {s.tags.join(', ')}
                            </>
                          )}
                        </div>
                      </span>
                    </span>
                    {s.effectDuration !== undefined && (
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-faint tabular-nums">
                        <span className="text-text">{s.effectDuration}</span>
                        s duration
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
        subtitle='Conditions on the target — used by stat modifiers like "+X% damage to burning enemies".'
        trailing={
          <CountBadge
            value={activeConditionCount}
            total={ENEMY_CONDITIONS.length}
            highlight={activeConditionCount > 0}
          />
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ENEMY_CONDITIONS.map((c) => {
            const checked = !!enemyConditions[c.key]
            return (
              <label
                key={c.key}
                className={`flex cursor-pointer items-center gap-2 rounded-[3px] border px-3 py-2 text-sm transition-colors ${checked ? 'border-accent-deep' : 'border-border-2 hover:border-accent-deep'}`}
                style={{
                  background: checked
                    ? 'linear-gradient(180deg, rgba(58,46,24,0.5), rgba(28,29,36,0.5))'
                    : 'linear-gradient(180deg, var(--color-panel-2), color-mix(in srgb, var(--color-bg) 70%, transparent))',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    setEnemyCondition(c.key, e.target.checked)
                  }
                />
                <span className={checked ? 'text-accent-hot' : 'text-text'}>
                  {c.label}
                </span>
              </label>
            )
          })}
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-faint italic">
          Future stat modifiers can reference these flags (currently UI-only).
        </p>
      </Panel>

      <Panel
        title="Enemy Resistances"
        subtitle="Per-element resistance % the target has. Damage modifier = 1 − (Enemy Res × (1 − Ignore)). 100% Ignore fully bypasses resistance; lower values help proportionally even against immune targets."
        trailing={
          <CountBadge
            value={activeResistanceCount}
            total={ENEMY_RESISTANCE_TYPES.length}
            highlight={activeResistanceCount > 0}
          />
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ENEMY_RESISTANCE_TYPES.map((r) => {
            const value = enemyResistances[r.key]
            const colorClass = RESIST_COLOR[r.key] ?? 'text-text'
            return (
              <label
                key={r.key}
                className="flex items-center justify-between gap-2 rounded-[3px] border border-border-2 px-3 py-2 text-sm transition-colors hover:border-accent-deep"
                style={{
                  background:
                    'linear-gradient(180deg, var(--color-panel-2), color-mix(in srgb, var(--color-bg) 70%, transparent))',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
                }}
              >
                <span
                  className={`font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${colorClass}`}
                >
                  {r.label}
                </span>
                <div
                  className="inline-flex items-center rounded-[3px] border border-border-2 px-1.5 transition-colors focus-within:border-accent-hot"
                  style={{
                    background:
                      'linear-gradient(180deg, #0d0e12, var(--color-panel-2))',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
                  }}
                >
                  <input
                    type="number"
                    value={value ?? ''}
                    placeholder="0"
                    onChange={(e) => {
                      const raw = e.target.value
                      if (raw === '') {
                        setEnemyResistance(r.key, null)
                        commitActiveProfile()
                        return
                      }
                      const n = Number(raw)
                      if (!Number.isFinite(n)) return
                      setEnemyResistance(r.key, n)
                      commitActiveProfile()
                    }}
                    className="w-12 bg-transparent py-0.5 text-right font-mono text-[12px] tabular-nums text-accent-hot outline-none"
                  />
                  <span className="font-mono text-[11px] text-faint">%</span>
                </div>
              </label>
            )
          })}
        </div>
      </Panel>

      <Panel
        title="Custom Config"
        subtitle="Add stats the engine doesn't compute yet. Pick a stat, enter a value — it stacks with regular sources and shows up in tooltips. Per-profile."
        trailing={
          <CountBadge
            value={customStats.length}
            highlight={customStats.length > 0}
          />
        }
      >
        {customStats.length === 0 ? (
          <p className="font-mono text-[12px] tracking-[0.04em] text-muted italic">
            No custom stats yet. Click "Add stat" to override or supplement a
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
                  className="space-y-1.5 rounded-[3px] border border-border-2 px-2.5 py-2"
                  style={{
                    background:
                      'linear-gradient(180deg, var(--color-panel-2), color-mix(in srgb, var(--color-bg) 70%, transparent))',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
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
                    <div
                      className="inline-flex w-40 shrink-0 items-center rounded-[3px] border border-border-2 px-2 py-1 transition-colors focus-within:border-accent-hot"
                      style={{
                        background:
                          'linear-gradient(180deg, #0d0e12, var(--color-panel-2))',
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
                      }}
                    >
                      <input
                        value={cs.value}
                        placeholder="Value (e.g. 100, 100%, 12-18)"
                        onChange={(e) =>
                          updateCustomStat(i, { value: e.target.value })
                        }
                        onBlur={() => commitActiveProfile()}
                        className="w-full bg-transparent text-right font-mono text-[12px] tabular-nums text-text outline-none"
                      />
                    </div>
                    <button
                      onClick={() => {
                        removeCustomStat(i)
                        commitActiveProfile()
                      }}
                      className="rounded-[3px] border border-border-2 bg-transparent px-2 py-1 font-mono text-[12px] text-muted transition-colors hover:border-stat-red hover:text-stat-red"
                      title="Remove"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                  <div
                    className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                      willApply
                        ? 'text-stat-green'
                        : cs.statKey
                          ? 'text-stat-orange'
                          : 'text-faint italic'
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
          className="mt-3 rounded-[3px] border border-accent-deep px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-hot transition-colors hover:border-accent-hot hover:text-[#fff0c4]"
          style={{
            background: 'linear-gradient(180deg, #3a2f1a, #2a2418)',
          }}
        >
          + Add stat
        </button>
      </Panel>
    </div>
  )
}

function CountBadge({
  value,
  total,
  highlight,
}: {
  value: number
  total?: number
  highlight?: boolean
}) {
  // Renders a small mono "active / total" count chip at the right side of a Panel header in ConfigView.
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
      <span className={highlight ? 'text-accent-hot' : 'text-muted'}>
        {value}
      </span>
      {total !== undefined && <span className="text-faint"> / {total}</span>}{' '}
      {total !== undefined ? 'active' : 'override' + (value === 1 ? '' : 's')}
    </span>
  )
}

function Panel({
  title,
  subtitle,
  trailing,
  children,
}: {
  title: string
  subtitle?: string
  trailing?: ReactNode
  children: ReactNode
}) {
  // Renders a titled section card with PickerModal-style chrome (gradient background, accent corners, sectionLabel header) used to group ConfigView's panels (Active Buffs, Enemy Conditions, Enemy Resistances, Custom Config), with an optional subtitle line and trailing slot for a count badge.
  return (
    <section
      className="relative overflow-hidden rounded-md border border-border p-4"
      style={{
        background:
          'linear-gradient(180deg, var(--color-panel), color-mix(in srgb, var(--color-bg) 70%, transparent))',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <PanelCornerMarks />
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-accent-deep/20 pb-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rotate-45 bg-accent-hot"
            style={{ boxShadow: '0 0 6px rgba(224,184,100,0.5)' }}
          />
          <h3 className="m-0 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-hot/70">
            {title}
          </h3>
        </div>
        {trailing}
      </div>
      {subtitle && (
        <p className="mb-3 text-[12px] leading-relaxed text-muted">{subtitle}</p>
      )}
      {children}
    </section>
  )
}

function PanelCornerMarks() {
  // Renders the four small accent-deep L-marks at the panel's corners, matching PickerModal's chrome.
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 8,
    height: 8,
    border: '1px solid var(--color-accent-deep)',
    opacity: 0.45,
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
