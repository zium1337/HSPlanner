import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import treeData from '../data/hero-siege-tree.json'
import { useBuild } from '../store/build'
import { ADJ, findPath, START_IDS, START_SET } from '../utils/treeGraph'
import {
  TooltipHeader,
  TooltipSection,
  TooltipText,
  UnsupportedModsList,
} from '../components/Tooltip'
import { TONE_BORDER, TONE_GLOW } from '../components/tooltip-tones'
import type { TooltipTone } from '../components/tooltip-tones'
import {
  classifyNodeLines,
  TREE_NODE_INFO,
  TREE_WARP_IDS,
  type TreeNodeInfo,
} from '../utils/treeStats'

type RawNode = [id: number, x: number, y: number, r: number]
type RawEdge = [x1: number, y1: number, x2: number, y2: number]

interface TreeNode {
  id: number
  x: number
  y: number
  r: number
  tier: 'minor' | 'notable' | 'keystone'
}

function tierTone(nodeType: string | undefined, tier: TreeNode['tier']): TooltipTone {
  if (nodeType === 'jewelry') return 'rare'
  if (nodeType === 'warp') return 'rare'
  if (nodeType === 'root') return 'angelic'
  if (nodeType === 'big' || tier === 'keystone' || tier === 'notable') return 'rare'
  return 'neutral'
}

function tierLabel(nodeType: string | undefined, tier: TreeNode['tier']): string {
  if (nodeType === 'jewelry') return 'Jewelry Socket'
  if (nodeType === 'warp') return 'Warp Node'
  if (nodeType === 'root') return 'Starting Node'
  if (nodeType === 'big') return 'Notable'
  if (tier === 'keystone') return 'Keystone'
  return 'Minor'
}

function classifyTier(r: number): TreeNode['tier'] {
  if (r >= 12) return 'keystone'
  if (r >= 10) return 'notable'
  return 'minor'
}

const VIEW_BOX = treeData.viewBox
const NODES: TreeNode[] = (treeData.nodes as RawNode[]).map(([id, x, y, r]) => ({
  id,
  x,
  y,
  r,
  tier: classifyTier(r),
}))
const EDGES: RawEdge[] = treeData.edges as RawEdge[]

const [vbX = 0, vbY = 0, vbW = 1000, vbH = 800] = VIEW_BOX.split(' ').map(Number)

const POS_ID_MAP = (() => {
  const m = new Map<string, number>()
  for (const n of NODES) {
    m.set(`${Math.round(n.x * 10)}_${Math.round(n.y * 10)}`, n.id)
  }
  return m
})()

const SEARCH_INDEX: { id: number; haystack: string }[] = Object.entries(
  TREE_NODE_INFO,
).map(([id, info]) => ({
  id: Number(id),
  haystack: (info.t + ' ' + info.l.join(' ')).toLowerCase(),
}))

interface NodePaint {
  isAlloc: boolean
  isHover: boolean
  isPreview: boolean
  isStart: boolean
  tier: TreeNode['tier']
}

function nodeFill({ isAlloc, isPreview, isStart, tier }: NodePaint): string {
  if (isAlloc) return tier === 'keystone' ? '#e94f37' : '#c9a55a'
  if (isPreview) return '#5a4528'
  if (isStart) return '#3a3528'
  return '#1c1d24'
}

function baseStrokeWidth(isStart: boolean, tier: TreeNode['tier']): number {
  if (isStart) return 2.5
  if (tier === 'minor') return 1
  return 2
}

function nodeStroke({
  isAlloc,
  isHover,
  isPreview,
  isStart,
  tier,
}: NodePaint): string {
  if (isAlloc) return '#d4cfbf'
  if (isHover || isPreview) return '#e0b864'
  if (isStart) return '#c9a55a'
  if (tier === 'keystone') return '#8a6f3a'
  if (tier === 'notable') return '#5a5448'
  return '#3a3528'
}

