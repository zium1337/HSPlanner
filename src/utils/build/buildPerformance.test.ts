import { describe, expect, it } from 'vitest'
import { applyDisabledPotions } from './buildPerformance'
import type { EquippedItem, Inventory } from '../../types'

function potion(baseId: string): EquippedItem {
  return { baseId, affixes: [], socketCount: 0, socketed: [], socketTypes: [] }
}

describe('applyDisabledPotions', () => {
  it('returns the same inventory reference when nothing is disabled', () => {
    const inv: Inventory = { potion_1: potion('p1'), weapon: potion('w') }
    expect(applyDisabledPotions(inv, {})).toBe(inv)
  })

  it('removes only the disabled slot, leaving others intact', () => {
    const inv: Inventory = { potion_1: potion('p1'), potion_2: potion('p2') }
    const out = applyDisabledPotions(inv, { potion_1: true })
    expect(out.potion_1).toBeUndefined()
    expect(out.potion_2).toBeDefined()
  })

  it('does not mutate the input inventory', () => {
    const inv: Inventory = { potion_1: potion('p1') }
    applyDisabledPotions(inv, { potion_1: true })
    expect(inv.potion_1).toBeDefined()
  })

  it('ignores slots whose flag is false', () => {
    const inv: Inventory = { potion_1: potion('p1') }
    const out = applyDisabledPotions(inv, { potion_1: false })
    expect(out.potion_1).toBeDefined()
  })
})
