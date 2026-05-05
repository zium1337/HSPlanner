import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getItem, getItemImage, items } from '../data'
import Tooltip from './Tooltip'
import { ItemTooltipBody, RARITY_LABEL, RARITY_TONE } from './ItemTooltip'
import type { ItemBase, ItemRarity, SlotKey } from '../types'

const RARITY_TEXT: Record<ItemRarity, string> = {
  common: 'text-white',
  uncommon: 'text-sky-400',
  rare: 'text-accent-hot',
  mythic: 'text-purple-400',
  satanic: 'text-red-500',
  heroic: 'text-lime-400',
  angelic: 'text-yellow-200',
  satanic_set: 'text-green-400',
  unholy: 'text-pink-400',
  relic: 'text-orange-300',
}

const RARITY_BORDER: Record<ItemRarity, string> = {
  common: 'border-white/40',
  uncommon: 'border-sky-400/50',
  rare: 'border-accent/60',
  mythic: 'border-purple-400/50',
  satanic: 'border-red-500/50',
  heroic: 'border-lime-400/50',
  angelic: 'border-yellow-200/50',
  satanic_set: 'border-green-400/50',
  unholy: 'border-pink-400/50',
  relic: 'border-orange-300/50',
}

const RARITY_ORDER: Record<ItemRarity, number> = {
  relic: 0,
  unholy: 1,
  angelic: 2,
  satanic_set: 3,
  satanic: 4,
  mythic: 5,
  heroic: 6,
  rare: 7,
  uncommon: 8,
  common: 9,
}

function slotGroup(slotKey: SlotKey): string {
  return slotKey.replace(/_\d+$/, '')
}

function itemsForSlot(slotKey: SlotKey): ItemBase[] {
  const group = slotGroup(slotKey)
  return items
    .filter((i) => i.slot === slotKey || slotGroup(i.slot) === group)
    .slice()
    .sort((a, b) => {
      const ra = RARITY_ORDER[a.rarity] ?? 99
      const rb = RARITY_ORDER[b.rarity] ?? 99
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name)
    })
}

function shortStatsLabel(it: ItemBase): string {
  const parts: string[] = []
  if (it.defenseMin !== undefined && it.defenseMax !== undefined)
    parts.push(`Def ${it.defenseMin}–${it.defenseMax}`)
  if (it.damageMin !== undefined && it.damageMax !== undefined)
    parts.push(`Dmg ${it.damageMin}–${it.damageMax}`)
  if (it.blockChance !== undefined) parts.push(`Blk ${it.blockChance}%`)
  if (it.sockets !== undefined) {
    const max = it.maxSockets ?? it.sockets
    parts.push(max > it.sockets ? `${it.sockets}/${max}◇` : `${it.sockets}◇`)
  }
  if (it.baseType === 'Charm')
    parts.push(`${it.width ?? 1}×${it.height ?? 1}`)
  if (it.requiresLevel) parts.push(`L${it.requiresLevel}`)
  return parts.join(' · ')
}

interface Props {
  slotKey: SlotKey
  slotLabel: string
  currentBaseId: string | null
  onClose: () => void
  onSelect: (baseId: string) => void
}

