import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import ItemTooltip, {
  ItemCard,
  ItemTooltipBody,
  RARITY_TONE,
} from '../components/ItemTooltip'
import PickerModal, {
  type PickerPanelState,
  type PickerRow,
} from '../components/PickerModal'
import Tooltip, {
  TooltipFooter,
  TooltipHeader,
  TooltipPanel,
  TooltipSection,
  TooltipStat,
  TooltipText,
} from '../components/Tooltip'
import {
  affixes,
  augments,
  crystalMods,
  detectRuneword,
  FORGE_KIND_LABEL,
  forgeKindFor,
  gameConfig,
  gems,
  getAffix,
  getAugment,
  getCrystalMod,
  getGem,
  getItem,
  getItemImage,
  getItemSet,
  getRune,
  getSkillsByClass,
  isGearSlot,
  items,
  runes,
  runewords,
} from '../data'
import type { ForgeKind } from '../data'
import {
  MAX_STARS,
  RAINBOW_MULTIPLIER,
  maxSocketsFor,
  useBuild,
} from '../store/build'
import {
  aggregateItemSkillBonuses,
  combineAdditiveAndMore,
  computeBuildStats,
  computeSkillDamage,
  fmtStats,
  formatValue,
  normalizeSkillName,
  rangedMax,
  rangedMin,
  rolledAffixValueWithStars,
  statName,
} from '../utils/stats'
import type { SkillDamageBreakdown } from '../utils/stats'
import { AUGMENT_MAX_LEVEL } from '../types'
import type {
  Affix,
  AttributeKey,
  CustomStat,
  EquippedItem,
  Inventory,
  ItemBase,
  ItemRarity,
  RangedValue,
  Skill,
  SlotKey,
  SocketType,
  TreeSocketContent,
} from '../types'

const SOCKETABLE_ICONS = import.meta.glob<string>(
  '../assets/socketable/*.png',
  { eager: true, query: '?url', import: 'default' },
)
const SOCKETABLE_ICON_BY_NAME: Record<string, string> = {}
for (const [p, url] of Object.entries(SOCKETABLE_ICONS)) {
  const file = p.split('/').pop() ?? ''
  const key = file.replace(/_spr\.png$/i, '').replace(/_/g, ' ')
  SOCKETABLE_ICON_BY_NAME[key.toLowerCase()] = url
}
function socketableIconForName(name: string): string | undefined {
  // Maps a gem/rune display name (e.g. "Chipped Amethyst", "Tul") to the bundled pixel-art PNG that the socket PickerModal renders next to the row. Mirrors JewelSocketModal's lookup so both modals share the same iconography.
  return SOCKETABLE_ICON_BY_NAME[name.toLowerCase()]
}

const GEM_TINT: Record<string, string> = {
  amethyst: '#c97acc',
  diamond: '#d4cfbf',
  emerald: '#74c98a',
  ruby: '#d96b5a',
  sapphire: '#5a8fc9',
  topaz: '#e0b864',
  skull: '#7a6a5a',
}
function gemColorForName(name: string): string {
  // Picks a fallback diamond-tint colour for a gem/jewel based on the last word of its name (sapphire → blue, ruby → red, etc.). Used by the socket PickerRow when no PNG icon is bundled, so the row still reads as a colour-coded gem.
  const last = name.split(' ').slice(-1)[0]?.toLowerCase() ?? ''
  return GEM_TINT[last] ?? '#5a5448'
}

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
  // Gear management view: shows every equipment slot, the relic/charm grid (with backtracking-based packing) and the per-slot edit panel for picking items, applying runewords, choosing sockets/gems/runes, setting stars, editing affix rolls, applying forge mods, and equipping angelic augments. The main inventory editor.
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

  const socketPickerRows: PickerRow[] = useMemo(() => {
    const out: PickerRow[] = []
    for (const g of gems) {
      const isJewel = g.name.toLowerCase().includes('jewel')
      const kind = isJewel ? 'JEWEL' : 'GEM'
      out.push({
        id: g.id,
        name: g.name,
        tier: g.tier,
        kindLabel: kind,
        group: isJewel ? 'Jewels' : 'Gems',
        meta: fmtStats(g.stats) || '—',
        iconColor: gemColorForName(g.name),
        iconUrl: socketableIconForName(g.name),
        tooltip: buildSocketableTooltip(g, kind),
      })
    }
    for (const r of runes) {
      out.push({
        id: r.id,
        name: r.name,
        tier: r.tier,
        kindLabel: 'RUNE',
        group: 'Runes',
        meta: fmtStats(r.stats) || '—',
        iconColor: '#c9a560',
        iconUrl: socketableIconForName(r.name),
        tooltip: buildSocketableTooltip(r, 'RUNE'),
      })
    }
    return out
  }, [])

  const gearSlots = gameConfig.slots.filter((s) => !s.key.startsWith('charm_'))
  const charmSlots = gameConfig.slots.filter((s) => s.key.startsWith('charm_'))

  const weaponBase = inventory.weapon ? getItem(inventory.weapon.baseId) : undefined
  const offhandLocked = !!weaponBase?.twoHanded

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-4">
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rotate-45 bg-accent-hot"
            style={{ boxShadow: '0 0 8px rgba(224,184,100,0.6)' }}
          />
          Config
        </div>
        <div className="flex items-end justify-between gap-3">
          <h2
            className="m-0 text-[22px] font-semibold tracking-[0.02em] text-accent-hot"
            style={{ textShadow: '0 0 16px rgba(224,184,100,0.18)' }}
          >
            Gear
          </h2>
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            <span>
              <span className="text-text">{items.length}</span> items
            </span>
            <span aria-hidden className="h-3 w-px bg-border" />
            <span>
              <span className="text-text">{gems.length}</span> gems
            </span>
            <span aria-hidden className="h-3 w-px bg-border" />
            <span>
              <span className="text-text">{runes.length}</span> runes
            </span>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <GearPanel
          title="Equipment"
          trailing={
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              <span className="text-accent-hot">
                {gearSlots.filter((s) => inventory[s.key]).length}
              </span>
              <span className="text-faint">
                {' '}
                / {gearSlots.length}
              </span>{' '}
              equipped
            </span>
          }
        >
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {gearSlots.map((slot) => (
              <li key={slot.key}>
                <SlotRow
                  slot={slot}
                  equipped={inventory[slot.key]}
                  active={activeSlot === slot.key}
                  locked={slot.key === 'offhand' && offhandLocked}
                  onSelect={() => setActiveSlot(slot.key)}
                />
              </li>
            ))}
          </ul>
        </GearPanel>

        <CharmSection
          charmSlots={charmSlots}
          activeSlot={activeSlot}
          onSelect={(s) => setActiveSlot(s)}
          fitError={charmFitError}
        />
      </div>

      {activeSlot && (
        <GearSlotModal
          slot={activeSlot}
          slotName={
            gameConfig.slots.find((s) => s.key === activeSlot)?.name ?? activeSlot
          }
          equipped={inventory[activeSlot]}
          offhandLocked={offhandLocked}
          socketPickerRows={socketPickerRows}
          onEquip={(id) => {
            if (activeSlot.startsWith('charm_')) {
              if (!tryEquipCharm(activeSlot, id)) return
            }
            equipItem(activeSlot, id)
          }}
          onUnequip={() => {
            unequipItem(activeSlot)
            setActiveSlot(null)
          }}
          onSocketCount={(n) => setSocketCount(activeSlot, n)}
          onSocketed={(idx, id) => setSocketed(activeSlot, idx, id)}
          onSocketType={(idx, t) => setSocketType(activeSlot, idx, t)}
          onSetStars={(n) => setStars(activeSlot, n)}
          onAddAffix={(affixId, tier) => addAffix(activeSlot, affixId, tier)}
          onRemoveAffix={(idx) => removeAffix(activeSlot, idx)}
          onAddForgedMod={(modId, tier) =>
            addForgedMod(activeSlot, modId, tier)
          }
          onRemoveForgedMod={(idx) => removeForgedMod(activeSlot, idx)}
          onApplyRuneword={(rwId) => applyRuneword(activeSlot, rwId)}
          onClose={() => setActiveSlot(null)}
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
      className={`group flex h-full min-h-11 w-full items-center gap-2 rounded-[3px] border px-2 py-1.5 text-left transition-colors ${rarityBorder} ${
        active
          ? 'border-accent-hot bg-accent-hot/10 ring-1 ring-accent-hot/40'
          : `${rarityBg} hover:border-accent-deep`
      }`}
    >
      <span className="w-20 shrink-0 truncate font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-faint">
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
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] tabular-nums text-faint">
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

function GearPanel({
  title,
  trailing,
  children,
}: {
  title: string
  trailing?: React.ReactNode
  children: React.ReactNode
}) {
  // Renders the panel-system frame (gradient, accent corners, sectionLabel header) shared by Equipment and Charm Inventory in GearView.
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
      <GearPanelCornerMarks />
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
      {children}
    </section>
  )
}

function GearPanelCornerMarks() {
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
    <GearPanel
      title="Charm Inventory"
      trailing={
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          <span className="text-accent-hot">{occupiedCells}</span>
          <span className="text-faint"> / {totalUsable}</span>
          {overflow.length > 0 && (
            <span className="ml-2 text-stat-red">
              · {overflow.length} won't fit
            </span>
          )}
        </span>
      }
    >
      <div
        className="mx-auto grid w-fit gap-1 rounded-[3px] border border-border-2 p-3"
        style={{
          background: 'linear-gradient(180deg, #0c0804, #070302)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.7)',
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
        <div
          className="mt-2 rounded-[3px] border border-stat-red/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-stat-red"
          style={{
            background:
              'linear-gradient(180deg, rgba(60,30,28,0.4), rgba(44,22,20,0.25))',
          }}
        >
          {overflow.length} charm{overflow.length === 1 ? '' : 's'} could not be
          placed — remove some to free space.
        </div>
      )}
      {fitError && (
        <div
          className="mt-2 rounded-[3px] border border-stat-red/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-stat-red"
          style={{
            background:
              'linear-gradient(180deg, rgba(60,30,28,0.4), rgba(44,22,20,0.25))',
          }}
        >
          {fitError}
        </div>
      )}
    </GearPanel>
  )
}

const RARITY_LABEL: Record<ItemRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  mythic: 'Mythic',
  satanic: 'Satanic',
  heroic: 'Heroic',
  angelic: 'Angelic',
  satanic_set: 'Satanic Set',
  unholy: 'Unholy',
  relic: 'Relic',
}

function buildItemSearchTerms(i: ItemBase): string {
  // Aggregates every searchable surface of a base item (implicits, unique effects, procs, skill bonuses, description, flavor) into a single lowercase string used by the gear PickerModal so users can filter by affix or effect text — not just by item name.
  const parts: string[] = [i.name, i.baseType]
  if (i.grade) parts.push(`Grade ${i.grade}`)
  if (i.implicit) {
    for (const [k, v] of Object.entries(i.implicit)) {
      parts.push(statName(k))
      parts.push(formatValue(v, k))
    }
  }
  if (i.uniqueEffects) parts.push(...i.uniqueEffects)
  if (i.procs) {
    for (const p of i.procs) {
      parts.push(p.description)
      if (p.details) parts.push(p.details)
    }
  }
  if (i.skillBonuses) {
    for (const [skill, val] of Object.entries(i.skillBonuses)) {
      parts.push(skill)
      parts.push(formatValue(val, skill))
    }
  }
  if (i.description) parts.push(i.description)
  if (i.flavor) parts.push(i.flavor)
  if (i.setId) parts.push(i.setId)
  return parts.join(' ').toLowerCase()
}

function NetChangeBlock({
  previous,
  next,
}: {
  previous: Record<string, number>
  next: Record<string, number>
}) {
  // Renders a Net Change section inside a PickerModal tooltip — diffs the previously-applied stats against the candidate stats and lists every key that moves. Positives in green, negatives in red, sorted by magnitude. Used by the socketable & crystal-mod tooltip builders so the user sees the build delta without leaving the picker.
  const allKeys = new Set([
    ...Object.keys(previous),
    ...Object.keys(next),
  ])
  const diffs: Array<{ key: string; diff: number }> = []
  for (const key of allKeys) {
    const d = (next[key] ?? 0) - (previous[key] ?? 0)
    if (Math.abs(d) < 0.01) continue
    diffs.push({ key, diff: d })
  }
  diffs.sort((a, b) => b.diff - a.diff)
  if (diffs.length === 0) {
    return (
      <TooltipSection>
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          Net Change
        </div>
        <p className="text-[11px] text-faint italic">No stat changes</p>
      </TooltipSection>
    )
  }
  return (
    <TooltipSection>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
        Net Change
      </div>
      <ul className="space-y-0.5 text-[12px]">
        {diffs.map(({ key, diff }) => {
          const up = diff > 0
          return (
            <li
              key={key}
              className="flex items-baseline justify-between gap-2"
            >
              <span className="min-w-0 wrap-break-words leading-tight text-muted">
                {statName(key)}
              </span>
              <span
                className={`shrink-0 whitespace-nowrap font-mono tabular-nums ${
                  up ? 'text-stat-green' : 'text-stat-red'
                }`}
              >
                {up ? '▲' : '▼'} {formatValue(diff, key)}
              </span>
            </li>
          )
        })}
      </ul>
    </TooltipSection>
  )
}

