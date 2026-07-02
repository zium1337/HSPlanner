export type EtherNodeType = 'root' | 'small' | 'big'

export interface EtherNode {
  id: number
  x: number
  y: number
  r: number
  t: EtherNodeType
  icon: string
  key: string
}

export interface EtherNodeStat {
  label: string
  value: string
  desc: string
}

export interface EtherTree {
  viewBox: string
  nodes: EtherNode[]
  edges: [number, number][]
  stats: Record<string, EtherNodeStat>
}
