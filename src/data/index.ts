import type {
  GameConfig,
  CharacterClass,
  Skill,
  TalentTree,
  ItemBase,
  Affix,
  Rune,
  Gem,
  Runeword,
  ItemSet,
  Relic,
  AngelicAugment,
} from '../types'
import affixesJson from './affixes.json'
import gameConfigJson from './game-config.json'
import runewordsJson from './runewords.json'
import setsJson from './sets.json'

export const gameConfig = gameConfigJson as GameConfig

const classModules = import.meta.glob<{ default: CharacterClass }>(
  './classes/*.json',
  { eager: true },
)
const skillModules = import.meta.glob<{ default: Skill[] }>(
  './skills/*.json',
  { eager: true },
)
const talentModules = import.meta.glob<{ default: TalentTree }>(
  './talents/*.json',
  { eager: true },
)
const itemModules = import.meta.glob<{ default: ItemBase[] }>(
  './items/*.json',
  { eager: true },
)
const gemModules = import.meta.glob<{ default: Gem[] }>(
  './gems/*.json',
  { eager: true },
)
const runeModules = import.meta.glob<{ default: Rune[] }>(
  './runes/*.json',
  { eager: true },
)

function collectScalar<T>(modules: Record<string, { default: T }>): T[] {
  return Object.values(modules).map((m) => m.default)
}

function collectFlat<T>(modules: Record<string, { default: T[] }>): T[] {
  return Object.values(modules).flatMap((m) => m.default)
}

export const classes: CharacterClass[] = collectScalar(classModules)
export const skills: Skill[] = collectFlat(skillModules)
export const talentTrees: TalentTree[] = collectScalar(talentModules)
export const items: ItemBase[] = collectFlat(itemModules)
export const gems: Gem[] = collectFlat(gemModules)
export const runes: Rune[] = collectFlat(runeModules)

export const affixes: Affix[] = affixesJson as Affix[]
export const runewords: Runeword[] = runewordsJson as unknown as Runeword[]
export const itemSets: ItemSet[] = setsJson as ItemSet[]
export const relics: Relic[] = []
export const augments: AngelicAugment[] = []

function indexById<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((entry) => [entry.id, entry]))
}

const classIndex = indexById(classes)
const itemIndex = indexById(items)
const gemIndex = indexById(gems)
const runeIndex = indexById(runes)
const runewordIndex = indexById(runewords)
const affixIndex = indexById(affixes)
const itemSetIndex = indexById(itemSets)

const skillsByClassId = new Map<string, Skill[]>()
for (const s of skills) {
  const list = skillsByClassId.get(s.classId)
  if (list) list.push(s)
  else skillsByClassId.set(s.classId, [s])
}

const EMPTY_SKILLS: Skill[] = []

export function getSkillsByClass(classId: string | null): Skill[] {
  if (!classId) return EMPTY_SKILLS
  return skillsByClassId.get(classId) ?? EMPTY_SKILLS
}

export function getClass(id: string): CharacterClass | undefined {
  return classIndex.get(id)
}

export function getItem(id: string): ItemBase | undefined {
  return itemIndex.get(id)
}

export function getGem(id: string): Gem | undefined {
  return gemIndex.get(id)
}

export function getRune(id: string): Rune | undefined {
  return runeIndex.get(id)
}

export function getSocketableById(
  id: string,
): { kind: 'gem'; data: Gem } | { kind: 'rune'; data: Rune } | undefined {
  const gem = getGem(id)
  if (gem) return { kind: 'gem', data: gem }
  const rune = getRune(id)
  if (rune) return { kind: 'rune', data: rune }
  return undefined
}

export function getRuneword(id: string): Runeword | undefined {
  return runewordIndex.get(id)
}

export function getAffix(id: string): Affix | undefined {
  return affixIndex.get(id)
}

export function getItemSet(id: string): ItemSet | undefined {
  return itemSetIndex.get(id)
}

export function detectRuneword(
  base: ItemBase,
  socketed: (string | null)[],
): Runeword | undefined {
  if (base.rarity !== 'common') return undefined
  if (socketed.some((s) => !s)) return undefined
  for (const rw of runewords) {
    if (rw.runes.length !== socketed.length) continue
    if (!rw.allowedBaseTypes.includes(base.baseType)) continue
    let match = true
    for (let i = 0; i < rw.runes.length; i++) {
      if (rw.runes[i] !== socketed[i]) {
        match = false
        break
      }
    }
    if (match) return rw
  }
  return undefined
}
