import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import { KIND_COLOR, KIND_LABEL, kindOf } from '../graph'
import type { NodeKind } from '../../shared/types'
import { Spinner } from './ui'

const STAGES = [
  'Uploading to Gemini', 'Reading the paper', 'Extracting claims', 'Tracing evidence', 'Exposing hidden assumptions',
  'Mapping methodology', 'Parsing equations', 'Hunting limitations', 'Walking the citation graph', 'Wiring the knowledge graph',
  'Igniting the time machine',
]

type BNode = { id: string; kind: NodeKind; born: number; x?: number; y?: number }

// The graph literally grows as Gemini streams out each entity.
export default function Building({ fileName, stage, found }: { fileName: string; stage: string; found: string[] }) {
  const fg = useRef<ForceGraphMethods<BNode> | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [elapsed, setElapsed] = useState(0)
  const [data, setData] = useState<{ nodes: BNode[]; links: { source: string; target: string }[] }>({ nodes: [], links: [] })

  useEffect(() => {
    const t0 = Date.now()
    const i = setInterval(() => setElapsed((Date.now() - t0) / 1000), 100)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(box.current!)
    return () => ro.disconnect()
  }, [])

  // Add newly discovered ids; wire each to a claim so the shape emerges.
  useEffect(() => {
    setData(prev => {
      const have = new Set(prev.nodes.map(n => n.id))
      const fresh = found.filter(id => !have.has(id))
      if (!fresh.length) return prev
      const nodes = [...prev.nodes]
      const links = [...prev.links]
      for (const id of fresh) {
        const kind = kindOf(id)
        const claims = nodes.filter(n => n.kind === 'claim')
        const anchor = kind === 'claim' ? claims[claims.length - 1] : claims[Math.floor(Math.random() * claims.length)]
        const parent = anchor && nodes.find(n => n.id === anchor.id)
        nodes.push({ id, kind, born: Date.now(), x: (parent?.x ?? 0) + Math.random() * 20 - 10, y: (parent?.y ?? 0) + Math.random() * 20 - 10 })
        if (anchor) links.push({ source: anchor.id, target: id })
      }
      return { nodes, links }
    })
  }, [found])

  useEffect(() => {
    fg.current?.d3Force('charge')?.strength(-60)
    const t = setTimeout(() => fg.current?.zoomToFit(600, 80), 300)
    return () => clearTimeout(t)
  }, [data.nodes.length])

  const counts = useMemo(() => {
    const c: Partial<Record<NodeKind, number>> = {}
    for (const n of data.nodes) c[n.kind] = (c[n.kind] ?? 0) + 1
    return c
  }, [data.nodes])

  const current = Math.max(0, STAGES.indexOf(stage))

  return (
    <div className="relative flex h-full">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_50%,rgba(124,58,237,0.18),transparent_60%)]" />
      <div ref={box} className="relative flex-1">
        <ForceGraph2D
          ref={fg}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor="rgba(0,0,0,0)"
          enableNodeDrag={false}
          linkColor={() => 'rgba(167,139,250,0.25)'}
          linkDirectionalParticles={1}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => '#c4b5fd'}
          nodeCanvasObject={(n, ctx) => {
            const node = n as BNode
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return
            const age = Math.min(1, (Date.now() - node.born) / 600)
            const r = (node.kind === 'claim' ? 9 : 5) * (0.3 + 0.7 * easeOutBack(age))
            const color = KIND_COLOR[node.kind]
            ctx.shadowColor = color
            ctx.shadowBlur = 18
            ctx.fillStyle = color
            ctx.beginPath(); ctx.arc(node.x!, node.y!, r, 0, Math.PI * 2); ctx.fill()
            ctx.shadowBlur = 0
            if (age < 1) {
              ctx.strokeStyle = color; ctx.globalAlpha = 1 - age; ctx.lineWidth = 1.5
              ctx.beginPath(); ctx.arc(node.x!, node.y!, r + 18 * age, 0, Math.PI * 2); ctx.stroke()
              ctx.globalAlpha = 1
            }
          }}
          autoPauseRedraw={false}
          cooldownTicks={Infinity}
        />
        <div className="pointer-events-none absolute bottom-10 left-0 right-0 text-center">
          <AnimatePresence mode="wait">
            <motion.div key={stage} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="font-display text-3xl font-semibold text-gradient">{stage}…</motion.div>
          </AnimatePresence>
          <div className="mt-2 font-mono text-xs text-white/40">{data.nodes.length} entities discovered · {elapsed.toFixed(1)}s</div>
        </div>
      </div>

      <div className="glass relative z-10 m-4 flex w-80 flex-col rounded-2xl p-5">
        <div className="text-[10px] uppercase tracking-widest text-white/40">Analyzing</div>
        <div className="mt-1 truncate font-display text-lg font-semibold" title={fileName}>{fileName}</div>
        <div className="mt-5 space-y-2.5">
          {STAGES.map((s, i) => (
            <div key={s} className={`flex items-center gap-3 text-sm transition-colors ${i < current ? 'text-white/50' : i === current ? 'text-white' : 'text-white/20'}`}>
              <span className="flex h-5 w-5 items-center justify-center">
                {i < current ? <Check size={15} className="text-emerald-400" /> : i === current ? <Spinner /> : <span className="h-1.5 w-1.5 rounded-full bg-white/20" />}
              </span>
              {s}
            </div>
          ))}
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-6">
          {(Object.keys(KIND_COLOR) as NodeKind[]).map(k => (
            <div key={k} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[k], boxShadow: `0 0 8px ${KIND_COLOR[k]}` }} />
              <span className="text-white/50">{KIND_LABEL[k]}</span>
              <motion.span key={counts[k]} initial={{ scale: 1.6, color: '#fff' }} animate={{ scale: 1, color: 'rgba(255,255,255,.85)' }}
                className="ml-auto font-mono tabular-nums">{counts[k] ?? 0}</motion.span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function easeOutBack(t: number) {
  const c1 = 1.70158, c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
