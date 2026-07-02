import { etherTree } from '../../data'
import { ETHER_NODE_BY_ID } from '../tree/etherGraph'

export const ETHER_MAGIC_FIND_KEY = 'etherUnSmall01'

export interface EtherSummaryEntry {
  key: string
  label: string
  desc: string
  count: number
  valuePer: number
  total: number
  isPercent: boolean
}

export function parseEtherValue(value: string): {
  num: number
  isPercent: boolean
} {
  const isPercent = value.endsWith('%')
  const num = Number.parseFloat(value)
  return { num: Number.isFinite(num) ? num : 0, isPercent }
}

export function summarizeEtherNodes(
  allocated: Iterable<number>,
): EtherSummaryEntry[] {
  const counts = new Map<string, number>()
  for (const id of allocated) {
    const node = ETHER_NODE_BY_ID.get(id)
    if (!node) continue
    counts.set(node.key, (counts.get(node.key) ?? 0) + 1)
  }
  const out: EtherSummaryEntry[] = []
  for (const [key, count] of counts) {
    const stat = etherTree.stats[key]
    if (!stat) continue
    const { num, isPercent } = parseEtherValue(stat.value)
    out.push({
      key,
      label: stat.label,
      desc: stat.desc,
      count,
      valuePer: num,
      total: Math.round(num * count * 100) / 100,
      isPercent,
    })
  }
  return out.sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  )
}

export function etherMagicFindTotal(allocated: Iterable<number>): number {
  let count = 0
  for (const id of allocated) {
    if (ETHER_NODE_BY_ID.get(id)?.key === ETHER_MAGIC_FIND_KEY) count++
  }
  const stat = etherTree.stats[ETHER_MAGIC_FIND_KEY]
  if (!stat) return 0
  return Math.round(parseEtherValue(stat.value).num * count * 100) / 100
}

export function formatEtherTotal(entry: {
  total: number
  isPercent: boolean
}): string {
  const num = Number.isInteger(entry.total)
    ? entry.total
    : Math.round(entry.total * 100) / 100
  return `+${num}${entry.isPercent ? '%' : ''}`
}

const ETHER_REGION_LABELS: Record<string, string> = {
  Un: 'Universal',
  Ow: 'Overworld',
  Ct: 'Chaos Tower',
  Cp: 'Chaos Pillars',
  SR: 'Shadow Realm',
  Pe: 'Prime Evil',
  Ur: 'Unstable Rift',
  Min: 'Mining',
  EB: 'Eternal Battlefield',
  CS: 'Cursed Spirit',
  US: 'Unholy Siege',
  Dng: 'Dungeons',
  Rg: 'Ruby Gardens',
  Cc: 'Colossal Creatures',
}

export function etherRegionLabel(key: string): string {
  const m = key.match(/^ether([A-Z][a-zA-Z]*?)(?:Small|Big)\d/)
  const code = m?.[1]
  return (code && ETHER_REGION_LABELS[code]) || 'Other'
}

export interface EtherSummaryGroup {
  region: string
  entries: EtherSummaryEntry[]
}

export function groupEtherSummary(
  entries: EtherSummaryEntry[],
): EtherSummaryGroup[] {
  const byRegion = new Map<string, EtherSummaryEntry[]>()
  for (const entry of entries) {
    const region = etherRegionLabel(entry.key)
    const list = byRegion.get(region)
    if (list) list.push(entry)
    else byRegion.set(region, [entry])
  }
  return [...byRegion.entries()]
    .map(([region, list]) => ({ region, entries: list }))
    .sort((a, b) => {
      if (a.region === 'Universal') return -1
      if (b.region === 'Universal') return 1
      return a.region.localeCompare(b.region)
    })
}
