#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(__dirname)
const OUT_PATH = join(ROOT, 'src/data/runewords.json')
const SOURCE_URL = 'https://hero-siege-helper.vercel.app/runewords'
const CHUNK_URL =
  'https://hero-siege-helper.vercel.app/_next/static/chunks/0r~z2px73s~11.js'

async function getHtml() {
  // Fetches the upstream runeword index HTML page and returns its body. Used by main when not in --local mode.
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function getChunk() {
  // Fetches the upstream Next.js chunk file containing the embedded runeword stat data and returns its body. Used by main when not in --local mode.
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
  crushing_blow_chance_percent: 'crushing_blow_chance',
  deadly_blow_chance_percent: 'deadly_blow',
  critical_strike_chance_percent: 'crit_chance',
  critical_strike_dmg_percent: 'crit_damage',
  cooldown_recovery_percent: 'skill_haste',
  faster_cast_rate_percent: 'faster_cast_rate',
  faster_hit_recovery_percent: 'faster_hit_recovery',
  mana_costs_decreased_percent: 'mana_cost_reduction',
  movement_speed_percent: 'movement_speed',
  attack_speed_percent: 'increased_attack_speed',
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
  max_all_resist_percent: 'all_resistances',
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
  dexterity_increase_percent: 'to_dexterity',
  strength_increase_percent: 'to_strength',
  intelligence_increase_percent: 'to_intelligence',
  energy_increase_percent: 'to_energy',
  vitality_increase_percent: 'to_vitality',
  all_attributes_percent: 'all_attributes',
  armor_increase_percent: 'to_armor',
}

function extractRunewordStats(chunkJs) {
  // Walks the chunk JS to find every item literal carrying `"Item Rarity":"Runeword"`, parses its `stats:[…]` array, and returns a `Map<runewordName, parsedStats[]>` keyed by lowercased name. Used by main to enrich the names scraped from the HTML index with their full stat list.
  const data = chunkJs
  const starts = []
  const startRe = /\{id:"([^"]+)",name:"([^"]+)",variants:/g
  let m
  while ((m = startRe.exec(data)) !== null) {
    starts.push({ idx: m.index, id: m[1], name: m[2] })
  }
  const result = new Map()
  for (let i = 0; i < starts.length; i++) {
    const { idx, name } = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1].idx : data.length
    const block = data.slice(idx, end)
    if (!block.includes('"Item Rarity":"Runeword"')) continue
    const rarityIdx = block.indexOf('"Item Rarity":"Runeword"')
    const statsIdx = block.indexOf('stats:[', rarityIdx)
    if (statsIdx < 0) continue
    let depth = 0
    let j = statsIdx + 'stats:['.length
    const arrStart = j
    while (j < block.length) {
      const c = block[j]
      if (c === '[') depth++
      else if (c === ']') {
        if (depth === 0) break
        depth--
      }
      j++
    }
    const arrText = block.slice(arrStart, j)
    const entries = []
    let d = 0
    let objStart = null
    for (let k = 0; k < arrText.length; k++) {
      const c = arrText[k]
      if (c === '{') {
        if (d === 0) objStart = k
        d++
      } else if (c === '}') {
        d--
        if (d === 0 && objStart !== null) {
          entries.push(arrText.slice(objStart, k + 1))
          objStart = null
        }
      }
    }
    const parsed = []
    for (const e of entries) {
      const sm = e.match(/"Stat ID":"([^"]+)"/)
      const mn = e.match(/"Min Value1":(-?[\d.]+)/)
      const mx = e.match(/"Max Value1":(-?[\d.]+)/)
      if (!sm) continue
      const statId = sm[1]
      const min = mn ? parseFloat(mn[1]) : null
      const max = mx ? parseFloat(mx[1]) : null
      parsed.push({ statId, min, max })
    }
    result.set(name.toLowerCase(), parsed)
  }
  return result
}

function statsToStatMap(parsed, warnUnmapped) {
  // Translates a list of parsed stat entries into the local statKey→number map by looking each id up in STAT_ID_MAP, ignoring `socketed_flat` (it's a required-sockets count rather than a stat) and recording unmapped ids on the supplied set. Used by main to build the runeword stats payload.
  const out = {}
  for (const { statId, min, max } of parsed) {
    if (statId === 'socketed_flat') continue
    const key = STAT_ID_MAP[statId]
    if (!key) {
      if (warnUnmapped) warnUnmapped.add(statId)
      continue
    }
    const val = max !== null ? max : min ?? 0
    if (val === 0) continue
    out[key] = (out[key] ?? 0) + val
  }
  return out
}

