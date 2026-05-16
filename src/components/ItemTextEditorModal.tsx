import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { backdropVariants, panelVariants } from '../lib/motion'
import type { EquippedItem, ItemBase, SlotKey } from '../types'
import {
  parseItemText,
  serializeEquippedItem,
  type ParseError,
  type ParseResult,
} from '../utils/itemTextFormat'
import { CornerMarks } from './PickerModal'

interface Props {
  slot: SlotKey
  slotName: string
  equipped: EquippedItem
  base: ItemBase
  onSave: (next: EquippedItem) => void
  onClose: () => void
}

export default function ItemTextEditorModal({
  slot: _slot,
  slotName,
  equipped,
  base,
  onSave,
  onClose,
}: Props) {
  const initialText = useMemo(
    () => serializeEquippedItem(equipped, base),
    [equipped, base],
  )
  const [text, setText] = useState(initialText)
  const [result, setResult] = useState<ParseResult>(() =>
    parseItemText(initialText, base.id),
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const handle = setTimeout(() => {
      setResult(parseItemText(text, base.id))
    }, 200)
    return () => clearTimeout(handle)
  }, [text, base.id])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const errorCount = result.errors.filter((e) => e.severity === 'error').length
  const warnCount = result.errors.filter((e) => e.severity === 'warning').length
  const canSave = !!result.equipped && errorCount === 0

  function handleSave() {
    if (!canSave || !result.equipped) return
    onSave(result.equipped)
    onClose()
  }

  return createPortal(
    <motion.div
      role="presentation"
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={onClose}
      variants={backdropVariants}
      initial="initial"
      animate="animate"
      style={{
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(201,165,90,0.06), rgba(0,0,0,0.78) 60%)',
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        variants={panelVariants}
        initial="initial"
        animate="animate"
        className="relative flex h-[88vh] w-[1100px] max-w-[96vw] flex-col overflow-hidden rounded-[6px] border border-border"
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
              Edit Item · {slotName}
            </div>
            <h2
              className="m-0 text-[18px] font-semibold tracking-[0.02em] text-accent-hot"
              style={{ textShadow: '0 0 16px rgba(224,184,100,0.15)' }}
            >
              {base.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-[3px] border border-border-2 bg-panel-2 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Close
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-row">
          <div className="flex min-w-0 flex-[3] flex-col border-r border-border">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              <span
                className="inline-block h-1 w-1 rotate-45 bg-accent-deep"
                aria-hidden="true"
              />
              Text · edit affixes, stars, sockets, augment
            </div>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              wrap="off"
              className="min-h-0 flex-1 resize-none border-0 px-4 py-3 font-mono text-[12px] leading-[1.55] text-text outline-none focus:outline-none"
              style={{
                background:
                  'linear-gradient(180deg, #0d0e12, var(--color-panel-2))',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
                tabSize: 2,
              }}
            />
          </div>

          <div className="flex w-[360px] shrink-0 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              <span
                className="inline-block h-1 w-1 rotate-45 bg-accent-deep"
                aria-hidden="true"
              />
              Validation
              {errorCount > 0 && (
                <span className="ml-auto text-stat-red">
                  {errorCount} error{errorCount !== 1 ? 's' : ''}
                </span>
              )}
              {errorCount === 0 && warnCount > 0 && (
                <span className="ml-auto text-amber-300">
                  {warnCount} warning{warnCount !== 1 ? 's' : ''}
                </span>
              )}
              {errorCount === 0 && warnCount === 0 && (
                <span className="ml-auto text-accent-hot">all clear</span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {result.errors.length === 0 ? (
                <div className="rounded-[3px] border border-border-2 bg-panel-2/60 px-3 py-3 font-mono text-[11px] text-muted">
                  All clear · save to apply changes to this slot.
                </div>
              ) : (
                result.errors.map((err, i) => (
                  <ErrorRow key={i} err={err} />
                ))
              )}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-black/30 px-4 py-3">
          <div
            className={`flex min-w-0 flex-1 items-center gap-2 font-mono text-[11px] tracking-[0.06em] ${
              canSave ? 'text-accent-hot' : 'text-faint'
            }`}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: canSave
                  ? 'var(--color-accent-hot)'
                  : 'var(--color-faint)',
                boxShadow: canSave
                  ? '0 0 8px rgba(224,184,100,0.6)'
                  : '0 0 6px var(--color-faint)',
              }}
            />
            <span className="truncate">
              {canSave
                ? 'Ready to save'
                : errorCount > 0
                  ? 'Fix errors before saving'
                  : 'Parsing…'}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={onClose}
              className="rounded-[3px] border border-border-2 bg-transparent px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={`rounded-[3px] border px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                canSave
                  ? 'border-accent-deep bg-accent-hot/10 text-accent-hot hover:bg-accent-hot/20'
                  : 'cursor-not-allowed border-border-2 bg-transparent text-faint opacity-60'
              }`}
            >
              Save
            </button>
          </div>
        </footer>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

function ErrorRow({ err }: { err: ParseError }) {
  const isError = err.severity === 'error'
  const cls = isError
    ? 'border-stat-red/40 bg-stat-red/10 text-stat-red'
    : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
  const tag = isError ? 'ERR' : 'WARN'
  return (
    <div
      className={`rounded-[3px] border px-3 py-2 font-mono text-[11px] leading-[1.5] ${cls}`}
    >
      <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] opacity-80">
        <span>{tag}</span>
        <span>·</span>
        <span>line {err.line}</span>
      </div>
      <div className="text-[11px]">{err.message}</div>
    </div>
  )
}