function formatStatLines(stats: Record<string, number>): ReactNode[] {
  // Renders a stat block as a list of TooltipStat rows for use inside a PickerRow tooltip body. Filters out zero values so Chipped Skull and other "no flat stat" gems don't render an empty block.
  return Object.entries(stats)
    .filter(([, v]) => v !== 0)
    .map(([key, val]) => (
      <TooltipStat
        key={key}
        label={statName(key)}
        value={formatValue(val, key)}
      />
    ))
}

function isLegacyTierTag(s?: string): boolean {
  // Returns true when the supplied description string is just a legacy "Tier S/A/B/…" grade tag (e.g. "Tier D" on Chipped Amethyst), so we can hide it from the tooltip body. Used by `buildSocketableTooltip` to suppress these noise lines.
  if (!s) return false
  return /^\s*tier\s+[a-z]+\s*$/i.test(s)
}

function buildSocketableTooltip(
  s: { id: string; name: string; tier: number; stats: Record<string, number>; description?: string },
  kind: 'GEM' | 'JEWEL' | 'RUNE',
  opts?: { previousStats?: Record<string, number>; multiplier?: number },
): ReactNode {
  // Returns a Tooltip body for a gem/jewel/rune row (or a SocketPickerTrigger with one currently socketed). Header carries the name + kind+tier subtitle + the bundled pixel sprite when available; then a stats block (formatted via statName/formatValue); optional non-tier description blurb; and — when `opts.previousStats` is supplied — a Net Change section that diffs the candidate's stats against whatever is currently socketed (with `multiplier` applied for rainbow sockets), so users can see the build delta without leaving the picker.
  const mult = opts?.multiplier ?? 1
  const scaled: Record<string, number> = {}
  for (const [k, v] of Object.entries(s.stats)) scaled[k] = v * mult
  const lines = formatStatLines(scaled)
  const hasDescription = s.description && !isLegacyTierTag(s.description)
  return (
    <>
      <TooltipHeader
        title={s.name}
        subtitle={`${kind} · Tier ${s.tier}`}
        image={socketableIconForName(s.name)}
      />
      {lines.length > 0 && <TooltipSection>{lines}</TooltipSection>}
      {hasDescription && (
        <TooltipSection>
          <TooltipText>{s.description}</TooltipText>
        </TooltipSection>
      )}
      {opts?.previousStats && (
        <NetChangeBlock
          previous={opts.previousStats}
          next={scaled}
        />
      )}
    </>
  )
}

function buildAffixTooltip(a: Affix): ReactNode {
  // Tooltip body for an affix row in the AffixesSection picker. Header shows the human description as the title (so users see what the affix does, not just its codename), with `AFFIX · {name} · T{tier}` as the subtitle. If the affix has a numeric range, a single TooltipStat row spells it out; the kind/group are surfaced in the footer.
  const sign = a.sign
  const suffix = a.format === 'percent' ? '%' : ''
  const range =
    a.valueMin !== null && a.valueMax !== null
      ? a.valueMin === a.valueMax
        ? `${sign}${a.valueMin}${suffix}`
        : `${sign}${a.valueMin}${suffix} – ${sign}${a.valueMax}${suffix}`
      : null
  return (
    <>
      <TooltipHeader
        title={a.description}
        subtitle={`Affix · ${a.name} · Tier ${a.tier}`}
      />
      {range && (
        <TooltipSection>
          <TooltipStat label="Range" value={range} />
          {a.statKey && (
            <TooltipStat label="Stat" value={statName(a.statKey)} />
          )}
        </TooltipSection>
      )}
      {a.kind && (
        <TooltipFooter>
          {a.kind === 'prefix' ? 'Prefix' : 'Suffix'} · group {a.groupId}
        </TooltipFooter>
      )}
    </>
  )
}

function affixAverageStats(a: Affix): Record<string, number> {
  // Returns the candidate-stat map for an Affix (averaged over its value range, signed) so the NetChangeBlock can diff it against whatever is currently rolled. Used by the crystal-mod tooltip and any other affix-rooted picker that wants a "stat delta vs current" preview.
  if (!a.statKey || a.valueMin === null || a.valueMax === null) return {}
  const avg = (a.valueMin + a.valueMax) / 2
  const signed = a.sign === '-' ? -avg : avg
  return { [a.statKey]: signed }
}

function buildCrystalModTooltip(
  m: Affix,
  opts?: { previousStats?: Record<string, number> },
): ReactNode {
  // Tooltip body for a satanic-crystal forged-mod row. Uses the `satanic` tooltip tone for the red gradient header, surfaces the human description, the numeric range and stat key (when defined), and — when `opts.previousStats` is supplied — a Net Change section comparing this mod's averaged stats against whatever crystal is currently forged on the item.
  const sign = m.sign
  const suffix = m.format === 'percent' ? '%' : ''
  const range =
    m.valueMin !== null && m.valueMax !== null
      ? m.valueMin === m.valueMax
        ? `${sign}${m.valueMin}${suffix}`
        : `${sign}${m.valueMin}${suffix} – ${sign}${m.valueMax}${suffix}`
      : null
  return (
    <>
      <TooltipHeader
        title={m.name}
        subtitle={`Satanic Crystal · Tier ${m.tier}`}
        tone="satanic"
      />
      <TooltipSection>
        <TooltipText>{m.description}</TooltipText>
      </TooltipSection>
      {range && (
        <TooltipSection>
          <TooltipStat label="Range" value={range} />
          {m.statKey && (
            <TooltipStat label="Stat" value={statName(m.statKey)} />
          )}
        </TooltipSection>
      )}
      {opts?.previousStats && (
        <NetChangeBlock
          previous={opts.previousStats}
          next={affixAverageStats(m)}
        />
      )}
    </>
  )
}

function buildRunewordTooltip(rw: {
  id: string
  name: string
  runes: string[]
  allowedBaseTypes: string[]
  stats: Record<string, number>
  requiresLevel?: number
  description?: string
}): ReactNode {
  // Tooltip body for a runeword row. Surfaces the rune sequence as primary text, then the granted stats (when any), then a footer of allowed base types + level requirement, and finally an optional description blurb.
  const seq = rw.runes.map((r) => r.replace(/^rune_/, '').toUpperCase()).join(' → ')
  const lines = formatStatLines(rw.stats)
  return (
    <>
      <TooltipHeader
        title={rw.name}
        subtitle={`Runeword · ${rw.runes.length} runes`}
        tone="rare"
      />
      <TooltipSection>
        <TooltipText>
          <span className="font-mono text-[11px] tabular-nums tracking-[0.06em] text-amber-300">
            {seq}
          </span>
        </TooltipText>
      </TooltipSection>
      {lines.length > 0 && <TooltipSection>{lines}</TooltipSection>}
      <TooltipFooter>
        Bases · {rw.allowedBaseTypes.join(', ')}
        {rw.requiresLevel ? ` · Lvl ${rw.requiresLevel}` : ''}
      </TooltipFooter>
      {rw.description && (
        <TooltipSection>
          <TooltipText>{rw.description}</TooltipText>
        </TooltipSection>
      )}
    </>
  )
}

function buildAugmentTooltip(aug: {
  id: string
  name: string
  description: string
  triggerNote: string
  rangedOnly?: boolean
  levels: { level: number; stats: Record<string, number>; cost: number }[]
}): ReactNode {
  // Tooltip body for an angelic-augment row. Uses the `angelic` tone (yellow gradient), shows the trigger note as a subtitle, the description prose, and a quick max-level snapshot (level + cost + stat lines) so users can compare augments without opening the picker for each.
  const lvl = aug.levels[aug.levels.length - 1] ?? aug.levels[0]
  const lines = lvl ? formatStatLines(lvl.stats) : []
  return (
    <>
      <TooltipHeader
        title={aug.name}
        subtitle={`Angelic Augment · ${aug.triggerNote}`}
        tone="angelic"
      />
      <TooltipSection>
        <TooltipText>{aug.description}</TooltipText>
      </TooltipSection>
      {lvl && lines.length > 0 && (
        <TooltipSection>
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-yellow-200/70">
            Max level · {lvl.level} · cost {lvl.cost} keys
          </div>
          {lines}
        </TooltipSection>
      )}
      {aug.rangedOnly && (
        <TooltipFooter>Ranged weapon required</TooltipFooter>
      )}
    </>
  )
}

function pickerItemsForSlot(slotKey: SlotKey): PickerRow[] {
  // Builds the modal-picker rows for the supplied gear slot, mirroring the legacy itemsForSlot (sorted by rarity then name) but enriched with rarity, group, baseType, a one-line meta string, and a full searchable-text blob (built by `buildItemSearchTerms`) so users can filter by affix/effect text. Used by ItemPickerLauncher.
  const group = slotGroup(slotKey)
  const matching = items
    .filter((i) => i.slot === slotKey || slotGroup(i.slot) === group)
    .slice()
    .sort((a, b) => {
      const ra = RARITY_ORDER[a.rarity] ?? 99
      const rb = RARITY_ORDER[b.rarity] ?? 99
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name)
    })
  return matching.map((i) => {
    const parts: string[] = [i.baseType]
    if (i.grade) parts.push(`Grade ${i.grade}`)
    if (i.baseType === 'Charm') parts.push(`${i.width ?? 1}×${i.height ?? 1}`)
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
      name: i.name,
      rarity: i.rarity,
      kindLabel: i.baseType,
      group: RARITY_LABEL[i.rarity],
      meta: parts.join(' · '),
      searchTerms: buildItemSearchTerms(i),
      iconUrl: getItemImage(i.id),
    }
  })
}

// ===== Compare Column (3-Panel "Net Change" preview) =====

interface BuildSummary {
  attributes: Record<AttributeKey, RangedValue>
  stats: Record<string, RangedValue>
  itemBaseId: string | null
  itemName: string | null
  itemRarity: ItemRarity | null
  itemSockets: number
  itemSocketsMax: number
  damage: SkillDamageBreakdown | null
  effCastMin: number | undefined
  effCastMax: number | undefined
  hitDpsMin: number | undefined
  hitDpsMax: number | undefined
  avgHitDpsMin: number | undefined
  avgHitDpsMax: number | undefined
  procDpsMin: number
  procDpsMax: number
  combinedDpsMin: number | undefined
  combinedDpsMax: number | undefined
  activeSkillName: string | null
}

interface BuildSummaryDeps {
  classId: string | null
  level: number
  allocated: Record<AttributeKey, number>
  skillRanks: Record<string, number>
  activeAuraId: string | null
  activeBuffs: Record<string, boolean>
  customStats: CustomStat[]
  allocatedTreeNodes: Set<number>
  treeSocketed: Record<number, TreeSocketContent | null>
  mainSkillId: string | null
  enemyConditions: Record<string, boolean>
  enemyResistances: Record<string, number>
  procToggles: Record<string, boolean>
  killsPerSec: number
}

