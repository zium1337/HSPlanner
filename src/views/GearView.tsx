import { useEffect, useMemo, useRef, useState } from 'react'
import ItemTooltip from '../components/ItemTooltip'
import GearItemModal from '../components/GearItemModal'
import {
  detectRuneword,
  gameConfig,
  gems,
  getItem,
  items,
  runes,
} from '../data'
import { useBuild } from '../store/build'
import type {
  EquippedItem,
  ItemRarity,
  SlotKey,
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
  // Gear management view: shows every equipment slot and the charm grid (with backtracking-based packing). Clicking a slot tile opens GearItemModal which handles both item picking and full configuration (sockets, stars, affixes, runewords, forge mods, angelic augment).
  const inventory = useBuild((s) => s.inventory)
  const equipItem = useBuild((s) => s.equipItem)

  const [pickerSlot, setPickerSlot] = useState<SlotKey | null>(null)
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
    const before = packCharms(others)
    const after = packCharms([...others, candidate])
    const candidateOverflowed = after.overflow.includes(slot)
    const overflowGrew = after.overflow.length > before.overflow.length
    if (candidateOverflowed || overflowGrew) {
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

  const gearSlots = gameConfig.slots.filter((s) => !s.key.startsWith('charm_'))
  const charmSlots = gameConfig.slots.filter((s) => s.key.startsWith('charm_'))

  const weaponBase = inventory.weapon ? getItem(inventory.weapon.baseId) : undefined
  const offhandLocked = !!weaponBase?.twoHanded

  const openSlot = (slotKey: SlotKey) => {
    if (slotKey === 'offhand' && offhandLocked && !inventory.offhand) return
    setPickerSlot(slotKey)
  }

  const pickerSlotConfig = pickerSlot
    ? gameConfig.slots.find((s) => s.key === pickerSlot)
    : null

  return (
    <div className="max-w-7xl">
      <header className="flex items-end justify-between mb-4">
        <h2 className="text-2xl font-semibold">Gear</h2>
        <p className="text-muted text-sm">
          {items.length} items · {gems.length} gems · {runes.length} runes
        </p>
      </header>

      <div className="space-y-4">
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
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {gearSlots.map((slot) => (
              <li key={slot.key}>
                <SlotRow
                  slot={slot}
                  equipped={inventory[slot.key]}
                  active={pickerSlot === slot.key}
                  locked={slot.key === 'offhand' && offhandLocked}
                  onSelect={() => openSlot(slot.key)}
                />
              </li>
            ))}
          </ul>
        </section>

        <CharmSection
          charmSlots={charmSlots}
          activeSlot={pickerSlot}
          onSelect={(s) => openSlot(s)}
          fitError={charmFitError}
        />
      </div>

      {pickerSlot && (
        <GearItemModal
          slotKey={pickerSlot}
          slotLabel={pickerSlotConfig?.name ?? pickerSlot}
          currentBaseId={inventory[pickerSlot]?.baseId ?? null}
          onClose={() => setPickerSlot(null)}
          onSelect={(id) => {
            if (pickerSlot.startsWith('charm_')) {
              if (!tryEquipCharm(pickerSlot, id)) return
            }
            equipItem(pickerSlot, id)
          }}
        />
      )}
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
  // Renders a single inventory-slot row in GearView's left rail with the slot label, the equipped item's name + rarity colour (or empty hint), the runeword override colour, and the click-to-select handler. Used once per slot inside GearView.
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

function buildInitialOccupancy(): boolean[] {
  // Returns a fresh boolean grid for the charm-pack solver, with the structurally-blocked cells of the charm grid pre-set to true. Used by `packCharms` (and the backtracker) before running each placement attempt.
  const occ = new Array(CHARM_GRID_ROWS * CHARM_GRID_COLS).fill(false)
  for (const [r, c] of CHARM_BLOCKED_CELLS) {
    occ[r * CHARM_GRID_COLS + c] = true
  }
  return occ
}

function canPlaceAt(
  ch: { w: number; h: number },
  r: number,
  c: number,
  occupancy: boolean[],
): boolean {
  // Returns true when the rectangular charm `ch` can be placed at (r, c) without overlapping any already-occupied cell. Used by the backtracking and greedy charm-packing routines.
  for (let dr = 0; dr < ch.h; dr++) {
    for (let dc = 0; dc < ch.w; dc++) {
      if (occupancy[(r + dr) * CHARM_GRID_COLS + (c + dc)]) return false
    }
  }
  return true
}

function setOccupancy(
  ch: { w: number; h: number },
  r: number,
  c: number,
  occupancy: boolean[],
  value: boolean,
): void {
  // Marks every cell that the rectangular charm `ch` occupies starting at (r, c) as `value`, used to claim or release a placement during backtracking.
  for (let dr = 0; dr < ch.h; dr++) {
    for (let dc = 0; dc < ch.w; dc++) {
      occupancy[(r + dr) * CHARM_GRID_COLS + (c + dc)] = value
    }
  }
}

function backtrackPack(
  charms: { slotKey: SlotKey; w: number; h: number }[],
  idx: number,
  occupancy: boolean[],
  positions: ({ row: number; col: number } | null)[],
): boolean {
  // Recursive depth-first backtracking that tries to place every charm in the supplied order, with a fast path for trailing 1×1 charms (which only need a free-cell count, not full backtracking). Returns true when a complete placement is found and writes the chosen positions into the `positions` array. Used by `packCharms`.
  if (idx === charms.length) return true

  let allUnit = true
  for (let i = idx; i < charms.length; i++) {
    const c = charms[i]!
    if (c.w !== 1 || c.h !== 1) {
      allUnit = false
      break
    }
  }
  if (allUnit) {
    const needed = charms.length - idx
    const free: { row: number; col: number }[] = []
    for (let r = 0; r < CHARM_GRID_ROWS && free.length < needed; r++) {
      for (let c = 0; c < CHARM_GRID_COLS && free.length < needed; c++) {
        if (!occupancy[r * CHARM_GRID_COLS + c]) free.push({ row: r, col: c })
      }
    }
    if (free.length < needed) return false
    for (let i = 0; i < needed; i++) positions[idx + i] = free[i]!
    return true
  }

  const ch = charms[idx]!
  for (let r = 0; r <= CHARM_GRID_ROWS - ch.h; r++) {
    for (let c = 0; c <= CHARM_GRID_COLS - ch.w; c++) {
      if (!canPlaceAt(ch, r, c, occupancy)) continue
      setOccupancy(ch, r, c, occupancy, true)
      positions[idx] = { row: r, col: c }
      if (backtrackPack(charms, idx + 1, occupancy, positions)) return true
      setOccupancy(ch, r, c, occupancy, false)
      positions[idx] = null
    }
  }
  return false
}

function packCharms(
  charms: { slotKey: SlotKey; w: number; h: number }[],
): { placed: PlacedCharm[]; overflow: SlotKey[]; occupancy: boolean[] } {
  // Packs every supplied charm into the constrained charm grid, sorting largest-first and trying the full backtracking solver first; if total area exceeds capacity it falls back to a greedy first-fit-decreasing algorithm and reports any charms that overflow. Used by GearView's CharmSection to render the visual layout.
  const sorted = [...charms].sort((a, b) => {
    const areaDiff = b.w * b.h - a.w * a.h
    if (areaDiff !== 0) return areaDiff
    const heightDiff = b.h - a.h
    if (heightDiff !== 0) return heightDiff
    return a.slotKey.localeCompare(b.slotKey)
  })

  const usable =
    CHARM_GRID_ROWS * CHARM_GRID_COLS - CHARM_BLOCKED_CELLS.length
  const totalArea = sorted.reduce((acc, c) => acc + c.w * c.h, 0)

  if (totalArea <= usable) {
    const occupancy = buildInitialOccupancy()
    const positions: ({ row: number; col: number } | null)[] = new Array(
      sorted.length,
    ).fill(null)
    if (backtrackPack(sorted, 0, occupancy, positions)) {
      const placed: PlacedCharm[] = sorted.map((ch, i) => ({
        slotKey: ch.slotKey,
        row: positions[i]!.row,
        col: positions[i]!.col,
        w: ch.w,
        h: ch.h,
      }))
      return { placed, overflow: [], occupancy }
    }
  }

  const occupancy = buildInitialOccupancy()
  const placed: PlacedCharm[] = []
  const overflow: SlotKey[] = []

  for (const ch of sorted) {
    let foundSpot: { r: number; c: number } | null = null
    for (let r = 0; r <= CHARM_GRID_ROWS - ch.h && !foundSpot; r++) {
      for (let c = 0; c <= CHARM_GRID_COLS - ch.w && !foundSpot; c++) {
        if (canPlaceAt(ch, r, c, occupancy)) foundSpot = { r, c }
      }
    }
    if (foundSpot) {
      setOccupancy(ch, foundSpot.r, foundSpot.c, occupancy, true)
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
  // Renders the visual charm grid (with blocked cells, multi-cell charms, click-to-edit, and an "overflow" warning when the user tries to equip more area than the grid can hold). Used by GearView underneath the slot rail.
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

