import { AnimatePresence, motion } from 'framer-motion'
import { MousePointerClick, RotateCcw, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import { forceCollide } from 'd3-force-3d'
import type { NodeKind } from '../../shared/types'
import { buildGraph, confidenceColor, effectiveConfidence, KIND_COLOR, KIND_LABEL, neighbors, type GLink, type GNode } from '../graph'
import { useWorkspace } from '../store'

const ORBIT: Record<NodeKind, number> = {
  claim: 95, evidence: 210, assumption: 210, limitation: 260, method: 300, equation: 300, citation: 380,
}

const REL_COLOR: Record<string, string> = {
  supports: '#34d399', assumes: '#fbbf24', uses: '#60a5fa', derives: '#f472b6',
  limits: '#f87171', builds_on: '#94a3b8', contradicts: '#ef4444', leads_to: '#a78bfa',
}

const id = (x: string | GNode) => (typeof x === 'string' ? x : x.id)

// Pulls each kind of node onto its own orbit around the claims.
function orbitForce(strength = 0.06) {
  let nodes: GNode[] = []
  const force = (alpha: number) => {
    for (const n of nodes as (GNode & { vx: number; vy: number })[]) {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.vx)) continue
      const r = ORBIT[n.kind]
      const d = Math.hypot(n.x!, n.y!) || 1
      const k = ((r - d) / d) * alpha * strength
      n.vx += n.x! * k
      n.vy += n.y! * k
    }
  }
  force.initialize = (ns: GNode[]) => { nodes = ns }
  return force
}

