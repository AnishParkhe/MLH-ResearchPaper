import { motion } from 'framer-motion'
import { compile } from 'mathjs'
import { FlaskConical, Play, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Playable, Simulation } from '../../shared/types'
import { playable, simulate } from '../api'
import { useWorkspace } from '../store'
import { Spinner } from './ui'

const axis = { stroke: 'rgba(255,255,255,0.3)', fontSize: 10, tickLine: false }
const tooltipStyle = { background: '#0e1122', border: '1px solid rgba(167,139,250,.3)', borderRadius: 8, fontSize: 11 }

function useAsync<T>(fn: () => Promise<T>) {
  const [state, setState] = useState<{ loading: boolean; data?: T; error?: string }>({ loading: false })
  const run = () => {
    setState({ loading: true })
    fn().then(data => setState({ loading: false, data }), e => setState({ loading: false, error: String(e.message ?? e) }))
  }
  return { ...state, run }
}

export function PlayableEquation({ equationId }: { equationId: string }) {
  const { docId } = useWorkspace()
  const req = useAsync(() => playable(docId, equationId))
  if (!req.data) {
    return (
      <div className="space-y-2">
        <button onClick={req.run} disabled={req.loading}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500/80 to-violet-500/80 px-4 py-3 font-semibold text-white shadow-lg shadow-pink-500/20 transition hover:shadow-pink-500/40 disabled:opacity-60">
          {req.loading ? <><Spinner /> Gemini is building a playground…</> : <><Play size={16} className="transition group-hover:scale-125" /> Make it playable</>}
        </button>
        {req.error && <div className="text-xs text-red-300">{req.error}</div>}
      </div>
    )
  }
  return <Playground spec={req.data} />
}

function Playground({ spec }: { spec: Playable }) {
  const [vals, setVals] = useState(() => Object.fromEntries(spec.params.map(p => [p.symbol, p.value])))
  const fn = useMemo(() => { try { return compile(spec.expression) } catch { return null } }, [spec.expression])

  const data = useMemo(() => {
    if (!fn) return []
    const defaults = Object.fromEntries(spec.params.map(p => [p.symbol, p.value]))
    const pts = []
    const N = 120
    for (let i = 0; i <= N; i++) {
      const x = spec.xMin + ((spec.xMax - spec.xMin) * i) / N
      const ev = (scope: Record<string, number>) => {
        try { const y = Number(fn.evaluate({ ...scope, [spec.xVar]: x })); return Number.isFinite(y) ? y : null } catch { return null }
      }
      pts.push({ x: +x.toPrecision(4), y: ev(vals), base: ev(defaults) })
    }
    return pts
  }, [fn, vals, spec])

  if (!fn) return <div className="text-xs text-red-300">Gemini produced an expression that couldn’t be compiled: <code>{spec.expression}</code></div>

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg bg-pink-500/10 p-2.5 text-xs text-pink-100">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-pink-300" /> {spec.insight}
      </div>
      <div className="h-52 rounded-xl bg-black/30 p-2">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 14, left: -8 }}>
            <defs>
              <linearGradient id="playFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f472b6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#f472b6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="x" {...axis} label={{ value: spec.xLabel, position: 'insideBottom', offset: -6, fill: 'rgba(255,255,255,.45)', fontSize: 10 }} />
            <YAxis {...axis} width={48} tickFormatter={v => +Number(v).toPrecision(3) + ''} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => Number(v).toPrecision(4)} />
            <Line dataKey="base" stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" dot={false} isAnimationActive={false} name="paper defaults" />
            <Area dataKey="y" stroke="#f472b6" strokeWidth={2.5} fill="url(#playFill)" dot={false} isAnimationActive={false} name={spec.yLabel} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2.5">
        {spec.params.map(p => (
          <label key={p.symbol} className="block">
            <div className="flex justify-between text-xs">
              <span className="text-white/70"><code className="text-pink-300">{p.symbol}</code> · {p.name}</span>
              <span className="font-mono tabular-nums text-white">{+vals[p.symbol].toPrecision(4)}</span>
            </div>
            <input type="range" className="w-full" min={p.min} max={p.max} step={p.step || (p.max - p.min) / 100} value={vals[p.symbol]}
              onChange={e => setVals(v => ({ ...v, [p.symbol]: Number(e.target.value) }))} />
          </label>
        ))}
      </div>
      <div className="font-mono text-[10px] text-white/30">y = {spec.expression}</div>
    </motion.div>
  )
}

export function SimulateWorlds({ claimId }: { claimId: string }) {
  const { docId } = useWorkspace()
  const req = useAsync<Simulation>(() => simulate(docId, claimId))
  if (!req.data) {
    return (
      <div className="space-y-2">
        <button onClick={req.run} disabled={req.loading}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500/80 to-cyan-500/80 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-emerald-500/40 disabled:opacity-60">
          {req.loading ? <><Spinner /> Simulating two universes…</> : <><FlaskConical size={16} className="transition group-hover:rotate-12" /> Simulate both worlds</>}
        </button>
        {req.error && <div className="text-xs text-red-300">{req.error}</div>}
      </div>
    )
  }
  const s = req.data
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      <div className="h-56 rounded-xl bg-black/30 p-2">
        <ResponsiveContainer>
          <ComposedChart data={s.points} margin={{ top: 8, right: 8, bottom: 14, left: -8 }}>
            <defs>
              <linearGradient id="gTrue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.3} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient>
              <linearGradient id="gFalse" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f87171" stopOpacity={0.3} /><stop offset="100%" stopColor="#f87171" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="x" {...axis} label={{ value: s.xLabel, position: 'insideBottom', offset: -6, fill: 'rgba(255,255,255,.45)', fontSize: 10 }} />
            <YAxis {...axis} width={44} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" height={20} />
            <Area type="monotone" dataKey="ifTrue" name="Claim TRUE" stroke="#34d399" strokeWidth={2.5} fill="url(#gTrue)" animationDuration={1400} />
            <Area type="monotone" dataKey="ifFalse" name="Claim FALSE" stroke="#f87171" strokeWidth={2.5} fill="url(#gFalse)" animationDuration={1400} animationBegin={500} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center text-[10px] uppercase tracking-widest text-white/35">{s.yLabel}</div>
      <p className="text-xs leading-relaxed text-white/70">{s.narrative}</p>
      <div className="rounded-lg border border-amber-300/25 bg-amber-400/10 p-2 text-xs text-amber-100">🎯 {s.decisiveRegion}</div>
    </motion.div>
  )
}
