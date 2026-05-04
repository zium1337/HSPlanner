#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(__dirname)
const OUT_PATH = join(ROOT, 'src/data/affixes.json')
const GAME_CONFIG_PATH = join(ROOT, 'src/data/game-config.json')
const SOURCE_URL = 'https://hero-siege-helper.vercel.app/data/affixes'

async function getHtml() {
  // Fetches the affix table HTML page from the upstream source URL, throwing on a non-2xx response. Used by main when not in --local mode.
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

function decode(s) {
  // Decodes a small set of HTML entities back into their literal characters. Used by stripTags before returning a clean text string.
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function stripTags(s) {
  // Removes every HTML tag from a fragment, decodes leftover entities, and collapses whitespace. Used by every parser to convert raw cell HTML to clean text.
  return decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

function parseTables(html) {
  // Splits a full HTML page into the inner contents of every `<table>` element. Used by main to walk every affix table on the page.
  const tables = []
  const re = /<table[^>]*>([\s\S]*?)<\/table>/g
  let m
  while ((m = re.exec(html)) !== null) tables.push(m[1])
  return tables
}

function parseRows(table) {
  // Splits a `<table>` body into the inner contents of every `<tr>` element. Used by main inside each table.
  const rows = []
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  let m
  while ((m = re.exec(table)) !== null) rows.push(m[1])
  return rows
}

function stripStyles(html) {
  // Removes every `<style>` block from an HTML fragment so cell parsing does not pick up CSS rules. Used by parseCells.
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

function parseCells(row) {
  // Splits a `<tr>` row into the inner contents of every `<th>` / `<td>` cell, after stripping any embedded `<style>` blocks. Used by main to extract the affix-name and description columns.
  const clean = stripStyles(row)
  const cells = []
  const re = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g
  let m
  while ((m = re.exec(clean)) !== null) cells.push(m[1])
  return cells
}

const gameConfig = JSON.parse(readFileSync(GAME_CONFIG_PATH, 'utf8'))
const STAT_NAMES = gameConfig.stats
  .map((s) => ({
    key: s.key,
    nameNorm: s.name.toLowerCase().replace(/^to\s+/, '').trim(),
    format: s.format,
  }))
  .sort((a, b) => b.nameNorm.length - a.nameNorm.length)

const MANUAL_MAPPINGS = {
  'flat physical damage': 'additive_physical_damage',
  'flat fire damage': 'flat_fire_skill_damage',
  'flat cold damage': 'flat_cold_skill_damage',
  'flat lightning damage': 'flat_lightning_skill_damage',
  'flat poison damage': 'flat_poison_skill_damage',
  'flat arcane damage': 'flat_arcane_skill_damage',
  'increased attack speed': 'increased_attack_speed',
  'increased experience gain': 'experience_gain',
  attack_rating: 'attack_rating',
  'attack rating': 'attack_rating',
  life: 'life',
  mana: 'mana',
  strength: 'to_strength',
  dexterity: 'to_dexterity',
  intelligence: 'to_intelligence',
  energy: 'to_energy',
  vitality: 'to_vitality',
  armor: 'to_armor',
  'all attributes': 'all_attributes',
  'all skills': 'all_skills',
  'all resistances': 'all_resistances',
  'fire resistance': 'fire_resistance',
  'cold resistance': 'cold_resistance',
  'lightning resistance': 'lightning_resistance',
  'poison resistance': 'poison_resistance',
  'arcane resistance': 'arcane_resistance',
  'enhanced damage': 'enhanced_damage',
  'enhanced defense': 'enhanced_defense',
  'attack damage': 'attack_damage',
  'critical strike damage': 'crit_damage',
  'chance for critical strike': 'crit_chance',
  'magic find': 'magic_find',
  'gold find': 'gold_find',
  'extra gold from kills': 'gold_find',
  'life stolen per hit': 'life_steal',
  'mana stolen per hit': 'mana_steal',
  'movement speed': 'movement_speed',
  'faster cast rate': 'faster_cast_rate',
  'faster hit recovery': 'faster_hit_recovery',
  'mana cost reduced': 'mana_cost_reduction',
  'deadly blow': 'deadly_blow',
  defense: 'defense',
  'block chance': 'block_chance',
  'chance to block attacks': 'block_chance',
  'open wounds': 'open_wounds',
  'crushing blow': 'crushing_blow_chance',
  'spell damage': 'spell_damage',
  'magic skill damage': 'magic_skill_damage',
  'arcane skill damage': 'arcane_skill_damage',
  'cold skill damage': 'cold_skill_damage',
  'fire skill damage': 'fire_skill_damage',
  'poison skill damage': 'poison_skill_damage',
  'lightning skill damage': 'lightning_skill_damage',
  'life replenish': 'life_replenish',
  'mana replenish': 'mana_replenish',
  'light radius': 'light_radius',
  'skill haste': 'skill_haste',
}

function guessStatKey(desc) {
  // Tries to map an affix description back to a stat key by normalising the text (lowercasing, stripping numbers/percent/brackets), checking the manual-mappings table first and then progressively-fuzzier matches against the game-config stat names. Returns null when nothing matches so main can count unmapped entries.
  let norm = desc
    .toLowerCase()
    .replace(/^[+-]/, '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\d+(\.\d+)?/g, ' ')
    .replace(/%/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  norm = norm.replace(/^to\s+/, '').trim()
  if (MANUAL_MAPPINGS[norm]) return MANUAL_MAPPINGS[norm]
  for (const s of STAT_NAMES) {
    if (norm === s.nameNorm) return s.key
  }
  for (const s of STAT_NAMES) {
    if (norm.includes(s.nameNorm) || s.nameNorm.includes(norm)) return s.key
  }
  return null
}

function parseStatString(raw) {
  // Parses an affix description into `{ sign, format, valueMin, valueMax }`, recognising explicit ranges like `[12-18]` and falling back to a single number. Used by main to fill in the numeric fields on each generated affix entry.
  const desc = raw.trim()
  const signMatch = desc.match(/^([+-])/)
  const sign = signMatch ? signMatch[1] : '+'
  const isPercent = /%/.test(desc)
  const rangeMatch = desc.match(/\[(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\]/)
  const singleMatch = !rangeMatch
    ? desc.match(/[+-]?(\d+(?:\.\d+)?)/)
    : null
  let valueMin = null
  let valueMax = null
  if (rangeMatch) {
    valueMin = parseFloat(rangeMatch[1])
    valueMax = parseFloat(rangeMatch[2])
  } else if (singleMatch) {
    valueMin = parseFloat(singleMatch[1])
    valueMax = valueMin
  }
  return {
    sign,
    format: isPercent ? 'percent' : 'flat',
    valueMin,
    valueMax,
  }
}

function slug(s) {
  // Converts an arbitrary string into a snake_case slug suitable for use inside an id (lowercased, non-alphanumerics collapsed to underscores, no leading/trailing underscores). Used by main when synthesising affix ids.
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

async function main() {
  // Top-level scraper that fetches (or reads `/tmp/affixes.html` in --local mode) the upstream HTML, parses every affix table into `{ id, groupId, tier, name, description, statKey, sign, format, valueMin, valueMax }` records, writes the result to `src/data/affixes.json`, and reports unmapped entries on stdout.
  const useLocal = process.argv.includes('--local')
  const html = useLocal
    ? readFileSync('/tmp/affixes.html', 'utf8')
    : await getHtml()

  const tables = parseTables(html)
  const affixes = []
  let unmapped = 0
  for (let i = 0; i < tables.length; i++) {
    const rows = parseRows(tables[i])
    if (rows.length < 2) continue
    const first = parseCells(rows[0])
    if (first.length !== 2) continue
    const head0 = stripTags(first[0]).toLowerCase()
    if (head0 !== 'affix') continue

    const tierRows = rows.slice(1)
    let groupId = null
    for (let j = 0; j < tierRows.length; j++) {
      const cells = parseCells(tierRows[j])
      if (cells.length < 2) continue
      const name = stripTags(cells[0])
      const description = stripTags(cells[1])
      if (!name || !description) continue
      if (j === 0) groupId = slug(description)
      const stat = parseStatString(description)
      const statKey = guessStatKey(description)
      if (!statKey) unmapped++
      affixes.push({
        id: `${groupId}_t${j + 1}_${slug(name)}`,
        groupId,
        tier: j + 1,
        name,
        description,
        statKey,
        sign: stat.sign,
        format: stat.format,
        valueMin: stat.valueMin,
        valueMax: stat.valueMax,
      })
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(affixes, null, 2) + '\n')
  console.log(`Wrote ${affixes.length} affixes → ${OUT_PATH}`)
  console.log(`Unmapped statKey: ${unmapped}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
