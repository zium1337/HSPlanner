import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import treeBackground from '../assets/atlas/Incarnation_Background.png'
import nodeIconsMap from '../data/node-icons.json'
import treeData from '../data/hero-siege-tree.json'
import { getAffix, getGem, getRune } from '../data'
import { useBuild } from '../store/build'
import { ADJ, findPath, START_IDS, START_SET } from '../utils/treeGraph'
import { formatValue, rolledAffixValue, statName } from '../utils/stats'
import JewelSocketModal from '../components/JewelSocketModal'
import {
  TooltipHeader,
  TooltipSection,
  TooltipSectionHeader,
  TooltipText,
  UnsupportedModsList,
} from '../components/Tooltip'
import { TONE_BORDER, TONE_GLOW } from '../components/tooltip-tones'
import type { TooltipTone } from '../components/tooltip-tones'
import type { TreeSocketContent } from '../types'
import {
  classifyNodeLines,
  TREE_JEWELRY_IDS,
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
  // Returns the tooltip tone (which drives the rarity-coloured border / glow / text colours) for a tree node based on its type and tier. Used by NodeTooltip and the TreeView renderer.
  if (nodeType === 'jewelry') return 'rare'
  if (nodeType === 'warp') return 'rare'
  if (nodeType === 'root') return 'angelic'
  if (nodeType === 'big' || tier === 'keystone' || tier === 'notable') return 'rare'
  return 'neutral'
}

function tierLabel(nodeType: string | undefined, tier: TreeNode['tier']): string {
  // Returns a human-readable label ("Notable", "Keystone", "Warp", etc.) for the given tree node type/tier. Used by NodeTooltip's subtitle.
  if (nodeType === 'jewelry') return 'Jewelry Socket'
  if (nodeType === 'warp') return 'Warp Node'
  if (nodeType === 'root') return 'Starting Node'
  if (nodeType === 'big') return 'Notable'
  if (tier === 'keystone') return 'Keystone'
  return 'Minor'
}

