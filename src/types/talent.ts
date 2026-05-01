import type { StatMap } from './game'

export type TalentTreeId = 'hero-level' | 'ether' | string

export interface TalentNode {
  id: string
  name: string
  description?: string
  maxRank: number
  effectPerRank?: StatMap
  requires?: string[]
  position?: { x: number; y: number }
}

export interface TalentTree {
  id: TalentTreeId
  name: string
  description?: string
  nodes: TalentNode[]
}
