import type { RangedValue } from '../types'

/**
 * Parse a free-text custom-stat value into a RangedValue, or null when the
 * input is unparseable (entry then treated as informational only).
 *
 * Accepts: "100", "+100", "-50", "100%", "1.5", "12-18", "[12-18]", "+12 - +18".
 */
export function parseCustomStatValue(raw: string): RangedValue | null {
  const trimmed = raw.trim().replace(/[[\]]/g, '').replace(/%/g, '')
  if (!trimmed) return null

  const rangeMatch = trimmed.match(
    /^([+-]?\d+(?:\.\d+)?)\s*-\s*([+-]?\d+(?:\.\d+)?)$/,
  )
  if (rangeMatch) {
    const min = Number(rangeMatch[1])
    const max = Number(rangeMatch[2])
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    return min === max ? min : [min, max]
  }

  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}
