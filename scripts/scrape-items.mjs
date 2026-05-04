#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(__dirname)
const ITEMS_DIR = join(ROOT, 'src/data/items')
const CHUNK_URL =
  'https://hero-siege-helper.vercel.app/_next/static/chunks/0r~z2px73s~11.js'

async function getChunk() {
  // Fetches the upstream Next.js chunk file containing the embedded item data and returns its body. Used by main when not in --local mode.
  const res = await fetch(CHUNK_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

const STAT_ID_MAP = {
  enhanced_dmg_percent: 'enhanced_damage',
  enhanced_defense_percent: 'enhanced_defense',
  defense_base: 'defense',
  defense_percent: 'enhanced_defense',
  attack_rating_flat: 'attack_rating',
  attack_rating_percent: 'attack_rating_pct',
  attack_dmg_percent: 'attack_damage',
  life_stolen_per_hit_percent: 'life_steal',
  mana_stolen_per_hit_percent: 'mana_steal',
  target_defense_ignored_percent: 'defense_ignored',
  open_wound_chance_percent: 'open_wounds',
  dmg_taken_to_mana_percent: 'damage_recouped_as_mana',
  dmg_taken_to_life_percent: 'damage_recouped_as_life',
  crushing_blow_chance_percent: 'crushing_blow_chance',
  deadly_blow_chance_percent: 'deadly_blow',
  critical_strike_chance_percent: 'crit_chance',
  critical_strike_dmg_percent: 'crit_damage',
  cooldown_recovery_percent: 'skill_haste',
  faster_cast_rate_percent: 'faster_cast_rate',
  total_faster_cast_rate_percent: 'faster_cast_rate',
  faster_hit_recovery_percent: 'faster_hit_recovery',
  mana_costs_decreased_percent: 'mana_cost_reduction',
  movement_speed_percent: 'movement_speed',
  attack_speed_percent: 'increased_attack_speed',
  total_attack_speed_percent: 'increased_attack_speed',
  attacks_per_second_base: 'attacks_per_second',
  life_flat: 'life',
  life_percent: 'increased_life',
  life_per_second_flat: 'life_replenish',
  life_after_kill_flat: 'life_per_kill',
  mana_flat: 'mana',
  mana_percent: 'increased_mana',
  mana_per_second_flat: 'mana_replenish',
  mana_after_kill_flat: 'mana_per_kill',
  strength_flat: 'to_strength',
  dexterity_flat: 'to_dexterity',
  intelligence_flat: 'to_intelligence',
  energy_flat: 'to_energy',
  vitality_flat: 'to_vitality',
  armor_flat: 'to_armor',
  all_attributes_flat: 'all_attributes',
  all_skills_flat: 'all_skills',
  physical_skills_flat: 'physical_skills',
  arcane_skills_flat: 'arcane_skills',
  cold_skills_flat: 'cold_skills',
  fire_skills_flat: 'fire_skills',
  lightning_skills_flat: 'lightning_skills',
  poison_skills_flat: 'poison_skills',
  explosion_skills_flat: 'explosion_skills',
  summon_skills_flat: 'summon_skills',
  all_resist_percent: 'all_resistances',
  fire_resist_percent: 'fire_resistance',
  cold_resist_percent: 'cold_resistance',
  lightning_resist_percent: 'lightning_resistance',
  poison_resist_percent: 'poison_resistance',
  arcane_resist_percent: 'arcane_resistance',
  max_lightning_resist_percent: 'max_lightning_resistance',
  magic_skill_dmg_percent: 'magic_skill_damage',
  arcane_skill_dmg_percent: 'arcane_skill_damage',
  cold_skill_dmg_percent: 'cold_skill_damage',
  fire_skill_dmg_percent: 'fire_skill_damage',
  poison_skill_dmg_percent: 'poison_skill_damage',
  lightning_skill_dmg_percent: 'lightning_skill_damage',
  magic_skill_dmg_flat: 'flat_skill_damage',
  arcane_skill_dmg_flat: 'flat_arcane_skill_damage',
  cold_skill_dmg_flat: 'flat_cold_skill_damage',
  fire_skill_dmg_flat: 'flat_fire_skill_damage',
  poison_skill_dmg_flat: 'flat_poison_skill_damage',
  lightning_skill_dmg_flat: 'flat_lightning_skill_damage',
  additive_physical_dmg_flat: 'additive_physical_damage',
  additive_arcane_dmg_flat: 'additive_arcane_damage',
  additive_cold_dmg_flat: 'additive_cold_damage',
  additive_fire_dmg_flat: 'additive_fire_damage',
  additive_lightning_dmg_flat: 'additive_lightning_damage',
  additive_poison_dmg_flat: 'additive_poison_damage',
  enemy_fire_resist_percent: 'ignore_lightning_res',
  enemy_cold_resist_percent: 'ignore_cold_res',
  enemy_lightning_resist_percent: 'ignore_lightning_res',
  enemy_poison_resist_percent: 'ignore_poison_res',
  enemy_arcane_resist_percent: 'ignore_arcane_res',
  magic_find_percent: 'magic_find',
  extra_gold_from_kills_percent: 'gold_find',
  increased_experience_gain_percent: 'experience_gain',
  jumping_power_percent: 'jumping_power',
  light_radius_flat: 'light_radius',
  block_chance_percent: 'block_chance',
  block_chance_base: 'block_chance',
  replenish_mana_percent: 'mana_replenish_pct',
  replenish_life_percent: 'life_replenish_pct',
  reduced_physical_dmg_taken_percent: 'physical_damage_reduction',
  reduced_magic_dmg_taken_percent: 'magic_damage_reduction',
  reduced_all_dmg_taken_percent: 'damage_mitigation',
  reduced_dmg_taken_flat: 'damage_reduced',
  dmg_returned_to_attacker_percent: 'damage_return',
  aoe_size_percent: 'area_of_effect',
  aoe_damage_percent: 'explosion_damage',
  slows_target_percent: 'slow_target',
  extra_dmg_to_stunned_percent: 'extra_damage_stunned',
  extra_dmg_to_bleeding_percent: 'extra_damage_bleeding',
  extra_dmg_to_burning_percent: 'extra_damage_burning',
  extra_dmg_to_poisoned_percent: 'extra_damage_poisoned',
  extra_dmg_to_stasis_percent: 'extra_damage_stasis',
  extra_dmg_to_frostbitten_percent: 'extra_damage_frost_bitten',
  extra_dmg_to_shadowburn_percent: 'extra_damage_shadow_burning',
  poison_damage_percent: 'increased_poisoned_damage',
  bleed_damage_percent: 'increased_bleeding_damage',
  burning_damage_percent: 'increased_burning_damage',
  stasis_damage_percent: 'increased_stasis_damage',
  frostbite_damage_percent: 'increased_frost_bite_damage',
  shadowburn_damage_percent: 'increased_shadow_burning_damage',
  cold_dmg_absorbed_percent: 'cold_absorption',
  fire_dmg_absorbed_percent: 'fire_absorption',
  lightning_dmg_absorbed_percent: 'lightning_absorption',
  poison_dmg_absorbed_percent: 'poison_absorption',
  projectile_speed_flat: 'projectile_speed',
  socketed_flat: null,
}

const SLOT_BY_TYPE = {
  Amulet: 'amulet',
  Ring: 'ring_1',
  Belt: 'belt',
  Boots: 'boots',
  Gloves: 'gloves',
  Helmet: 'helmet',
  Shield: 'offhand',
  'Body Armor': 'armor',
  Armor: 'armor',
  Charm: 'charm_1',
  Weapon: 'weapon',
  Mace: 'weapon',
  Sword: 'weapon',
  Axe: 'weapon',
  Bow: 'weapon',
  Wand: 'weapon',
  Gun: 'weapon',
  Book: 'weapon',
  Staff: 'weapon',
  Polearm: 'weapon',
  Dagger: 'weapon',
  Claw: 'weapon',
  Flask: 'weapon',
  Throwing: 'weapon',
  Chainsaw: 'weapon',
  Cane: 'weapon',
  Spell: 'weapon',
  Spellblade: 'weapon',
  Potion: 'potion_1',
  Gem: 'charm_1',
}

const SLOT_FILE_BASE = {
  amulet: 'amulets',
  ring_1: 'rings',
  belt: 'belts',
  boots: 'boots',
  gloves: 'gloves',
  helmet: 'helmets',
  offhand: 'shields',
  armor: 'armors',
  charm_1: 'charms',
  weapon: 'weapons',
  potion_1: 'potions',
  relic_1: 'relics',
}

function parseValue(str, key) {
  // Returns the numeric value of a `"key":number` entry inside the chunk text as a float, or null when not found. Used by extractStatEntries.
  const re = new RegExp(`"${key}":(-?[\\d.]+)`)
  const m = str.match(re)
  return m ? parseFloat(m[1]) : null
}

function parseString(str, key) {
  // Returns the string value of a `"key":"value"` entry inside the chunk text, or null when not found. Used by extractStatEntries and pickBestVersion.
  const re = new RegExp(`"${key}":"([^"]+)"`)
  const m = str.match(re)
  return m ? m[1] : null
}

function parseArray(str, key) {
  // Returns a `"key":["…","…"]` array as a list of trimmed, dequoted strings. Used by main to read each item's base-types.
  const re = new RegExp(`"${key}":\\[([^\\]]*)\\]`)
  const m = str.match(re)
  if (!m) return null
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^"|"$/g, ''))
    .filter((s) => s.length > 0)
}