function computeBuildSummary(
  inventory: Inventory,
  slot: SlotKey,
  deps: BuildSummaryDeps,
): BuildSummary {
  const computed = computeBuildStats(
    deps.classId,
    deps.level,
    deps.allocated,
    inventory,
    deps.skillRanks,
    deps.activeAuraId,
    deps.activeBuffs,
    deps.customStats,
    deps.allocatedTreeNodes,
    deps.treeSocketed,
  )

  const allClassSkills = getSkillsByClass(deps.classId)
  const classSkills = allClassSkills.filter((s) => s.kind === 'active')
  const activeSkill = deps.mainSkillId
    ? classSkills.find((s) => s.id === deps.mainSkillId)
    : null
  const activeRank = activeSkill ? (deps.skillRanks[activeSkill.id] ?? 0) : 0

  const itemSkillBonuses = aggregateItemSkillBonuses(inventory)
  const skillRanksByName: Record<string, number> = {}
  const skillsByNormalizedName: Record<string, Skill> = {}
  for (const s of allClassSkills) {
    skillRanksByName[normalizeSkillName(s.name)] = deps.skillRanks[s.id] ?? 0
    skillsByNormalizedName[normalizeSkillName(s.name)] = s
  }

  const damage =
    activeSkill && activeRank > 0
      ? computeSkillDamage(
          activeSkill,
          activeRank,
          computed.attributes,
          computed.stats,
          skillRanksByName,
          itemSkillBonuses,
          deps.enemyConditions,
          deps.enemyResistances,
          skillsByNormalizedName,
        )
      : null

  const fcrCombined = combineAdditiveAndMore(
    computed.stats.faster_cast_rate,
    computed.stats.faster_cast_rate_more,
  )
  const fcrMin = rangedMin(fcrCombined)
  const fcrMax = rangedMax(fcrCombined)
  const effCastMin = activeSkill?.baseCastRate
    ? activeSkill.baseCastRate * (1 + fcrMin / 100)
    : undefined
  const effCastMax = activeSkill?.baseCastRate
    ? activeSkill.baseCastRate * (1 + fcrMax / 100)
    : undefined
  const hitDpsMin =
    damage && effCastMin !== undefined ? damage.finalMin * effCastMin : undefined
  const hitDpsMax =
    damage && effCastMax !== undefined ? damage.finalMax * effCastMax : undefined
  const avgHitDpsMin =
    damage && effCastMin !== undefined ? damage.avgMin * effCastMin : undefined
  const avgHitDpsMax =
    damage && effCastMax !== undefined ? damage.avgMax * effCastMax : undefined

  let procDpsMin = 0
  let procDpsMax = 0
  for (const procSkill of allClassSkills) {
    if (!procSkill.proc) continue
    if (!deps.procToggles[procSkill.id]) continue
    const procRank = deps.skillRanks[procSkill.id] ?? 0
    if (procRank === 0) continue
    const targetName = normalizeSkillName(procSkill.proc.target)
    const target = skillsByNormalizedName[targetName]
    if (!target) continue
    const targetRank = deps.skillRanks[target.id] ?? 0
    if (targetRank === 0) continue
    const targetDmg = computeSkillDamage(
      target,
      targetRank,
      computed.attributes,
      computed.stats,
      skillRanksByName,
      itemSkillBonuses,
      deps.enemyConditions,
      deps.enemyResistances,
      skillsByNormalizedName,
    )
    if (!targetDmg) continue
    const rate = procSkill.proc.trigger === 'on_kill' ? deps.killsPerSec : 1
    const factor = rate * (procSkill.proc.chance / 100)
    procDpsMin += factor * targetDmg.avgMin
    procDpsMax += factor * targetDmg.avgMax
  }

  const combinedDpsMin =
    avgHitDpsMin !== undefined ? avgHitDpsMin + procDpsMin : undefined
  const combinedDpsMax =
    avgHitDpsMax !== undefined ? avgHitDpsMax + procDpsMax : undefined

  const equipped = inventory[slot]
  const base = equipped ? getItem(equipped.baseId) : null
  const baseSockets = base?.sockets ?? 0
  const baseSocketsMax = base?.maxSockets ?? baseSockets
  const itemSockets = equipped?.socketCount ?? baseSockets

  return {
    attributes: computed.attributes,
    stats: computed.stats,
    itemBaseId: equipped?.baseId ?? null,
    itemName: base?.name ?? null,
    itemRarity: base?.rarity ?? null,
    itemSockets,
    itemSocketsMax: baseSocketsMax,
    damage,
    effCastMin,
    effCastMax,
    hitDpsMin,
    hitDpsMax,
    avgHitDpsMin,
    avgHitDpsMax,
    procDpsMin,
    procDpsMax,
    combinedDpsMin,
    combinedDpsMax,
    activeSkillName: activeSkill?.name ?? null,
  }
}

type DiffKind = 'up' | 'down' | 'same' | 'new' | 'lost'

interface StatDiff {
  key: string
  label: string
  beforeMin: number
  beforeMax: number
  afterMin: number
  afterMax: number
  delta: number
  kind: DiffKind
  unit?: 'pct' | 'flat'
}

function rangedBounds(v: RangedValue | undefined): { min: number; max: number } {
  if (v === undefined) return { min: 0, max: 0 }
  return { min: rangedMin(v), max: rangedMax(v) }
}

function classifyDiff(before: number, after: number): DiffKind {
  const eps = 0.001
  const beforeZero = Math.abs(before) < eps
  const afterZero = Math.abs(after) < eps
  if (beforeZero && afterZero) return 'same'
  if (beforeZero && !afterZero) return 'new'
  if (!beforeZero && afterZero) return 'lost'
  if (Math.abs(after - before) < eps) return 'same'
  return after > before ? 'up' : 'down'
}

const ITEM_AFFIX_KEYS: ReadonlyArray<{ key: string; label: string; unit?: 'pct' | 'flat' }> = [
  { key: 'defense', label: 'Defense' },
  { key: 'enhanced_defense', label: 'Enhanced Defense', unit: 'pct' },
  { key: 'all_skills', label: '+ All Skills' },
  { key: 'enhanced_damage', label: 'Enhanced Damage', unit: 'pct' },
]

const BUILD_STAT_KEYS: ReadonlyArray<{ key: string; label: string; unit?: 'pct' | 'flat' }> = [
  { key: 'life', label: 'Life' },
  { key: 'mana', label: 'Mana' },
  { key: 'crit_chance', label: 'Crit Chance', unit: 'pct' },
  { key: 'crit_damage', label: 'Crit Damage', unit: 'pct' },
  { key: 'fire_resist', label: 'Fire Resist', unit: 'pct' },
  { key: 'cold_resist', label: 'Cold Resist', unit: 'pct' },
  { key: 'lightning_resist', label: 'Lightning Resist', unit: 'pct' },
  { key: 'poison_resist', label: 'Poison Resist', unit: 'pct' },
  { key: 'magic_find', label: 'Magic Find', unit: 'pct' },
  { key: 'gold_find', label: 'Gold Find', unit: 'pct' },
]

function pickStatDiffsByKeys(
  before: BuildSummary,
  after: BuildSummary,
  keys: ReadonlyArray<{ key: string; label: string; unit?: 'pct' | 'flat' }>,
): StatDiff[] {
  const out: StatDiff[] = []
  for (const { key, label, unit } of keys) {
    const b = rangedBounds(before.stats[key])
    const a = rangedBounds(after.stats[key])
    const beforeAvg = (b.min + b.max) / 2
    const afterAvg = (a.min + a.max) / 2
    const kind = classifyDiff(beforeAvg, afterAvg)
    if (kind === 'same') continue
    out.push({
      key,
      label,
      beforeMin: b.min,
      beforeMax: b.max,
      afterMin: a.min,
      afterMax: a.max,
      delta: afterAvg - beforeAvg,
      kind,
      unit,
    })
  }
  return out
}

function attrDiffs(before: BuildSummary, after: BuildSummary): StatDiff[] {
  const out: StatDiff[] = []
  for (const attr of gameConfig.attributes) {
    const b = rangedBounds(before.attributes[attr.key])
    const a = rangedBounds(after.attributes[attr.key])
    const beforeAvg = (b.min + b.max) / 2
    const afterAvg = (a.min + a.max) / 2
    const kind = classifyDiff(beforeAvg, afterAvg)
    if (kind === 'same') continue
    out.push({
      key: attr.key,
      label: attr.name,
      beforeMin: b.min,
      beforeMax: b.max,
      afterMin: a.min,
      afterMax: a.max,
      delta: afterAvg - beforeAvg,
      kind,
    })
  }
  return out
}

function socketDiff(before: BuildSummary, after: BuildSummary): StatDiff | null {
  const kind = classifyDiff(before.itemSockets, after.itemSockets)
  if (kind === 'same') return null
  return {
    key: 'sockets',
    label: 'Sockets',
    beforeMin: before.itemSockets,
    beforeMax: before.itemSockets,
    afterMin: after.itemSockets,
    afterMax: after.itemSockets,
    delta: after.itemSockets - before.itemSockets,
    kind,
  }
}

function hitDpsDiff(before: BuildSummary, after: BuildSummary): StatDiff | null {
  const beforeMin = before.hitDpsMin ?? 0
  const beforeMax = before.hitDpsMax ?? 0
  const afterMin = after.hitDpsMin ?? 0
  const afterMax = after.hitDpsMax ?? 0
  const beforeAvg = (beforeMin + beforeMax) / 2
  const afterAvg = (afterMin + afterMax) / 2
  const kind = classifyDiff(beforeAvg, afterAvg)
  if (
    kind === 'same' &&
    before.hitDpsMin === undefined &&
    after.hitDpsMin === undefined
  ) {
    return null
  }
  return {
    key: 'hit_dps',
    label: 'Hit DPS',
    beforeMin,
    beforeMax,
    afterMin,
    afterMax,
    delta: afterAvg - beforeAvg,
    kind,
  }
}

function combinedDpsDiff(
  before: BuildSummary,
  after: BuildSummary,
): StatDiff | null {
  const beforeMin = before.combinedDpsMin ?? 0
  const beforeMax = before.combinedDpsMax ?? 0
  const afterMin = after.combinedDpsMin ?? 0
  const afterMax = after.combinedDpsMax ?? 0
  const beforeAvg = (beforeMin + beforeMax) / 2
  const afterAvg = (afterMin + afterMax) / 2
  const kind = classifyDiff(beforeAvg, afterAvg)
  if (
    kind === 'same' &&
    before.combinedDpsMin === undefined &&
    after.combinedDpsMin === undefined
  ) {
    return null
  }
  return {
    key: 'combined_dps',
    label: 'Combined DPS',
    beforeMin,
    beforeMax,
    afterMin,
    afterMax,
    delta: afterAvg - beforeAvg,
    kind,
  }
}

function avgHitDiff(before: BuildSummary, after: BuildSummary): StatDiff | null {
  const beforeMin = before.damage !== null ? before.damage.avgMin : 0
  const beforeMax = before.damage !== null ? before.damage.avgMax : 0
  const afterMin = after.damage !== null ? after.damage.avgMin : 0
  const afterMax = after.damage !== null ? after.damage.avgMax : 0
  const beforeAvg = (beforeMin + beforeMax) / 2
  const afterAvg = (afterMin + afterMax) / 2
  const kind = classifyDiff(beforeAvg, afterAvg)
  if (kind === 'same' && before.damage === null && after.damage === null) {
    return null
  }
  return {
    key: 'avg_hit',
    label: 'Average Hit',
    beforeMin,
    beforeMax,
    afterMin,
    afterMax,
    delta: afterAvg - beforeAvg,
    kind,
  }
}

type Verdict = 'upgrade' | 'downgrade' | 'sidegrade'

function computeVerdict(
  before: BuildSummary,
  after: BuildSummary,
): Verdict {
  if (
    before.hitDpsMin !== undefined &&
    after.hitDpsMin !== undefined &&
    before.hitDpsMax !== undefined &&
    after.hitDpsMax !== undefined
  ) {
    const b = (before.hitDpsMin + before.hitDpsMax) / 2
    const a = (after.hitDpsMin + after.hitDpsMax) / 2
    if (b > 0) {
      const ratio = (a - b) / b
      if (ratio > 0.02) return 'upgrade'
      if (ratio < -0.02) return 'downgrade'
      return 'sidegrade'
    }
    if (a > b) return 'upgrade'
    if (a < b) return 'downgrade'
  }
  let netUp = 0
  let netDown = 0
  for (const d of [
    ...pickStatDiffsByKeys(before, after, ITEM_AFFIX_KEYS),
    ...pickStatDiffsByKeys(before, after, BUILD_STAT_KEYS),
    ...attrDiffs(before, after),
  ]) {
    if (d.kind === 'up' || d.kind === 'new') netUp += 1
    if (d.kind === 'down' || d.kind === 'lost') netDown += 1
  }
  if (netUp > netDown && netUp - netDown >= 2) return 'upgrade'
  if (netDown > netUp && netDown - netUp >= 2) return 'downgrade'
  return 'sidegrade'
}

function formatScalar(n: number, unit?: 'pct' | 'flat'): string {
  const abs = Math.abs(n)
  const rounded =
    Math.abs(n - Math.round(n)) < 0.05 ? Math.round(n) : Math.round(n * 10) / 10
  if (unit === 'pct') return `${rounded}%`
  if (abs >= 1000) {
    return `${(n / 1000).toFixed(abs >= 10000 ? 1 : 2)}k`
  }
  return `${rounded}`
}

function formatStatNum(min: number, max: number, unit?: 'pct' | 'flat'): string {
  if (Math.abs(max - min) < 0.001) return formatScalar(min, unit)
  return `${formatScalar(min, unit)}-${formatScalar(max, unit)}`
}

