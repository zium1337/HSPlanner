import {
  affixes,
  augments,
  crystalMods,
  gems,
  getAffix,
  getAugment,
  getCrystalMod,
  getGem,
  getRune,
  items,
  runes,
} from '../data'
import type {
  Affix,
  AngelicAugment,
  EquippedItem,
  Gem,
  ItemBase,
  Rune,
  SocketType,
} from '../types'
import { AUGMENT_MAX_LEVEL } from '../types'

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Superior',
  rare: 'Rare',
  mythic: 'Mythic',
  satanic: 'Satanic',
  heroic: 'Heroic',
  angelic: 'Angelic',
  satanic_set: 'Satanic Set',
  unholy: 'Unholy',
  relic: 'Relic',
}

function lower(s: string): string {
  return s.trim().toLowerCase()
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

const itemsByName: Map<string, ItemBase[]> = (() => {
  const m = new Map<string, ItemBase[]>()
  for (const it of items) {
    const k = lower(it.name)
    const existing = m.get(k)
    if (existing) existing.push(it)
    else m.set(k, [it])
  }
  return m
})()

const gemRuneByName: Map<string, Gem | Rune> = (() => {
  const m = new Map<string, Gem | Rune>()
  for (const g of gems) m.set(lower(g.name), g)
  for (const r of runes) m.set(lower(r.name), r)
  return m
})()

const affixByNameTier: Map<string, Affix> = (() => {
  const m = new Map<string, Affix>()
  for (const a of affixes) m.set(`${lower(a.name)}|${a.tier}`, a)
  return m
})()

const crystalByName: Map<string, Affix> = (() => {
  const m = new Map<string, Affix>()
  for (const c of crystalMods) m.set(lower(c.name), c)
  return m
})()

const augmentByName: Map<string, AngelicAugment> = (() => {
  const m = new Map<string, AngelicAugment>()
  for (const a of augments) m.set(lower(a.name), a)
  return m
})()

export function serializeItem(equipped: EquippedItem, base: ItemBase): string {
  // Renders an equipped item to a PoB-style human-readable text block (item name, stars, sockets, affixes, forge, augment) suitable for copy/paste between builds. The same string round-trips through parseItem.
  const lines: string[] = []
  const rarity = RARITY_LABEL[base.rarity] ?? base.rarity
  lines.push(`${base.name} (${rarity} ${base.baseType})`)

  if (equipped.stars && equipped.stars > 0) {
    lines.push(`Stars: ${equipped.stars}`)
  }

  if (equipped.socketCount > 0) {
    lines.push('Sockets:')
    for (let i = 0; i < equipped.socketCount; i++) {
      const id = equipped.socketed[i]
      const type = equipped.socketTypes[i] ?? 'normal'
      if (!id) {
        lines.push(`  ${i + 1}: -`)
      } else {
        const source = getGem(id) ?? getRune(id)
        const name = source?.name ?? id
        const suffix = type === 'rainbow' ? ' (rainbow)' : ''
        lines.push(`  ${i + 1}: ${name}${suffix}`)
      }
    }
  }

  if (equipped.affixes.length > 0) {
    lines.push('Affixes:')
    for (const a of equipped.affixes) {
      const affix = getAffix(a.affixId)
      if (!affix) {
        lines.push(`  unknown:${a.affixId} T${a.tier}`)
        continue
      }
      const rollPct = Math.round(a.roll * 100)
      const rollStr = rollPct !== 100 ? ` (roll ${rollPct}%)` : ''
      lines.push(`  ${affix.name} T${affix.tier}${rollStr}`)
    }
  }

  if (equipped.forgedMods?.length) {
    for (const f of equipped.forgedMods) {
      const mod = getCrystalMod(f.affixId)
      if (!mod) continue
      lines.push(`Forged: ${mod.name}`)
    }
  }

  if (equipped.augment) {
    const aug = getAugment(equipped.augment.id)
    if (aug) {
      lines.push(`Augment: ${aug.name}, Level ${equipped.augment.level}`)
    }
  }

  return lines.join('\n')
}

export interface ParsedItem {
  baseId: string | null
  baseName: string | null
  stars: number | null
  socketCount: number | null
  socketed: { id: string | null; type: SocketType }[]
  affixes: { affixId: string; tier: number; roll: number }[]
  forgedMods: { affixId: string; tier: number }[]
  augment: { id: string; level: number } | null
  hasAugmentLine: boolean
  errors: string[]
  warnings: string[]
  notes: string[]
}

export function parseItem(text: string): ParsedItem {
  // Parses the PoB-style item text back into a structured ParsedItem. Tolerates whitespace, mixed case, optional rarity/baseType parens after the name, and reports `errors` / `warnings` / `notes` for any line that couldn't be matched.
  const result: ParsedItem = {
    baseId: null,
    baseName: null,
    stars: null,
    socketCount: null,
    socketed: [],
    affixes: [],
    forgedMods: [],
    augment: null,
    hasAugmentLine: false,
    errors: [],
    warnings: [],
    notes: [],
  }

  if (!text.trim()) {
    result.errors.push('Empty input.')
    return result
  }

  const rawLines = text.split(/\r?\n/)
  type Mode = 'init' | 'sockets' | 'affixes'
  let mode: Mode = 'init'
  let foundItemLine = false

  for (const raw of rawLines) {
    const line = raw.trim()
    if (!line) continue

    if (/^sockets:\s*$/i.test(line)) {
      mode = 'sockets'
      continue
    }
    if (/^affixes:\s*$/i.test(line)) {
      mode = 'affixes'
      continue
    }

    if (mode === 'sockets') {
      const m = line.match(/^[-*]?\s*(\d+)\s*[:.]\s*(.*)$/)
      if (m) {
        const idx = parseInt(m[1]!, 10) - 1
        let value = (m[2] ?? '').trim()
        let type: SocketType = 'normal'
        const rainbowMatch = value.match(/\s*\((rainbow|r)\)\s*$/i)
        if (rainbowMatch) {
          type = 'rainbow'
          value = value.replace(/\s*\((rainbow|r)\)\s*$/i, '').trim()
        }
        let id: string | null = null
        if (value === '' || value === '-' || /^empty$/i.test(value)) {
          id = null
        } else {
          const source = gemRuneByName.get(lower(value))
          if (source) {
            id = source.id
            result.notes.push(
              `Socket ${idx + 1}: ${source.name}${type === 'rainbow' ? ' (rainbow)' : ''}`,
            )
          } else {
            result.warnings.push(
              `Socket ${idx + 1}: unknown gem/rune "${value}" — left empty`,
            )
            id = null
          }
        }
        while (result.socketed.length <= idx) {
          result.socketed.push({ id: null, type: 'normal' })
        }
        result.socketed[idx] = { id, type }
        continue
      }
    }

    if (mode === 'affixes') {
      const m = line.match(
        /^[-*]?\s*(.+?)\s+T(\d+)(?:\s*\(roll\s+(\d+(?:\.\d+)?)\s*%?\))?\s*$/i,
      )
      if (m) {
        const name = m[1]!.trim()
        const tier = parseInt(m[2]!, 10)
        const rollPct = m[3] ? parseFloat(m[3]) : 100
        const roll = clamp(rollPct / 100, 0, 1)
        const affix = affixByNameTier.get(`${lower(name)}|${tier}`)
        if (!affix) {
          result.warnings.push(`Affix "${name} T${tier}": unknown — skipped`)
        } else {
          result.affixes.push({ affixId: affix.id, tier, roll })
          result.notes.push(
            `Affix: ${affix.name} T${tier}${roll !== 1 ? ` (roll ${rollPct}%)` : ''}`,
          )
        }
        continue
      }
    }

    const kv = line.match(/^([A-Za-z][A-Za-z\s]*?):\s*(.+)$/)
    if (kv) {
      const key = kv[1]!.trim().toLowerCase()
      const value = kv[2]!.trim()

      if (key === 'stars') {
        const n = parseInt(value, 10)
        if (Number.isFinite(n) && n >= 0) {
          result.stars = n
          result.notes.push(`Stars: ${n}`)
        } else {
          result.warnings.push(`Stars: invalid value "${value}"`)
        }
        continue
      }

      if (key === 'sockets') {
        const n = parseInt(value, 10)
        if (Number.isFinite(n) && n >= 0) {
          result.socketCount = n
          result.notes.push(`Socket count: ${n}`)
        }
        continue
      }

      if (key === 'forged') {
        const mod = crystalByName.get(lower(value))
        if (mod) {
          result.forgedMods.push({ affixId: mod.id, tier: mod.tier })
          result.notes.push(`Forged: ${mod.name}`)
        } else {
          result.warnings.push(`Forged: unknown mod "${value}"`)
        }
        continue
      }

      if (key === 'augment') {
        result.hasAugmentLine = true
        const am = value.match(/^(.+?)(?:\s*[,]?\s+Level\s+(\d+))?\s*$/i)
        if (am) {
          const augName = am[1]!.trim()
          const level = am[2] ? parseInt(am[2], 10) : 1
          if (lower(augName) === 'none' || lower(augName) === '-') {
            result.augment = null
            result.notes.push(`Augment: removed`)
          } else {
            const aug = augmentByName.get(lower(augName))
            if (aug) {
              result.augment = {
                id: aug.id,
                level: clamp(level, 1, AUGMENT_MAX_LEVEL),
              }
              result.notes.push(
                `Augment: ${aug.name}, Level ${result.augment.level}`,
              )
            } else {
              result.warnings.push(`Augment: unknown "${augName}"`)
            }
          }
        }
        continue
      }

      result.warnings.push(`Unknown key "${kv[1]}" — line skipped`)
      continue
    }

    if (!foundItemLine) {
      foundItemLine = true
      const nameOnly = line.replace(/\s*\([^)]*\)\s*$/, '').trim()
      result.baseName = nameOnly
      const candidates = itemsByName.get(lower(nameOnly)) ?? []
      let item: ItemBase | undefined
      if (candidates.length === 1) {
        item = candidates[0]
      } else if (candidates.length > 1) {
        const parenMatch = line.match(/\(([^)]+)\)/)
        if (parenMatch) {
          const hint = lower(parenMatch[1]!)
          item = candidates.find(
            (c) =>
              hint.includes(lower(c.rarity)) ||
              hint.includes(lower(RARITY_LABEL[c.rarity] ?? '')) ||
              hint.includes(lower(c.baseType)),
          )
        }
        if (!item) {
          item = candidates[0]
          result.warnings.push(
            `Multiple items named "${nameOnly}" — picked ${item?.id}`,
          )
        }
      }
      if (item) {
        result.baseId = item.id
        result.notes.push(`Item: ${item.name}`)
      } else {
        result.errors.push(`Item "${nameOnly}" not found`)
      }
      continue
    }

    result.warnings.push(`Unrecognized line: "${line}"`)
  }

  return result
}