function decode(s) {
  // Decodes a small set of HTML entities back into their literal characters. Used by every parser before exposing scraped text.
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function flattenToText(html) {
  // Strips every `<style>` block, replaces remaining tags with `|`, decodes entities, and collapses repeated `|`s. Returns a deterministic pipe-separated text representation of the original HTML. Used by parseBlock to walk a runeword card.
  const noStyles = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
  const piped = noStyles.replace(/<[^>]+>/g, '|')
  return decode(piped).replace(/\|+/g, '|').replace(/^\|/, '').replace(/\|$/, '')
}

function extractNames(html) {
  // Scans the runeword index page for the "Click to copy" name divs and returns the trimmed name list in source order. Used by main to enumerate every runeword the upstream lists.
  const decoded = decode(html)
  const re =
    /title="Click to copy"><div class="css-0">([A-Za-z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff\s'´]{1,40})<\/div>/g
  const names = []
  let m
  while ((m = re.exec(decoded)) !== null) names.push(m[1].trim())
  return names
}

function slug(s) {
  // Converts an arbitrary string into a snake_case slug suitable for use inside an id. Used when synthesising rune ids.
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function normalizeBase(str) {
  // Strips a leading `1H`/`2H` marker and collapses whitespace from a base-type token. Used by canonicalBase to clean upstream labels.
  return str
    .replace(/^[12]H\s*\|?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const BASE_ALIASES = {
  'Body Armor': 'Armor',
}

function canonicalBase(s) {
  // Returns the canonical local base-type name for a scraped string by normalising it and applying BASE_ALIASES (e.g. `Body Armor` → `Armor`). Used by parseBlock when building the runeword's allowed-base list.
  const n = normalizeBase(s)
  return BASE_ALIASES[n] ?? n
}

function parseBlock(block) {
  // Parses a single runeword card (already flattened to pipe-separated text) into `{ name, level, bases, runes }`, walking the tokens to extract the rune sequence and the list of allowed bases. Used by main once per scraped runeword.
  const parts = block.split('|').map((p) => p.trim()).filter(Boolean)
  const name = parts[0]
  let level = null
  let cursor = 1
  if (parts[cursor] === '[') {
    level = parseInt(parts[cursor + 1], 10)
    cursor += 3
  }
  const runes = []
  const bases = []
  while (cursor < parts.length) {
    const tok = parts[cursor]
    if (/^[1-9]$/.test(tok)) {
      const pos = parseInt(tok, 10)
      const runeName = parts[cursor + 1]
      if (!runeName) break
      runes.push({ pos, name: runeName })
      cursor += 2
      continue
    }
    if (/^[12]H$/i.test(tok)) {
      cursor += 1
      continue
    }
    if (!/^[A-Z][A-Za-z ]{0,30}$/.test(tok)) {
      break
    }
    bases.push(canonicalBase(tok))
    cursor += 1
  }
  runes.sort((a, b) => a.pos - b.pos)
  return {
    name,
    level,
    bases: Array.from(new Set(bases)),
    runes: runes.map((r) => `rune_${slug(r.name)}`),
  }
}

async function main() {
  // Top-level scraper that fetches both the runeword index HTML and the chunk JS (or reads `/tmp/runewords.html` and `/tmp/chunk_big.js` in --local mode), correlates each runeword name with its parsed stats, and writes the resulting array to `src/data/runewords.json`. Reports unmapped Stat IDs at the end.
  const useLocal = process.argv.includes('--local')
  const html = useLocal
    ? readFileSync('/tmp/runewords.html', 'utf8')
    : await getHtml()
  const chunkJs = useLocal
    ? readFileSync('/tmp/chunk_big.js', 'utf8')
    : await getChunk()
  const unmapped = new Set()
  const rwStatsMap = extractRunewordStats(chunkJs)

  const names = extractNames(html)
  if (names.length === 0) {
    console.error('No runeword names found')
    process.exit(1)
  }

  const text = flattenToText(html)
  const records = []
  const orderedNames = names.slice()

  for (let i = 0; i < orderedNames.length; i++) {
    const name = orderedNames[i]
    const startToken = `${name}|[|`
    const start = text.indexOf(startToken)
    if (start < 0) continue
    let end = text.length
    for (let j = 0; j < orderedNames.length; j++) {
      if (j === i) continue
      const cand = text.indexOf(`${orderedNames[j]}|[|`, start + 1)
      if (cand > 0 && cand < end) end = cand
    }
    const block = text.slice(start, end)
    const parsed = parseBlock(block)
    if (parsed.runes.length === 0) continue
    records.push(parsed)
  }

  const out = records.map((r) => {
    const parsed = rwStatsMap.get(r.name.toLowerCase()) ?? []
    const stats = statsToStatMap(parsed, unmapped)
    return {
      id: `rw_${slug(r.name)}`,
      name: r.name,
      runes: r.runes,
      allowedBaseTypes: r.bases,
      stats,
      requiresLevel: r.level ?? undefined,
      requiresItemLevel: 1,
    }
  })

  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n')
  const withStats = out.filter((r) => Object.keys(r.stats).length > 0).length
  console.log(
    `Wrote ${out.length} runewords → ${OUT_PATH} (${withStats} with stats)`,
  )
  const runeSet = new Set()
  for (const r of out) for (const ru of r.runes) runeSet.add(ru)
  console.log('Distinct runes referenced:', [...runeSet].sort().join(', '))
  if (unmapped.size > 0) {
    console.log(`\nUnmapped Stat IDs (${unmapped.size}):`)
    for (const id of [...unmapped].sort()) console.log(`  ${id}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