function formatDeltaNum(n: number, unit?: 'pct' | 'flat', kind?: DiffKind): string {
  if (kind === 'new') return 'new'
  if (kind === 'lost') return 'lost'
  if (kind === 'same') return '='
  const sign = n > 0 ? '+' : ''
  const abs = Math.abs(n)
  const rounded = Math.abs(n - Math.round(n)) < 0.05 ? Math.round(n) : Math.round(n * 10) / 10
  if (unit === 'pct') return `${sign}${rounded}%`
  if (abs >= 1000) {
    return `${sign}${(n / 1000).toFixed(n >= 10000 || n <= -10000 ? 1 : 2)}k`
  }
  return `${sign}${rounded}`
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const config: Record<
    Verdict,
    { label: string; arrow: string; cls: string }
  > = {
    upgrade: {
      label: 'Upgrade',
      arrow: '▲',
      cls: 'border-stat-green text-stat-green bg-stat-green/8 shadow-[0_0_18px_rgba(116,201,138,0.12)]',
    },
    downgrade: {
      label: 'Downgrade',
      arrow: '▼',
      cls: 'border-stat-red text-stat-red bg-stat-red/8 shadow-[0_0_18px_rgba(232,144,122,0.12)]',
    },
    sidegrade: {
      label: 'Sidegrade',
      arrow: '≈',
      cls: 'border-border-2 text-muted bg-panel-2/60',
    },
  }
  const c = config[verdict]
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xs border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] ${c.cls}`}
    >
      <span className="text-[14px] leading-none">{c.arrow}</span>
      <span>{c.label}</span>
    </div>
  )
}

function DiffRow({ diff }: { diff: StatDiff }) {
  const beforeText =
    diff.kind === 'new'
      ? 'none'
      : formatStatNum(diff.beforeMin, diff.beforeMax, diff.unit)
  const afterText =
    diff.kind === 'lost'
      ? '—'
      : formatStatNum(diff.afterMin, diff.afterMax, diff.unit)

  const tone =
    diff.kind === 'up' || diff.kind === 'new'
      ? 'border-stat-green/35 bg-stat-green/8 text-stat-green'
      : diff.kind === 'down' || diff.kind === 'lost'
        ? 'border-stat-red/35 bg-stat-red/8 text-stat-red'
        : 'border-border-2 bg-transparent text-muted'

  const afterColor =
    diff.kind === 'up' || diff.kind === 'new'
      ? 'text-stat-green'
      : diff.kind === 'down' || diff.kind === 'lost'
        ? 'text-stat-red'
        : 'text-text'

  const beforeStyle = diff.kind === 'new' ? 'italic text-faint' : 'text-faint'
  const afterStyle = diff.kind === 'lost' ? 'italic text-faint' : afterColor
  const opacity = diff.kind === 'same' ? 'opacity-50' : ''

  return (
    <div
      className={`grid items-center gap-2.5 border-b border-dashed border-border px-1 py-1.5 last:border-b-0 font-mono text-[11px] ${opacity}`}
      style={{ gridTemplateColumns: '1fr auto auto auto auto' }}
    >
      <span className="font-sans text-[12px] text-text/85">{diff.label}</span>
      <span className={`min-w-13.5 text-right tabular-nums ${beforeStyle}`}>
        {beforeText}
      </span>
      <span className="text-faint">→</span>
      <span
        className={`min-w-13.5 text-right font-semibold tabular-nums ${afterStyle}`}
      >
        {afterText}
      </span>
      <span
        className={`min-w-15.5 rounded-xs border px-1.5 py-0.5 text-right text-[10px] font-semibold tabular-nums ${tone}`}
      >
        {formatDeltaNum(diff.delta, diff.unit, diff.kind)}
      </span>
    </div>
  )
}

function DiffSection({
  title,
  diffs,
  emptyHint,
}: {
  title: string
  diffs: StatDiff[]
  emptyHint?: string
}) {
  if (diffs.length === 0 && !emptyHint) return null
  return (
    <div className="mt-4 first:mt-0">
      <div className="mb-2 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        <span>{title}</span>
        <span className="h-px flex-1 bg-border" />
        {diffs.length > 0 && (
          <span className="font-normal tracking-[0.14em] text-faint">
            {diffs.length} change{diffs.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {diffs.length === 0 ? (
        <p className="text-[11px] text-faint italic">{emptyHint}</p>
      ) : (
        diffs.map((d) => <DiffRow key={d.key} diff={d} />)
      )}
    </div>
  )
}

function CompareSummary({
  before,
  after,
}: {
  before: BuildSummary
  after: BuildSummary
}) {
  const beforeColor = before.itemRarity
    ? RARITY_TEXT[before.itemRarity]
    : 'text-faint'
  const afterColor = after.itemRarity
    ? RARITY_TEXT[after.itemRarity]
    : 'text-faint'
  return (
    <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-border bg-border">
      <div className="bg-panel-2/80 px-3 py-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
          Currently Equipped
        </div>
        <div className={`mt-1 truncate text-[13px] font-medium ${beforeColor}`}>
          {before.itemName ?? <span className="italic text-faint">Empty slot</span>}
        </div>
      </div>
      <div className="bg-panel-2/80 px-3 py-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
          Selected
        </div>
        <div className={`mt-1 truncate text-[13px] font-medium ${afterColor}`}>
          {after.itemName ?? <span className="italic text-faint">Empty slot</span>}
        </div>
      </div>
    </div>
  )
}

function isSameEquipped(a: EquippedItem, b: EquippedItem): boolean {
  if (a.baseId !== b.baseId) return false
  if ((a.stars ?? 0) !== (b.stars ?? 0)) return false
  if (a.socketCount !== b.socketCount) return false
  const aSocketed = a.socketed ?? []
  const bSocketed = b.socketed ?? []
  if (aSocketed.length !== bSocketed.length) return false
  for (let i = 0; i < aSocketed.length; i++) {
    if (aSocketed[i] !== bSocketed[i]) return false
  }
  const aTypes = a.socketTypes ?? []
  const bTypes = b.socketTypes ?? []
  if (aTypes.length !== bTypes.length) return false
  for (let i = 0; i < aTypes.length; i++) {
    if (aTypes[i] !== bTypes[i]) return false
  }
  const aAffixes = a.affixes ?? []
  const bAffixes = b.affixes ?? []
  if (aAffixes.length !== bAffixes.length) return false
  for (let i = 0; i < aAffixes.length; i++) {
    if (
      aAffixes[i]?.affixId !== bAffixes[i]?.affixId ||
      aAffixes[i]?.tier !== bAffixes[i]?.tier ||
      aAffixes[i]?.roll !== bAffixes[i]?.roll
    ) {
      return false
    }
  }
  const aMods = a.forgedMods ?? []
  const bMods = b.forgedMods ?? []
  if (aMods.length !== bMods.length) return false
  for (let i = 0; i < aMods.length; i++) {
    if (
      aMods[i]?.affixId !== bMods[i]?.affixId ||
      aMods[i]?.tier !== bMods[i]?.tier
    ) {
      return false
    }
  }
  return (
    a.augment?.id === b.augment?.id && a.augment?.level === b.augment?.level
  )
}

function CompareItemCards({
  baselineEquipped,
  currentEquipped,
}: {
  baselineEquipped: EquippedItem | null
  currentEquipped: EquippedItem | null
}) {
  const baselineBase = baselineEquipped ? getItem(baselineEquipped.baseId) : null
  const currentBase = currentEquipped ? getItem(currentEquipped.baseId) : null
  if (!baselineBase && !currentBase) return null

  const sameItem =
    baselineEquipped &&
    currentEquipped &&
    isSameEquipped(baselineEquipped, currentEquipped)

  if (sameItem && currentBase && currentEquipped) {
    return (
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          <span>Item</span>
          <span className="h-px flex-1 bg-border" />
          <span className="font-normal tracking-[0.14em] text-faint">unchanged</span>
        </div>
        <ItemCard
          equipped={currentEquipped}
          base={currentBase}
          className="w-full text-[12px]"
        />
      </div>
    )
  }

  return (
    <div className="mb-4">
      <div className="mb-3 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        <span>Items</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex items-start gap-3">
        <ItemCard
          equipped={baselineEquipped ?? undefined}
          base={baselineBase ?? undefined}
          className="min-w-0 flex-1 text-[12px]"
        />
        <ItemCard
          equipped={currentEquipped ?? undefined}
          base={currentBase ?? undefined}
          className="min-w-0 flex-1 text-[12px]"
        />
      </div>
    </div>
  )
}

function CompareColumn({
  baselineInventory,
  currentInventory,
  baselineEquipped,
  currentEquipped,
  slot,
  deps,
}: {
  baselineInventory: Inventory
  currentInventory: Inventory
  baselineEquipped: EquippedItem | null
  currentEquipped: EquippedItem | undefined
  slot: SlotKey
  deps: BuildSummaryDeps
}) {
  const beforeSummary = useMemo(
    () => computeBuildSummary(baselineInventory, slot, deps),
    [baselineInventory, slot, deps],
  )
  const afterSummary = useMemo(
    () => computeBuildSummary(currentInventory, slot, deps),
    [currentInventory, slot, deps],
  )

  const verdict = useMemo(
    () => computeVerdict(beforeSummary, afterSummary),
    [beforeSummary, afterSummary],
  )

  const hitDps = hitDpsDiff(beforeSummary, afterSummary)
  const combinedDps = combinedDpsDiff(beforeSummary, afterSummary)
  const avgHit = avgHitDiff(beforeSummary, afterSummary)
  const itemAffixDiffs = pickStatDiffsByKeys(
    beforeSummary,
    afterSummary,
    ITEM_AFFIX_KEYS,
  )
  const sock = socketDiff(beforeSummary, afterSummary)
  if (sock) itemAffixDiffs.unshift(sock)

  const buildStatDiffs = [
    ...attrDiffs(beforeSummary, afterSummary),
    ...pickStatDiffsByKeys(beforeSummary, afterSummary, BUILD_STAT_KEYS),
  ]
  const damageRows = [hitDps, combinedDps, avgHit].filter(
    (d): d is StatDiff => d !== null,
  )

  const headerBg =
    verdict === 'upgrade'
      ? 'linear-gradient(180deg, rgba(116,201,138,0.05), transparent)'
      : verdict === 'downgrade'
        ? 'linear-gradient(180deg, rgba(232,144,122,0.05), transparent)'
        : 'linear-gradient(180deg, rgba(138,128,118,0.04), transparent)'

  return (
    <div className="flex w-150 min-w-0 shrink-0 flex-col border-l border-border bg-black/15">
      <div
        className="border-b border-border px-5 py-4"
        style={{ background: headerBg }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Comparison
            </div>
            <h3 className="m-0 font-cinzel text-[16px] font-semibold tracking-[0.02em] text-text/85">
              Net change
            </h3>
          </div>
          <VerdictBadge verdict={verdict} />
        </div>
        <CompareSummary before={beforeSummary} after={afterSummary} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
        <CompareItemCards
          baselineEquipped={baselineEquipped}
          currentEquipped={currentEquipped ?? null}
        />
        {damageRows.length > 0 && (
          <DiffSection
            title={
              afterSummary.activeSkillName
                ? `Active Skill · ${afterSummary.activeSkillName}`
                : 'Active Skill'
            }
            diffs={damageRows}
          />
        )}
        <DiffSection
          title="Item Affixes"
          diffs={itemAffixDiffs}
          emptyHint={
            beforeSummary.itemBaseId === afterSummary.itemBaseId
              ? 'No item-level changes'
              : undefined
          }
        />
        <DiffSection
          title="Build Stats"
          diffs={buildStatDiffs}
          emptyHint="No build-stat changes"
        />
      </div>
    </div>
  )
}

interface GearSlotModalProps {
  slot: SlotKey
  slotName: string
  equipped: EquippedItem | undefined
  offhandLocked: boolean
  socketPickerRows: PickerRow[]
  onEquip: (id: string) => void
  onUnequip: () => void
  onSocketCount: (n: number) => void
  onSocketed: (idx: number, id: string | null) => void
  onSocketType: (idx: number, type: SocketType) => void
  onSetStars: (n: number) => void
  onAddAffix: (affixId: string, tier: number) => void
  onRemoveAffix: (idx: number) => void
  onAddForgedMod: (modId: string, tier: number) => void
  onRemoveForgedMod: (idx: number) => void
  onApplyRuneword: (rwId: string) => void
  onClose: () => void
}

function GearSlotModal({
  slot,
  slotName,
  equipped,
  offhandLocked,
  socketPickerRows,
  onEquip,
  onUnequip,
  onSocketCount,
  onSocketed,
  onSocketType,
  onSetStars,
  onAddAffix,
  onRemoveAffix,
  onAddForgedMod,
  onRemoveForgedMod,
  onApplyRuneword,
  onClose,
}: GearSlotModalProps) {
  // Full-screen slot editor that replaces the old aside EditPanel. The left column lists every item that fits this slot (grouped by rarity, searchable by name AND affix/effect text); the right column shows the live configuration of the equipped item (sockets, stars, affixes, forge mods, augment, runeword presets) or — when hovering a different item — a side-by-side compare overlay.
  const [q, setQ] = useState('')
  const [showCompareCol, setShowCompareCol] = useState(true)
  const rows = useMemo(() => pickerItemsForSlot(slot), [slot])
  const inv = useBuild((s) => s.inventory)
  const classId = useBuild((s) => s.classId)
  const level = useBuild((s) => s.level)
  const allocated = useBuild((s) => s.allocated)
  const skillRanks = useBuild((s) => s.skillRanks)
  const activeAuraId = useBuild((s) => s.activeAuraId)
  const activeBuffs = useBuild((s) => s.activeBuffs)
  const customStats = useBuild((s) => s.customStats)
  const allocatedTreeNodes = useBuild((s) => s.allocatedTreeNodes)
  const treeSocketed = useBuild((s) => s.treeSocketed)
  const mainSkillId = useBuild((s) => s.mainSkillId)
  const enemyConditions = useBuild((s) => s.enemyConditions)
  const enemyResistances = useBuild((s) => s.enemyResistances)
  const procToggles = useBuild((s) => s.procToggles)
  const killsPerSec = useBuild((s) => s.killsPerSec)

  // Frozen at modal open so the compare column diffs live edits against the original equipped state.
  const [baselineEquipped] = useState<EquippedItem | null>(() =>
    equipped ? structuredClone(equipped) : null,
  )
  const baselineInventory = useMemo<Inventory>(
    () => ({ ...inv, [slot]: baselineEquipped ?? undefined }),
    [inv, baselineEquipped, slot],
  )
  const compareDeps = useMemo<BuildSummaryDeps>(
    () => ({
      classId,
      level,
      allocated,
      skillRanks,
      activeAuraId,
      activeBuffs,
      customStats,
      allocatedTreeNodes,
      treeSocketed,
      mainSkillId,
      enemyConditions,
      enemyResistances,
      procToggles,
      killsPerSec,
    }),
    [
      classId,
      level,
      allocated,
      skillRanks,
      activeAuraId,
      activeBuffs,
      customStats,
      allocatedTreeNodes,
      treeSocketed,
      mainSkillId,
      enemyConditions,
      enemyResistances,
      procToggles,
      killsPerSec,
    ],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filter = q.trim().toLowerCase()
  const filteredRows = useMemo(() => {
    if (!filter) return rows
    return rows.filter((r) => {
      if (r.name.toLowerCase().includes(filter)) return true
      if (typeof r.meta === 'string' && r.meta.toLowerCase().includes(filter))
        return true
      if (r.kindLabel?.toLowerCase().includes(filter)) return true
      if (r.group?.toLowerCase().includes(filter)) return true
      return r.searchTerms?.includes(filter) ?? false
    })
  }, [rows, filter])

  const groupedRows = useMemo(() => {
    const out: { group: string | null; rows: PickerRow[] }[] = []
    const idx = new Map<string, number>()
    for (const r of filteredRows) {
      const g = r.group ?? null
      const key = g ?? '__none__'
      let pos = idx.get(key)
      if (pos === undefined) {
        pos = out.length
        idx.set(key, pos)
        out.push({ group: g, rows: [] })
      }
      out[pos]!.rows.push(r)
    }
    return out
  }, [filteredRows])

  const hasGroupHeaders = groupedRows.some((g) => g.group !== null)

  const base = equipped ? getItem(equipped.baseId) : undefined
  const maxSockets = equipped
    ? maxSocketsFor(equipped.baseId, equipped.forgedMods)
    : 0
  const set = base?.setId ? getItemSet(base.setId) : undefined
  const setEquippedCount = base?.setId
    ? Object.values(inv).reduce((acc, eq) => {
        if (!eq) return acc
        const b = getItem(eq.baseId)
        return b?.setId === base.setId ? acc + 1 : acc
      }, 0)
    : 0
  const forgeKind =
    base && isGearSlot(slot) ? forgeKindFor(base.rarity) : null

  const isOffhandLocked = slot === 'offhand' && offhandLocked && !equipped

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/70"
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
        className={`relative flex h-[88vh] ${showCompareCol && !isOffhandLocked ? 'w-390' : 'w-295'} max-w-[96vw] flex-col overflow-hidden rounded-md border border-border`}
        style={{
          background:
            'linear-gradient(180deg, var(--color-panel-2), color-mix(in srgb, var(--color-bg) 80%, transparent))',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.02), 0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        <PickerCornerMarks />

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
              Gear Slot
            </div>
            <h2
              className="m-0 text-[18px] font-semibold tracking-[0.02em] text-accent-hot"
              style={{ textShadow: '0 0 16px rgba(224,184,100,0.15)' }}
            >
              {equipped && base ? (
                <>
                  {slotName}
                </>
              ) : (
                slotName
              )}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCompareCol((v) => !v)}
              aria-pressed={showCompareCol}
              className={`rounded-[3px] border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
                showCompareCol
                  ? 'border-accent-deep bg-accent-hot/8 text-accent-hot'
                  : 'border-border-2 bg-transparent text-muted hover:border-accent-deep hover:text-accent-hot'
              }`}
            >
              Compare
            </button>
            {equipped && (
              <button
                onClick={onUnequip}
                className="rounded-[3px] border border-border-2 bg-transparent px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-stat-red hover:text-stat-red"
              >
                Remove
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-[3px] border border-border-2 bg-panel-2 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
            >
              Close
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-row">
          <div className="flex w-140 min-w-0 shrink-0 flex-col border-r border-border">
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
                  placeholder="Search by name, affix, or effect…"
                  className="w-full rounded-[3px] border border-border-2 px-3 py-2 pl-9 text-text placeholder:text-faint focus:border-accent-deep focus:outline-none focus:ring-2 focus:ring-accent-hot/15"
                  style={{
                    background:
                      'linear-gradient(180deg, #0d0e12, var(--color-panel-2))',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
                  }}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {isOffhandLocked ? (
                <div className="m-4 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-[11px] text-amber-200">
                  Offhand is locked while a Two-Handed weapon is in the main
                  hand. Remove the weapon to free this slot.
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted">
                  No items match
                </div>
              ) : (
                groupedRows.map((g, gi) => (
                  <div key={g.group ?? `__${gi}`}>
                    {hasGroupHeaders && g.group && (
                      <div
                        className="sticky top-0 z-1 flex items-center gap-2 border-b border-accent-deep/30 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-accent-hot/70"
                        style={{
                          background: 'var(--color-panel-2)',
                        }}
                      >
                        <span
                          className="inline-block h-1 w-1 rotate-45 bg-accent-deep"
                          aria-hidden="true"
                        />
                        {g.group}
                      </div>
                    )}
                    {g.rows.map((r) => (
                      <GearItemRow
                        key={r.id}
                        row={r}
                        selected={r.id === equipped?.baseId}
                        onSelect={() => onEquip(r.id)}
                        onHover={() => {}}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {isOffhandLocked ? (
              <ConfigEmptyState
                title="Slot locked"
                hint="Remove the 2H weapon to enable this slot."
                tone="warning"
              />
            ) : equipped && base ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <ConfigSectionHeader label="Item Configuration" />
                <div className="space-y-3 p-4">
                  {set && set.bonuses.length > 0 && (
                    <SetSummary set={set} count={setEquippedCount} />
                  )}

                  <RunewordPresets
                    base={base}
                    maxSockets={maxSockets}
                    activeRunewordId={
                      detectRuneword(base, equipped.socketed)?.id
                    }
                    onApply={onApplyRuneword}
                  />

                  <SocketsSection
                    equipped={equipped}
                    maxSockets={maxSockets}
                    base={base}
                    socketPickerRows={socketPickerRows}
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

                  {(base.rarity === 'common' || base.randomAffixGroupId) && (
                    <AffixesSection
                      equipped={equipped}
                      base={base}
                      maxAffixes={base.maxAffixes}
                      onAdd={onAddAffix}
                      onRemove={onRemoveAffix}
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

                  {slot === 'armor' && <AugmentSection equipped={equipped} />}
                </div>
              </div>
            ) : (
              <ConfigEmptyState
                title="No item equipped"
                hint="Pick an item from the left to start configuring."
              />
            )}
          </div>

          {showCompareCol && !isOffhandLocked && (
            <CompareColumn
              baselineInventory={baselineInventory}
              currentInventory={inv}
              baselineEquipped={baselineEquipped}
              currentEquipped={equipped}
              slot={slot}
              deps={compareDeps}
            />
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-black/30 px-4 py-3">
          <div
            className={`flex min-w-0 flex-1 items-center gap-2 font-mono text-[11px] tracking-[0.06em] ${
              equipped ? 'text-accent-hot' : 'text-faint'
            }`}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: equipped
                  ? 'var(--color-accent-hot)'
                  : 'var(--color-faint)',
                boxShadow: equipped
                  ? '0 0 8px rgba(224,184,100,0.6)'
                  : '0 0 6px var(--color-faint)',
              }}
            />
            <span className="truncate">
              {equipped && base
                ? `${base.name} · ${RARITY_LABEL[base.rarity]}`
                : 'Empty slot'}
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            {filteredRows.length} item{filteredRows.length === 1 ? '' : 's'}
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function GearItemRow({
  row,
  selected,
  onSelect,
  onHover,
}: {
  row: PickerRow
  selected: boolean
  onSelect: () => void
  onHover: () => void
}) {
  // Renders one row inside the GearSlotModal's left column: rarity-coloured icon, base-type kindLabel, item name (in rarity colour), and meta string. Click selects the item; hover surfaces the compare overlay in the right column.
  const rarity = row.rarity
  const nameColor =
    rarity === 'common'
      ? 'text-white'
      : rarity === 'uncommon'
        ? 'text-sky-400'
        : rarity === 'rare'
          ? 'text-accent-hot'
          : rarity === 'mythic'
            ? 'text-purple-400'
            : rarity === 'satanic'
              ? 'text-red-500'
              : rarity === 'heroic'
                ? 'text-lime-400'
                : rarity === 'angelic'
                  ? 'text-yellow-200'
                  : rarity === 'satanic_set'
                    ? 'text-green-400'
                    : rarity === 'unholy'
                      ? 'text-pink-400'
                      : rarity === 'relic'
                        ? 'text-orange-300'
                        : 'text-text'

  const itemBase = getItem(row.id)
  const tooltipTone = itemBase ? RARITY_TONE[itemBase.rarity] : 'neutral'

  const button = (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`group relative grid w-full cursor-pointer items-center gap-3 border-b border-dashed border-border px-4 py-2 text-left transition-colors last:border-b-0 hover:bg-accent-hot/5 ${
        selected ? 'bg-linear-to-r from-accent-hot/10 to-transparent' : ''
      }`}
      style={{ gridTemplateColumns: '40px 1fr auto' }}
    >
      <span
        className={`pointer-events-none absolute left-0 top-0 bottom-0 w-0.5 bg-accent-hot transition-opacity ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
        }`}
        style={
          selected ? { boxShadow: '0 0 12px rgba(224,184,100,0.4)' } : undefined
        }
      />
      <span className="flex h-9 w-9 items-center justify-center">
        {row.iconUrl ? (
          <img
            src={row.iconUrl}
            alt=""
            className="h-full w-full object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <span
            className="block h-7 w-7 rotate-45 rounded-xs"
            style={{
              background: `linear-gradient(135deg, ${gemTintForRarity(rarity)}, #0d0b07)`,
              border: `1px solid color-mix(in srgb, ${gemTintForRarity(rarity)} 60%, #000)`,
            }}
            aria-hidden="true"
          />
        )}
      </span>
      <span className={`truncate text-[12px] font-medium ${nameColor}`}>
        {row.name}
      </span>
      <span className="truncate font-mono text-[9px] tracking-[0.04em] text-muted/80 max-w-45">
        {typeof row.meta === 'string' ? row.meta : ''}
      </span>
    </button>
  )

  if (!itemBase) return button

  return (
    <Tooltip
      content={<ItemTooltipBody base={itemBase} />}
      tone={tooltipTone}
      placement="right"
      delay={150}
    >
      {button}
    </Tooltip>
  )
}

