#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(__dirname)
const ITEMS_DIR = join(ROOT, 'src/data/items')
const SOURCE_URL = 'https://hero-siege-helper.vercel.app/data/bases'

async function getHtml() {
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

function decode(s) {
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function parseTables(html) {
  const tables = []
  const re = /<table[^>]*>([\s\S]*?)<\/table>/g
  let m
  while ((m = re.exec(html)) !== null) tables.push(m[1])
  return tables
}

function parseRows(table) {
  const rows = []
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  let m
  while ((m = re.exec(table)) !== null) rows.push(m[1])
  return rows
}

function stripStyles(html) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

function parseCells(row) {
  const clean = stripStyles(row)
  const cells = []
  const re = /<td[^>]*>([\s\S]*?)<\/td>/g
  let m
  while ((m = re.exec(clean)) !== null) cells.push(m[1].trim())
  return cells
}

function parseStatsCell(html) {
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
  return gameId.replace(/^normal_/, 'base_')
}

function parseWeaponRow(cells) {
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
