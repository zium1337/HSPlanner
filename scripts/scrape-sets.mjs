#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(__dirname)
const OUT_PATH = join(ROOT, 'src/data/sets.json')
const GAME_CONFIG_PATH = join(ROOT, 'src/data/game-config.json')
const SOURCE_URL = 'https://hero-siege-helper.vercel.app/items/sets'

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
    .replace(/&nbsp;/g, ' ')
}

function flatten(html) {
  const noStyles = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
  const piped = noStyles.replace(/<[^>]+>/g, '|')
  return decode(piped).replace(/\|+/g, '|').replace(/^\||\|$/g, '')
}

const gameConfig = JSON.parse(readFileSync(GAME_CONFIG_PATH, 'utf8'))
const STAT_NAMES = gameConfig.stats
  .map((s) => ({
    key: s.key,
    nameNorm: s.name.toLowerCase().replace(/^to\s+/, '').trim(),
    format: s.format,
  }))
  .sort((a, b) => b.nameNorm.length - a.nameNorm.length)

const MANUAL = {
  'flat physical damage': 'additive_physical_damage',
  'flat fire damage': 'flat_fire_skill_damage',
  'flat cold damage': 'flat_cold_skill_damage',
  'flat lightning damage': 'flat_lightning_skill_damage',
  'flat poison damage': 'flat_poison_skill_damage',
  'flat arcane damage': 'flat_arcane_skill_damage',
  'additive poison damage': 'additive_poison_damage',
  'additive fire damage': 'additive_fire_damage',
  'additive cold damage': 'additive_cold_damage',
  'additive lightning damage': 'additive_lightning_damage',
  'additive arcane damage': 'additive_arcane_damage',
  'additive physical damage': 'additive_physical_damage',
  'increased attack speed': 'increased_attack_speed',
  'increased experience gain': 'experience_gain',
  'increased movement speed': 'movement_speed',
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
  'maximum fire resist': 'fire_resistance',
  'maximum cold resist': 'cold_resistance',
  'maximum lightning resist': 'max_lightning_resistance',
  'maximum poison resist': 'poison_resistance',
  'maximum arcane resist': 'arcane_resistance',
  'enhanced damage': 'enhanced_damage',
  'enhanced defense': 'enhanced_defense',
  'attack damage': 'attack_damage',
  'critical strike damage': 'crit_damage',
  'chance for critical strike': 'crit_chance',
  'magic find': 'magic_find',
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
  'replenish life': 'life_replenish_pct',
  'replenish mana': 'mana_replenish_pct',
  'light radius': 'light_radius',
  'skill haste': 'skill_haste',
  'cooldown recovery': 'skill_haste',
  'physical damage taken reduced': 'physical_damage_reduction',
  'magic damage taken reduced': 'magic_damage_reduction',
}

