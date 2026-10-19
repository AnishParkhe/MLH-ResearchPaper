import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import katex from 'katex'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { confidenceColor } from '../graph'

export function Gauge({ value, size = 96, label = 'support' }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 8
  const circ = 2 * Math.PI * r * 0.75 // 270° arc
  const mv = useMotionValue(value)
  const [shown, setShown] = useState(value)
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: v => setShown(Math.round(v)) })
    return c.stop
  }, [value, mv])
  const offset = useTransform(mv, v => circ * (1 - v / 100))
  const color = confidenceColor(shown)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[135deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={7}
          strokeDasharray={`${circ} ${2 * Math.PI * r}`} strokeLinecap="round" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${circ} ${2 * Math.PI * r}`} strokeLinecap="round"
          style={{ strokeDashoffset: offset, filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold tabular-nums" style={{ color }}>{shown}</span>
        <span className="text-[9px] uppercase tracking-widest text-white/40">{label}</span>
      </div>
    </div>
  )
}

export function Tex({ latex, display = true }: { latex: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { displayMode: display, throwOnError: false, strict: 'ignore' })
    } catch {
      return latex
    }
  }, [latex, display])
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

export function Pill({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', className)}
      style={{ color: color ?? '#cbd5e1', background: `${color ?? '#94a3b8'}1f`, border: `1px solid ${color ?? '#94a3b8'}40` }}>
      {children}
    </span>
  )
}

export function Meter({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-white/50">
      <span className="w-14 uppercase tracking-wider">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <motion.div className="h-full rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }}
          initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
      </div>
      <span className="w-7 text-right tabular-nums text-white/70">{value}</span>
    </div>
  )
}

// Minimal **bold** markdown.
export function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') ? <strong key={i} className="text-white">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}</>
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-violet-300', className)} />
}
