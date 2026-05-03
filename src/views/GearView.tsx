import { useEffect, useMemo, useRef, useState } from 'react'
import ItemTooltip, { ItemCard } from '../components/ItemTooltip'
import SearchableSelect from '../components/SearchableSelect'
import type { SearchableOption } from '../components/SearchableSelect'
import {
  affixes,
  crystalMods,
  detectRuneword,
  FORGE_KIND_LABEL,
  forgeKindFor,
  gameConfig,
  gems,
  getAffix,
  getCrystalMod,
  getItem,
  getItemSet,
  isGearSlot,
  items,
  runes,
  runewords,
} from '../data'
import type { ForgeKind } from '../data'
import { MAX_STARS, maxSocketsFor, useBuild } from '../store/build'
import { fmtStats, rolledAffixValueWithStars } from '../utils/stats'
import type {
  EquippedItem,
  ItemBase,
  ItemRarity,
  SlotKey,
  SocketType,
} from '../types'

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

const RARITY_BG: Record<ItemRarity, string> = {
  common: 'bg-white/5',
  uncommon: 'bg-sky-500/10',
  rare: 'bg-yellow-500/10',
  mythic: 'bg-purple-500/10',
  satanic: 'bg-red-500/10',
  heroic: 'bg-lime-500/10',
  angelic: 'bg-yellow-400/10',
  satanic_set: 'bg-green-500/10',
  unholy: 'bg-pink-500/10',
  relic: 'bg-orange-500/10',
}

const RARITY_BORDER: Record<ItemRarity, string> = {
  common: 'border-white/30',
  uncommon: 'border-sky-400/40',
  rare: 'border-accent/50',
  mythic: 'border-purple-400/40',
  satanic: 'border-red-500/40',
  heroic: 'border-lime-400/40',
  angelic: 'border-yellow-200/40',
  satanic_set: 'border-green-400/40',
  unholy: 'border-pink-400/40',
  relic: 'border-orange-300/40',
}