function classifyTier(r: number): TreeNode['tier'] {
  // Maps a node's radius (from the precomputed tree JSON) to one of the named tiers (`minor`, `notable`, `keystone`, etc.). Used while indexing the tree-node table at module load.
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

const NODE_ICON_FILES = import.meta.glob<string>(
  '../assets/atlas/nodes/*.png',
  { eager: true, query: '?url', import: 'default' },
)
const NODE_ICON_URL_BY_KEY: Record<string, string> = {}
for (const [p, url] of Object.entries(NODE_ICON_FILES)) {
  const file = p.split('/').pop() ?? ''
  const key = file.replace(/\.png$/i, '')
  NODE_ICON_URL_BY_KEY[key] = url
}

const NODE_ICON_KEY_BY_ID = nodeIconsMap as Record<string, string>
const NODE_ICONS: { id: number; x: number; y: number; r: number; href: string }[] =
  NODES.flatMap((n) => {
    const key = NODE_ICON_KEY_BY_ID[String(n.id)]
    const href = key ? NODE_ICON_URL_BY_KEY[key] : undefined
    return href ? [{ id: n.id, x: n.x, y: n.y, r: n.r, href }] : []
  })

const JEWELRY_NODES = NODES.filter((n) => TREE_JEWELRY_IDS.has(n.id))

interface NodePaint {
  isAlloc: boolean
  isHover: boolean
  isPreview: boolean
  isStart: boolean
  tier: TreeNode['tier']
}

function nodeFill({ isAlloc, isPreview, isStart, tier }: NodePaint): string {
  // Returns the SVG fill colour for a tree node based on whether it is allocated, currently being previewed, a start node, and its tier. Used by the TreeView SVG renderer.
  if (isAlloc) return tier === 'keystone' ? '#e94f37' : '#c9a55a'
  if (isPreview) return '#5a4528'
  if (isStart) return '#3a3528'
  return '#1c1d24'
}

function baseStrokeWidth(isStart: boolean, tier: TreeNode['tier']): number {
  // Returns the SVG stroke width to use for a tree node, with start nodes and higher tiers getting a thicker outline. Used by the TreeView renderer.
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
  // Returns the SVG stroke colour for a tree node based on the same paint state used by `nodeFill`. Used by the TreeView renderer to outline nodes consistently with their fill.
  if (isAlloc) return '#d4cfbf'
  if (isHover || isPreview) return '#e0b864'
  if (isStart) return '#c9a55a'
  if (tier === 'keystone') return '#8a6f3a'
  if (tier === 'notable') return '#5a5448'
  return '#3a3528'
}

export default function TreeView() {
  // Top-level Talent Tree view: renders the full Hero Siege passive tree as a pan-and-zoomable SVG with allocated nodes, preview path on hover, search, node tooltips, and click-to-allocate / click-to-deallocate that defers cleanup of orphaned subtrees to the build store.
  const allocated = useBuild((s) => s.allocatedTreeNodes)
  const toggleNode = useBuild((s) => s.toggleTreeNode)
  const resetTree = useBuild((s) => s.resetTreeNodes)
  const treeSocketed = useBuild((s) => s.treeSocketed)
  const setTreeSocketed = useBuild((s) => s.setTreeSocketed)
  const [socketModalNodeId, setSocketModalNodeId] = useState<number | null>(null)

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

  const socketMarks = useMemo(
    () =>
      JEWELRY_NODES.flatMap((n) =>
        treeSocketed[n.id] != null
          ? [
              <circle
                key={`socket-mark-${n.id}`}
                cx={n.x}
                cy={n.y}
                r={n.r + 4}
                fill="none"
                stroke="#ffd66b"
                strokeWidth={2}
                opacity={0.85}
              />,
            ]
          : [],
      ),
    [treeSocketed],
  )

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
              if (TREE_JEWELRY_IDS.has(n.id) && allocated.has(n.id)) {
                setSocketModalNodeId(n.id)
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
    <div className="relative h-full" style={{ backgroundColor: '#0a0b0f' }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `url(${treeBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
      />
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden"
        style={{
          cursor: dragging ? 'grabbing' : 'grab',
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
            <g pointerEvents="none" style={{ opacity: searchMatches ? 0.25 : 1 }}>
              {NODE_ICONS.map((icon) => {
                const size = icon.r * 2
                return (
                  <image
                    key={`icon-${icon.id}`}
                    href={icon.href}
                    x={icon.x - icon.r}
                    y={icon.y - icon.r}
                    width={size}
                    height={size}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ imageRendering: 'pixelated' }}
                  />
                )
              })}
            </g>
            {matchOverlay && <g pointerEvents="none">{matchOverlay}</g>}
            <g pointerEvents="none">{socketMarks}</g>
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

      <div className="pointer-events-none absolute right-3.5 top-3 z-10 flex items-start gap-1.5">
        <div className="pointer-events-auto relative">
          <svg
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes or #id…"
            data-search-input
            className="w-64 rounded-[3px] border border-border-2 px-3 py-1.5 pl-9 pr-14 font-mono text-[11px] text-text placeholder:text-faint transition-colors focus:border-accent-deep focus:outline-none focus:ring-2 focus:ring-accent-hot/15"
            style={{
              background:
                'linear-gradient(180deg, #0d0e12, var(--color-panel-2))',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
            }}
          />
          {searchQuery && (
            <>
              <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.14em] text-accent-hot">
                {searchMatches?.size ?? 0}
              </span>
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[2px] px-1 font-mono text-[12px] text-faint transition-colors hover:text-accent-hot"
                aria-label="Clear search"
              >
                ×
              </button>
            </>
          )}
        </div>
        <button
          onClick={fitView}
          className="pointer-events-auto rounded-[3px] border border-border-2 bg-panel-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
        >
          Fit
        </button>
        <button
          onClick={resetTree}
          className="pointer-events-auto rounded-[3px] border border-border-2 bg-transparent px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-stat-red hover:text-stat-red"
        >
          Reset
        </button>
      </div>

      <div
        className="pointer-events-none absolute bottom-3.5 left-3.5 z-10 inline-flex items-center gap-3 rounded-[3px] border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-panel-2) 80%, transparent), color-mix(in srgb, var(--color-bg) 70%, transparent))',
          backdropFilter: 'blur(6px)',
          boxShadow:
            'inset 0 1px 0 rgba(201,165,90,0.06), 0 4px 16px rgba(0,0,0,0.45)',
        }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-1 w-1 rotate-45 bg-accent-deep"
          />
          Nodes
          <span className="text-text">{NODES.length}</span>
        </span>
        <span aria-hidden className="h-3 w-px bg-border" />
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-1 w-1 rotate-45 bg-accent-hot"
            style={{ boxShadow: '0 0 6px rgba(224,184,100,0.6)' }}
          />
          Allocated
          <span className="text-accent-hot">{allocated.size}</span>
        </span>
        <span aria-hidden className="h-3 w-px bg-border" />
        <span className="inline-flex items-center gap-1.5">
          Zoom
          <span className="text-accent-hot">
            {(scale * 100).toFixed(0)}%
          </span>
        </span>
        {hoverNode && (
          <>
            <span aria-hidden className="h-3 w-px bg-border" />
            <span className="inline-flex items-center gap-1.5">
              Hover
              <span className="text-text">#{hoverNode.id}</span>
              <span className="text-faint">· {hoverNode.tier}</span>
            </span>
          </>
        )}
      </div>

      {hoverNode && hoverPos && !dragging &&
        createPortal(
          <NodeTooltip
            node={hoverNode}
            info={hoverInfo}
            cursor={hoverPos}
            socketContent={
              TREE_JEWELRY_IDS.has(hoverNode.id)
                ? treeSocketed[hoverNode.id] ?? null
                : null
            }
            isJewelry={TREE_JEWELRY_IDS.has(hoverNode.id)}
            isAllocated={allocated.has(hoverNode.id)}
          />,
          document.body,
        )}

      {socketModalNodeId != null && (
        <JewelSocketModal
          nodeId={socketModalNodeId}
          current={treeSocketed[socketModalNodeId] ?? null}
          onClose={() => setSocketModalNodeId(null)}
          onApply={(content) => {
            setTreeSocketed(socketModalNodeId, content)
          }}
        />
      )}
    </div>
  )
}

function NodeTooltip({
  node,
  info,
  cursor,
  socketContent,
  isJewelry,
  isAllocated,
}: {
  node: TreeNode
  info: TreeNodeInfo | null
  cursor: { x: number; y: number }
  socketContent: TreeSocketContent | null
  isJewelry: boolean
  isAllocated: boolean
}) {
  // Floating tooltip rendered next to a hovered tree node. Splits the node's text lines into parsed mods (rendered prettily) and unsupported lines (rendered with a "Not Yet Supported" label), shows the tier label, and clamps its position inside the viewport. Used by TreeView whenever the user mouses over a node.
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
      {isJewelry ? (
        <JewelrySocketSection
          content={socketContent}
          isAllocated={isAllocated}
        />
      ) : (
        <>
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
        </>
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

function JewelrySocketSection({
  content,
  isAllocated,
}: {
  content: TreeSocketContent | null
  isAllocated: boolean
}) {
  if (!content) {
    return (
      <TooltipSection>
        <TooltipSectionHeader tone="gold">Socketed</TooltipSectionHeader>
        <TooltipText>
          <span className="text-faint italic">
            Empty socket{isAllocated ? ' — click to insert' : ''}
          </span>
        </TooltipText>
      </TooltipSection>
    )
  }

  let socketedTitle: string
  let socketedSubtitle: string | null = null
  let statLines: { key: string; value: number }[] = []

  if (content.kind === 'item') {
    const source = getGem(content.id) ?? getRune(content.id)
    if (!source) {
      return (
        <TooltipSection>
          <TooltipSectionHeader tone="gold">Socketed</TooltipSectionHeader>
          <TooltipText>
            <span className="text-stat-red">
              unknown socketable: {content.id}
            </span>
          </TooltipText>
        </TooltipSection>
      )
    }
    socketedTitle = source.name
    socketedSubtitle = `T${source.tier}`
    statLines = Object.entries(source.stats)
      .filter(([, v]) => v !== 0)
      .map(([key, value]) => ({ key, value }))
  } else {
    socketedTitle = 'Uncut Jewel'
    socketedSubtitle = `${content.affixes.length} affix${
      content.affixes.length === 1 ? '' : 'es'
    }`
    statLines = content.affixes
      .map((eq) => {
        const def = getAffix(eq.affixId)
        if (!def || !def.statKey) return null
        const value = rolledAffixValue(def, eq.roll)
        if (value === 0) return null
        return { key: def.statKey, value }
      })
      .filter((x): x is { key: string; value: number } => x !== null)
  }

  return (
    <>
      <TooltipSection>
        <TooltipSectionHeader tone="gold" trailing={socketedSubtitle}>
          Socketed
        </TooltipSectionHeader>
        <div className="text-[12px] font-medium text-accent-hot">
          {socketedTitle}
        </div>
      </TooltipSection>
      {statLines.length > 0 && (
        <TooltipSection>
          <TooltipSectionHeader tone="gold">From Sockets</TooltipSectionHeader>
          <ul className="space-y-0.5 text-[12px]">
            {statLines.map(({ key, value }) => (
              <li key={key} className="text-accent">
                {formatValue(value, key)} {statName(key)}
              </li>
            ))}
          </ul>
        </TooltipSection>
      )}
    </>
  )
}
