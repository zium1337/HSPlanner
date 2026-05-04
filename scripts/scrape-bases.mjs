#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(__dirname)
const ITEMS_DIR = join(ROOT, 'src/data/items')
const SOURCE_URL = 'https://hero-siege-helper.vercel.app/data/bases'

async function getHtml() {
  // Fetches the upstream item-base HTML page and returns its body, throwing on a non-2xx response. Used by main when not in --local mode.
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

function decode(s) {
  // Decodes a small set of HTML entities back into their literal characters. Used by every cell parser before the value is exposed.
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function parseTables(html) {
  // Splits a full HTML page into the inner contents of every `<table>` element. Used by main to walk each item-base table on the page.
  const tables = []
  const re = /<table[^>]*>([\s\S]*?)<\/table>/g
  let m
  while ((m = re.exec(html)) !== null) tables.push(m[1])
  return tables
}

function parseRows(table) {
  // Splits a `<table>` body into the inner contents of every `<tr>` element. Used by main inside each base table.
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
  // Splits a `<tr>` row into the inner contents of every `<td>` cell, after stripping any embedded `<style>` blocks. Used by main to extract base columns.
  const clean = stripStyles(row)
  const cells = []
  const re = /<td[^>]*>([\s\S]*?)<\/td>/g
  let m
  while ((m = re.exec(clean)) !== null) cells.push(m[1].trim())
  return cells
}

function parseStatsCell(html) {
  // Extracts every `<span title="Tier">…</span><span title="Range">…</span>` pair from a stats cell into an array of `{ tier, range }` strings. Used by parseWeaponRow and parseArmorRow to grab the per-tier number ranges.
  const out = []
  const re =
    /<span title="Tier">([^<]+)<\/span><span title="Range">([^<]+)<\/span>/g
  let m
  while ((m = re.exec(html)) !== null) {
    out.push({ tier: decode(m[1]).trim(), range: decode(m[2]).trim() })
  }
  return out
}

function parseRange(str) {
  // Parses a "min-max" string into a `[min, max]` tuple, returning null on empty / TBD / unparseable inputs. Used by parseWeaponRow and parseArmorRow.
  if (!str || str === 'TBD') return null
  const m = str.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/)
  if (!m) return null
  return [parseFloat(m[1]), parseFloat(m[2])]
}

const SLOT_BY_TYPE = {
  Flask: 'weapon',
  Gun: 'weapon',
  Throwing: 'weapon',
  Spell: 'weapon',
  Dagger: 'weapon',
  Bow: 'weapon',
  Chainsaw: 'weapon',
  Polearm: 'weapon',
  Axe: 'weapon',
  Mace: 'weapon',
  Sword: 'weapon',
  Claw: 'weapon',
  Wand: 'weapon',
  Cane: 'weapon',
  Staff: 'weapon',
  Book: 'weapon',
  Shield: 'offhand',
  Armor: 'armor',
  Belt: 'belt',
  Boots: 'boots',
  Charm: 'relic_1',
  Gloves: 'gloves',
  Helmet: 'helmet',
}

const FILE_BY_SLOT = {
  weapon: 'weapons.base.json',
  offhand: 'shields.base.json',
  armor: 'armors.base.json',
  belt: 'belts.base.json',
  boots: 'boots.base.json',
  gloves: 'gloves.base.json',
  helmet: 'helmets.base.json',
  relic_1: 'charms.base.json',
}

const MAX_SOCKETS_BY_SLOT = {
  weapon: 6,
  offhand: 5,
  armor: 4,
  helmet: 4,
  belt: 3,
  boots: 4,
  gloves: 3,
  relic_1: 0,
}

function itemIdFromGameId(gameId) {
  // Translates an upstream game id (e.g. `normal_axe_1`) into the local item id convention (`base_axe_1`). Used by toItemBase when building each ItemBase entry.
  return gameId.replace(/^normal_/, 'base_')
}

function parseWeaponRow(cells) {
  // Decodes a single weapon-table row into `{ type, gameId, name, aps, hand, damage }` after parsing the embedded stats cell. Used by main to walk the weapon table.
  if (cells.length < 6) return null
  const [type, gameId, name, apsStr, handStr, statsHtml] = cells
  const aps = apsStr && apsStr !== 'TBD' ? parseFloat(apsStr) : null
  const hand = handStr ? parseInt(handStr, 10) : null
  const tiers = parseStatsCell(statsHtml)
  const dmgRange = tiers.length > 0 ? parseRange(tiers[0].range) : null
  return {
    type: decode(type).trim(),
    gameId: decode(gameId).trim(),
    name: decode(name).trim(),
    aps,
    hand: Number.isFinite(hand) ? hand : null,
    damage: dmgRange,
  }
}

function parseArmorRow(cells) {
  // Decodes a single armor-table row into `{ type, gameId, name, defense, block }`. Used by main to walk the armor table.
  if (cells.length < 5) return null
  const [type, gameId, name, defenseHtml, blockStr] = cells
  const tiers = parseStatsCell(defenseHtml)
  const defRange = tiers.length > 0 ? parseRange(tiers[0].range) : null
  const blockM = blockStr && blockStr.match(/(\d+)/)
  const block = blockM ? parseInt(blockM[1], 10) : null
  return {
    type: decode(type).trim(),
    gameId: decode(gameId).trim(),
    name: decode(name).trim(),
    defense: defRange,
    block,
  }
}

function toItemBase(entry) {
  // Converts a parsed weapon / armor row into the ItemBase JSON shape consumed by the app, mapping the type to a slot, generating an id, copying numeric stats, and seeding socket counts from the slot table. Returns null and warns when the type is unrecognised. Used by main once per parsed row.
  const slot = SLOT_BY_TYPE[entry.type]
  if (!slot) {
    console.warn(`Unknown type: ${entry.type} (${entry.name})`)
    return null
  }
  const id = itemIdFromGameId(entry.gameId)
  const out = {
    id,
    name: entry.name,
    baseType: entry.type,
    slot,
    rarity: 'common',
  }
  if ('aps' in entry && entry.aps !== null) out.attackSpeed = entry.aps
  if ('damage' in entry && entry.damage) {
    out.damageMin = entry.damage[0]
    out.damageMax = entry.damage[1]
  }
  if ('defense' in entry && entry.defense) {
    out.defenseMin = entry.defense[0]
    out.defenseMax = entry.defense[1]
  }
  if ('block' in entry && entry.block != null) out.blockChance = entry.block
  if ('hand' in entry && entry.hand != null)
    out.description = entry.hand === 2 ? 'Two-Handed' : 'One-Handed'
  const maxSockets = MAX_SOCKETS_BY_SLOT[slot]
  if (maxSockets && maxSockets > 0) {
    out.sockets = 0
    out.maxSockets = maxSockets
  }
  return out
}

async function main() {
  // Top-level scraper that fetches (or reads `/tmp/bases.html` in --local mode) the upstream HTML, parses the weapon and armor tables into ItemBase records, groups them by slot, and writes one JSON file per slot under `src/data/items/`.
  const useLocal = process.argv.includes('--local')
  const html = useLocal
    ? readFileSync('/tmp/bases.html', 'utf8')
    : await getHtml()

  const tables = parseTables(html)
  if (tables.length < 2) {
    console.error(`Expected 2 tables, found ${tables.length}`)
    process.exit(1)
  }

  const weaponRows = parseRows(tables[0]).slice(1)
  const armorRows = parseRows(tables[1]).slice(1)

  const items = []
  for (const r of weaponRows) {
    const parsed = parseWeaponRow(parseCells(r))
    if (!parsed) continue
    const base = toItemBase(parsed)
    if (base) items.push(base)
  }
  for (const r of armorRows) {
    const parsed = parseArmorRow(parseCells(r))
    if (!parsed) continue
    const base = toItemBase(parsed)
    if (base) items.push(base)
  }

  const bySlot = new Map()
  for (const it of items) {
    const file = FILE_BY_SLOT[it.slot]
    if (!file) continue
    if (!bySlot.has(file)) bySlot.set(file, [])
    bySlot.get(file).push(it)
  }

  mkdirSync(ITEMS_DIR, { recursive: true })
  for (const [file, list] of bySlot) {
    const outPath = join(ITEMS_DIR, file)
    writeFileSync(outPath, JSON.stringify(list, null, 2) + '\n')
    console.log(`Wrote ${list.length} → ${outPath}`)
  }
  console.log(`Total: ${items.length} base items`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
