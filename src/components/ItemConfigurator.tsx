import { useEffect, useMemo, useState } from 'react'
import { Dropdown } from './Dropdown'
import type { DropdownItem } from './Dropdown'
import SocketPickerModal from './SocketPickerModal'
import {
  affixes,
  augments,
  crystalMods,
  detectRuneword,
  FORGE_KIND_LABEL,
  forgeKindFor,
  gameConfig,
  getAffix,
  getAugment,
  getCrystalMod,
  getGem,
  getItem,
  getItemSet,
  getRune,
  isGearSlot,
  runewords,
} from '../data'
import type { ForgeKind } from '../data'
import { MAX_STARS, maxSocketsFor, useBuild } from '../store/build'
import { rolledAffixValueWithStars } from '../utils/stats'
import { AUGMENT_MAX_LEVEL } from '../types'
import type {
  EquippedItem,
  ItemBase,
  SlotKey,
  SocketType,
} from '../types'

interface Props {
  slot: SlotKey
}

export default function ItemConfigurator({ slot }: Props) {
  // Self-contained item editor that reads/writes the build store directly. Renders runeword presets, sockets, stars, affixes, forge mods and (for armour) angelic augment for the equipped item in the supplied slot. Used inside GearItemModal so picking and configuring happen in the same window.
  const inventory = useBuild((s) => s.inventory)
  const unequipItem = useBuild((s) => s.unequipItem)
  const setSocketCount = useBuild((s) => s.setSocketCount)
  const setSocketed = useBuild((s) => s.setSocketed)
  const setSocketType = useBuild((s) => s.setSocketType)
  const setStars = useBuild((s) => s.setStars)
  const addAffix = useBuild((s) => s.addAffix)
  const removeAffix = useBuild((s) => s.removeAffix)
  const setAffixRoll = useBuild((s) => s.setAffixRoll)
  const addForgedMod = useBuild((s) => s.addForgedMod)
  const removeForgedMod = useBuild((s) => s.removeForgedMod)
  const applyRuneword = useBuild((s) => s.applyRuneword)

  const equipped = inventory[slot]
  const base = equipped ? getItem(equipped.baseId) : undefined
  const maxSockets = equipped
    ? maxSocketsFor(equipped.baseId, equipped.forgedMods)
    : 0
  const set = base?.setId ? getItemSet(base.setId) : undefined
  const setEquippedCount = base?.setId
    ? Object.values(inventory).reduce((acc, eq) => {
        if (!eq) return acc
        const b = getItem(eq.baseId)
        return b?.setId === base.setId ? acc + 1 : acc
      }, 0)
    : 0
  const forgeKind =
    base && isGearSlot(slot) ? forgeKindFor(base.rarity) : null

  if (!equipped || !base) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-10 text-center">
        <p className="text-[11px] uppercase tracking-[0.14em] text-faint italic">
          Pick an item from the list to configure it.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Configure · {base.name}
        </span>
        <button
          onClick={() => unequipItem(slot)}
          className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-border text-muted hover:text-red-400 hover:border-red-400"
        >
          Remove
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
        {set && set.bonuses.length > 0 && (
          <SetSummary set={set} count={setEquippedCount} />
        )}

        <RunewordPresets
          base={base}
          maxSockets={maxSockets}
          activeRunewordId={detectRuneword(base, equipped.socketed)?.id}
          onApply={(rwId) => applyRuneword(slot, rwId)}
        />

        <SocketsSection
          equipped={equipped}
          maxSockets={maxSockets}
          base={base}
          onSocketCount={(n) => setSocketCount(slot, n)}
          onSocketed={(idx, id) => setSocketed(slot, idx, id)}
          onSocketType={(idx, t) => setSocketType(slot, idx, t)}
        />

        {isGearSlot(slot) && (
          <StarsSection
            stars={equipped.stars ?? 0}
            onChange={(n) => setStars(slot, n)}
          />
        )}

        {(base.rarity === 'common' || base.randomAffixGroupId) && (
          <AffixesSection
            equipped={equipped}
            base={base}
            maxAffixes={base.maxAffixes}
            onAdd={(affixId, tier) => addAffix(slot, affixId, tier)}
            onRemove={(idx) => removeAffix(slot, idx)}
            onSetRoll={(idx, roll) => setAffixRoll(slot, idx, roll)}
          />
        )}

        {forgeKind && (
          <ForgedModsSection
            forgeKind={forgeKind}
            equipped={equipped}
            onAdd={(modId, tier) => addForgedMod(slot, modId, tier)}
            onRemove={(idx) => removeForgedMod(slot, idx)}
          />
        )}

        {slot === 'armor' && <AugmentSection equipped={equipped} />}
      </div>
    </div>
  )
}