function extractStatEntries(statsBody) {
  // Walks the contents of a `stats:[…]` array, splitting it into top-level `{…}` blocks and parsing each into `{ statId, min, max, spellName }`. Used by main to read every item's stat list.
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
    spellName: parseString(e, 'Spell Name'),
  }))
}

function extractItems(chunkJs) {
  // Scans the entire chunk JS and returns one `{ id, name, block }` per top-level item literal, where `block` is the raw text of that literal. Used by main to enumerate every item in the chunk.
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
  // Extracts the `versions:[…]` sub-array from an item block, splits it into top-level `{…}` version objects, and returns the one with the highest sortable `versionId`. Used by main to pick the most-recent stats for each item.
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

function getSlotAndBaseType(itemType, itemBases) {
  // Maps an upstream item type to the local slot key and base type, preferring the first entry of `itemBases` when one is supplied. Returns null when the type is unrecognised. Used by main when classifying each item.
  const slot = SLOT_BY_TYPE[itemType]
  if (!slot) return null
  let baseType = itemType === 'Body Armor' ? 'Armor' : itemType
  if (slot === 'weapon' && itemBases && itemBases.length > 0) {
    baseType = itemBases[0]
  } else if (itemBases && itemBases.length > 0) {
    baseType = itemBases[0]
  }
  return { slot, baseType, allBases: itemBases }
}

function formatStatId(id) {
  // Renders an upstream stat id into a Title Case label by stripping the `_flat`/`_percent`/`_base` suffixes and converting underscores to spaces. Used as the fallback display for unsupported stat ids.
  return id
    .replace(/_flat|_percent|_base/g, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function statsToImplicit(stats, unmapped) {
  // Walks every parsed stat entry and folds it into either the structured `implicit` map (when the stat id is mapped) or the freeform `extraEffects` list (otherwise). Returns both, and records unmapped ids on the supplied set so main can report them.
  const implicit = {}
  const extraEffects = []
  for (const s of stats) {
    if (s.statId === 'socketed_flat') continue
    const mapped = STAT_ID_MAP[s.statId]
    if (mapped === undefined) {
      const desc = s.spellName
        ? `${formatStatId(s.statId)}: ${s.spellName}`
        : formatStatId(s.statId)
      extraEffects.push(desc)
      if (unmapped) unmapped.add(s.statId)
      continue
    }
    if (mapped === null) continue
    const mn = s.min ?? 0
    const mx = s.max ?? mn
    const val = mn === mx ? mn : [mn, mx]
    if (mn === 0 && mx === 0) continue
    implicit[mapped] = val
  }
  return { implicit, extraEffects }
}

function slugify(s) {
  // Converts an arbitrary string into a snake_case slug suitable for use inside an id. Used by normalizeItemId.
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function normalizeItemId(type, slug, rarity) {
  // Composes the canonical local item id `<type>_<rarity>_<slug>` from a base type, an item slug, and a rarity name. Used by main when synthesising item ids.
  const typeSlug = slugify(type ?? 'item')
  return `${typeSlug}_${rarity}_${slug}`
}

function getSocketsCount(stats) {
  // Returns the minimum socket count declared in a parsed stat list, or null when no `socketed_flat` entry is present. Used by main to seed the item's `sockets` field.
  const s = stats.find((x) => x.statId === 'socketed_flat')
  if (!s) return null
  return s.min ?? null
}

const KNOWN_RARITIES = [
  'common',
  'uncommon',
  'rare',
  'mythic',
  'satanic',
  'heroic',
  'angelic',
  'unholy',
]

async function main() {
  // Top-level scraper that fetches (or reads `/tmp/chunk_big.js` in --local mode) the upstream chunk, walks every item, picks the most-recent version, maps its stats, and writes one JSON file per slot under `src/data/items/` filtered by the requested rarity (defaults to "satanic"). Reports unmapped Stat IDs at the end so the operator can extend STAT_ID_MAP.
  const useLocal = process.argv.includes('--local')
  const rarityArg =
    process.argv.find((a) => a.startsWith('--rarity='))?.split('=')[1] ??
    'satanic'
  const typeArg =
    process.argv.find((a) => a.startsWith('--type='))?.split('=')[1] ?? null
  const all = process.argv.includes('--all')
  const rarityFilters = (all ? KNOWN_RARITIES : rarityArg.split(','))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const relicMode = typeArg && typeArg.toLowerCase() === 'relic'

  const chunk = useLocal
    ? readFileSync('/tmp/chunk_big.js', 'utf8')
    : await getChunk()

  const unmapped = new Set()
  const allItems = extractItems(chunk)
  const buckets = new Map()

  for (const it of allItems) {
    const version = pickBestVersion(it.block)
    if (!version) continue
    const rarity = parseString(version, 'Item Rarity')
    const itemType = parseString(version, 'Item Type')

    let rarityNorm
    let baseRarity
    if (relicMode) {
      if (itemType !== 'Relic') continue
      rarityNorm = 'relic'
      baseRarity = 'relic'
    } else {
      if (!rarity) continue
      rarityNorm = rarity.toLowerCase().replace(/\s+/g, '_')
      baseRarity = rarityNorm.replace(/_set$/, '')
      if (!rarityFilters.includes(baseRarity)) continue
    }

    const itemBases = parseArray(version, 'Item Bases')
    const itemName = parseString(version, 'Item Name') ?? it.name
    const itemLevel = parseValue(version, 'Item Level Requirement')
    const itemTier = parseString(version, 'Item Tier')
    const itemSet = parseString(version, 'Item Set')
    const widthMatch = version.match(/Width:(\d+),Height:(\d+)/)
    const width = widthMatch ? parseInt(widthMatch[1], 10) : null
    const height = widthMatch ? parseInt(widthMatch[2], 10) : null

    let slotInfo
    if (relicMode) {
      slotInfo = { slot: 'relic_1', baseType: 'Relic', allBases: [] }
    } else {
      slotInfo = getSlotAndBaseType(itemType, itemBases)
      if (!slotInfo) continue
    }

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
    const { implicit, extraEffects } = statsToImplicit(stats, unmapped)
    const sockets = getSocketsCount(stats)

    const storageRarity =
      rarityNorm === 'satanic_set' ? 'satanic_set' : baseRarity
    const base = {
      id: normalizeItemId(itemType, slugify(it.id), baseRarity),
      name: itemName,
      baseType: slotInfo.baseType,
      slot: slotInfo.slot,
      rarity: storageRarity,
    }
    if (itemTier) base.grade = itemTier
    if (itemLevel !== null && itemLevel > 0) base.requiresLevel = itemLevel
    if (Object.keys(implicit).length > 0) base.implicit = implicit
    if (extraEffects.length > 0) base.uniqueEffects = extraEffects
    if (itemSet) base.setId = slugify(itemSet)
    if (sockets !== null && sockets > 0) {
      base.sockets = sockets
      base.maxSockets = sockets
    }
    if (itemType === 'Weapon' && slotInfo.allBases) {
      base.description = slotInfo.allBases.join(' / ')
    }
    if (width !== null && height !== null) {
      base.width = width
      base.height = height
    }

    const slotBase = SLOT_FILE_BASE[slotInfo.slot]
    if (!slotBase) continue
    if (!buckets.has(baseRarity)) buckets.set(baseRarity, new Map())
    const slotMap = buckets.get(baseRarity)
    if (!slotMap.has(slotBase)) slotMap.set(slotBase, [])
    slotMap.get(slotBase).push(base)
  }

  mkdirSync(ITEMS_DIR, { recursive: true })
  let total = 0
  for (const [rarity, slotMap] of buckets) {
    let rarityTotal = 0
    for (const [slotBase, list] of slotMap) {
      const seen = new Set()
      const dedup = []
      for (const it of list) {
        if (seen.has(it.id)) continue
        seen.add(it.id)
        dedup.push(it)
      }
      dedup.sort((a, b) => a.name.localeCompare(b.name))
      const outPath = join(ITEMS_DIR, `${slotBase}.${rarity}.json`)
      writeFileSync(outPath, JSON.stringify(dedup, null, 2) + '\n')
      console.log(`  ${slotBase}.${rarity}.json: ${dedup.length}`)
      rarityTotal += dedup.length
    }
    console.log(`[${rarity}] total ${rarityTotal}`)
    total += rarityTotal
  }
  console.log(`\nGrand total: ${total} items`)
  if (unmapped.size > 0) {
    console.log(`\nUnmapped Stat IDs (${unmapped.size}):`)
    for (const id of [...unmapped].sort()) console.log(`  ${id}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