export default function GearItemModal({
  slotKey,
  slotLabel,
  currentBaseId,
  onClose,
  onSelect,
}: Props) {
  const [pending, setPending] = useState<string | null>(currentBaseId)
  const [q, setQ] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const all = useMemo(() => itemsForSlot(slotKey), [slotKey])

  const filter = q.trim().toLowerCase()
  const rows = filter
    ? all.filter(
        (it) =>
          it.name.toLowerCase().includes(filter) ||
          it.baseType.toLowerCase().includes(filter) ||
          (it.rarity ?? '').toLowerCase().includes(filter) ||
          (RARITY_LABEL[it.rarity] ?? '').toLowerCase().includes(filter),
      )
    : all

  const pendingBase = pending ? getItem(pending) : null
  const dirty = pending !== currentBaseId
  const statusText = pendingBase
    ? `${pendingBase.name} · ${RARITY_LABEL[pendingBase.rarity]} ${pendingBase.baseType}`
    : 'Nothing selected'

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-sm"
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
        className="relative flex h-[88vh] w-[640px] max-w-[94vw] flex-col overflow-hidden rounded-[6px] border border-border"
        style={{
          background:
            'linear-gradient(180deg, var(--color-panel-2), color-mix(in srgb, var(--color-bg) 80%, transparent))',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.02), 0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        <CornerMarks />

        {/* Header */}
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
              Gear Slot{' '}
              <span className="text-accent-hot">· {slotLabel}</span>
            </div>
            <h2
              className="m-0 text-[18px] font-semibold tracking-[0.02em] text-accent-hot"
              style={{
                textShadow: '0 0 16px rgba(224,184,100,0.15)',
              }}
            >
              Choose Item
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-[3px] border border-border-2 bg-panel-2 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Close
          </button>
        </header>

        {/* Search */}
        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search items by name, type, or rarity…"
              className="w-full rounded-[3px] border border-border-2 px-3 py-2 pl-9 text-text placeholder:text-faint focus:border-accent-deep focus:outline-none focus:ring-2 focus:ring-accent-hot/15"
              style={{
                background:
                  'linear-gradient(180deg, #0d0e12, var(--color-panel-2))',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted">
              {all.length === 0 ? 'No items for this slot' : 'No matches'}
            </div>
          )}
          {rows.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              selected={pending === it.id}
              equipped={currentBaseId === it.id}
              onSelect={() => setPending(it.id)}
              onCommit={() => {
                onSelect(it.id)
                onClose()
              }}
            />
          ))}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-border bg-black/30 px-4 py-3">
          <div
            className={`flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] ${
              pendingBase ? 'text-accent-hot' : 'text-faint'
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: pendingBase
                  ? 'var(--color-accent-hot)'
                  : 'var(--color-faint)',
                boxShadow: pendingBase
                  ? '0 0 8px rgba(224,184,100,0.6)'
                  : '0 0 6px var(--color-faint)',
              }}
            />
            <span className="truncate max-w-[360px]">{statusText}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-[3px] border border-border-2 bg-transparent px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
            >
              Cancel
            </button>
            <button
              disabled={!dirty || !pending}
              onClick={() => {
                if (!pending) return
                onSelect(pending)
                onClose()
              }}
              className="rounded-[3px] border border-accent-deep px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-hot transition-all enabled:hover:border-accent-hot enabled:hover:shadow-[0_0_14px_rgba(224,184,100,0.3)] disabled:cursor-not-allowed disabled:border-border-2 disabled:text-faint"
              style={
                !dirty || !pending
                  ? undefined
                  : {
                      background:
                        'linear-gradient(180deg, #3a2f1a, #2a2418)',
                    }
              }
            >
              Equip
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function ItemRow({
  item,
  selected,
  equipped,
  onSelect,
  onCommit,
}: {
  item: ItemBase
  selected: boolean
  equipped: boolean
  onSelect: () => void
  onCommit: () => void
}) {
  const url = getItemImage(item.id)
  const rarityText = RARITY_TEXT[item.rarity] ?? 'text-text'
  const rarityBorder = RARITY_BORDER[item.rarity] ?? 'border-border-2'
  const tone = RARITY_TONE[item.rarity]
  const stats = shortStatsLabel(item)

  return (
    <Tooltip
      tone={tone}
      placement="right"
      content={<ItemTooltipBody base={item} />}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onCommit}
        className={`group relative grid w-full cursor-pointer items-center gap-3.5 border-b border-dashed border-border px-4 py-2 text-left transition-colors last:border-b-0 hover:bg-accent-hot/5 ${
          selected
            ? 'bg-gradient-to-r from-accent-hot/10 to-transparent'
            : ''
        }`}
        style={{
          gridTemplateColumns: '36px 76px 1fr auto',
        }}
      >
        <span
          className={`pointer-events-none absolute left-0 top-0 bottom-0 w-[2px] bg-accent-hot transition-opacity ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
          }`}
          style={
            selected
              ? { boxShadow: '0 0 12px rgba(224,184,100,0.4)' }
              : undefined
          }
        />

        {/* Icon */}
        <span className="flex items-center justify-center">
          {url ? (
            <img
              src={url}
              alt=""
              width={28}
              height={28}
              style={{ imageRendering: 'pixelated', objectFit: 'contain' }}
            />
          ) : (
            <RarityBadge rarity={item.rarity} />
          )}
        </span>

        {/* Rarity chip */}
        <span
          className={`w-max rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] ${rarityText} ${rarityBorder}`}
          style={{
            background: 'linear-gradient(180deg, #1a1610, #0d0b07)',
          }}
        >
          {RARITY_LABEL[item.rarity]}
        </span>

        {/* Name + base type */}
        <span className="min-w-0">
          <span
            className={`block truncate text-[13px] font-medium ${rarityText}`}
          >
            {item.name}
            {equipped && (
              <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                · Equipped
              </span>
            )}
          </span>
          <span className="block truncate font-mono text-[10px] text-muted">
            {item.baseType}
            {item.grade ? ` · Grade ${item.grade}` : ''}
            {item.twoHanded ? ' · 2H' : ''}
          </span>
        </span>

        {/* Stats */}
        <span
          className={`shrink-0 truncate font-mono text-[10px] tracking-[0.02em] ${
            stats === '' ? 'italic text-faint' : 'text-muted'
          }`}
        >
          {stats || '—'}
        </span>
      </button>
    </Tooltip>
  )
}

function RarityBadge({ rarity }: { rarity: ItemRarity }) {
  const text = RARITY_TEXT[rarity] ?? 'text-text'
  const border = RARITY_BORDER[rarity] ?? 'border-border-2'
  return (
    <span
      className={`block h-7 w-7 rotate-45 rounded-[3px] border ${border} ${text}`}
      style={{
        background: 'linear-gradient(135deg, currentColor 0%, #0d0b07 80%)',
        opacity: 0.85,
      }}
    />
  )
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
