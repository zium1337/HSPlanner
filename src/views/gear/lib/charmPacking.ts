import type { SlotKey } from '../../../types'

export const CHARM_GRID_COLS = 3
export const CHARM_GRID_ROWS = 11
export const CHARM_BLOCKED_CELLS: ReadonlyArray<readonly [number, number]> = [
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

export function packCharms(
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