function gemTintForRarity(rarity: ItemRarity | undefined): string {
  // Returns the primary tint color used for the diamond icon next to each gear-row in the slot modal. Mirrors the rarity palette used elsewhere in the app.
  switch (rarity) {
    case 'satanic':
      return '#d96b5a'
    case 'satanic_set':
      return '#74c98a'
    case 'angelic':
      return '#e0d36a'
    case 'unholy':
      return '#cf6db0'
    case 'heroic':
      return '#96c95a'
    case 'mythic':
      return '#a070c8'
    case 'rare':
      return '#c9a560'
    case 'uncommon':
      return '#5a8fc9'
    case 'relic':
      return '#d18a4a'
    default:
      return '#7a7468'
  }
}

function PickerCornerMarks() {
  // Draws the four small accent-deep corner brackets that frame every gear/jewel modal in this codebase. Used by GearSlotModal — same visual style as JewelSocketModal and PickerModal.
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

type SectionTone = 'default' | 'satanic' | 'angelic' | 'set' | 'warning'

const SECTION_TONE: Record<
  SectionTone,
  {
    border: string
    accentDot: string
    label: string
    bg: string
  }
> = {
  default: {
    border: 'border-accent-deep/25',
    accentDot: 'bg-accent-deep',
    label: 'text-accent-hot/75',
    bg: 'linear-gradient(180deg, rgba(28,29,36,0.55), rgba(13,14,18,0.35))',
  },
  satanic: {
    border: 'border-red-500/30',
    accentDot: 'bg-red-500',
    label: 'text-red-300/85',
    bg: 'linear-gradient(180deg, rgba(120,30,30,0.18), rgba(60,15,15,0.12))',
  },
  angelic: {
    border: 'border-yellow-200/30',
    accentDot: 'bg-yellow-200',
    label: 'text-yellow-200/85',
    bg: 'linear-gradient(180deg, rgba(120,100,40,0.18), rgba(50,40,15,0.12))',
  },
  set: {
    border: 'border-green-500/30',
    accentDot: 'bg-green-400',
    label: 'text-green-300/85',
    bg: 'linear-gradient(180deg, rgba(40,90,55,0.18), rgba(15,40,25,0.12))',
  },
  warning: {
    border: 'border-amber-500/30',
    accentDot: 'bg-amber-400',
    label: 'text-amber-200/85',
    bg: 'linear-gradient(180deg, rgba(120,90,30,0.16), rgba(50,40,15,0.1))',
  },
}

function SectionCard({
  label,
  tone = 'default',
  rightSlot,
  bodyClassName = 'p-3',
  children,
}: {
  label: string
  tone?: SectionTone
  rightSlot?: React.ReactNode
  bodyClassName?: string
  children?: React.ReactNode
}) {
  // Shared "section card" wrapper used by every editor block in the GearSlotModal right column. Renders a panel-2 gradient frame with a mono-uppercase header (rotated diamond accent dot + label + optional right-slot for counts/buttons) and a configurable body, so SocketsSection/StarsSection/AffixesSection/etc. all share the same dossier-card visual language as the modal shell.
  const t = SECTION_TONE[tone]
  return (
    <div
      className={`relative overflow-hidden rounded-sm border ${t.border}`}
      style={{ background: t.bg }}
    >
      <header
        className={`flex items-center justify-between gap-2 border-b ${t.border} px-3.5 py-2`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-1 w-1 rotate-45 ${t.accentDot}`}
            aria-hidden="true"
          />
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.18em] ${t.label}`}
          >
            {label}
          </span>
        </div>
        {rightSlot && (
          <div className="flex items-center gap-2">{rightSlot}</div>
        )}
      </header>
      {children !== undefined && (
        <div className={bodyClassName}>{children}</div>
      )}
    </div>
  )
}

function ConfigSectionHeader({
  label,
  accent,
}: {
  label: string
  accent?: string
}) {
  // Sticky header that sits at the top of the GearSlotModal right column, mirroring the small-caps "GEAR SLOT · X" treatment used by the modal's main header but scoped to whatever the right pane is currently showing (item configuration / compare view).
  return (
    <div
      className="sticky top-0 z-1 flex items-center gap-2 border-b border-accent-deep/30 px-4 py-2"
      style={{ background: 'var(--color-panel-2)' }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rotate-45 bg-accent-hot"
        style={{ boxShadow: '0 0 8px rgba(224,184,100,0.6)' }}
        aria-hidden="true"
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
        {label}
      </span>
      {accent && (
        <>
          <span className="text-faint">·</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-hot truncate">
            {accent}
          </span>
        </>
      )}
    </div>
  )
}

function ConfigEmptyState({
  title,
  hint,
  tone = 'default',
}: {
  title: string
  hint: string
  tone?: 'default' | 'warning'
}) {
  // Centered empty/locked state for the GearSlotModal right column: rotated-diamond glyph in a subtle accent ring, a strong title, and a mono-uppercase hint. Visually echoes the modal's corner-bracket framing so the empty pane never looks blank or unfinished.
  const isWarning = tone === 'warning'
  const ring = isWarning ? 'border-amber-400/40' : 'border-accent-deep/40'
  const glow = isWarning ? 'rgba(245,180,80,0.16)' : 'rgba(201,165,90,0.14)'
  const iconColor = isWarning ? 'bg-amber-400' : 'bg-accent-deep'
  const titleColor = isWarning ? 'text-amber-200' : 'text-muted'

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center text-faint">
      <div className="flex flex-col items-center">
        <div
          className={`mb-4 flex h-14.5 w-14.5 items-center justify-center rounded-full border border-dashed ${ring}`}
          style={{
            background: `radial-gradient(circle, ${glow}, transparent 70%)`,
          }}
        >
          <span
            className={`block h-3 w-3 rotate-45 ${iconColor}`}
            aria-hidden="true"
          />
        </div>
        <div
          className={`mb-1.5 text-[14px] font-semibold tracking-[0.08em] ${titleColor}`}
        >
          {title}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
          {hint}
        </div>
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
  // Renders a compact summary card for an item set inside the GearSlotModal right column showing the set name, equipped-count badge, and each tier with its description coloured by activation state. Wrapped in the shared SectionCard so its visual language matches the rest of the popup. Used when the equipped item belongs to a set.
  return (
    <SectionCard
      label={set.name}
      tone="set"
      rightSlot={
        <span className="font-mono text-[10px] tabular-nums text-green-300/80">
          {count}/{set.items.length} pieces
        </span>
      }
      bodyClassName="px-3.5 py-2.5"
    >
      <ul className="space-y-1.5">
        {set.bonuses.map((bonus, idx) => {
          const active = count >= bonus.pieces
          return (
            <li
              key={idx}
              className={`text-[11px] ${active ? 'text-green-200' : 'text-muted/60'}`}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
                    active ? 'text-green-300' : 'text-faint'
                  }`}
                >
                  {bonus.pieces}-Set
                </span>
                {active && (
                  <span className="font-mono text-[10px] text-green-300">
                    ✓
                  </span>
                )}
              </div>
              {(bonus.descriptions ?? []).map((d, i) => (
                <div
                  key={i}
                  className={`ml-3 text-[10.5px] leading-snug ${
                    active ? 'text-green-200/90' : 'text-muted/55'
                  }`}
                >
                  {d}
                </div>
              ))}
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

function slotGroup(slotKey: SlotKey): string {
  // Strips a trailing `_N` suffix from a slot key so paired slots (e.g. `ring_1`, `ring_2`) collapse into a single shared group ("ring"). Used by `itemsForSlot` and the inventory move logic.
  return slotKey.replace(/_\d+$/, '')
}

function SocketPickerTrigger({
  socketIndex,
  socketed,
  socketType,
  rows,
  onChange,
}: {
  socketIndex: number
  socketed: string | null
  socketType: SocketType
  rows: PickerRow[]
  onChange: (id: string | null) => void
}) {
  // Renders a single socket's trigger button (icon + name + Browse arrow, or "Empty socket" italic) that opens the shared PickerModal scoped to gems + runes when clicked. Uses the modal's `allowClear` to surface a Clear-socket action so the user never has to scroll for a "(none)" row. When the socket is filled, wraps the trigger in a Tooltip so the user can preview the socketed gem/rune's stats without re-opening the picker. The picker's row tooltips are enriched on-the-fly with a NetChangeBlock that diffs the candidate against whatever is currently socketed (with the rainbow multiplier applied where appropriate), so users see the build delta inline.
  const [open, setOpen] = useState(false)
  const multiplier = socketType === 'rainbow' ? RAINBOW_MULTIPLIER : 1
  const previousStats = useMemo<Record<string, number>>(() => {
    if (!socketed) return {}
    const src = getGem(socketed) ?? getRune(socketed)
    if (!src) return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(src.stats)) out[k] = v * multiplier
    return out
  }, [socketed, multiplier])

  const enrichedRows = useMemo<PickerRow[]>(
    () =>
      rows.map((r) => {
        const gem = getGem(r.id)
        const rune = !gem ? getRune(r.id) : undefined
        const src = gem ?? rune
        if (!src) return r
        const kind: 'GEM' | 'JEWEL' | 'RUNE' = rune
          ? 'RUNE'
          : src.name.toLowerCase().includes('jewel')
            ? 'JEWEL'
            : 'GEM'
        return {
          ...r,
          tooltip: buildSocketableTooltip(src, kind, {
            previousStats,
            multiplier,
          }),
        }
      }),
    [rows, previousStats, multiplier],
  )

  const triggerTooltip = useMemo<ReactNode>(() => {
    if (!socketed) return null
    const gem = getGem(socketed)
    const rune = !gem ? getRune(socketed) : undefined
    const src = gem ?? rune
    if (!src) return null
    const kind: 'GEM' | 'JEWEL' | 'RUNE' = rune
      ? 'RUNE'
      : src.name.toLowerCase().includes('jewel')
        ? 'JEWEL'
        : 'GEM'
    return buildSocketableTooltip(src, kind, { multiplier })
  }, [socketed, multiplier])

  const renderSelectedPanel = (state: PickerPanelState): ReactNode => {
    if (!triggerTooltip || !state.selectedId) return null
    let hoveredScaled: Record<string, number> | undefined
    if (state.hoveredId && state.hoveredId !== state.selectedId) {
      const hg = getGem(state.hoveredId)
      const hr = !hg ? getRune(state.hoveredId) : undefined
      const hsrc = hg ?? hr
      if (hsrc) {
        const out: Record<string, number> = {}
        for (const [k, v] of Object.entries(hsrc.stats)) {
          out[k] = v * multiplier
        }
        hoveredScaled = out
      }
    }
    return (
      <TooltipPanel className="w-full">
        {triggerTooltip}
        {hoveredScaled && (
          <NetChangeBlock previous={previousStats} next={hoveredScaled} />
        )}
      </TooltipPanel>
    )
  }

  const current = socketed ? rows.find((r) => r.id === socketed) : undefined

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="group flex w-full items-center justify-between gap-2 rounded-xs border border-accent-deep/25 bg-panel-2/40 px-2 py-1 text-left transition-colors hover:border-accent-hot/50"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {current?.iconUrl ? (
          <img
            src={current.iconUrl}
            alt=""
            width={16}
            height={16}
            style={{ imageRendering: 'pixelated' }}
          />
        ) : current ? (
          <span
            className="block h-3 w-3 rotate-45 rounded-[1px]"
            style={{
              background: `linear-gradient(135deg, ${
                current.iconColor ?? '#5a5448'
              }, #0d0b07)`,
              border: `1px solid color-mix(in srgb, ${
                current.iconColor ?? '#5a5448'
              } 60%, #000)`,
            }}
            aria-hidden="true"
          />
        ) : (
          <span
            className="block h-3 w-3 rotate-45 rounded-[1px] border border-dashed border-accent-deep/40"
            aria-hidden="true"
          />
        )}
        <span
          className={`truncate text-[12px] ${
            current
              ? 'text-text group-hover:text-accent-hot'
              : 'italic text-faint'
          }`}
        >
          {current ? current.name : 'Empty socket'}
        </span>
        {current?.tier !== undefined && (
          <span className="ml-1 rounded-xs border border-accent-deep/40 px-1 py-px font-mono text-[9px] tabular-nums text-accent-hot/75">
            T{current.tier}
          </span>
        )}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint group-hover:text-accent-hot">
        Browse →
      </span>
    </button>
  )

  return (
    <>
      {triggerTooltip ? (
        <Tooltip content={triggerTooltip} placement="right" delay={120}>
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      {open && (
        <PickerModal
          title="Insert Socketable"
          sectionLabel="Socket"
          sectionAccent={`#${socketIndex + 1}`}
          rows={enrichedRows}
          selectedId={socketed}
          searchPlaceholder="Search gems / runes…"
          emptyMessage="No matches"
          width={680}
          allowClear={!!socketed}
          onClear={() => onChange(null)}
          onSelect={(id) => onChange(id)}
          onClose={() => setOpen(false)}
          selectedPanel={renderSelectedPanel}
        />
      )}
    </>
  )
}

function SocketsSection({
  equipped,
  maxSockets,
  base,
  socketPickerRows,
  onSocketCount,
  onSocketed,
  onSocketType,
}: {
  equipped: EquippedItem
  maxSockets: number
  base: ItemBase
  socketPickerRows: PickerRow[]
  onSocketCount: (n: number) => void
  onSocketed: (idx: number, id: string | null) => void
  onSocketType: (idx: number, type: SocketType) => void
}) {
  // Renders the per-item sockets editor: socket-count stepper, one socket trigger button per socket slot (with normal/rainbow toggle) that opens a PickerModal listing every gem and rune grouped by kind, and detection of any active runeword. Wrapped in the shared SectionCard for consistent framing inside the GearSlotModal right column.
  if (maxSockets === 0) return null
  return (
    <SectionCard
      label="Sockets"
      rightSlot={
        <>
          <button
            onClick={() => onSocketCount(equipped.socketCount - 1)}
            disabled={equipped.socketCount === 0}
            className="flex h-5 w-5 items-center justify-center rounded-xs border border-accent-deep/40 bg-bg/60 font-mono text-[12px] leading-none text-muted transition-colors hover:border-accent-hot hover:text-accent-hot disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Decrease sockets"
          >
            −
          </button>
          <span className="min-w-10.5 text-center font-mono text-[11px] tabular-nums text-accent-hot">
            {equipped.socketCount}/{maxSockets}
          </span>
          <button
            onClick={() => onSocketCount(equipped.socketCount + 1)}
            disabled={equipped.socketCount >= maxSockets}
            className="flex h-5 w-5 items-center justify-center rounded-xs border border-accent-deep/40 bg-bg/60 font-mono text-[12px] leading-none text-muted transition-colors hover:border-accent-hot hover:text-accent-hot disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Increase sockets"
          >
            +
          </button>
        </>
      }
      bodyClassName={equipped.socketCount > 0 ? 'p-2 space-y-1.5' : 'px-3 py-2'}
    >
      {equipped.socketCount > 0 ? (
        <>
          {Array.from({ length: equipped.socketCount }).map((_, i) => {
            const socketed = equipped.socketed[i]
            const type = equipped.socketTypes[i] ?? 'normal'
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-[3px] border border-accent-deep/15 bg-bg/40 p-1.5"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border border-accent-deep/30 bg-panel-2/60 font-mono text-[10px] tabular-nums text-accent-hot/80">
                  {i + 1}
                </span>
                <SocketTypeToggle
                  value={type}
                  onChange={(t) => onSocketType(i, t)}
                />
                <div className="min-w-0 flex-1">
                  <SocketPickerTrigger
                    socketIndex={i}
                    socketed={socketed ?? null}
                    socketType={type}
                    rows={socketPickerRows}
                    onChange={(id) => onSocketed(i, id)}
                  />
                </div>
              </div>
            )
          })}
          {base.sockets !== undefined &&
            base.sockets !== equipped.socketCount && (
              <div className="pt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                base · {base.sockets}
              </div>
            )}
        </>
      ) : (
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint italic">
          No sockets allocated
        </div>
      )}
    </SectionCard>
  )
}

function StarsSection({
  stars,
  onChange,
}: {
  stars: number
  onChange: (n: number) => void
}) {
  // Renders the 0-MAX_STARS star picker for the equipped gear item. Wrapped in the shared SectionCard for consistent framing inside the GearSlotModal right column. Used by GearSlotModal for any gear-slot equip.
  const bonusPct = stars * 8
  return (
    <SectionCard
      label="Stars"
      rightSlot={
        <span
          className={`font-mono text-[10px] tabular-nums tracking-[0.04em] ${
            stars > 0 ? 'text-amber-300' : 'text-faint'
          }`}
        >
          {stars > 0 ? `+${bonusPct}% to affixes` : 'no bonus'}
        </span>
      }
    >
      <div className="flex items-center gap-1.5">
        {Array.from({ length: MAX_STARS }).map((_, i) => {
          const target = i + 1
          const filled = target <= stars
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(stars === target ? target - 1 : target)}
              aria-label={`${target} star${target === 1 ? '' : 's'}`}
              className={`text-[20px] leading-none transition-all ${
                filled
                  ? 'text-amber-300 hover:text-amber-200'
                  : 'text-muted/30 hover:text-amber-200/50'
              }`}
              style={
                filled
                  ? {
                      textShadow:
                        '0 0 10px rgba(252,211,77,0.45), 0 0 2px rgba(252,211,77,0.6)',
                    }
                  : undefined
              }
            >
              ★
            </button>
          )
        })}
        {stars > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            className="ml-2 rounded-xs border border-border-2 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint transition-colors hover:border-stat-red hover:text-stat-red"
          >
            Clear
          </button>
        )}
      </div>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] leading-snug text-faint">
        +8% per star to user-added affixes — runeword & "+X to all skills" mods
        excluded.
      </p>
    </SectionCard>
  )
}

