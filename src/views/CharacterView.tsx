import { classes, gameConfig, getClass } from '../data'
import { attrPointsFor, finalAttributes, useBuild } from '../store/build'

/**
 * Click → 1, Shift+Click → 5, Ctrl/Cmd+Shift+Click → all available (clamped
 * by `cap` so we never overshoot remaining points or current allocation).
 */
function attrStep(e: React.MouseEvent, cap: number): number {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey) return cap
  if (e.shiftKey) return Math.min(5, cap)
  return 1
}

export default function CharacterView() {
  const { classId, level, allocated, setClass, setLevel, incAttr, decAttr, resetAttrs } =
    useBuild()

  const cls = classId ? getClass(classId) : undefined
  const finals = finalAttributes(classId, allocated)
  const spent = Object.values(allocated).reduce((s, v) => s + v, 0)
  const total = attrPointsFor(level)
  const remaining = total - spent

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Character</h2>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Class">
          {classes.length === 0 ? (
            <p className="text-muted text-sm">
              No classes found. Add a file in{' '}
              <code className="text-accent">src/data/classes/*.json</code>.
            </p>
          ) : (
            <select
              value={classId ?? ''}
              onChange={(e) => setClass(e.target.value)}
              className="w-full bg-panel-2 border border-border rounded-md px-3 py-2 text-sm"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {cls?.description && (
            <p className="text-muted text-sm mt-3">{cls.description}</p>
          )}
          {cls?.primaryAttribute && (
            <p className="text-xs text-muted mt-2">
              Primary attribute:{' '}
              <span className="text-accent">
                {gameConfig.attributes.find((a) => a.key === cls.primaryAttribute)
                  ?.name ?? cls.primaryAttribute}
              </span>
            </p>
          )}
        </Panel>

        <Panel title="Level">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={gameConfig.maxCharacterLevel}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="flex-1"
              style={{
                ['--sl-pct' as never]:
                  ((level - 1) /
                    Math.max(1, gameConfig.maxCharacterLevel - 1)) *
                    100 +
                  '%',
              }}
            />
            <input
              type="number"
              min={1}
              max={gameConfig.maxCharacterLevel}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="w-20 bg-panel-2 border border-border rounded-md px-2 py-1 text-sm text-center"
            />
          </div>
          <div className="mt-3 flex justify-between text-xs text-muted">
            <span>1</span>
            <span>
              Max {gameConfig.maxCharacterLevel} · +{gameConfig.etherMaxLevel}{' '}
              Ether
            </span>
          </div>
        </Panel>
      </section>

      <section>
        <Panel
          title="Attributes"
          right={
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted">Points:</span>
              <span className={remaining > 0 ? 'text-accent' : 'text-muted'}>
                {remaining}
              </span>
              <span className="text-muted">/ {total}</span>
              <button
                onClick={resetAttrs}
                disabled={spent === 0}
                className="text-xs px-2 py-1 rounded border border-border text-muted hover:text-text hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Reset
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {gameConfig.attributes.map((attr) => {
              const base =
                (gameConfig.defaultBaseAttributes?.[attr.key] ?? 0) +
                (cls?.baseAttributes[attr.key] ?? 0)
              const added = allocated[attr.key] ?? 0
              const final = finals[attr.key] ?? 0
              return (
                <div
                  key={attr.key}
                  className="flex items-center justify-between bg-panel-2 border border-border rounded-md px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">{attr.name}</div>
                    <div className="text-xs text-muted">
                      base {base}
                      {added > 0 && (
                        <span className="text-accent"> +{added}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => decAttr(attr.key, attrStep(e, added))}
                      disabled={added === 0}
                      title="−1 · Shift −5 · Ctrl+Shift remove all"
                      className="w-7 h-7 rounded bg-panel border border-border text-muted hover:text-text hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      −
                    </button>
                    <div className="w-12 text-center text-lg font-semibold tabular-nums">
                      {final}
                    </div>
                    <button
                      onClick={(e) => incAttr(attr.key, attrStep(e, remaining))}
                      disabled={remaining === 0}
                      title="+1 · Shift +5 · Ctrl+Shift add all"
                      className="w-7 h-7 rounded bg-panel border border-border text-muted hover:text-text hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </section>
    </div>
  )
}

function Panel({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-muted">
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  )
}