function SetSummary({
  set,
  count,
}: {
  set: NonNullable<ReturnType<typeof getItemSet>>
  count: number
}) {
  return (
    <div className="rounded border border-green-500/30 bg-green-500/5 p-2">
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.12em] mb-1">
        <span className="text-green-400 font-semibold">{set.name}</span>
        <span className="text-muted">
          {count}/{set.items.length} pieces
        </span>
      </div>
      <ul className="space-y-0.5">
        {set.bonuses.map((bonus, idx) => {
          const active = count >= bonus.pieces
          return (
            <li
              key={idx}
              className={`text-[10px] ${active ? 'text-green-300' : 'text-muted/70'}`}
            >
              <span className="uppercase tracking-wider">
                {bonus.pieces}-Set {active ? '✓' : ''}
              </span>
              {(bonus.descriptions ?? []).map((d, i) => (
                <div key={i} className="ml-2">
                  {d}
                </div>
              ))}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SocketsSection({
  equipped,
  maxSockets,
  base,
  onSocketCount,
  onSocketed,
  onSocketType,
}: {
  equipped: EquippedItem
  maxSockets: number
  base: ItemBase
  onSocketCount: (n: number) => void
  onSocketed: (idx: number, id: string | null) => void
  onSocketType: (idx: number, type: SocketType) => void
}) {
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)
  if (maxSockets === 0) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
          Sockets
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSocketCount(equipped.socketCount - 1)}
            disabled={equipped.socketCount === 0}
            className="w-6 h-6 rounded bg-panel-2 border border-border text-muted hover:text-text hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed text-xs"
          >
            −
          </button>
          <span className="min-w-12 text-center tabular-nums text-xs">
            {equipped.socketCount} / {maxSockets}
          </span>
          <button
            onClick={() => onSocketCount(equipped.socketCount + 1)}
            disabled={equipped.socketCount >= maxSockets}
            className="w-6 h-6 rounded bg-panel-2 border border-border text-muted hover:text-text hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed text-xs"
          >
            +
          </button>
        </div>
        {base.sockets !== undefined &&
          base.sockets !== equipped.socketCount && (
            <span className="text-[10px] text-muted">
              base: {base.sockets}
            </span>
          )}
      </div>

      {equipped.socketCount > 0 && (
        <div className="space-y-1.5">
          {Array.from({ length: equipped.socketCount }).map((_, i) => {
            const socketedId = equipped.socketed[i]
            const type = equipped.socketTypes[i] ?? 'normal'
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 bg-panel-2 border border-border rounded p-1.5"
              >
                <span className="w-4 text-[10px] text-muted text-center tabular-nums">
                  {i + 1}
                </span>
                <SocketTypeToggle
                  value={type}
                  onChange={(t) => onSocketType(i, t)}
                />
                <div className="flex-1 min-w-0">
                  <SocketSlotTrigger
                    socketedId={socketedId ?? null}
                    onClick={() => setPickerIndex(i)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {pickerIndex !== null && (
        <SocketPickerModal
          socketIndex={pickerIndex}
          totalSockets={equipped.socketCount}
          currentId={equipped.socketed[pickerIndex] ?? null}
          socketType={equipped.socketTypes[pickerIndex] ?? 'normal'}
          onClose={() => setPickerIndex(null)}
          onSelect={(id) => onSocketed(pickerIndex, id)}
        />
      )}
    </div>
  )
}

function SocketSlotTrigger({
  socketedId,
  onClick,
}: {
  socketedId: string | null
  onClick: () => void
}) {
  const source = socketedId
    ? getGem(socketedId) ?? getRune(socketedId)
    : null
  const isRune = socketedId ? !!getRune(socketedId) : false
  const isJewel = source?.name.toLowerCase().includes('jewel') ?? false
  const kindLabel = isRune ? 'Rune' : isJewel ? 'Jewel' : 'Gem'
  return (
    <button
      type="button"
      className="hs-dd-trigger"
      onClick={onClick}
    >
      <span
        className={[
          'hs-dd-trigger-label',
          source ? '' : 'is-empty',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {source ? (
          <>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint mr-1.5">
              {kindLabel}
            </span>
            <span>{source.name}</span>
            <span className="ml-1.5 font-mono text-[10px] text-muted">
              T{source.tier}
            </span>
          </>
        ) : (
          'Empty socket'
        )}
      </span>
      <span className="hs-dd-chev" />
    </button>
  )
}

function StarsSection({
  stars,
  onChange,
}: {
  stars: number
  onChange: (n: number) => void
}) {
  const bonusPct = stars * 8
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
          Stars
        </span>
        <span className="text-[10px] text-muted tabular-nums">
          {stars > 0 ? `+${bonusPct}% to affixes` : 'no bonus'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {Array.from({ length: MAX_STARS }).map((_, i) => {
          const target = i + 1
          const filled = target <= stars
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(stars === target ? target - 1 : target)}
              aria-label={`${target} star${target === 1 ? '' : 's'}`}
              className={`text-lg leading-none transition-colors ${
                filled
                  ? 'text-amber-300 hover:text-amber-200'
                  : 'text-muted/40 hover:text-amber-200/60'
              }`}
            >
              ★
            </button>
          )
        })}
        {stars > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            className="ml-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border text-muted hover:text-red-400 hover:border-red-400"
          >
            Clear
          </button>
        )}
      </div>
      <p className="text-[10px] text-faint italic leading-tight">
        Each star adds +8% to user-added affixes. "+X to all skills" and runeword mods are not affected.
      </p>
    </div>
  )
}

function SocketTypeToggle({
  value,
  onChange,
}: {
  value: SocketType
  onChange: (t: SocketType) => void
}) {
  return (
    <div className="flex border border-border rounded overflow-hidden text-[10px] font-medium shrink-0">
      <button
        type="button"
        onClick={() => onChange('normal')}
        className={`px-1.5 py-0.5 transition-colors ${
          value === 'normal'
            ? 'bg-panel-3 text-text'
            : 'bg-panel text-muted hover:text-text'
        }`}
      >
        N
      </button>
      <button
        type="button"
        onClick={() => onChange('rainbow')}
        title="Rainbow socket: +50% effect"
        className={`px-1.5 py-0.5 transition-colors ${
          value === 'rainbow'
            ? 'bg-gradient-to-r from-rose-500 via-amber-400 to-sky-400 text-bg font-semibold'
            : 'bg-panel text-muted hover:text-text'
        }`}
      >
        R
      </button>
    </div>
  )
}

function formatAffixValue(
  affix: {
    sign: '+' | '-'
    format: 'flat' | 'percent'
    valueMin: number | null
    valueMax: number | null
    statKey: string | null
  },
  roll: number,
  stars?: number,
): string {
  if (affix.valueMin === null || affix.valueMax === null) return affix.sign
  const signed = rolledAffixValueWithStars(affix, roll, stars)
  const abs = Math.abs(signed)
  const num = Number.isInteger(abs) ? abs : Math.round(abs * 100) / 100
  const sign = signed < 0 ? '-' : '+'
  const suffix = affix.format === 'percent' ? '%' : ''
  return `${sign}${num}${suffix}`
}

function AffixesSection({
  equipped,
  base,
  maxAffixes,
  onAdd,
  onRemove,
  onSetRoll,
}: {
  equipped: EquippedItem
  base?: ItemBase
  maxAffixes?: number
  onAdd: (affixId: string, tier: number) => void
  onRemove: (index: number) => void
  onSetRoll: (index: number, roll: number) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const atCap =
    maxAffixes !== undefined && equipped.affixes.length >= maxAffixes
  useEffect(() => {
    if (atCap && open) setOpen(false)
  }, [atCap, open])

  const randomGroupId = base?.randomAffixGroupId ?? null

  const groupAffixes = useMemo(() => {
    if (!randomGroupId) return []
    return affixes.filter((a) => a.groupId === randomGroupId)
  }, [randomGroupId])

  const groupItems: DropdownItem[] = useMemo(() => {
    return groupAffixes.map((a) => ({
      id: a.id,
      name: a.description,
      meta: a.name,
    }))
  }, [groupAffixes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return [] as typeof affixes
    return affixes
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          (a.statKey ?? '').toLowerCase().includes(q),
      )
      .slice(0, 40)
  }, [query])

  const sectionTitle =
    randomGroupId === 'random_unholy' ? 'Unholy Affixes' : 'Affixes'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
          {sectionTitle} ({equipped.affixes.length}
          {maxAffixes !== undefined ? `/${maxAffixes}` : ''})
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={atCap}
          className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-border hover:border-accent text-muted hover:text-accent disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted disabled:cursor-not-allowed"
        >
          {open ? 'Done' : '+ Add'}
        </button>
      </div>

      {equipped.affixes.length > 0 && (
        <ul className="space-y-1">
          {equipped.affixes.map((eq, idx) => {
            const affix = getAffix(eq.affixId)
            if (!affix) return null
            const hasRange =
              affix.valueMin !== null &&
              affix.valueMax !== null &&
              affix.valueMin !== affix.valueMax
            return (
              <li
                key={idx}
                className="bg-panel-2 border border-border rounded px-2 py-1 text-[11px]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate">
                    <span className="text-yellow-300 font-medium tabular-nums">
                      {formatAffixValue(affix, eq.roll, equipped.stars)}
                    </span>{' '}
                    <span className="text-text/80">{affix.name}</span>{' '}
                    <span className="text-muted">T{affix.tier}</span>
                  </span>
                  <button
                    onClick={() => onRemove(idx)}
                    className="text-muted hover:text-red-400 px-1 shrink-0"
                    aria-label="Remove affix"
                  >
                    ×
                  </button>
                </div>
                {hasRange && (
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={eq.roll}
                    onChange={(e) =>
                      onSetRoll(idx, parseFloat(e.target.value))
                    }
                    className="w-full mt-1"
                    style={{ ['--sl-pct' as never]: eq.roll * 100 + '%' }}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {open && randomGroupId && (
        <Dropdown
          items={groupItems}
          allowNone={false}
          placeholder="Pick Random Unholy Affix…"
          onChange={(id) => {
            if (!id) return
            const a = groupAffixes.find((x) => x.id === id)
            if (!a) return
            onAdd(a.id, a.tier)
            setOpen(false)
          }}
        />
      )}

      {open && !randomGroupId && (
        <div className="space-y-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search affixes…"
            autoFocus
            className="w-full bg-panel-2 border border-border rounded px-2 py-1 text-[11px] focus:outline-none focus:border-accent"
          />
          {filtered.length > 0 && (
            <ul className="max-h-60 overflow-y-auto space-y-0.5 border border-border rounded bg-panel-2">
              {filtered.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => {
                      onAdd(a.id, a.tier)
                      setQuery('')
                      setOpen(false)
                    }}
                    className="w-full text-left text-[11px] px-2 py-1 hover:bg-accent/10"
                  >
                    <span className="text-accent">{a.name}</span>{' '}
                    <span className="text-muted">· T{a.tier}</span>{' '}
                    <span className="text-text/80">{a.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.length >= 2 && filtered.length === 0 && (
            <p className="text-[11px] text-muted italic">No matches.</p>
          )}
        </div>
      )}
    </div>
  )
}

function ForgedModsSection({
  forgeKind,
  equipped,
  onAdd,
  onRemove,
}: {
  forgeKind: ForgeKind
  equipped: EquippedItem
  onAdd: (modId: string, tier: number) => void
  onRemove: (index: number) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const mods = equipped.forgedMods ?? []
  const sourceLabel = FORGE_KIND_LABEL[forgeKind]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return [] as typeof crystalMods
    return crystalMods
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          (m.statKey ?? '').toLowerCase().includes(q),
      )
      .slice(0, 40)
  }, [query])

  const canAdd = mods.length === 0
  const isOpen = open && canAdd

  return (
    <div className="space-y-2 rounded border border-red-500/30 bg-red-500/5 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-red-300">
          {sourceLabel} · Forged
        </span>
        {canAdd && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-red-500/30 hover:border-red-400 text-red-300 hover:text-red-200"
          >
            {isOpen ? 'Done' : '+ Add'}
          </button>
        )}
      </div>

      {mods.length > 0 && (
        <ul className="space-y-1">
          {mods.map((eq, idx) => {
            const mod = getCrystalMod(eq.affixId)
            if (!mod) return null
            return (
              <li
                key={idx}
                className="bg-panel-2 border border-red-500/20 rounded px-2 py-1 text-[11px]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-red-300 tabular-nums">
                    {mod.description}
                  </span>
                  <button
                    onClick={() => onRemove(idx)}
                    className="text-muted hover:text-red-400 px-1 shrink-0"
                    aria-label="Remove forged mod"
                  >
                    ×
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {isOpen && (
        <div className="space-y-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${sourceLabel} mods…`}
            autoFocus
            className="w-full bg-panel-2 border border-border rounded px-2 py-1 text-[11px] focus:outline-none focus:border-red-400"
          />
          {filtered.length > 0 && (
            <ul className="max-h-60 overflow-y-auto space-y-0.5 border border-border rounded bg-panel-2">
              {filtered.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => {
                      onAdd(m.id, m.tier)
                      setQuery('')
                      setOpen(false)
                    }}
                    className="w-full text-left text-[11px] px-2 py-1 hover:bg-red-500/10"
                  >
                    <span className="text-red-300">{m.name}</span>{' '}
                    <span className="text-text/80">{m.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.length >= 2 && filtered.length === 0 && (
            <p className="text-[11px] text-muted italic">No matches.</p>
          )}
        </div>
      )}
    </div>
  )
}

function RunewordPresets({
  base,
  maxSockets,
  activeRunewordId,
  onApply,
}: {
  base: ItemBase
  maxSockets: number
  activeRunewordId?: string
  onApply: (runewordId: string) => void
}) {
  const compatible = useMemo(() => {
    if (base.rarity !== 'common') return []
    return runewords.filter(
      (rw) =>
        rw.allowedBaseTypes.includes(base.baseType) &&
        rw.runes.length <= maxSockets,
    )
  }, [base, maxSockets])

  const [open, setOpen] = useState(false)

  if (compatible.length === 0) return null

  const activeRw = activeRunewordId
    ? compatible.find((rw) => rw.id === activeRunewordId)
    : undefined

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-muted hover:text-text"
      >
        <span className="flex items-center gap-1.5">
          <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>
            ▸
          </span>
          Runeword Presets
          <span className="text-faint">({compatible.length})</span>
        </span>
        {activeRw && !open && (
          <span className="text-amber-300 normal-case tracking-normal text-[11px] font-semibold truncate">
            {activeRw.name}
          </span>
        )}
      </button>
      {open && (
        <ul className="space-y-1">
          {compatible.map((rw) => {
            const active = rw.id === activeRunewordId
            const runeSeq = rw.runes
              .map((r) => r.replace(/^rune_/, ''))
              .join(' → ')
            return (
              <li key={rw.id}>
                <button
                  onClick={() => onApply(rw.id)}
                  className={`w-full text-left text-[11px] px-2 py-1 rounded border transition-colors ${
                    active
                      ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                      : 'border-border bg-panel-2 hover:border-amber-400/40 hover:bg-amber-500/5'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{rw.name}</span>
                    <span className="text-[10px] text-muted">
                      {rw.runes.length}◇
                      {rw.requiresLevel ? ` · L${rw.requiresLevel}` : ''}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted/80 tabular-nums">
                    {runeSeq}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const AUGMENT_OPTIONS: DropdownItem[] = augments
  .map((a) => ({
    id: a.id,
    name: a.name,
    meta: a.triggerNote,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

function AugmentSection({ equipped }: { equipped: EquippedItem }) {
  const setAugment = useBuild((s) => s.setAugment)
  const setAugmentLevel = useBuild((s) => s.setAugmentLevel)
  const aug = equipped.augment ? getAugment(equipped.augment.id) : undefined
  const level = equipped.augment?.level ?? 1
  const tier = aug?.levels[Math.max(0, Math.min(aug.levels.length - 1, level - 1))]

  return (
    <div className="rounded border border-yellow-200/30 bg-yellow-200/5 p-2 space-y-2">
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.12em]">
        <span className="text-yellow-200 font-semibold">Angelic Augment</span>
        {aug && (
          <button
            onClick={() => setAugment(null)}
            className="text-faint hover:text-red-300 normal-case tracking-normal"
            aria-label="Remove augment"
          >
            Remove
          </button>
        )}
      </div>

      <Dropdown
        items={AUGMENT_OPTIONS}
        value={equipped.augment?.id ?? null}
        onChange={(id) => setAugment(id)}
        placeholder="Choose augment…"
        allowNone={false}
      />

      {aug && tier && (
        <>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted uppercase tracking-wider">Level</span>
            <input
              type="range"
              min={1}
              max={AUGMENT_MAX_LEVEL}
              value={level}
              onChange={(e) => setAugmentLevel(Number(e.target.value))}
              className="flex-1"
              style={{
                ['--sl-pct' as never]:
                  ((level - 1) / Math.max(1, AUGMENT_MAX_LEVEL - 1)) * 100 +
                  '%',
              }}
            />
            <span className="font-mono text-yellow-200 w-6 text-center">
              {level}
            </span>
            <span className="text-faint">/ {AUGMENT_MAX_LEVEL}</span>
          </div>

          <div className="text-[11px] text-text/85 leading-snug">
            {aug.description}
          </div>

          <div className="text-[10px] text-faint italic">
            {aug.triggerNote}
            {tier.procChance !== undefined && tier.procChance !== null && (
              <> · proc {tier.procChance}%</>
            )}
            {tier.procDurationSec !== undefined && tier.procDurationSec !== null && (
              <> · {tier.procDurationSec}s</>
            )}
            {tier.cost !== undefined && <> · cost {tier.cost} keys</>}
          </div>

          {Object.keys(tier.stats).length > 0 && (
            <ul className="space-y-0.5 text-[11px]">
              {Object.entries(tier.stats).map(([key, val]) => {
                const def = gameConfig.stats.find((s) => s.key === key)
                const label = def?.name ?? key
                const sign = (val as number) >= 0 ? '+' : ''
                const suffix = def?.format === 'percent' ? '%' : ''
                return (
                  <li key={key} className="flex justify-between">
                    <span className="text-text/80">{label}</span>
                    <span className="text-yellow-200 font-mono tabular-nums">
                      {sign}
                      {val as number}
                      {suffix}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          {tier.meta && Object.keys(tier.meta).length > 0 && (
            <ul className="space-y-0.5 text-[10px] text-faint">
              {Object.entries(tier.meta).map(([key, val]) => (
                <li key={key} className="flex justify-between">
                  <span>{key.replace(/_/g, ' ')}</span>
                  <span className="font-mono">{val as number}</span>
                </li>
              ))}
            </ul>
          )}

          {aug.rangedOnly && (
            <div className="text-[10px] text-orange-300 italic">
              Effect only applies with a ranged weapon equipped.
            </div>
          )}
        </>
      )}
    </div>
  )
}