export default function GearView() {
  const {
    inventory,
    equipItem,
    unequipItem,
    setSocketCount,
    setSocketed,
    setSocketType,
    setStars,
    addAffix,
    removeAffix,
    setAffixRoll,
    addForgedMod,
    removeForgedMod,
    applyRuneword,
  } = useBuild()

  const [activeSlot, setActiveSlot] = useState<SlotKey | null>(null)
  const [charmFitError, setCharmFitError] = useState<string | null>(null)
  const charmErrorTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (charmErrorTimer.current !== null)
        window.clearTimeout(charmErrorTimer.current)
    },
    [],
  )

  const tryEquipCharm = (slot: SlotKey, baseId: string): boolean => {
    const base = getItem(baseId)
    if (!base) return false
    const newW = base.width ?? 1
    const newH = base.height ?? 1
    const others: { slotKey: SlotKey; w: number; h: number }[] = []
    for (const cs of charmSlots) {
      if (cs.key === slot) continue
      const eq = inventory[cs.key]
      if (!eq) continue
      const b = getItem(eq.baseId)
      others.push({
        slotKey: cs.key,
        w: b?.width ?? 1,
        h: b?.height ?? 1,
      })
    }
    const candidate = { slotKey: slot, w: newW, h: newH }
    const result = packCharms([...others, candidate])
    if (result.overflow.includes(slot)) {
      const name = base.name ?? baseId
      setCharmFitError(
        `${name} (${newW}×${newH}) won't fit — free up space first.`,
      )
      if (charmErrorTimer.current !== null)
        window.clearTimeout(charmErrorTimer.current)
      charmErrorTimer.current = window.setTimeout(
        () => setCharmFitError(null),
        4000,
      )
      return false
    }
    setCharmFitError(null)
    return true
  }

  const socketOptions: SearchableOption[] = useMemo(() => {
    const opts: SearchableOption[] = []
    for (const g of gems)
      opts.push({
        id: g.id,
        label: `💎 ${g.name}`,
        hint: `T${g.tier} · ${fmtStats(g.stats)}`,
      })
    for (const r of runes)
      opts.push({
        id: r.id,
        label: `ᚱ ${r.name}`,
        hint: `T${r.tier} · ${fmtStats(r.stats)}`,
      })
    return opts
  }, [])

  const gearSlots = gameConfig.slots.filter((s) => !s.key.startsWith('charm_'))
  const charmSlots = gameConfig.slots.filter((s) => s.key.startsWith('charm_'))

  const weaponBase = inventory.weapon ? getItem(inventory.weapon.baseId) : undefined
  const offhandLocked = !!weaponBase?.twoHanded

  return (
    <div className="max-w-7xl">
      <header className="flex items-end justify-between mb-4">
        <h2 className="text-2xl font-semibold">Gear</h2>
        <p className="text-muted text-sm">
          {items.length} items · {gems.length} gems · {runes.length} runes
        </p>
      </header>

      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <section className="bg-panel border border-border rounded-[4px] p-3">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Equipment
              </h3>
              <span className="text-[10px] text-faint">
                {gearSlots.filter((s) => inventory[s.key]).length}/
                {gearSlots.length} equipped
              </span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {gearSlots.map((slot) => (
                <li key={slot.key}>
                  <SlotRow
                    slot={slot}
                    equipped={inventory[slot.key]}
                    active={activeSlot === slot.key}
                    locked={slot.key === 'offhand' && offhandLocked}
                    onSelect={() =>
                      setActiveSlot(activeSlot === slot.key ? null : slot.key)
                    }
                  />
                </li>
              ))}
            </ul>
          </section>

          <CharmSection
            charmSlots={charmSlots}
            activeSlot={activeSlot}
            onSelect={(s) => setActiveSlot(activeSlot === s ? null : s)}
            fitError={charmFitError}
          />
        </div>

        <aside className="w-[400px] shrink-0 sticky top-0 self-start">
          <EditPanel
            slot={activeSlot}
            equipped={activeSlot ? inventory[activeSlot] : undefined}
            offhandLocked={offhandLocked}
            socketOptions={socketOptions}
            onEquip={(id) => {
              if (!activeSlot) return
              if (activeSlot.startsWith('charm_')) {
                if (!tryEquipCharm(activeSlot, id)) return
              }
              equipItem(activeSlot, id)
            }}
            onUnequip={() => {
              if (!activeSlot) return
              unequipItem(activeSlot)
              setActiveSlot(null)
            }}
            onSocketCount={(n) => activeSlot && setSocketCount(activeSlot, n)}
            onSocketed={(idx, id) =>
              activeSlot && setSocketed(activeSlot, idx, id)
            }
            onSocketType={(idx, t) =>
              activeSlot && setSocketType(activeSlot, idx, t)
            }
            onSetStars={(n) => activeSlot && setStars(activeSlot, n)}
            onAddAffix={(affixId, tier) =>
              activeSlot && addAffix(activeSlot, affixId, tier)
            }
            onRemoveAffix={(idx) => activeSlot && removeAffix(activeSlot, idx)}
            onSetAffixRoll={(idx, roll) =>
              activeSlot && setAffixRoll(activeSlot, idx, roll)
            }
            onAddForgedMod={(modId, tier) =>
              activeSlot && addForgedMod(activeSlot, modId, tier)
            }
            onRemoveForgedMod={(idx) =>
              activeSlot && removeForgedMod(activeSlot, idx)
            }
            onApplyRuneword={(rwId) =>
              activeSlot && applyRuneword(activeSlot, rwId)
            }
          />
        </aside>
      </div>
    </div>
  )
}

