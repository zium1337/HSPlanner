import type { AttributeKey, SlotKey } from './game'

export type SocketType = 'normal' | 'rainbow'

export interface EquippedAffix {
  affixId: string
  tier: number
  roll: number
}

export interface EquippedItem {
  baseId: string
  affixes: EquippedAffix[]
  socketCount: number
  socketed: (string | null)[]
  socketTypes: SocketType[]
  runewordId?: string
  stars?: number
  forgedMods?: EquippedAffix[]
}

export type Inventory = Partial<Record<SlotKey, EquippedItem>>

export interface Build {
  id: string
  name: string
  classId: string
  level: number
  attributePoints: Record<AttributeKey, number>
  skillRanks: Record<string, number>
  talentRanks: Record<string, number>
  inventory: Inventory
  relicIds: string[]
  augmentIds: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}