export default function TreeView() {
  const allocated = useBuild((s) => s.allocatedTreeNodes)
  const toggleNode = useBuild((s) => s.toggleTreeNode)
  const resetTree = useBuild((s) => s.resetTreeNodes)

  const [scale, setScale] = useState(0.35)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [viewportSize, setViewportSize] = useState({ w: 1000, h: 800 })
  const [searchQuery, setSearchQuery] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const didDragRef = useRef(false)

  const fitView = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const fitW = rect.width / vbW
    const fitH = rect.height / vbH
    const fit = Math.min(fitW, fitH) * 0.95
    setScale(fit)
    setTx((rect.width - vbW * fit) / 2 - vbX * fit)
    setTy((rect.height - vbH * fit) / 2 - vbY * fit)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setViewportSize({ w: rect.width || 1000, h: rect.height || 800 })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    fitView()
  }, [fitView])

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(5, scale * factor))
    const worldX = (mx - tx) / scale
    const worldY = (my - ty) / scale
    setScale(newScale)
    setTx(mx - worldX * newScale)
    setTy(my - worldY * newScale)
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    setDragging(true)
    didDragRef.current = false
    dragStart.current = { x: e.clientX, y: e.clientY, tx, ty }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging || !dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    if (Math.abs(dx) + Math.abs(dy) > 3) didDragRef.current = true
    setTx(dragStart.current.tx + dx)
    setTy(dragStart.current.ty + dy)
  }

  function onMouseUp() {
    setDragging(false)
  }

  const hoverNode = useMemo(
    () => (hoverId != null ? NODES.find((n) => n.id === hoverId) : null),
    [hoverId],
  )

  const hoverInfo: TreeNodeInfo | null = useMemo(() => {
    if (hoverId == null) return null
    return TREE_NODE_INFO[String(hoverId)] ?? null
  }, [hoverId])

  const previewPath = useMemo(() => {
    if (hoverId == null || allocated.has(hoverId)) return null
    const sources = allocated.size > 0 ? allocated : new Set<number>(START_IDS)
    const path = findPath(sources, hoverId)
    if (!path) return null
    return new Set(path)
  }, [hoverId, allocated])

  const previewEdgeKeys = useMemo(() => {
    if (!previewPath) return null
    const keys = new Set<string>()
    const arr = [...previewPath]
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i]!
      const b = arr[i + 1]!
      keys.add(a < b ? `${a}-${b}` : `${b}-${a}`)
    }
    return keys
  }, [previewPath])

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null
    const matches = new Set<number>()
    for (const entry of SEARCH_INDEX) {
      if (entry.haystack.includes(q)) matches.add(entry.id)
    }
    const idQuery = q.replace(/^#/, '')
    if (/^\d+$/.test(idQuery)) {
      for (const n of NODES) {
        if (String(n.id).includes(idQuery)) matches.add(n.id)
      }
    }
    return matches
  }, [searchQuery])

  const nodeCircles = useMemo(
    () =>
      NODES.map((n) => {
        const paint: NodePaint = {
          isAlloc: allocated.has(n.id),
          isHover: false,
          isPreview: previewPath?.has(n.id) ?? false,
          isStart: START_SET.has(n.id),
          tier: n.tier,
        }
        return (
          <circle
            key={n.id}
            cx={n.x}
            cy={n.y}
            r={paint.isStart ? n.r + 3 : n.r}
            fill={nodeFill(paint)}
            stroke={nodeStroke(paint)}
            strokeWidth={baseStrokeWidth(paint.isStart, n.tier)}
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => {
              setHoverId(n.id)
              setHoverPos({ x: e.clientX, y: e.clientY })
            }}
            onMouseMove={(e) => {
              setHoverPos({ x: e.clientX, y: e.clientY })
            }}
            onMouseLeave={() => {
              setHoverId((cur) => (cur === n.id ? null : cur))
              setHoverPos(null)
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (didDragRef.current) {
                didDragRef.current = false
                return
              }
              toggleNode(n.id)
            }}
          />
        )
      }),
    [allocated, previewPath, toggleNode],
  )

  const matchOverlay = useMemo(() => {
    if (!searchMatches) return null
    return NODES.filter((n) => searchMatches.has(n.id)).map((n) => (
      <circle
        key={`match-${n.id}`}
        cx={n.x}
        cy={n.y}
        r={n.r + 4}
        fill="none"
        stroke="#e0b864"
        strokeWidth={3}
      />
    ))
  }, [searchMatches])

  const allocatedEdgeKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const id of allocated) {
      for (const nb of ADJ.get(id) ?? []) {
        if (allocated.has(nb)) {
          keys.add(id < nb ? `${id}-${nb}` : `${nb}-${id}`)
        }
      }
    }
    return keys
  }, [allocated])

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden"
        style={{
          cursor: dragging ? 'grabbing' : 'grab',
          background:
            'radial-gradient(ellipse at 50% 50%, #14151c 0%, #0a0b0f 80%)',
        }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <svg
          width="100%"
          height="100%"
          style={{ display: 'block' }}
          viewBox={`0 0 ${viewportSize.w} ${viewportSize.h}`}
        >
          <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
            <g>
              {EDGES.map(([x1, y1, x2, y2], i) => {
                let stroke = '#2a2f3a'
                let strokeWidth = 1.5
                const ka = `${Math.round(x1 * 10)}_${Math.round(y1 * 10)}`
                const kb = `${Math.round(x2 * 10)}_${Math.round(y2 * 10)}`
                const idA = POS_ID_MAP.get(ka)
                const idB = POS_ID_MAP.get(kb)
                if (idA != null && idB != null) {
                  if (TREE_WARP_IDS.has(idA) && TREE_WARP_IDS.has(idB)) return null
                  const key = idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`
                  if (allocatedEdgeKeys.has(key)) {
                    stroke = '#c48a3a'
                    strokeWidth = 2.5
                  } else if (previewEdgeKeys?.has(key)) {
                    stroke = '#8a6a2a'
                    strokeWidth = 2
                  }
                }
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                  />
                )
              })}
            </g>
            <g style={{ opacity: searchMatches ? 0.25 : 1 }}>{nodeCircles}</g>
            {matchOverlay && <g pointerEvents="none">{matchOverlay}</g>}
          </g>
        </svg>
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      <div className="pointer-events-none absolute inset-x-3.5 top-2.5 z-10 flex items-start justify-between gap-3">
        <div className="pointer-events-auto inline-flex items-center gap-4 rounded-[3px] border border-border bg-panel/85 px-3 py-1.5 text-[11px] text-muted backdrop-blur-sm">
          <span>
            Nodes:{' '}
            <span className="font-mono font-medium text-text">{NODES.length}</span>
          </span>
          <span>
            Allocated:{' '}
            <span className="font-mono font-medium text-accent-hot">
              {allocated.size}
            </span>
          </span>
          {hoverNode && (
            <span>
              Hover:{' '}
              <span className="font-mono font-medium text-text">
                #{hoverNode.id}
              </span>{' '}
              <span className="text-faint">({hoverNode.tier})</span>
            </span>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes or #id..."
              data-search-input
              className="w-56 rounded-[3px] border border-border bg-panel/85 backdrop-blur-sm px-3 py-1.5 pr-14 text-xs text-text placeholder:text-faint transition-colors focus:border-accent-deep focus:outline-none"
            />
            {searchQuery && (
              <>
                <span className="pointer-events-none absolute right-7 top-1/2 -translate-y-1/2 font-mono text-[10px] text-accent-hot">
                  {searchMatches?.size ?? 0}
                </span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[2px] px-1.5 text-xs text-faint hover:text-accent-hot"
                  aria-label="Clear search"
                >
                  ×
                </button>
              </>
            )}
          </div>
          <button
            onClick={resetTree}
            className="rounded-[3px] border border-border bg-panel-2/85 backdrop-blur-sm px-3 py-1.5 text-xs text-text transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Reset
          </button>
          <button
            onClick={fitView}
            className="rounded-[3px] border border-border bg-panel-2/85 backdrop-blur-sm px-3 py-1.5 text-xs text-text transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Fit
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3.5 right-3.5 z-10 rounded-[3px] border border-border bg-panel/85 backdrop-blur-sm px-2.5 py-1 font-mono text-[11px] text-muted">
        Zoom: <span className="text-text">{(scale * 100).toFixed(0)}%</span>
      </div>

      {hoverNode && hoverPos && !dragging &&
        createPortal(
          <NodeTooltip
            node={hoverNode}
            info={hoverInfo}
            cursor={hoverPos}
          />,
          document.body,
        )}
    </div>
  )
}

function NodeTooltip({
  node,
  info,
  cursor,
}: {
  node: TreeNode
  info: TreeNodeInfo | null
  cursor: { x: number; y: number }
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const tone = tierTone(info?.n, node.tier)
  const tierName = tierLabel(info?.n, node.tier)
  const lineGroups = useMemo(
    () => (info ? classifyNodeLines(info.l) : null),
    [info],
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 12
    const offset = 16
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = cursor.x + offset
    if (left + rect.width + margin > vw) left = cursor.x - rect.width - offset
    left = Math.max(margin, Math.min(left, vw - rect.width - margin))
    let top = cursor.y + offset
    if (top + rect.height + margin > vh) top = cursor.y - rect.height - offset
    top = Math.max(margin, Math.min(top, vh - rect.height - margin))
    setPos({ left, top })
  }, [cursor.x, cursor.y, info, node.id])

  return (
    <div
      ref={ref}
      role="tooltip"
      className={`fixed z-[1000] min-w-[240px] max-w-[360px] bg-panel border ${TONE_BORDER[tone]} ${TONE_GLOW[tone]} rounded-[4px] overflow-hidden pointer-events-none select-none shadow-[0_8px_32px_rgba(0,0,0,0.8)]`}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        opacity: pos ? 1 : 0,
        transition: 'opacity 80ms ease-out',
      }}
    >
      <TooltipHeader
        title={info?.t ?? `Node #${node.id}`}
        subtitle={tierName}
        tone={tone}
      />
      {lineGroups && lineGroups.parsed.length > 0 && (
        <TooltipSection>
          <div className="space-y-0.5">
            {lineGroups.parsed.map((p, i) => (
              <TooltipText key={i}>{p.line}</TooltipText>
            ))}
          </div>
        </TooltipSection>
      )}
      {lineGroups && lineGroups.unsupported.length > 0 && (
        <TooltipSection>
          <UnsupportedModsList lines={lineGroups.unsupported} />
        </TooltipSection>
      )}
      {info && info.g && info.g.length > 0 && (
        <TooltipSection className="bg-panel-2/40">
          <div className="flex flex-wrap gap-1">
            {info.g.map((tag, i) => (
              <span
                key={i}
                className="inline-block rounded-[2px] border border-border-2 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        </TooltipSection>
      )}
      {!info && (
        <TooltipSection>
          <TooltipText>
            <span className="text-faint">No data available</span>
          </TooltipText>
        </TooltipSection>
      )}
    </div>
  )
}
