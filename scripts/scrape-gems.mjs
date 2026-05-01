#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(__dirname)
const OUT_PATH = join(ROOT, 'src/data/gems/hero-siege.json')
const CHUNK_URL =
  'https://hero-siege-helper.vercel.app/_next/static/chunks/0r~z2px73s~11.js'

async function getChunk() {
  const res = await fetch(CHUNK_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

const STAT_ID_MAP = {
  additive_physical_dmg_flat: 'additive_physical_damage',
  additive_arcane_dmg_flat: 'additive_arcane_damage',
  additive_cold_dmg_flat: 'additive_cold_damage',
  additive_fire_dmg_flat: 'additive_fire_damage',
  additive_lightning_dmg_flat: 'additive_lightning_damage',
  additive_poison_dmg_flat: 'additive_poison_damage',
  arcane_skill_dmg_flat: 'flat_arcane_skill_damage',
  cold_skill_dmg_flat: 'flat_cold_skill_damage',
  fire_skill_dmg_flat: 'flat_fire_skill_damage',
  poison_skill_dmg_flat: 'flat_poison_skill_damage',
  lightning_skill_dmg_flat: 'flat_lightning_skill_damage',
  magic_skill_dmg_flat: 'flat_skill_damage',
  arcane_skill_dmg_percent: 'arcane_skill_damage',
  cold_skill_dmg_percent: 'cold_skill_damage',
  fire_skill_dmg_percent: 'fire_skill_damage',
  poison_skill_dmg_percent: 'poison_skill_damage',
  lightning_skill_dmg_percent: 'lightning_skill_damage',
  magic_skill_dmg_percent: 'magic_skill_damage',
  enhanced_dmg_percent: 'enhanced_damage',
  defense_base: 'defense',
  enhanced_defense_percent: 'enhanced_defense',
  attack_rating_flat: 'attack_rating',
  attack_speed_percent: 'increased_attack_speed',
  attack_dmg_percent: 'attack_damage',
  life_flat: 'life',
  life_percent: 'increased_life',
  mana_flat: 'mana',
  mana_percent: 'increased_mana',
  all_resist_percent: 'all_resistances',
  fire_resist_percent: 'fire_resistance',
  cold_resist_percent: 'cold_resistance',
  lightning_resist_percent: 'lightning_resistance',
  poison_resist_percent: 'poison_resistance',
  arcane_resist_percent: 'arcane_resistance',
  strength_flat: 'to_strength',
  dexterity_flat: 'to_dexterity',
  intelligence_flat: 'to_intelligence',
  vitality_flat: 'to_vitality',
  energy_flat: 'to_energy',
  all_attributes_flat: 'all_attributes',
  all_skills_flat: 'all_skills',
  attack_rating_percent: 'attack_rating_pct',
  critical_strike_chance_percent: 'crit_chance',
  critical_strike_dmg_percent: 'crit_damage',
  dmg_returned_to_attacker_percent: 'damage_return',
  faster_cast_rate_percent: 'faster_cast_rate',
  jumping_power_percent: 'jumping_power',
  life_after_kill_flat: 'life_per_kill',
  mana_after_kill_flat: 'mana_per_kill',
  light_radius_flat: 'light_radius',
  magic_find_percent: 'magic_find',
  extra_gold_from_kills_percent: 'gold_find',
  target_defense_ignored_percent: 'defense_ignored',
}

const GEM_COLOR_BY_NAME = {
  ruby: 'red',
  sapphire: 'blue',
  emerald: 'green',
  topaz: 'yellow',
  amethyst: 'purple',
  diamond: 'white',
  onyx: 'black',
  rainbow: 'rainbow',
  skull: 'white',
  'black diamond': 'black',
}

function parseString(str, key) {
  const re = new RegExp(`"${key}":"([^"]+)"`)
  const m = str.match(re)
  return m ? m[1] : null
}

function parseValue(str, key) {
  const re = new RegExp(`"${key}":(-?[\\d.]+)`)
  const m = str.match(re)
  return m ? parseFloat(m[1]) : null
}

function extractStatEntries(statsBody) {
  const entries = []
  let depth = 0
  let objStart = null
  for (let k = 0; k < statsBody.length; k++) {
    const c = statsBody[k]
    if (c === '{') {
      if (depth === 0) objStart = k
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && objStart !== null) {
        entries.push(statsBody.slice(objStart, k + 1))
        objStart = null
      }
    }
  }
  return entries.map((e) => ({
    statId: parseString(e, 'Stat ID') ?? '',
    min: parseValue(e, 'Min Value1'),
    max: parseValue(e, 'Max Value1'),
  }))
}

function extractItems(chunkJs) {
  const data = chunkJs
  const re = /\{id:"([^"]+)",name:"([^"]+)",variants:/g
  const results = []
  let m
  while ((m = re.exec(data)) !== null) {
    const start = m.index
    let depth = 0
    let j = start
    while (j < data.length) {
      if (data[j] === '{') depth++
      else if (data[j] === '}') {
        depth--
        if (depth === 0) {
          j++
          break
        }
      }
      j++
    }
    const block = data.slice(start, j)
    results.push({ id: m[1], name: m[2], block })
  }
  return results
}

function pickBestVersion(block) {
  const vIdx = block.indexOf('versions:[')
  if (vIdx < 0) return null
  let depth = 0
  let j = vIdx + 'versions:['.length
  const start = j
  while (j < block.length) {
    const c = block[j]
    if (c === '[') depth++
    else if (c === ']') {
      if (depth === 0) break
      depth--
    }
    j++
  }
  const arr = block.slice(start, j)
  const versions = []
  let d = 0
  let os = null
  for (let k = 0; k < arr.length; k++) {
    const c = arr[k]
    if (c === '{') {
      if (d === 0) os = k
      d++
    } else if (c === '}') {
      d--
      if (d === 0 && os !== null) {
        versions.push(arr.slice(os, k + 1))
        os = null
      }
    }
  }
  if (versions.length === 0) return null
  versions.sort((a, b) => {
    const va = parseString(a, 'versionId') ?? ''
    const vb = parseString(b, 'versionId') ?? ''
    return vb.localeCompare(va)
  })
  return versions[0]
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

const TIER_RANK = { D: 1, C: 2, B: 3, A: 4, S: 5, SS: 6, SSS: 7 }

function tierToNumber(tierStr) {
  if (!tierStr) return 1
  return TIER_RANK[tierStr] ?? 1
}

function colorOf(name) {
  const lower = name.trim().toLowerCase()
  for (const key of Object.keys(GEM_COLOR_BY_NAME)) {
    if (lower.includes(key)) return GEM_COLOR_BY_NAME[key]
  }
  return undefined
}

async function main() {
  const useLocal = process.argv.includes('--local')
  const chunk = useLocal
    ? readFileSync('/tmp/chunk_big.js', 'utf8')
    : await getChunk()

  const allItems = extractItems(chunk)
  const gems = []
  const unmapped = new Set()

  for (const it of allItems) {
    const version = pickBestVersion(it.block)
    if (!version) continue
    const itemType = parseString(version, 'Item Type')
    if (itemType !== 'Gem') continue
    const name = (parseString(version, 'Item Name') ?? it.name).trim()
    const tierStr = parseString(version, 'Item Tier')
    const tier = tierToNumber(tierStr)

    const statsIdx = version.indexOf('stats:[')
    if (statsIdx < 0) continue
    let depth = 0
    let j = statsIdx + 'stats:['.length
    const start = j
    while (j < version.length) {
      const c = version[j]
      if (c === '[') depth++
      else if (c === ']') {
        if (depth === 0) break
        depth--
      }
      j++
    }
    const stats = extractStatEntries(version.slice(start, j))
    const statMap = {}
    for (const s of stats) {
      const mapped = STAT_ID_MAP[s.statId]
      if (!mapped) {
        unmapped.add(s.statId)
        continue
      }
      const val = s.max ?? s.min ?? 0
      if (val === 0) continue
      statMap[mapped] = val
    }

    const slug = slugify(it.id)
    const entry = {
      id: `gem_${slug}`,
      name,
      tier,
      stats: statMap,
    }
    const color = colorOf(name)
    if (color) entry.color = color
    if (tierStr) entry.description = `Tier ${tierStr}`
    gems.push(entry)
  }

  const seen = new Set()
  const dedup = []
  for (const g of gems) {
    if (seen.has(g.id)) continue
    seen.add(g.id)
    dedup.push(g)
  }
  dedup.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))

  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(dedup, null, 2) + '\n')
  const withStats = dedup.filter(
    (g) => Object.keys(g.stats).length > 0,
  ).length
  console.log(
    `Wrote ${dedup.length} gems → ${OUT_PATH} (${withStats} with stats)`,
  )
  if (unmapped.size > 0) {
    console.log(`\nUnmapped Stat IDs (${unmapped.size}):`)
    for (const id of [...unmapped].sort()) console.log(`  ${id}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
