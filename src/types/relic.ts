import type { StatMap } from './game'

export interface Relic {
  id: string
  name: string
  tier: number
  stats: StatMap
  description?: string
}

export interface AngelicAugment {
  id: string
  name: string
  stats: StatMap
  description?: string
}
