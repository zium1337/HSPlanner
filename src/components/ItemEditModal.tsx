import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBuild } from '../store/build'
import {
  parseItem,
  serializeItem,
  type ParsedItem,
} from '../utils/itemSerialize'
import type { EquippedItem, ItemBase, SlotKey } from '../types'

interface Props {
  slot: SlotKey
  equipped: EquippedItem
  base: ItemBase
  onClose: () => void
}

export default function ItemEditModal({
  slot,
  equipped,
  base,
  onClose,
}: Props) {
  // PoB-style text editor for the equipped item. Serializes the current item to text on open and parses the textarea on every keystroke; the right panel previews how the parser interpreted each line so the user can validate before saving. Save applies the parsed item via store actions (equipItem resets the slot, then sockets/stars/affixes/forge/augment are applied on top).
  const initial = useMemo(
    () => serializeItem(equipped, base),
    [equipped, base],
  )
  const [text, setText] = useState(initial)
  const parsed = useMemo(() => parseItem(text), [text])

  const equipItem = useBuild((s) => s.equipItem)
  const setSocketCount = useBuild((s) => s.setSocketCount)
  const setSocketed = useBuild((s) => s.setSocketed)
  const setSocketType = useBuild((s) => s.setSocketType)
  const setStars = useBuild((s) => s.setStars)
  const addAffix = useBuild((s) => s.addAffix)
  const setAffixRoll = useBuild((s) => s.setAffixRoll)
  const addForgedMod = useBuild((s) => s.addForgedMod)
  const setAugment = useBuild((s) => s.setAugment)
  const setAugmentLevel = useBuild((s) => s.setAugmentLevel)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const canSave = parsed.baseId != null && parsed.errors.length === 0

  function applyAndClose() {
    if (!canSave || !parsed.baseId) return
    apply(slot, parsed, {
      equipItem,
      setSocketCount,
      setSocketed,
      setSocketType,
      setStars,
      addAffix,
      setAffixRoll,
      addForgedMod,
      setAugment,
      setAugmentLevel,
    })
    onClose()
  }

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm"
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
        className="relative flex h-[88vh] w-[1040px] max-w-[96vw] flex-col overflow-hidden rounded-[6px] border border-border"
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
              Edit Item Text
              <span className="text-accent-hot">· {base.name}</span>
            </div>
            <h2
              className="m-0 text-[18px] font-semibold tracking-[0.02em] text-accent-hot"
              style={{
                textShadow: '0 0 16px rgba(224,184,100,0.15)',
              }}
            >
              Item Source
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-[3px] border border-border-2 bg-panel-2 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Close
          </button>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex w-1/2 shrink-0 flex-col border-r border-border">
            <div className="border-b border-border px-3 py-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                Source · editable
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[12px] leading-[1.6] text-text outline-none focus:bg-black/20"
              style={{
                tabSize: 2,
              }}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-border px-3 py-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                Parser preview
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[12px] leading-[1.6]">
              <PreviewPanel parsed={parsed} />
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-border bg-black/30 px-4 py-3">
          <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.06em]">
            <StatusPill
              label={`${parsed.notes.length} parsed`}
              tone="ok"
            />
            {parsed.warnings.length > 0 && (
              <StatusPill
                label={`${parsed.warnings.length} warning${
                  parsed.warnings.length === 1 ? '' : 's'
                }`}
                tone="warn"
              />
            )}
            {parsed.errors.length > 0 && (
              <StatusPill
                label={`${parsed.errors.length} error${
                  parsed.errors.length === 1 ? '' : 's'
                }`}
                tone="err"
              />
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setText(initial)}
              disabled={text === initial}
              className="rounded-[3px] border border-border-2 bg-transparent px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="rounded-[3px] border border-border-2 bg-transparent px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
            >
              Cancel
            </button>
            <button
              disabled={!canSave}
              onClick={applyAndClose}
              className="rounded-[3px] border border-accent-deep px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-hot transition-all enabled:hover:border-accent-hot enabled:hover:shadow-[0_0_14px_rgba(224,184,100,0.3)] disabled:cursor-not-allowed disabled:border-border-2 disabled:text-faint"
              style={
                canSave
                  ? {
                      background: 'linear-gradient(180deg, #3a2f1a, #2a2418)',
                    }
                  : undefined
              }
            >
              Save
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function PreviewPanel({ parsed }: { parsed: ParsedItem }) {
  if (
    parsed.notes.length === 0 &&
    parsed.warnings.length === 0 &&
    parsed.errors.length === 0
  ) {
    return (
      <p className="text-[11px] italic text-faint">
        Start typing on the left — the parser will preview each line here.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {parsed.errors.length > 0 && (
        <PreviewBlock label="Errors" tone="err" lines={parsed.errors} />
      )}
      {parsed.warnings.length > 0 && (
        <PreviewBlock label="Warnings" tone="warn" lines={parsed.warnings} />
      )}
      {parsed.notes.length > 0 && (
        <PreviewBlock label="Parsed" tone="ok" lines={parsed.notes} />
      )}
    </div>
  )
}

function PreviewBlock({
  label,
  tone,
  lines,
}: {
  label: string
  tone: 'ok' | 'warn' | 'err'
  lines: string[]
}) {
  const headerClass =
    tone === 'ok'
      ? 'text-accent-hot'
      : tone === 'warn'
        ? 'text-amber-300'
        : 'text-red-400'
  const lineClass =
    tone === 'ok'
      ? 'text-text/85'
      : tone === 'warn'
        ? 'text-amber-200/85'
        : 'text-red-300'
  const symbol = tone === 'ok' ? '✓' : tone === 'warn' ? '⚠' : '✗'
  return (
    <div>
      <div
        className={`mb-1 font-mono text-[10px] uppercase tracking-[0.14em] ${headerClass}`}
      >
        {label}
      </div>
      <ul className="space-y-0.5">
        {lines.map((l, i) => (
          <li
            key={i}
            className={`flex gap-2 font-mono text-[11px] leading-[1.5] ${lineClass}`}
          >
            <span className="shrink-0 text-faint">{symbol}</span>
            <span className="break-words">{l}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatusPill({
  label,
  tone,
}: {
  label: string
  tone: 'ok' | 'warn' | 'err'
}) {
  const cls =
    tone === 'ok'
      ? 'text-accent-hot border-accent-deep'
      : tone === 'warn'
        ? 'text-amber-300 border-amber-400/40'
        : 'text-red-300 border-red-500/40'
  return (
    <span
      className={`rounded-[3px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${cls}`}
    >
      {label}
    </span>
  )
}

interface ApplyDeps {
  equipItem: (slot: SlotKey, baseId: string) => void
  setSocketCount: (slot: SlotKey, count: number) => void
  setSocketed: (slot: SlotKey, idx: number, id: string | null) => void
  setSocketType: (
    slot: SlotKey,
    idx: number,
    type: 'normal' | 'rainbow',
  ) => void
  setStars: (slot: SlotKey, count: number) => void
  addAffix: (slot: SlotKey, affixId: string, tier: number) => void
  setAffixRoll: (slot: SlotKey, idx: number, roll: number) => void
  addForgedMod: (slot: SlotKey, modId: string, tier: number) => void
  setAugment: (id: string | null) => void
  setAugmentLevel: (level: number) => void
}

function apply(slot: SlotKey, parsed: ParsedItem, deps: ApplyDeps): void {
  // Applies a fully-parsed ParsedItem to the supplied slot. Always re-equips the base (which resets sockets/affixes/etc.) and then rebuilds the slot from the parsed fields. Used by ItemEditModal's Save handler.
  if (!parsed.baseId) return

  deps.equipItem(slot, parsed.baseId)

  if (parsed.stars != null) {
    deps.setStars(slot, parsed.stars)
  }

  const explicitCount = parsed.socketCount
  const fromList = parsed.socketed.length
  const targetCount = explicitCount ?? (fromList > 0 ? fromList : null)
  if (targetCount != null) {
    deps.setSocketCount(slot, targetCount)
  }

  for (let i = 0; i < parsed.socketed.length; i++) {
    const s = parsed.socketed[i]
    if (!s) continue
    if (s.id) deps.setSocketed(slot, i, s.id)
    if (s.type === 'rainbow') deps.setSocketType(slot, i, 'rainbow')
  }

  for (let i = 0; i < parsed.affixes.length; i++) {
    const a = parsed.affixes[i]!
    deps.addAffix(slot, a.affixId, a.tier)
    if (a.roll !== 1) deps.setAffixRoll(slot, i, a.roll)
  }

  for (const m of parsed.forgedMods) {
    deps.addForgedMod(slot, m.affixId, m.tier)
  }

  if (parsed.hasAugmentLine) {
    if (parsed.augment) {
      deps.setAugment(parsed.augment.id)
      deps.setAugmentLevel(parsed.augment.level)
    } else {
      deps.setAugment(null)
    }
  }
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