function SlotRow({
  slot,
  equipped,
  active,
  locked,
  onSelect,
}: {
  slot: { key: SlotKey; name: string }
  equipped: EquippedItem | undefined
  active: boolean
  locked?: boolean
  onSelect: () => void
}) {
  const base = equipped ? getItem(equipped.baseId) : undefined
  const runeword =
    base && equipped ? detectRuneword(base, equipped.socketed) : undefined

  const rarityText = base
    ? runeword
      ? 'text-accent-hot'
      : RARITY_TEXT[base.rarity]
    : locked
      ? 'text-faint/50'
      : 'text-faint'
  const rarityBg = base
    ? RARITY_BG[base.rarity]
    : locked
      ? 'bg-panel-2/50'
      : 'bg-transparent'
  const rarityBorder = base
    ? RARITY_BORDER[base.rarity]
    : locked
      ? 'border-border/40 border-dashed'
      : 'border-border border-dashed'

  const badges: string[] = []
  if (base && equipped) {
    if (base.defenseMin !== undefined && base.defenseMax !== undefined)
      badges.push(`Def ${base.defenseMin}–${base.defenseMax}`)
    if (base.damageMin !== undefined && base.damageMax !== undefined)
      badges.push(`Dmg ${base.damageMin}–${base.damageMax}`)
    if (equipped.socketCount > 0)
      badges.push(
        `${equipped.socketed.filter(Boolean).length}/${equipped.socketCount}◇`,
      )
    if (equipped.stars && equipped.stars > 0)
      badges.push(`${'★'.repeat(equipped.stars)}`)
    if (base.requiresLevel) badges.push(`L${base.requiresLevel}`)
  }

  const button = (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full h-full min-h-[44px] flex items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors ${rarityBorder} ${
        active
          ? 'bg-accent/10 border-accent ring-1 ring-accent'
          : `${rarityBg} hover:border-accent/60`
      }`}
    >
      <span className="w-16 shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">
        {slot.name}
      </span>
      <span className="flex-1 min-w-0">
        {base ? (
          <>
            <span
              className={`block truncate text-[12px] font-semibold ${rarityText}`}
            >
              {runeword ? runeword.name : base.name}
            </span>
            <span className="block truncate text-[10px] text-muted">
              {runeword ? `Runeword · ${base.baseType}` : base.baseType}
            </span>
          </>
        ) : locked ? (
          <span className="block text-[11px] text-faint/60 italic">
            locked · 2H weapon equipped
          </span>
        ) : (
          <span className="block text-[11px] text-faint italic">empty</span>
        )}
      </span>
      {badges.length > 0 && (
        <span className="shrink-0 text-[9px] text-muted tabular-nums uppercase tracking-wider">
          {badges.join(' · ')}
        </span>
      )}
    </button>
  )

  if (!equipped) return button
  return (
    <ItemTooltip equipped={equipped} placement="right">
      {button}
    </ItemTooltip>
  )
}

const CHARM_GRID_COLS = 3
const CHARM_GRID_ROWS = 11
const CHARM_BLOCKED_CELLS: ReadonlyArray<readonly [number, number]> = [
  [3, 0],
  [3, 2],
  [7, 2],
]

interface PlacedCharm {
  slotKey: SlotKey
  row: number
  col: number
  w: number
  h: number
}

function packCharms(
  charms: { slotKey: SlotKey; w: number; h: number }[],
): { placed: PlacedCharm[]; overflow: SlotKey[]; occupancy: boolean[] } {
  const occupancy = new Array(CHARM_GRID_ROWS * CHARM_GRID_COLS).fill(false)
  for (const [r, c] of CHARM_BLOCKED_CELLS) {
    occupancy[r * CHARM_GRID_COLS + c] = true
  }

  const sorted = [...charms].sort((a, b) => {
    const areaDiff = b.w * b.h - a.w * a.h
    if (areaDiff !== 0) return areaDiff
    return a.slotKey.localeCompare(b.slotKey)
  })

  const placed: PlacedCharm[] = []
  const overflow: SlotKey[] = []

  for (const ch of sorted) {
    let foundSpot: { r: number; c: number } | null = null
    for (let r = 0; r <= CHARM_GRID_ROWS - ch.h && !foundSpot; r++) {
      for (let c = 0; c <= CHARM_GRID_COLS - ch.w && !foundSpot; c++) {
        let ok = true
        for (let dr = 0; dr < ch.h && ok; dr++) {
          for (let dc = 0; dc < ch.w && ok; dc++) {
            if (occupancy[(r + dr) * CHARM_GRID_COLS + (c + dc)]) ok = false
          }
        }
        if (ok) foundSpot = { r, c }
      }
    }
    if (foundSpot) {
      for (let dr = 0; dr < ch.h; dr++) {
        for (let dc = 0; dc < ch.w; dc++) {
          occupancy[
            (foundSpot.r + dr) * CHARM_GRID_COLS + (foundSpot.c + dc)
          ] = true
        }
      }
      placed.push({
        slotKey: ch.slotKey,
        row: foundSpot.r,
        col: foundSpot.c,
        w: ch.w,
        h: ch.h,
      })
    } else {
      overflow.push(ch.slotKey)
    }
  }

  return { placed, overflow, occupancy }
}

function CharmSection({
  charmSlots,
  activeSlot,
  onSelect,
  fitError,
}: {
  charmSlots: { key: SlotKey; name: string }[]
  activeSlot: SlotKey | null
  onSelect: (s: SlotKey) => void
  fitError?: string | null
}) {
  const inventory = useBuild((s) => s.inventory)

  const { placed, overflow, occupancy, totalUsable, occupiedCells } =
    useMemo(() => {
      const charms = charmSlots
        .map((slot) => {
          const eq = inventory[slot.key]
          if (!eq) return null
          const base = getItem(eq.baseId)
          return {
            slotKey: slot.key,
            w: base?.width ?? 1,
            h: base?.height ?? 1,
          }
        })
        .filter((c): c is { slotKey: SlotKey; w: number; h: number } =>
          Boolean(c),
        )

      const result = packCharms(charms)
      const total =
        CHARM_GRID_ROWS * CHARM_GRID_COLS - CHARM_BLOCKED_CELLS.length
      const used = charms.reduce((acc, c) => acc + c.w * c.h, 0)
      return {
        ...result,
        totalUsable: total,
        occupiedCells: used,
      }
    }, [charmSlots, inventory])

  const blockedSet = useMemo(() => {
    const s = new Set<number>()
    for (const [r, c] of CHARM_BLOCKED_CELLS) s.add(r * CHARM_GRID_COLS + c)
    return s
  }, [])

  const nextEmptySlotKey = useMemo(
    () => charmSlots.find((s) => !inventory[s.key])?.key,
    [charmSlots, inventory],
  )

  const emptyCells: { row: number; col: number }[] = []
  for (let r = 0; r < CHARM_GRID_ROWS; r++) {
    for (let c = 0; c < CHARM_GRID_COLS; c++) {
      const idx = r * CHARM_GRID_COLS + c
      if (!occupancy[idx] && !blockedSet.has(idx)) {
        emptyCells.push({ row: r, col: c })
      }
    }
  }

  return (
    <section className="bg-panel border border-border rounded-[4px] p-3">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Charm Inventory
        </h3>
        <span className="text-[10px] text-faint">
          {occupiedCells}/{totalUsable}
          {overflow.length > 0 && (
            <span className="ml-2 text-red-400">
              · {overflow.length} won't fit
            </span>
          )}
        </span>
      </div>

      <div
        className="grid gap-1 p-3 rounded border border-border bg-[#0c0804] w-fit mx-auto"
        style={{
          gridTemplateColumns: `repeat(${CHARM_GRID_COLS}, 4rem)`,
          gridTemplateRows: `repeat(${CHARM_GRID_ROWS}, 4rem)`,
        }}
      >
        {CHARM_BLOCKED_CELLS.map(([r, c]) => (
          <div
            key={`blocked-${r}-${c}`}
            style={{ gridColumn: c + 1, gridRow: r + 1 }}
            className="rounded border border-dashed border-[#3a2a18] bg-[#070403] opacity-60"
            aria-label="Blocked"
          />
        ))}

        {placed.map((p) => {
          const eq = inventory[p.slotKey]
          if (!eq) return null
          const base = getItem(eq.baseId)
          if (!base) return null
          const isActive = activeSlot === p.slotKey
          const rarityColor = RARITY_TEXT[base.rarity] ?? 'text-text'
          const rarityBg = RARITY_BG[base.rarity] ?? 'bg-panel-2'

          const cell = (
            <button
              type="button"
              onClick={() => onSelect(p.slotKey)}
              aria-label={base.name}
              className={`w-full h-full rounded text-[10px] p-1 flex flex-col items-center justify-center text-center transition-colors overflow-hidden ${
                isActive
                  ? 'border-2 border-accent bg-accent/10 ring-1 ring-accent'
                  : `border border-[#846339] ${rarityBg} hover:opacity-90 cursor-pointer`
              }`}
            >
              <div className={`text-2xl leading-none ${rarityColor}`}>◆</div>
              <div
                className={`mt-0.5 px-1 leading-tight ${rarityColor} font-medium text-[9px] pointer-events-none`}
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {base.name}
              </div>
            </button>
          )

          return (
            <div
              key={p.slotKey}
              style={{
                gridColumn: `${p.col + 1} / span ${p.w}`,
                gridRow: `${p.row + 1} / span ${p.h}`,
              }}
              className="relative"
            >
              <ItemTooltip
                equipped={eq}
                placement="right"
                className="block w-full h-full"
              >
                {cell}
              </ItemTooltip>
            </div>
          )
        })}

        {emptyCells.map(({ row, col }) => (
          <button
            key={`empty-${row}-${col}`}
            type="button"
            onClick={() => {
              if (nextEmptySlotKey) onSelect(nextEmptySlotKey)
            }}
            disabled={!nextEmptySlotKey}
            style={{ gridColumn: col + 1, gridRow: row + 1 }}
            className="rounded text-[10px] flex items-center justify-center border border-[#5a4528] bg-[#120c08] hover:border-[#846339] text-transparent hover:text-accent/40 cursor-pointer disabled:cursor-not-allowed"
            aria-label="Empty charm slot"
          >
            <span className="text-lg">+</span>
          </button>
        ))}
      </div>

      {overflow.length > 0 && (
        <div className="mt-2 px-2 py-1 text-[10px] text-red-400 border border-red-500/30 bg-red-500/5 rounded">
          {overflow.length} charm{overflow.length === 1 ? '' : 's'} could not be
          placed — remove some to free space.
        </div>
      )}
      {fitError && (
        <div className="mt-2 px-2 py-1 text-[10px] text-red-400 border border-red-500/30 bg-red-500/5 rounded">
          {fitError}
        </div>
      )}
    </section>
  )
}

function ItemCompareOverlay({
  equipped,
  prospectId,
  slotKey,
}: {
  equipped: EquippedItem | undefined
  prospectId: string | null
  slotKey: SlotKey
}) {
  const prospectBase = prospectId ? getItem(prospectId) : undefined
  const equippedBase = equipped ? getItem(equipped.baseId) : undefined
  const isSame = !!prospectId && equipped?.baseId === prospectId

  if (!equipped && !prospectBase) return null

  if (isSame && prospectBase) {
    return (
      <ItemCard
        base={prospectBase}
        state="equipped"
        arcLabel="Currently Equipped"
        className="w-[260px] pointer-events-auto text-[12px]"
      />
    )
  }

  if (!prospectBase && equipped && equippedBase) {
    return (
      <div className="flex items-start gap-3 pointer-events-auto">
        <div className="w-[260px] shrink-0">
          <ItemCard
            equipped={equipped}
            base={equippedBase}
            state="equipped"
            arcLabel="Currently Equipped"
            className="text-[12px]"
          />
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-faint italic max-w-[110px] leading-tight pt-6">
          Hover an item to compare
        </div>
      </div>
    )
  }

  if (!prospectBase) return null

  return (
    <div className="flex items-start gap-3 pointer-events-auto">
      {equipped && equippedBase && (
        <div className="w-[260px] shrink-0">
          <ItemCard
            equipped={equipped}
            base={equippedBase}
            state="equipped"
            arcLabel="Currently Equipped"
            className="text-[12px]"
          />
        </div>
      )}
      <div className="w-[260px] shrink-0">
        <ItemCard
          base={prospectBase}
          state="selected"
          arcLabel="Selected"
          compareWith={equipped}
          compareSlotKey={slotKey}
          className="text-[12px]"
        />
      </div>
    </div>
  )
}

function EditPanel({
  slot,
  equipped,
  offhandLocked,
  socketOptions,
  onEquip,
  onUnequip,
  onSocketCount,
  onSocketed,
  onSocketType,
  onSetStars,
  onAddAffix,
  onRemoveAffix,
  onSetAffixRoll,
  onAddForgedMod,
  onRemoveForgedMod,
  onApplyRuneword,
}: {
  slot: SlotKey | null
  equipped: EquippedItem | undefined
  offhandLocked: boolean
  socketOptions: SearchableOption[]
  onEquip: (id: string) => void
  onUnequip: () => void
  onSocketCount: (n: number) => void
  onSocketed: (idx: number, id: string | null) => void
  onSocketType: (idx: number, type: SocketType) => void
  onSetStars: (n: number) => void
  onAddAffix: (affixId: string, tier: number) => void
  onRemoveAffix: (idx: number) => void
  onSetAffixRoll: (idx: number, roll: number) => void
  onAddForgedMod: (modId: string, tier: number) => void
  onRemoveForgedMod: (idx: number) => void
  onApplyRuneword: (rwId: string) => void
}) {
  const slotConfig = slot
    ? gameConfig.slots.find((s) => s.key === slot)
    : undefined
  const itemOpts = useMemo(() => (slot ? itemsForSlot(slot) : []), [slot])
  const base = equipped ? getItem(equipped.baseId) : undefined
  const maxSockets = equipped ? maxSocketsFor(equipped.baseId) : 0
  const inv = useBuild((s) => s.inventory)
  const set = base?.setId ? getItemSet(base.setId) : undefined
  const setEquippedCount = base?.setId
    ? Object.values(inv).reduce((acc, eq) => {
        if (!eq) return acc
        const b = getItem(eq.baseId)
        return b?.setId === base.setId ? acc + 1 : acc
      }, 0)
    : 0
  const forgeKind =
    slot && base && isGearSlot(slot) ? forgeKindFor(base.rarity) : null

  if (!slot) {
    return (
      <div className="bg-panel border border-border rounded-[4px] p-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.14em] text-faint">
          Select a slot to edit
        </p>
      </div>
    )
  }

  return (
    <div className="bg-panel border border-border rounded-[4px]">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          {slotConfig?.name}
        </span>
        {equipped && (
          <button
            onClick={onUnequip}
            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-border text-muted hover:text-red-400 hover:border-red-400"
          >
            Remove
          </button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {slot === 'offhand' && offhandLocked && !equipped ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-2 text-[11px] text-amber-200">
            Offhand is locked while a Two-Handed weapon is in the main hand.
            Remove the weapon to free this slot.
          </div>
        ) : (
        <SearchableSelect
          value={equipped?.baseId ?? null}
          options={itemOpts}
          placeholder={
            itemOpts.length === 0
              ? 'No items match this slot'
              : equipped
                ? 'Swap item…'
                : 'Select an item…'
          }
          onChange={(id) => {
            if (id) onEquip(id)
          }}
          sidePanel={(hoveredId) => (
            <ItemCompareOverlay
              equipped={equipped}
              prospectId={hoveredId}
              slotKey={slot}
            />
          )}
        />
        )}

        {equipped && base && (
          <>
            {set && set.bonuses.length > 0 && (
              <SetSummary set={set} count={setEquippedCount} />
            )}

            <RunewordPresets
              base={base}
              maxSockets={maxSockets}
              activeRunewordId={detectRuneword(base, equipped.socketed)?.id}
              onApply={onApplyRuneword}
            />

            <SocketsSection
              equipped={equipped}
              maxSockets={maxSockets}
              base={base}
              socketOptions={socketOptions}
              onSocketCount={onSocketCount}
              onSocketed={onSocketed}
              onSocketType={onSocketType}
            />

            {isGearSlot(slot) && (
              <StarsSection
                stars={equipped.stars ?? 0}
                onChange={onSetStars}
              />
            )}

            {base.rarity === 'common' && (
              <AffixesSection
                equipped={equipped}
                onAdd={onAddAffix}
                onRemove={onRemoveAffix}
                onSetRoll={onSetAffixRoll}
              />
            )}

            {forgeKind && (
              <ForgedModsSection
                forgeKind={forgeKind}
                equipped={equipped}
                onAdd={onAddForgedMod}
                onRemove={onRemoveForgedMod}
              />
            )}
          </>
        )}
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

function slotGroup(slotKey: SlotKey): string {
  return slotKey.replace(/_\d+$/, '')
}

function itemsForSlot(slotKey: SlotKey): SearchableOption[] {
  const group = slotGroup(slotKey)
  return items
    .filter((i) => i.slot === slotKey || slotGroup(i.slot) === group)
    .map((i) => {
      const parts: string[] = [i.baseType]
      if (i.grade) parts.push(`Grade ${i.grade}`)
      if (i.baseType === 'Charm')
        parts.push(`${i.width ?? 1}×${i.height ?? 1}`)
      if (i.defenseMin !== undefined && i.defenseMax !== undefined)
        parts.push(`Def ${i.defenseMin}–${i.defenseMax}`)
      if (i.damageMin !== undefined && i.damageMax !== undefined)
        parts.push(`Dmg ${i.damageMin}–${i.damageMax}`)
      if (i.blockChance !== undefined) parts.push(`Block ${i.blockChance}%`)
      if (i.sockets !== undefined) {
        const max = i.maxSockets ?? i.sockets
        parts.push(
          max > i.sockets
            ? `${i.sockets}/${max} sockets`
            : `${i.sockets} sockets`,
        )
      }
      return {
        id: i.id,
        label: i.name,
        hint: parts.join(' · '),
        accent: RARITY_BG[i.rarity],
      }
    })
}

function SocketsSection({
  equipped,
  maxSockets,
  base,
  socketOptions,
  onSocketCount,
  onSocketed,
  onSocketType,
}: {
  equipped: EquippedItem
  maxSockets: number
  base: ItemBase
  socketOptions: SearchableOption[]
  onSocketCount: (n: number) => void
  onSocketed: (idx: number, id: string | null) => void
  onSocketType: (idx: number, type: SocketType) => void
}) {
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
            const socketed = equipped.socketed[i]
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
                  <SearchableSelect
                    value={socketed ?? null}
                    options={socketOptions}
                    onChange={(id) => onSocketed(i, id)}
                    placeholder="Empty socket"
                    clearLabel="— remove —"
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
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
  onAdd,
  onRemove,
  onSetRoll,
}: {
  equipped: EquippedItem
  onAdd: (affixId: string, tier: number) => void
  onRemove: (index: number) => void
  onSetRoll: (index: number, roll: number) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
          Affixes ({equipped.affixes.length})
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-border hover:border-accent text-muted hover:text-accent"
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
                    className="w-full mt-1 accent-accent"
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {open && (
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
  const isProphecy = forgeKind === 'gypsy_prophecy'
  const accentText = isProphecy ? 'text-pink-300' : 'text-red-300'
  const accentTextHover = isProphecy ? 'hover:text-pink-200' : 'hover:text-red-200'
  const accentBorder = isProphecy ? 'border-pink-400/30' : 'border-red-500/30'
  const accentBg = isProphecy ? 'bg-pink-400/5' : 'bg-red-500/5'
  const accentBorderHover = isProphecy ? 'hover:border-pink-300' : 'hover:border-red-400'
  const accentBorderItem = isProphecy ? 'border-pink-400/20' : 'border-red-500/20'
  const accentBorderInputFocus = isProphecy
    ? 'focus:border-pink-300'
    : 'focus:border-red-400'
  const accentRowHover = isProphecy ? 'hover:bg-pink-400/10' : 'hover:bg-red-500/10'

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
    <div className={`space-y-2 rounded border ${accentBorder} ${accentBg} p-2`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] uppercase tracking-[0.12em] ${accentText}`}>
          {sourceLabel} · Forged
        </span>
        {canAdd && (
          <button
            onClick={() => setOpen((v) => !v)}
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${accentBorder} ${accentBorderHover} ${accentText} ${accentTextHover}`}
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
                className={`bg-panel-2 border ${accentBorderItem} rounded px-2 py-1 text-[11px]`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate ${accentText} tabular-nums`}>
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
            className={`w-full bg-panel-2 border border-border rounded px-2 py-1 text-[11px] focus:outline-none ${accentBorderInputFocus}`}
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
                    className={`w-full text-left text-[11px] px-2 py-1 ${accentRowHover}`}
                  >
                    <span className={accentText}>{m.name}</span>{' '}
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
