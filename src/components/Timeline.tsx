import { animate, motion } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Citation } from '../../shared/types'
import { KIND_COLOR } from '../graph'
import { useWorkspace } from '../store'

const ROLES: Citation['role'][] = ['foundation', 'method', 'dataset', 'contrast', 'related']
const ROLE_COLOR: Record<Citation['role'], string> = {
  foundation: '#a78bfa', method: '#60a5fa', dataset: '#34d399', contrast: '#f87171', related: '#94a3b8',
}
const NOW = new Date().getFullYear()
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)

export default function Timeline() {
  const { analysis: a, select, selected, setTab, cascade, broken } = useWorkspace()
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 900, h: 600 })
  const [hover, setHover] = useState<string | null>(null)
  const paperYear = a.paper.year || NOW
  const cites = useMemo(() => a.citations.filter(c => c.year > 1800 && c.year <= paperYear + 1), [a, paperYear])
  const minYear = Math.min(paperYear - 3, ...cites.map(c => c.year)) - 1
  const nowYear = Math.max(NOW, paperYear + 1)
  const maxYear = nowYear + 3
  const [year, setYear] = useState(maxYear)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(box.current!)
    return () => ro.disconnect()
  }, [])

  // Time travel: sweep from the oldest foundation to the proposed future.
  useEffect(() => {
    if (!playing) return
    const ctl = animate(minYear, maxYear, { duration: 7, ease: 'easeInOut', onUpdate: v => setYear(v), onComplete: () => setPlaying(false) })
    return ctl.stop
  }, [playing, minYear, maxYear])

  const padL = 90, padR = 20, top = 140, bottom = 100
  const x0 = padL, inner = size.w - padL - padR
  // Piecewise scale: the paper's past gets most of the room, the years since publication are compressed,
  // and the proposed future gets a fixed band for experiments.
  const PAST = 0.6, GAP = 0.68
  const X = (y: number) => {
    if (y <= paperYear) return x0 + inner * PAST * ((y - minYear) / Math.max(1, paperYear - minYear))
    if (y <= nowYear) return x0 + inner * (PAST + (GAP - PAST) * ((y - paperYear) / Math.max(1, nowYear - paperYear)))
    return x0 + inner * (GAP + (1 - GAP) * ((y - nowYear) / (maxYear - nowYear)))
  }
  const laneH = (size.h - top - bottom) / ROLES.length
  const paper = { x: X(paperYear), y: top + (size.h - top - bottom) / 2 }
  const futureX0 = X(nowYear)

  // Stack same-year citations vertically inside their lane.
  const placed = useMemo(() => {
    const groups = new Map<string, Citation[]>()
    for (const c of cites) groups.set(`${c.role}-${c.year}`, [...(groups.get(`${c.role}-${c.year}`) ?? []), c])
    return cites.map(c => {
      const g = groups.get(`${c.role}-${c.year}`)!
      const k = g.indexOf(c)
      const lane = ROLES.indexOf(c.role)
      return { c, x: X(c.year), y: top + laneH * lane + laneH / 2 + (k - (g.length - 1) / 2) * 24 }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cites, size, minYear, maxYear])

  const expX = futureX0 + 26
  const labelChars = Math.max(8, Math.floor((size.w - expX - 30) / 6.2))
  const experiments = a.claims.map((c, i) => ({
    c, x: expX,
    y: top + ((size.h - top - bottom) * (i + 0.5)) / a.claims.length,
    year: nowYear + (3 * (i + 1)) / (a.claims.length + 1),
  }))

  const visible = (y: number) => y <= year
  const ticks: number[] = []
  const span = paperYear - minYear
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 6 ? 2 : 1
  for (let y = Math.ceil(minYear / step) * step; y < paperYear; y += step) if (paperYear - y >= step / 2) ticks.push(y)
  const existed = cites.filter(c => c.year <= year).length
  const hoverCite = hover ? a.citations.find(c => c.id === hover) : null
  const hoverTargets = hover ? a.edges.filter(e => e.source === hover).map(e => e.target) : []
  const axisY = size.h - bottom + 30

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden">
      <svg width={size.w} height={size.h} className="absolute inset-0">
        <defs>
          <radialGradient id="paperGlow"><stop offset="0%" stopColor="#f0abfc" stopOpacity="0.9" /><stop offset="100%" stopColor="#a78bfa" stopOpacity="0" /></radialGradient>
          <linearGradient id="futureBand" x1="0" x2="1"><stop offset="0%" stopColor="#34d399" stopOpacity="0.02" /><stop offset="100%" stopColor="#34d399" stopOpacity="0.1" /></linearGradient>
        </defs>

        {ROLES.map((r, i) => (
          <g key={r}>
            <rect x={0} y={top + laneH * i} width={futureX0} height={laneH} fill={i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent'} />
            <text x={14} y={top + laneH * i + laneH / 2 + 3} fill={ROLE_COLOR[r]} opacity={0.6} fontSize={10} letterSpacing={2} style={{ textTransform: 'uppercase' }}>{r}</text>
          </g>
        ))}

        {/* Future band */}
        <rect x={futureX0} y={top - 24} width={size.w - futureX0} height={size.h - top - bottom + 54} fill="url(#futureBand)" />
        <text x={futureX0 + 12} y={top - 8} fill="#6ee7b7" fontSize={10} letterSpacing={2}>PROPOSED EXPERIMENTS</text>

        {/* Axis */}
        <line x1={padL} x2={size.w - padR} y1={axisY} y2={axisY} stroke="rgba(255,255,255,0.15)" />
        {ticks.map(t => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={top - 24} y2={axisY + 4} stroke="rgba(255,255,255,0.04)" />
            <text x={X(t)} y={axisY + 18} fill="rgba(255,255,255,0.35)" fontSize={10} textAnchor="middle" fontFamily="JetBrains Mono">{t}</text>
          </g>
        ))}
        <text x={X(paperYear)} y={axisY + 18} fill="#c4b5fd" fontSize={10} textAnchor="middle" fontFamily="JetBrains Mono">{paperYear}</text>
        {nowYear > paperYear + 1 && (
          <text x={(X(paperYear) + futureX0) / 2} y={axisY - 6} fill="rgba(255,255,255,0.3)" fontSize={9} textAnchor="middle">
            ⟿ {nowYear - paperYear} yrs
          </text>
        )}
        <line x1={futureX0} x2={futureX0} y1={top - 24} y2={axisY} stroke="#6ee7b7" strokeOpacity={0.45} strokeDasharray="3 4" />
        <text x={futureX0} y={axisY + 18} fill="#6ee7b7" fontSize={10} textAnchor="middle">today</text>

        {placed.map(({ c, x, y }, i) => {
          const on = visible(c.year)
          const lit = hover === c.id
          return (
            <motion.path key={c.id} d={`M${x},${y} Q${(x + paper.x) / 2},${Math.min(y, paper.y) - 50} ${paper.x},${paper.y}`}
              fill="none" stroke={ROLE_COLOR[c.role]} strokeWidth={lit ? 2.5 : 1.2}
              initial={{ pathLength: 0 }} animate={{ pathLength: 1, opacity: on ? (lit ? 1 : hover ? 0.1 : 0.4) : 0.03 }}
              transition={{ pathLength: { delay: 0.3 + i * 0.07, duration: 1.1 }, opacity: { duration: 0.3 } }} />
          )
        })}

        {experiments.map(({ c, x, y, year: ey }, i) => {
          const dmg = broken.has(c.id) ? 1 : cascade.damage.get(c.id) ?? 0
          return (
            <motion.path key={c.id} d={`M${paper.x},${paper.y} C${(paper.x + x) / 2},${paper.y} ${(paper.x + x) / 2},${y} ${x},${y}`}
              fill="none" stroke={dmg > 0.3 ? '#ef4444' : '#34d399'} strokeWidth={1.3} strokeDasharray="5 6"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1, opacity: visible(ey) ? 0.6 : 0.03, strokeDashoffset: [0, -22] }}
              transition={{ pathLength: { delay: 1 + i * 0.1, duration: 1 }, strokeDashoffset: { repeat: Infinity, duration: 1.2, ease: 'linear' } }} />
          )
        })}

        {placed.map(({ c, x, y }, i) => {
          const on = visible(c.year)
          return (
            <motion.g key={c.id} initial={{ opacity: 0 }} animate={{ opacity: on ? (hover && hover !== c.id ? 0.45 : 1) : 0.1 }}
              transition={{ delay: on ? i * 0.04 : 0 }} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)} onClick={() => select(c.id)}>
              <circle cx={x} cy={y} r={selected === c.id ? 8 : 5.5} fill={ROLE_COLOR[c.role]} style={{ filter: `drop-shadow(0 0 6px ${ROLE_COLOR[c.role]})` }} />
              <text x={x - 9} y={y + 3.5} fill="rgba(255,255,255,0.75)" fontSize={10} textAnchor="end">
                {trunc(c.title, 22)} <tspan fill="rgba(255,255,255,0.35)" fontFamily="JetBrains Mono" fontSize={9}>’{String(c.year).slice(2)}</tspan>
              </text>
            </motion.g>
          )
        })}

        <motion.g initial={{ scale: 0 }} animate={{ scale: visible(paperYear) ? 1 : 0.4, opacity: visible(paperYear) ? 1 : 0.2 }}
          transition={{ type: 'spring', stiffness: 120, damping: 12 }} style={{ transformOrigin: `${paper.x}px ${paper.y}px`, cursor: 'pointer' }}
          onClick={() => select(null)}>
          <circle cx={paper.x} cy={paper.y} r={60} fill="url(#paperGlow)" opacity={0.6}>
            <animate attributeName="r" values="44;64;44" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx={paper.x} cy={paper.y} r={20} fill="#c4b5fd" stroke="#fff" strokeWidth={2} />
          <text x={paper.x} y={paper.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1e1b4b">{paperYear}</text>
          <text x={paper.x} y={paper.y + 40} textAnchor="middle" fontSize={12} fontWeight={600} fill="#f5f3ff">{trunc(a.paper.title, 30)}</text>
        </motion.g>

        {experiments.map(({ c, x, y, year: ey }) => {
          const dmg = broken.has(c.id) ? 1 : cascade.damage.get(c.id) ?? 0
          const color = dmg > 0.3 ? '#ef4444' : '#34d399'
          return (
            <motion.g key={c.id} animate={{ opacity: visible(ey) ? 1 : 0.1 }} style={{ cursor: 'pointer' }}
              onClick={() => { select(c.id); setTab('falsify') }}>
              <rect x={x - 6} y={y - 6} width={12} height={12} rx={2} fill="#05060d" stroke={color} strokeWidth={1.6} transform={`rotate(45 ${x} ${y})`}
                style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
              <text x={x + 14} y={y - 1} fill="rgba(255,255,255,0.85)" fontSize={10.5} fontWeight={500}>{trunc(c.short, labelChars)}</text>
              <text x={x + 14} y={y + 12} fill={color} opacity={0.75} fontSize={9}>{trunc(`${c.falsify.difficulty} · ${c.falsify.timeEstimate}`, labelChars)}</text>
            </motion.g>
          )
        })}

        <line x1={X(year)} x2={X(year)} y1={top - 30} y2={axisY} stroke="#fbbf24" strokeWidth={1.5} style={{ filter: 'drop-shadow(0 0 6px #fbbf24)' }} />
        <circle cx={X(year)} cy={axisY} r={4} fill="#fbbf24" />
      </svg>

      <div className="absolute left-6 top-4">
        <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300/70">Knowledge as of</div>
        <div className="font-mono text-5xl font-bold leading-none tabular-nums text-amber-200" style={{ textShadow: '0 0 30px rgba(251,191,36,.5)' }}>
          {Math.floor(year)}
        </div>
        <div className="mt-1.5 text-xs text-white/45">
          {existed}/{cites.length} key references exist ·{' '}
          {year >= paperYear ? <span className="text-violet-300">paper published</span> : <>paper in {Math.ceil(paperYear - year)}y</>}
          {year >= nowYear && <> · <span className="text-emerald-300">experiments proposed</span></>}
        </div>
      </div>

      <div className="glass absolute bottom-4 left-1/2 flex w-[min(640px,85%)] -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-2.5">
        <button onClick={() => { if (!playing) setYear(minYear); setPlaying(p => !p) }} title="Time travel"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-ink-950 shadow-[0_0_20px_rgba(251,191,36,.5)] transition hover:scale-110">
          {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <input type="range" className="flex-1" style={{ accentColor: '#fbbf24' }} min={minYear} max={maxYear} step={0.1} value={year}
          onChange={e => { setPlaying(false); setYear(Number(e.target.value)) }} />
        <span className="font-mono text-xs text-white/50">{minYear}–{maxYear}</span>
      </div>

      {hoverCite && (
        <div className="glass pointer-events-none absolute right-5 top-5 max-w-xs rounded-xl p-3 text-xs">
          <div className="font-semibold text-white">{hoverCite.title}</div>
          <div className="mt-0.5 text-white/45">{hoverCite.authors} · {hoverCite.year}</div>
          {hoverTargets.length > 0 && <div className="mt-2 text-white/60">Feeds into: <span style={{ color: KIND_COLOR.claim }}>{hoverTargets.join(', ')}</span></div>}
        </div>
      )}
    </div>
  )
}