export default function KnowledgeGraph() {
  const ws = useWorkspace()
  const { analysis, selected, select, cascade, broken, overrides, toggleBroken } = ws
  const fg = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [hover, setHover] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<NodeKind>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const cascadeStart = useRef(0)
  const prevBroken = useRef<Set<string>>(new Set(broken)) // don't re-toast on remount

  const full = useMemo(() => buildGraph(analysis), [analysis])
  const data = useMemo(() => {
    const nodes = full.nodes.filter(n => !hidden.has(n.kind))
    const keep = new Set(nodes.map(n => n.id))
    return { nodes, links: full.links.filter(l => keep.has(id(l.source)) && keep.has(id(l.target))) }
  }, [full, hidden])
  const byId = useMemo(() => new Map(full.nodes.map(n => [n.id, n])), [full])

  const focus = hover ?? selected
  const lit = useMemo(() => (focus ? neighbors(full.links, focus) : null), [focus, full.links])

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(box.current!)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const g = fg.current
    if (!g) return
    g.d3Force('charge')?.strength(-140)
    g.d3Force('orbit', orbitForce() as never)
    g.d3Force('collide', forceCollide<GNode>(n => (n.kind === 'claim' ? 34 : 16)) as never)
    const link = g.d3Force('link') as unknown as { distance: (fn: (l: GLink) => number) => void } | undefined
    link?.distance((l: GLink) => (l.relation === 'builds_on' ? 120 : 80))
    const t = setTimeout(() => g.zoomToFit(900, 60), 1600)
    return () => clearTimeout(t)
  }, [])

  const fitted = useRef(false)

  // Fly to the selected node.
  useEffect(() => {
    const n = selected ? byId.get(selected) : null
    if (n?.x != null && fg.current) {
      fg.current.centerAt(n.x, n.y, 800)
      fg.current.zoom(2.1, 800)
    }
  }, [selected, byId])

  // Cascade bookkeeping + toast.
  useEffect(() => {
    const added = [...broken].filter(b => !prevBroken.current.has(b))
    prevBroken.current = new Set(broken)
    if (!added.length) return
    cascadeStart.current = performance.now()
    const hit = analysis.claims.filter(c => !broken.has(c.id) && (cascade.damage.get(c.id) ?? 0) > 0.3).length
    setToast(`${byId.get(added[0])?.label ?? added[0]} falls → ${hit} claim${hit === 1 ? '' : 's'} destabilized`)
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [broken, cascade, analysis.claims, byId])

  const claimById = useMemo(() => new Map(analysis.claims.map(c => [c.id, c])), [analysis])

  const draw = (node: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return
    const now = performance.now()
    const color = KIND_COLOR[node.kind]
    const isBroken = broken.has(node.id)
    const depth = cascade.depth.get(node.id) ?? 0
    const reveal = Math.min(1, Math.max(0, (now - cascadeStart.current - depth * 380) / 450))
    const dmg = (cascade.damage.get(node.id) ?? 0) * (isBroken ? 1 : reveal)
    const dim = lit && !lit.has(node.id) ? 0.12 : 1
    const claim = claimById.get(node.id)
    let r = node.kind === 'claim' ? (node.central ? 13 : 10) : node.kind === 'citation' ? 4.5 : 6.5
    if (node.id === selected) r *= 1.25
    const x = node.x!, y = node.y!

    ctx.globalAlpha = dim
    // Glow + body, tinted red by damage.
    const body = dmg > 0.05 ? mix(color, '#ef4444', dmg) : color
    const grad = ctx.createRadialGradient(x - r / 3, y - r / 3, r / 6, x, y, r)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.25, body)
    grad.addColorStop(1, shade(body, -0.35))
    ctx.shadowColor = body
    ctx.shadowBlur = node.id === selected || node.id === hover ? 30 : 14
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0

    // Claims carry a confidence ring.
    if (claim) {
      const conf = effectiveConfidence(overrides[node.id] ?? claim.confidence, isBroken ? 1 : dmg)
      ctx.lineWidth = 2.5
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = confidenceColor(conf)
      ctx.beginPath(); ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * conf) / 100); ctx.stroke()
    }

    // Shockwave as the cascade reaches this node; steady pulse while broken.
    if (dmg > 0.05 && reveal < 1 && !isBroken) {
      ctx.strokeStyle = `rgba(239,68,68,${1 - reveal})`
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(x, y, r + 26 * reveal, 0, Math.PI * 2); ctx.stroke()
    }
    if (isBroken) {
      const p = (now % 1400) / 1400
      ctx.strokeStyle = `rgba(239,68,68,${0.9 - p * 0.9})`
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(x, y, r + 6 + p * 16, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(x - r * 0.45, y - r * 0.45); ctx.lineTo(x + r * 0.45, y + r * 0.45)
      ctx.moveTo(x + r * 0.45, y - r * 0.45); ctx.lineTo(x - r * 0.45, y + r * 0.45)
      ctx.stroke()
    }

    // Labels: claims always; others when zoomed or in focus.
    const showLabel = node.kind === 'claim' || scale > 1.7 || (lit?.has(node.id) ?? false)
    if (showLabel) {
      const fs = Math.max(10 / scale, node.kind === 'claim' ? 4.2 : 3.4)
      ctx.font = `${node.kind === 'claim' ? 600 : 500} ${fs}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const label = node.kind === 'claim' ? node.label : node.label.length > 30 ? node.label.slice(0, 29) + '…' : node.label
      const ty = y + r + (claim ? 7 : 3)
      ctx.lineWidth = 3 / scale + 1.5
      ctx.strokeStyle = 'rgba(5,6,13,0.85)'
      ctx.strokeText(label, x, ty)
      ctx.fillStyle = dmg > 0.3 ? '#fca5a5' : node.kind === 'claim' ? '#f5f3ff' : 'rgba(226,232,240,0.85)'
      ctx.fillText(label, x, ty)
    }
    ctx.globalAlpha = 1
  }

  const linkLit = (l: GLink) => !!focus && (id(l.source) === focus || id(l.target) === focus)
  const brokenScore = broken.size

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden">
      <ForceGraph2D
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        autoPauseRedraw={false}
        nodeRelSize={8}
        nodeCanvasObject={(n, ctx, s) => draw(n as GNode, ctx, s)}
        nodePointerAreaPaint={(n, color, ctx) => {
          ctx.fillStyle = color
          ctx.beginPath(); ctx.arc(n.x!, n.y!, (n as GNode).kind === 'claim' ? 16 : 9, 0, Math.PI * 2); ctx.fill()
        }}
        nodeLabel={() => ''}
        onNodeHover={n => { setHover(n ? (n as GNode).id : null); box.current!.style.cursor = n ? 'pointer' : 'grab' }}
        onNodeClick={n => select((n as GNode).id)}
        onNodeRightClick={n => toggleBroken((n as GNode).id)}
        onBackgroundClick={() => select(null)}
        linkColor={l => {
          const lk = l as GLink
          const c = REL_COLOR[lk.relation] ?? '#94a3b8'
          const a = focus ? (linkLit(lk) ? 0.9 : 0.04) : 0.22
          return hexA(c, a)
        }}
        linkWidth={l => (linkLit(l as GLink) ? 2.2 : 0.8)}
        linkLineDash={l => ((l as GLink).relation === 'assumes' ? [3, 2] : (l as GLink).relation === 'contradicts' ? [1, 2] : null)}
        linkCurvature={0.12}
        linkDirectionalParticles={l => (linkLit(l as GLink) ? 4 : (cascade.damage.get(id((l as GLink).source)) ?? 0) > 0.2 ? 3 : 1)}
        linkDirectionalParticleSpeed={l => ((cascade.damage.get(id((l as GLink).source)) ?? 0) > 0.2 ? 0.012 : 0.004)}
        linkDirectionalParticleWidth={l => (linkLit(l as GLink) ? 3 : 1.6)}
        linkDirectionalParticleColor={l => {
          const s = id((l as GLink).source)
          return (cascade.damage.get(s) ?? 0) > 0.2 ? '#ef4444' : KIND_COLOR[byId.get(s)?.kind ?? 'citation']
        }}
        onRenderFramePre={(ctx) => {
          // Orbit guides.
          ctx.save()
          ctx.setLineDash([2, 6])
          for (const r of [190, 280, 360]) {
            ctx.strokeStyle = 'rgba(167,139,250,0.07)'
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
          }
          ctx.restore()
        }}
        onEngineStop={() => { if (!fitted.current && !selected) { fitted.current = true; fg.current?.zoomToFit(800, 50) } }}
        cooldownTime={8000}
        d3VelocityDecay={0.3}
      />

      {/* Hover card */}
      <AnimatePresence>
        {hover && byId.get(hover) && (
          <motion.div key={hover} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass pointer-events-none absolute left-1/2 top-4 max-w-md -translate-x-1/2 rounded-xl px-4 py-2 text-center text-sm">
            <span className="mr-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: KIND_COLOR[byId.get(hover)!.kind] }}>
              {byId.get(hover)!.kind} · {hover}
            </span>
            <span className="text-white/85">{byId.get(hover)!.label}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cascade toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-red-400/40 bg-red-950/80 px-4 py-2 text-sm text-red-100 shadow-[0_0_40px_rgba(239,68,68,0.35)] backdrop-blur">
            <Zap size={15} className="text-red-400" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend / filters */}
      <div className="glass absolute bottom-4 left-4 flex flex-wrap gap-1 rounded-xl p-1.5">
        {(Object.keys(KIND_COLOR) as NodeKind[]).map(k => {
          const off = hidden.has(k)
          const n = full.nodes.filter(x => x.kind === k).length
          if (!n) return null
          return (
            <button key={k} onClick={() => setHidden(h => { const s = new Set(h); if (s.has(k)) s.delete(k); else s.add(k); return s })}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition ${off ? 'opacity-35' : 'hover:bg-white/5'}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[k], boxShadow: off ? 'none' : `0 0 6px ${KIND_COLOR[k]}` }} />
              {KIND_LABEL[k]} <span className="text-white/35">{n}</span>
            </button>
          )
        })}
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-3">
        {brokenScore > 0 && (
          <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} onClick={ws.resetBroken}
            className="flex items-center gap-1.5 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/20">
            <RotateCcw size={13} /> Restore reality ({brokenScore})
          </motion.button>
        )}
        <div className="glass flex items-center gap-2 rounded-xl px-3 py-1.5 text-[11px] text-white/45">
          <MousePointerClick size={13} /> click: inspect · <b className="text-red-300/80">right-click: what if it’s false?</b>
        </div>
      </div>
    </div>
  )
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
function mix(a: string, b: string, t: number) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * (1 + amt))))
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}