function SocketTypeToggle({
  value,
  onChange,
}: {
  value: SocketType
  onChange: (t: SocketType) => void
}) {
  // Renders the small N/R toggle next to a socket dropdown that lets the user mark a socket as Rainbow (+50% effect on the socketed gem/rune). Used inside SocketsSection. Styled to match the modal's accent-deep border + mono typography language.
  return (
    <div className="flex shrink-0 overflow-hidden rounded-xs border border-accent-deep/30 font-mono text-[10px] font-semibold tracking-[0.06em]">
      <button
        type="button"
        onClick={() => onChange('normal')}
        className={`px-2 py-0.5 transition-colors ${
          value === 'normal'
            ? 'bg-accent-deep/20 text-accent-hot'
            : 'bg-bg/40 text-faint hover:text-muted'
        }`}
      >
        N
      </button>
      <button
        type="button"
        onClick={() => onChange('rainbow')}
        title="Rainbow socket: +50% effect"
        className={`px-2 py-0.5 transition-colors ${
          value === 'rainbow'
            ? 'bg-linear-to-r from-rose-500 via-amber-400 to-sky-400 text-bg'
            : 'bg-bg/40 text-faint hover:text-muted'
        }`}
      >
        R
      </button>
    </div>
  )
}

function formatAffixRange(
  affix: {
    sign: '+' | '-'
    format: 'flat' | 'percent'
    valueMin: number | null
    valueMax: number | null
    statKey: string | null
  },
  stars?: number,
): string {
  // Formats an affix's full roll window as a signed bracketed range ("+[15-25]%", "+[12-18]", "+30") with star scaling applied to both endpoints. Single-value affixes (min === max) drop the brackets and dash. Used by AffixesSection so each row shows the *range* the affix can roll, not just its current rolled value.
  if (affix.valueMin === null || affix.valueMax === null) return affix.sign
  const minSigned = rolledAffixValueWithStars(affix, 0, stars)
  const maxSigned = rolledAffixValueWithStars(affix, 1, stars)
  const fmtAbs = (v: number) => {
    const abs = Math.abs(v)
    return Number.isInteger(abs) ? abs : Math.round(abs * 100) / 100
  }
  const lo = fmtAbs(minSigned)
  const hi = fmtAbs(maxSigned)
  const sign =
    affix.sign === '-' || minSigned < 0 || maxSigned < 0 ? '-' : '+'
  const suffix = affix.format === 'percent' ? '%' : ''
  if (lo === hi) return `${sign}${hi}${suffix}`
  return `${sign}[${lo}-${hi}]${suffix}`
}