function guessStatKey(desc) {
  const norm = desc
    .toLowerCase()
    .replace(/^[+-]/, '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\([^)]+\)/g, ' ')
    .replace(/\d+(\.\d+)?/g, ' ')
    .replace(/%/g, ' ')
    .replace(/\bincreased\b|\bby\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^to\s+/, '')
    .trim()
  if (MANUAL[norm]) return MANUAL[norm]
  for (const s of STAT_NAMES) {
    if (norm === s.nameNorm) return s.key
  }
  for (const s of STAT_NAMES) {
    if (norm.includes(s.nameNorm) || s.nameNorm.includes(norm)) return s.key
  }
  return null
}

function parseStatLine(line) {
  const desc = line.trim()
  const sign = desc.startsWith('-') ? '-' : '+'
  const isPct = /%/.test(desc)
  const m = desc.match(/-?\d+(?:\.\d+)?/)
  const value = m ? parseFloat(m[0]) : null
  const statKey = guessStatKey(desc)
  return {
    description: desc,
    statKey,
    sign,
    format: isPct ? 'percent' : 'flat',
    value,
  }
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

const SLOT_TOKENS = new Set([
  'Amulet',
  'Ring',
  'Belt',
  'Boots',
  'Gloves',
  'Helmet',
  'Shield',
  'Body Armor',
  'Armor',
  'Charm',
  'Weapon',
  'Mace',
  'Sword',
  'Axe',
  'Bow',
  'Wand',
  'Gun',
  'Book',
  'Staff',
  'Polearm',
  'Dagger',
  'Claw',
  'Flask',
  'Throwing',
  'Chainsaw',
  'Cane',
  'Spell',
  'Spellblade',
  'Potion',
  'Gem',
])

const KNOWN_SETS = [
  "Gurag's Fury",
  "Death's Toll",
  "Anubi's Eternal Life",
  "Damien's Legacy",
  "Genji's Battle Gear",
  "Satan's Curse",
  "Mevius' Eye of Chaos",
  "Tal's Reaping",
  "Thunder God's Wrath",
  "Stickman Steve's Destruction",
  "Redneck's Work Gear",
  "Lumberjack's Forestry Gear",
  "Black Beard's Remains",
  "Plunderer's Ensemble",
  "Death Lord's Legacy",
  "Venom's Frame",
  "Thor's Thunder Hammer",
  "Justiciar's Thunder Raiment",
  "Viking's Demise",
  "Shield Bearer's Sanctuary",
  "Elder of Mos'Arathim",
  "Vagabond's Rags",
  "Marksman's Hunting Gear",
  "Engineer's Combat Gear",
  "Nobunaga's Empire",
  "Master's Legacy",
  "Juggernaut's Rampart",
  "Gladiator's Glory",
  "Doctor's Medkit",
  "Blood-letter's Armament",
  "Dante's Nightmare",
  "Gabriel's Devotion",
  "The Holy One",
  "Demon Hunter's Ensemble",
  "Sage's Apparel",
  "Grey Mage's Regalia",
  "Champion's Valor",
  "Zealot's prophecy",
  "Temporal Mastery",
  "Ymir's Wisdom",
  "Valkyrie's Battle Gear",
  "Flames of the Apocalypse",
  "Flames of Divinity",
  "Guardian of the Sun Temple",
  "Guardian's of the Sands",
  "Bone Conjurer's Regalia",
  "Wall of God",
  "Abomination's Defiled Organs",
  "Arc's Blessed Faith",
  "Aztec's Mystery",
  "Demolition Expert",
  "Traveler",
  "God of the Elements",
  "Uabel's Majesty",
  "Satan's Redemption",
  "Shield Bearer's Sanctuary",
]

async function main() {
  const useLocal = process.argv.includes('--local')
  const html = useLocal
    ? readFileSync('/tmp/sets.html', 'utf8')
    : await getHtml()

  const text = flatten(html)

  const knownSorted = [...new Set(KNOWN_SETS)].sort((a, b) => b.length - a.length)
  const positions = []
  for (const name of knownSorted) {
    let idx = 0
    while ((idx = text.indexOf(name, idx)) !== -1) {
      const prevOk = idx === 0 || text[idx - 1] === '|'
      const after = text.slice(idx + name.length, idx + name.length + 3)
      if (prevOk && after === '|(|') {
        positions.push({ idx, name })
      }
      idx += name.length
    }
  }
  positions.sort((a, b) => a.idx - b.idx)
  const seen = new Set()
  const uniquePositions = []
  for (const p of positions) {
    if (seen.has(p.idx)) continue
    seen.add(p.idx)
    uniquePositions.push(p)
  }

  const sets = []
  for (let i = 0; i < uniquePositions.length; i++) {
    const { idx, name } = uniquePositions[i]
    const end =
      i + 1 < uniquePositions.length
        ? uniquePositions[i + 1].idx
        : text.length
    const block = text.slice(idx, end)
    const tokens = block.split('|').map((t) => t.trim()).filter(Boolean)
    if (tokens[0] !== name) continue
    const items = []
    let j = 1
    while (j < tokens.length) {
      if (
        tokens[j] === '(' &&
        SLOT_TOKENS.has(tokens[j + 1]) &&
        tokens[j + 2] === ')'
      ) {
        const slotName = tokens[j + 1]
        const itemName = tokens[j + 3]
        if (itemName) items.push({ slot: slotName, name: itemName })
        j += 4
      } else {
        break
      }
    }
    const bonusTokens = tokens.slice(j)
    const statMap = {}
    const descriptions = []
    for (const line of bonusTokens) {
      if (!line) continue
      descriptions.push(line)
      const parsed = parseStatLine(line)
      if (parsed.statKey && parsed.value !== null) {
        const signed = parsed.sign === '-' ? -parsed.value : parsed.value
        statMap[parsed.statKey] = (statMap[parsed.statKey] ?? 0) + signed
      }
    }
    sets.push({
      id: slugify(name),
      name,
      items: items.map((p) => ({
        slot: p.slot,
        name: p.name,
        itemId: slugify(p.name),
      })),
      bonuses: [
        {
          pieces: items.length,
          stats: statMap,
          descriptions,
        },
      ],
    })
  }

  writeFileSync(OUT_PATH, JSON.stringify(sets, null, 2) + '\n')
  const withStats = sets.filter(
    (s) => Object.keys(s.bonuses[0].stats).length > 0,
  ).length
  console.log(
    `Wrote ${sets.length} sets → ${OUT_PATH} (${withStats} with mapped stats)`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