function InvertedCrossIcon({ color = '#cf6db0' }: { color?: string }) {
  // Pixel-art rotated crucifix glyph used as the row icon for unholy-group affixes in the PickerModal — replaces the default rotated diamond so unholy entries read as occult/dark even on a quick glance. Renders at the same 28×28 footprint as `FallbackIcon` so the row grid stays aligned.
  const dark = `color-mix(in srgb, ${color} 35%, #0d0b07)`
  return (
    <span
      className="flex h-7 w-7 items-center justify-center"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        width={20}
        height={20}
        style={{
          transform: 'rotate(180deg)',
          filter: `drop-shadow(0 0 6px ${color}80)`,
        }}
      >
        <defs>
          <linearGradient id="ic-cross" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={dark} />
          </linearGradient>
        </defs>
        <path
          d="M10.5 2 H13.5 V8 H18 V11 H13.5 V22 H10.5 V11 H6 V8 H10.5 Z"
          fill="url(#ic-cross)"
          stroke={dark}
          strokeWidth="0.6"
          strokeLinejoin="miter"
        />
      </svg>
    </span>
  )
}

function affixToPickerRow(a: Affix, opts?: { useDescriptionAsName?: boolean }): PickerRow {
  // Maps an affix definition into a PickerRow for the AffixesSection picker. When `useDescriptionAsName` is set, the description is shown as the primary label (used by the random_unholy group whose names are opaque). Affixes from the `random_unholy` group get the inverted-cross icon (pink unholy tone) instead of the default rotated diamond. Attaches a rich tooltip so users can preview the full description, value range, and stat key on hover.
  const primary = opts?.useDescriptionAsName ? a.description : a.name
  const meta = opts?.useDescriptionAsName ? a.name : a.description
  const isUnholy = a.groupId === 'random_unholy'
  return {
    id: a.id,
    name: primary,
    tier: a.tier,
    kindLabel: a.kind?.toUpperCase() ?? 'AFFIX',
    meta,
    iconColor: isUnholy ? '#cf6db0' : '#c9a560',
    iconNode: isUnholy ? <InvertedCrossIcon color="#cf6db0" /> : undefined,
    tooltip: buildAffixTooltip(a),
  }
}

function AffixesSection({
  equipped,
  base,
  maxAffixes,
  onAdd,
  onRemove,
}: {
  equipped: EquippedItem
  base?: ItemBase
  maxAffixes?: number
  onAdd: (affixId: string, tier: number) => void
  onRemove: (index: number) => void
}) {
  // Per-item affix editor that lists each rolled affix with a roll slider and remove button, and exposes an "Add" button that opens the affix PickerModal restricted to the affix groups available on the current item slot. Honours the item's `maxAffixes` cap and routes the special `random_unholy` group through the same modal with description-first labelling.
  const [open, setOpen] = useState(false)
  const atCap =
    maxAffixes !== undefined && equipped.affixes.length >= maxAffixes
  const modalOpen = open && !atCap

  const randomGroupId = base?.randomAffixGroupId ?? null
  const isUnholy = randomGroupId === 'random_unholy'

  const pickerRows = useMemo<PickerRow[]>(() => {
    const source = randomGroupId
      ? affixes.filter((a) => a.groupId === randomGroupId)
      : affixes
    return source
      .slice()
      .sort(
        (a, b) =>
          (isUnholy ? a.description : a.name).localeCompare(
            isUnholy ? b.description : b.name,
          ) || a.tier - b.tier,
      )
      .map((a) => affixToPickerRow(a, { useDescriptionAsName: isUnholy }))
  }, [randomGroupId, isUnholy])

  const sectionTitle = isUnholy ? 'Unholy Affixes' : 'Affixes'
  const modalTitle = isUnholy ? 'Pick Unholy Affix' : 'Add Affix'

  return (
    <SectionCard
      label={sectionTitle}
      rightSlot={
        <>
          <span className="font-mono text-[10px] tabular-nums tracking-[0.04em] text-accent-hot/80">
            {equipped.affixes.length}
            {maxAffixes !== undefined ? ` / ${maxAffixes}` : ''}
          </span>
          <button
            onClick={() => setOpen(true)}
            disabled={atCap}
            className="rounded-xs border border-accent-deep px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-accent-hot transition-all hover:border-accent-hot hover:shadow-[0_0_10px_rgba(224,184,100,0.25)] disabled:cursor-not-allowed disabled:border-border-2 disabled:text-faint disabled:shadow-none"
            style={{
              background: atCap
                ? 'transparent'
                : 'linear-gradient(180deg, #3a2f1a, #2a2418)',
            }}
          >
            + Add
          </button>
        </>
      }
      bodyClassName={
        equipped.affixes.length > 0 ? 'p-2 space-y-1.5' : 'px-3 py-2'
      }
    >
      {equipped.affixes.length === 0 ? (
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint italic">
          No affixes rolled
        </div>
      ) : (
        equipped.affixes.map((eq, idx) => {
          const affix = getAffix(eq.affixId)
          if (!affix) return null
          return (
            <div
              key={idx}
              className="flex items-center gap-1.5 rounded-[3px] border border-accent-deep/15 bg-bg/40 p-1.5"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border border-accent-deep/30 bg-panel-2/60 font-mono text-[10px] tabular-nums text-accent-hot/80">
                {idx + 1}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate text-[12px] leading-snug">
                <span className="font-mono font-semibold tabular-nums text-amber-300">
                  {formatAffixRange(affix, equipped.stars)}
                </span>
                <span className="truncate text-text/85">{affix.name}</span>
                <span className="rounded-xs border border-accent-deep/40 px-1 py-px font-mono text-[9px] tabular-nums text-accent-hot/75">
                  T{affix.tier}
                </span>
              </span>
              <button
                onClick={() => onRemove(idx)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border border-border-2 font-mono text-[12px] leading-none text-faint transition-colors hover:border-stat-red hover:text-stat-red"
                aria-label="Remove affix"
              >
                ×
              </button>
            </div>
          )
        })
      )}

      {modalOpen && (
        <PickerModal
          title={modalTitle}
          sectionLabel="Affix"
          rows={pickerRows}
          searchPlaceholder="Search affixes…"
          emptyMessage="No matching affixes"
          width={680}
          onSelect={(id) => {
            const a = affixes.find((x) => x.id === id)
            if (!a) return
            onAdd(a.id, a.tier)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </SectionCard>
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
  // Editor for the (single) crystal-forge mod on a gear item, exposing a "+ Add" button that opens the satanic-crystal PickerModal and a per-mod remove control. The picker's row tooltips include a NetChangeBlock that diffs each candidate's averaged stats against whatever crystal is currently forged on the item, so users see the build delta without leaving the picker. Used inside the GearSlotModal right column for satanic-tier and above items.
  const [open, setOpen] = useState(false)
  const mods = useMemo(
    () => equipped.forgedMods ?? [],
    [equipped.forgedMods],
  )
  const sourceLabel = FORGE_KIND_LABEL[forgeKind]

  const previousStats = useMemo<Record<string, number>>(() => {
    const eq = mods[0]
    if (!eq) return {}
    const m = getCrystalMod(eq.affixId)
    if (!m) return {}
    return affixAverageStats(m)
  }, [mods])

  const pickerRows = useMemo<PickerRow[]>(
    () =>
      crystalMods
        .slice()
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) || a.tier - b.tier,
        )
        .map((m) => ({
          id: m.id,
          name: m.name,
          tier: m.tier,
          kindLabel: 'CRYSTAL',
          meta: m.description,
          iconColor: '#d96b5a',
          tooltip: buildCrystalModTooltip(m, { previousStats }),
          tooltipTone: 'satanic' as const,
        })),
    [previousStats],
  )

  const canAdd = mods.length === 0

  return (
    <SectionCard
      label={`${sourceLabel} · Forged`}
      tone="satanic"
      rightSlot={
        canAdd ? (
          <button
            onClick={() => setOpen(true)}
            className="rounded-xs border border-red-500/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-red-300 transition-all hover:border-red-400 hover:text-red-200 hover:shadow-[0_0_10px_rgba(239,68,68,0.25)]"
            style={{
              background: 'linear-gradient(180deg, #3a1a1a, #2a1818)',
            }}
          >
            + Add
          </button>
        ) : undefined
      }
      bodyClassName={mods.length > 0 ? 'p-2 space-y-1.5' : 'px-3 py-2'}
    >
      {mods.length === 0 ? (
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint italic">
          No crystal forged
        </div>
      ) : (
        mods.map((eq, idx) => {
          const mod = getCrystalMod(eq.affixId)
          if (!mod) return null
          return (
            <div
              key={idx}
              className="flex items-center gap-1.5 rounded-[3px] border border-accent-deep/15 bg-bg/40 p-1.5"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border border-accent-deep/30 bg-panel-2/60 font-mono text-[10px] tabular-nums text-accent-hot/80">
                {idx + 1}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate text-[12px] leading-snug">
                <span className="font-mono font-semibold tabular-nums text-amber-300">
                  {formatAffixRange(mod)}
                </span>
                <span className="truncate text-text/85">{mod.name}</span>
                <span className="rounded-xs border border-accent-deep/40 px-1 py-px font-mono text-[9px] tabular-nums text-accent-hot/75">
                  T{mod.tier}
                </span>
              </span>
              <button
                onClick={() => onRemove(idx)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border border-border-2 font-mono text-[12px] leading-none text-faint transition-colors hover:border-stat-red hover:text-stat-red"
                aria-label="Remove forged mod"
              >
                ×
              </button>
            </div>
          )
        })
      )}

      {open && (
        <PickerModal
          title={`Forge ${sourceLabel}`}
          sectionLabel={sourceLabel}
          rows={pickerRows}
          searchPlaceholder={`Search ${sourceLabel} mods…`}
          emptyMessage={`No matching ${sourceLabel} mods`}
          width={680}
          onSelect={(id) => {
            const m = crystalMods.find((x) => x.id === id)
            if (!m) return
            onAdd(m.id, m.tier)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </SectionCard>
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
  // Renders the runeword picker shown for common-rarity items: filters to runewords whose base-type and rune count fit, exposes a "Browse →" trigger button summarising the active runeword (or prompting to choose), and opens a PickerModal listing every compatible runeword (rune sequence as meta, socket-count + level requirement as a structured search blob). Used inside the GearSlotModal right column. Hidden when no runeword fits.
  const compatible = useMemo(() => {
    if (base.rarity !== 'common') return []
    return runewords.filter(
      (rw) =>
        rw.allowedBaseTypes.includes(base.baseType) &&
        rw.runes.length <= maxSockets,
    )
  }, [base, maxSockets])

  const [open, setOpen] = useState(false)

  const pickerRows = useMemo<PickerRow[]>(
    () =>
      compatible.map((rw) => {
        const runeSeq = rw.runes
          .map((r) => r.replace(/^rune_/, ''))
          .join(' → ')
        const reqLabel = rw.requiresLevel ? ` · L${rw.requiresLevel}` : ''
        return {
          id: rw.id,
          name: rw.name,
          tier: rw.runes.length,
          kindLabel: 'RUNEWORD',
          meta: `${runeSeq}${reqLabel}`,
          iconColor: '#e0b864',
          searchTerms: [
            rw.name,
            runeSeq,
            ...rw.runes,
            ...rw.allowedBaseTypes,
          ]
            .join(' ')
            .toLowerCase(),
          tooltip: buildRunewordTooltip(rw),
          tooltipTone: 'rare' as const,
        }
      }),
    [compatible],
  )

  if (compatible.length === 0) return null

  const activeRw = activeRunewordId
    ? compatible.find((rw) => rw.id === activeRunewordId)
    : undefined
  const activeRuneSeq = activeRw
    ? activeRw.runes.map((r) => r.replace(/^rune_/, '')).join(' → ')
    : null

  const renderSelectedPanel = (state: PickerPanelState): ReactNode => {
    if (!state.selectedId) return null
    const sel = compatible.find((rw) => rw.id === state.selectedId)
    if (!sel) return null
    const hovered =
      state.hoveredId && state.hoveredId !== state.selectedId
        ? compatible.find((rw) => rw.id === state.hoveredId)
        : undefined
    return (
      <TooltipPanel className="w-full" tone="rare">
        {buildRunewordTooltip(sel)}
        {hovered && (
          <NetChangeBlock previous={sel.stats} next={hovered.stats} />
        )}
      </TooltipPanel>
    )
  }

  return (
    <SectionCard
      label="Runeword Presets"
      rightSlot={
        <span className="font-mono text-[10px] tabular-nums text-faint">
          {compatible.length} compatible
        </span>
      }
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center justify-between gap-2 rounded-[3px] border border-accent-deep/30 px-3 py-2 text-left transition-all hover:border-amber-400/50 hover:shadow-[0_0_12px_rgba(252,211,77,0.15)]"
        style={{
          background:
            'linear-gradient(180deg, rgba(28,29,36,0.7), rgba(13,14,18,0.5))',
        }}
      >
        <span className="flex min-w-0 flex-col">
          <span
            className={`truncate text-[13px] font-medium ${
              activeRw ? 'text-amber-300' : 'italic text-faint'
            }`}
          >
            {activeRw ? activeRw.name : 'Choose runeword…'}
          </span>
          {activeRuneSeq && (
            <span className="truncate font-mono text-[10px] tabular-nums tracking-[0.04em] text-muted/80">
              {activeRuneSeq}
            </span>
          )}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint group-hover:text-amber-300">
          Browse →
        </span>
      </button>

      {open && (
        <PickerModal
          title="Pick Runeword"
          sectionLabel="Runeword"
          rows={pickerRows}
          selectedId={activeRunewordId ?? null}
          searchPlaceholder="Search runewords…"
          emptyMessage="No matching runewords"
          width={680}
          selectedPanel={renderSelectedPanel}
          onSelect={(id) => onApply(id)}
          onClose={() => setOpen(false)}
        />
      )}
    </SectionCard>
  )
}

const AUGMENT_PICKER_ROWS: PickerRow[] = augments
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((a) => ({
    id: a.id,
    name: a.name,
    kindLabel: 'AUGMENT',
    meta: a.triggerNote,
    rarity: 'angelic' as const,
    tooltip: buildAugmentTooltip(a),
    tooltipTone: 'angelic' as const,
  }))

function AugmentSection({ equipped }: { equipped: EquippedItem }) {
  // Renders the Angelic Augment editor on the body-armour slot: a "Choose augment…" trigger that opens the augment PickerModal, a level slider (1..AUGMENT_MAX_LEVEL), trigger / proc duration / cost metadata, and the per-level stat list. Used inside EditPanel only when the armour slot is active.
  const setAugment = useBuild((s) => s.setAugment)
  const setAugmentLevel = useBuild((s) => s.setAugmentLevel)
  const [pickerOpen, setPickerOpen] = useState(false)
  const aug = equipped.augment ? getAugment(equipped.augment.id) : undefined
  const level = equipped.augment?.level ?? 1
  const tier = aug?.levels[Math.max(0, Math.min(aug.levels.length - 1, level - 1))]

  const renderSelectedPanel = (state: PickerPanelState): ReactNode => {
    if (!state.selectedId) return null
    const sel = getAugment(state.selectedId)
    if (!sel) return null
    const selTier =
      sel.levels[Math.max(0, Math.min(sel.levels.length - 1, level - 1))]
    let hoveredStats: Record<string, number> | undefined
    if (state.hoveredId && state.hoveredId !== state.selectedId) {
      const hov = getAugment(state.hoveredId)
      if (hov) {
        const hovTier =
          hov.levels[Math.max(0, Math.min(hov.levels.length - 1, level - 1))]
        hoveredStats = hovTier?.stats
      }
    }
    return (
      <TooltipPanel className="w-full" tone="angelic">
        {buildAugmentTooltip(sel)}
        {selTier && hoveredStats && (
          <NetChangeBlock previous={selTier.stats} next={hoveredStats} />
        )}
      </TooltipPanel>
    )
  }

  return (
    <SectionCard
      label="Angelic Augment"
      tone="angelic"
      rightSlot={
        aug ? (
          <button
            onClick={() => setAugment(null)}
            className="rounded-xs border border-border-2 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint transition-colors hover:border-stat-red hover:text-stat-red"
            aria-label="Remove augment"
          >
            Remove
          </button>
        ) : undefined
      }
      bodyClassName="p-3 space-y-2.5"
    >
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="group flex w-full items-center justify-between gap-2 rounded-[3px] border border-yellow-200/30 px-3 py-2 text-left transition-all hover:border-yellow-200/60 hover:shadow-[0_0_12px_rgba(252,233,128,0.15)]"
        style={{
          background:
            'linear-gradient(180deg, rgba(28,29,36,0.7), rgba(13,14,18,0.5))',
        }}
      >
        <span
          className={`truncate text-[13px] font-medium ${
            aug ? 'text-yellow-200' : 'text-faint italic'
          }`}
        >
          {aug ? aug.name : 'Choose augment…'}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint group-hover:text-yellow-200">
          Browse →
        </span>
      </button>

      {pickerOpen && (
        <PickerModal
          title="Pick Angelic Augment"
          sectionLabel="Augment"
          rows={AUGMENT_PICKER_ROWS}
          selectedId={equipped.augment?.id ?? null}
          searchPlaceholder="Search augments…"
          emptyMessage="No augments match"
          width={680}
          allowClear={!!equipped.augment}
          onClear={() => setAugment(null)}
          onSelect={(id) => setAugment(id)}
          onClose={() => setPickerOpen(false)}
          selectedPanel={renderSelectedPanel}
        />
      )}

      {aug && tier && (
        <div className="space-y-2.5">
          <div
            className="flex items-center gap-2.5 rounded-[3px] border border-yellow-200/15 bg-bg/40 px-2.5 py-1.5"
          >
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-yellow-200/70">
              Level
            </span>
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
            <span className="w-7 text-center font-mono text-[12px] tabular-nums text-yellow-200">
              {level}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-faint">
              / {AUGMENT_MAX_LEVEL}
            </span>
          </div>

          <p className="text-[11px] leading-snug text-text/85">
            {aug.description}
          </p>

          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-xs border border-yellow-200/25 bg-bg/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-yellow-200/80">
              {aug.triggerNote}
            </span>
            {tier.procChance !== undefined && tier.procChance !== null && (
              <span className="rounded-xs border border-yellow-200/25 bg-bg/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-yellow-200/80">
                proc {tier.procChance}%
              </span>
            )}
            {tier.procDurationSec !== undefined &&
              tier.procDurationSec !== null && (
                <span className="rounded-xs border border-yellow-200/25 bg-bg/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-yellow-200/80">
                  {tier.procDurationSec}s
                </span>
              )}
            {tier.cost !== undefined && (
              <span className="rounded-xs border border-yellow-200/25 bg-bg/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-yellow-200/80">
                cost {tier.cost} keys
              </span>
            )}
          </div>

          {Object.keys(tier.stats).length > 0 && (
            <div className="rounded-[3px] border border-yellow-200/15 bg-bg/40 p-2">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-yellow-200/70">
                Stats
              </div>
              <ul className="space-y-0.5 text-[11px]">
                {Object.entries(tier.stats).map(([key, val]) => {
                  const def = gameConfig.stats.find((s) => s.key === key)
                  const label = def?.name ?? key
                  const sign = (val as number) >= 0 ? '+' : ''
                  const suffix = def?.format === 'percent' ? '%' : ''
                  return (
                    <li key={key} className="flex justify-between">
                      <span className="text-text/80">{label}</span>
                      <span className="font-mono tabular-nums text-yellow-200">
                        {sign}
                        {val as number}
                        {suffix}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {tier.meta && Object.keys(tier.meta).length > 0 && (
            <ul className="space-y-0.5 px-1 text-[10px] text-faint">
              {Object.entries(tier.meta).map(([key, val]) => (
                <li key={key} className="flex justify-between">
                  <span>{key.replace(/_/g, ' ')}</span>
                  <span className="font-mono">{val as number}</span>
                </li>
              ))}
            </ul>
          )}

          {aug.rangedOnly && (
            <div className="rounded-xs border border-orange-300/40 bg-orange-300/5 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-orange-300/85">
              Ranged weapon required
            </div>
          )}
        </div>
      )}
    </SectionCard>
  )
}
