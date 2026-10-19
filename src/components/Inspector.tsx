import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, BookOpen, CircleDollarSign, Clock, FileSearch, Gavel, Quote, ShieldAlert, Skull, Swords, Target } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import type { Claim, NodeKind } from '../../shared/types'
import { challenge } from '../api'
import { confidenceColor, effectiveConfidence, KIND_COLOR, kindOf } from '../graph'
import { useWorkspace } from '../store'
import { PlayableEquation, SimulateWorlds } from './Charts'
import { Gauge, Meter, Pill, Rich, Spinner, Tex } from './ui'

export default function Inspector() {
  const { selected } = useWorkspace()
  return (
    <AnimatePresence mode="wait">
      <motion.div key={selected ?? 'overview'} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.25 }} className="scroll-thin h-full overflow-y-auto p-5">
        {!selected ? <Overview /> : kindOf(selected) === 'claim' ? <ClaimView id={selected} /> : <EntityView id={selected} />}
      </motion.div>
    </AnimatePresence>
  )
}

// ---------------- helpers ----------------

function useEntity(id: string) {
  const { analysis: a } = useWorkspace()
  return [...a.claims, ...a.evidence, ...a.assumptions, ...a.methods, ...a.equations, ...a.limitations, ...a.citations].find(x => x.id === id)
}

function labelOf(e: ReturnType<typeof useEntity>): string {
  if (!e) return ''
  if ('short' in e) return e.short
  if ('name' in e) return e.name
  return e.title
}

function Back() {
  const { select } = useWorkspace()
  return (
    <button onClick={() => select(null)} className="mb-4 flex items-center gap-1 text-xs text-white/40 transition hover:text-white">
      <ArrowLeft size={13} /> Overview
    </button>
  )
}

function Chip({ id }: { id: string }) {
  const { select, cascade } = useWorkspace()
  const e = useEntity(id)
  const dmg = cascade.damage.get(id) ?? 0
  const color = KIND_COLOR[kindOf(id)]
  return (
    <button onClick={() => select(id)} title={labelOf(e)}
      className="flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-xs transition hover:brightness-125"
      style={{ borderColor: `${color}40`, background: `${color}12`, color }}>
      <span className="font-mono text-[10px] opacity-70">{id}</span>
      <span className={clsx('truncate text-white/80', dmg > 0.3 && 'text-red-300 line-through')}>{labelOf(e)}</span>
    </button>
  )
}

function Section({ title, icon, children, color }: { title: string; icon?: ReactNode; children: ReactNode; color?: string }) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: color ?? 'rgba(255,255,255,.4)' }}>
        {icon}{title}
      </div>
      {children}
    </div>
  )
}

function QuoteBlock({ quote, page, color = '#fbbf24' }: { quote: string; page: number; color?: string }) {
  const { showInPdf } = useWorkspace()
  return (
    <button onClick={() => showInPdf(page, quote)} className="group block w-full text-left">
      <div className="quote rounded-r-lg bg-white/[0.03] py-1.5 pl-3 pr-2 text-[13px] leading-snug text-white/75 transition group-hover:bg-white/[0.07]" style={{ borderColor: color }}>
        “{quote}”
        <span className="ml-2 whitespace-nowrap font-sans text-[10px] not-italic text-white/35 group-hover:text-amber-300">
          <FileSearch size={10} className="mr-0.5 inline" /> p.{page}
        </span>
      </div>
    </button>
  )
}

function BreakButton({ id }: { id: string }) {
  const { broken, toggleBroken } = useWorkspace()
  const on = broken.has(id)
  return (
    <button onClick={() => toggleBroken(id)}
      className={clsx('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
        on ? 'border-red-400/60 bg-red-500/25 text-red-100 shadow-[0_0_20px_rgba(239,68,68,.35)]' : 'border-red-400/25 bg-red-500/5 text-red-200/80 hover:bg-red-500/15')}>
      <Skull size={13} /> {on ? 'Assumed false — restore' : 'What if it’s false?'}
    </button>
  )
}

function Connections({ id }: { id: string }) {
  const { analysis } = useWorkspace()
  const out = analysis.edges.filter(e => e.source === id)
  const inc = analysis.edges.filter(e => e.target === id)
  if (!out.length && !inc.length) return null
  return (
    <Section title="Connections">
      <div className="space-y-1.5">
        {inc.map((e, i) => (
          <div key={'i' + i} className="flex items-center gap-2"><span className="w-20 shrink-0 text-right text-[10px] text-white/35">{e.relation.replace('_', ' ')} ←</span><Chip id={e.source} /></div>
        ))}
        {out.map((e, i) => (
          <div key={'o' + i} className="flex items-center gap-2"><span className="w-20 shrink-0 text-right text-[10px] text-white/35">{e.relation.replace('_', ' ')} →</span><Chip id={e.target} /></div>
        ))}
      </div>
    </Section>
  )
}

// ---------------- overview ----------------

function Overview() {
  const { analysis: a, score, cascade, overrides, select, broken, toggleBroken } = useWorkspace()
  const claims = [...a.claims].sort((x, y) => (y.type === 'central' ? 1 : 0) - (x.type === 'central' ? 1 : 0))
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-violet-300/70">{a.paper.field} · {a.paper.year}</div>
      <h2 className="mt-1 font-display text-2xl font-bold leading-tight">{a.paper.title}</h2>
      <div className="mt-1 text-xs text-white/45">{a.paper.authors.slice(0, 4).join(', ')}{a.paper.authors.length > 4 && ` +${a.paper.authors.length - 4}`} · {a.paper.venue}</div>

      <div className="mt-4 rounded-xl border border-violet-400/20 bg-gradient-to-br from-violet-500/15 to-fuchsia-500/5 p-3 text-sm font-medium text-violet-100">⚡ {a.paper.hook}</div>
      <p className="mt-3 text-sm leading-relaxed text-white/65">{a.paper.tldr}</p>

      <div className="mt-5 flex items-center gap-4 rounded-2xl bg-white/[0.03] p-4">
        <Gauge value={score} size={104} label="robustness" />
        <div className="text-xs leading-relaxed text-white/55">
          <div className="mb-1 font-display text-sm font-semibold text-white">Paper robustness</div>
          Weighted support across all claims. <b className="text-red-300">Break assumptions</b> below or <b className="text-pink-300">challenge claims</b> to stress-test it.
        </div>
      </div>

      <Section title="Claims" icon={<Target size={11} />} color={KIND_COLOR.claim}>
        <div className="space-y-1.5">
          {claims.map((c, i) => {
            const conf = effectiveConfidence(overrides[c.id] ?? c.confidence, broken.has(c.id) ? 1 : cascade.damage.get(c.id))
            return (
              <motion.button key={c.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                onClick={() => select(c.id)} className="group flex w-full items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.07]">
                <span className="font-mono text-[10px] text-violet-300/60">{c.id}</span>
                <span className="flex-1 text-sm text-white/85">{c.short}{c.type === 'central' && <span className="ml-1.5 text-[9px] text-violet-300">★</span>}</span>
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/5">
                  <motion.div className="h-full rounded-full" animate={{ width: `${conf}%`, background: confidenceColor(conf) }} transition={{ duration: 0.8 }} />
                </div>
                <span className="w-6 text-right font-mono text-xs tabular-nums" style={{ color: confidenceColor(conf) }}>{conf}</span>
              </motion.button>
            )
          })}
        </div>
      </Section>

      <Section title="Stress test: flip an assumption" icon={<ShieldAlert size={11} />} color={KIND_COLOR.assumption}>
        <div className="space-y-1.5">
          {a.assumptions.map(x => {
            const on = broken.has(x.id)
            return (
              <div key={x.id} className={clsx('flex items-center gap-3 rounded-xl px-3 py-2 transition', on ? 'bg-red-500/15' : 'bg-white/[0.03]')}>
                <button onClick={() => select(x.id)} className="flex-1 text-left">
                  <div className="text-sm text-white/85">{x.short}</div>
                  <div className="text-[10px] text-white/35">{x.explicit ? 'stated' : 'hidden'} · fragility {x.fragility}</div>
                </button>
                <button onClick={() => toggleBroken(x.id)} aria-label="toggle assumption"
                  className={clsx('relative h-5 w-9 rounded-full transition', on ? 'bg-red-500' : 'bg-emerald-500/70')}>
                  <motion.span layout className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow" style={{ left: on ? 18 : 2 }} />
                </button>
              </div>
            )
          })}
        </div>
        <div className="mt-2 text-[10px] text-white/35">Green = holds. Flip to red and watch the damage ripple through the graph.</div>
      </Section>

      {a.equations.length > 0 && (
        <Section title="Equations · make them playable" icon={<span className="font-serif italic">ƒ</span>} color={KIND_COLOR.equation}>
          <div className="space-y-1.5">
            {a.equations.map(q => (
              <button key={q.id} onClick={() => select(q.id)} className="block w-full overflow-hidden rounded-xl bg-white/[0.03] px-3 py-1 text-left text-white/85 transition hover:bg-pink-500/10">
                <div className="text-[10px] text-pink-300/70">{q.id} · {q.name}</div>
                <div className="pointer-events-none origin-left scale-90"><Tex latex={q.latex} /></div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {a.limitations.length > 0 && (
        <Section title="Limitations" icon={<ShieldAlert size={11} />} color={KIND_COLOR.limitation}>
          <div className="flex flex-wrap gap-1.5">{a.limitations.map(l => <Chip key={l.id} id={l.id} />)}</div>
        </Section>
      )}
    </div>
  )
}

// ---------------- claim ----------------

const TABS = [
  { key: 'evidence', label: 'Evidence', icon: BookOpen },
  { key: 'assumptions', label: 'Assumptions', icon: ShieldAlert },
  { key: 'falsify', label: 'Disprove it', icon: Target },
  { key: 'challenge', label: 'Challenge', icon: Swords },
] as const

function ClaimView({ id }: { id: string }) {
  const { analysis: a, overrides, cascade, broken, showInPdf, tab, setTab } = useWorkspace()
  const c = a.claims.find(x => x.id === id)!
  const dmg = broken.has(id) ? 1 : cascade.damage.get(id) ?? 0
  const conf = effectiveConfidence(overrides[id] ?? c.confidence, dmg)

  return (
    <div>
      <Back />
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill color={KIND_COLOR.claim}>Claim {c.id}</Pill>
            <Pill color={c.type === 'central' ? '#f0abfc' : '#94a3b8'}>{c.type}</Pill>
            {dmg > 0.05 && <Pill color="#ef4444">{broken.has(id) ? 'falsified' : `-${Math.round(dmg * 100)}% cascade`}</Pill>}
          </div>
          <h2 className="mt-2 font-display text-xl font-bold leading-tight">{c.short}</h2>
        </div>
        <Gauge value={conf} size={86} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white/75">{c.text}</p>
      <div className="mt-3"><QuoteBlock quote={c.quote} page={c.page} color={KIND_COLOR.claim} /></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => showInPdf(c.page, c.quote)} className="flex items-center gap-1.5 rounded-lg border border-amber-300/25 bg-amber-400/5 px-2.5 py-1.5 text-xs text-amber-100 hover:bg-amber-400/15">
          <FileSearch size={13} /> Show in paper
        </button>
        <BreakButton id={c.id} />
      </div>

      <div className="sticky -top-5 z-10 -mx-5 mt-5 bg-ink-900/90 px-5 pt-1 backdrop-blur">
        <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={clsx('relative flex flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition', tab === t.key ? 'text-white' : 'text-white/45 hover:text-white/80')}>
              {tab === t.key && <motion.span layoutId="tab" className="absolute inset-0 rounded-lg bg-violet-500/30 ring-1 ring-violet-300/30" />}
              <t.icon size={12} className="relative" /><span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="pt-4">
          {tab === 'evidence' && <EvidenceTab c={c} />}
          {tab === 'assumptions' && <AssumptionsTab c={c} />}
          {tab === 'falsify' && <FalsifyTab c={c} />}
          {tab === 'challenge' && <ChallengeTab c={c} />}
        </motion.div>
      </AnimatePresence>
      <Connections id={id} />
    </div>
  )
}

function EvidenceTab({ c }: { c: Claim }) {
  const { analysis: a, select, broken, toggleBroken } = useWorkspace()
  const ev = a.evidence.filter(e => c.evidenceIds.includes(e.id))
  const contra = a.edges.filter(e => e.target === c.id && e.relation === 'contradicts').map(e => e.source)
  if (!ev.length) return <div className="text-sm text-white/40">No direct evidence was linked — that’s a red flag in itself.</div>
  return (
    <div className="space-y-3">
      {ev.map((e, i) => (
        <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
          className={clsx('rounded-xl border p-3 transition', broken.has(e.id) ? 'border-red-400/40 bg-red-500/10' : 'border-emerald-400/15 bg-emerald-400/[0.04]')}>
          <div className="mb-1.5 flex items-center gap-2">
            <Pill color={KIND_COLOR.evidence}>{e.kind}</Pill>
            <button onClick={() => select(e.id)} className="truncate text-sm font-semibold text-white/90 hover:underline">{e.short}</button>
            <button onClick={() => toggleBroken(e.id)} title="What if this evidence is wrong?" className="ml-auto text-white/30 hover:text-red-300"><Skull size={14} /></button>
          </div>
          <p className="mb-2 text-xs leading-relaxed text-white/60">{e.summary}</p>
          <Meter value={e.strength} color={KIND_COLOR.evidence} label="strength" />
          <div className="mt-2"><QuoteBlock quote={e.quote} page={e.page} color={KIND_COLOR.evidence} /></div>
        </motion.div>
      ))}
      {contra.length > 0 && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3">
          <div className="mb-1.5 text-xs font-semibold text-red-200">⚠ In tension with</div>
          <div className="flex flex-wrap gap-1.5">{contra.map(id => <Chip key={id} id={id} />)}</div>
        </div>
      )}
    </div>
  )
}

function AssumptionsTab({ c }: { c: Claim }) {
  const { analysis: a, broken, toggleBroken, select } = useWorkspace()
  const as = a.assumptions.filter(x => c.assumptionIds.includes(x.id))
  return (
    <div className="space-y-3">
      {as.map((x, i) => {
        const on = broken.has(x.id)
        return (
          <motion.div key={x.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className={clsx('rounded-xl border p-3 transition', on ? 'border-red-400/50 bg-red-500/15' : 'border-amber-300/15 bg-amber-300/[0.04]')}>
            <div className="mb-1.5 flex items-center gap-2">
              <Pill color={x.explicit ? KIND_COLOR.assumption : '#fb923c'}>{x.explicit ? 'stated' : 'hidden'}</Pill>
              <button onClick={() => select(x.id)} className="truncate text-sm font-semibold text-white/90 hover:underline">{x.short}</button>
            </div>
            <p className="mb-2 text-xs leading-relaxed text-white/60">{x.text}</p>
            <Meter value={x.fragility} color="#fb923c" label="fragility" />
            {x.quote && <div className="mt-2"><QuoteBlock quote={x.quote} page={x.page} color={KIND_COLOR.assumption} /></div>}
            <button onClick={() => toggleBroken(x.id)}
              className={clsx('mt-2.5 w-full rounded-lg py-1.5 text-xs font-semibold transition', on ? 'bg-red-500 text-white' : 'bg-white/5 text-white/70 hover:bg-red-500/20 hover:text-red-100')}>
              {on ? '💥 Broken — click to restore' : 'Break this assumption'}
            </button>
          </motion.div>
        )
      })}
    </div>
  )
}

function FalsifyTab({ c }: { c: Claim }) {
  const f = c.falsify
  const diffColor = { easy: '#34d399', medium: '#fbbf24', hard: '#f87171' }[f.difficulty]
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-300/20 bg-gradient-to-br from-violet-500/15 to-transparent p-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-violet-300">Falsifiable hypothesis</div>
        <div className="text-sm font-medium leading-relaxed text-white/90">{f.hypothesis}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Pill color={diffColor}>{f.difficulty}</Pill>
        <Pill color="#67e8f9"><CircleDollarSign size={10} /> {f.cost}</Pill>
        <Pill color="#c4b5fd"><Clock size={10} /> {f.timeEstimate}</Pill>
      </div>
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">Protocol</div>
        <ol className="relative space-y-3 border-l border-white/10 pl-5">
          {f.setup.map((s, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }} className="relative text-xs leading-relaxed text-white/70">
              <span className="absolute -left-[29px] flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 font-mono text-[10px] font-bold text-white shadow-[0_0_12px_rgba(167,139,250,.6)]">{i + 1}</span>
              {s}
            </motion.li>
          ))}
        </ol>
      </div>
      <div className="grid gap-2">
        <div className="rounded-xl bg-white/[0.04] p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-cyan-300/80">Measure</div>
          <div className="text-xs text-white/75">{f.metric}</div>
        </div>
        <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-red-300">If the claim is false, you’d see</div>
          <div className="text-xs text-red-50/85">{f.predictionIfFalse}</div>
        </div>
      </div>
      <SimulateWorlds claimId={c.id} />
    </div>
  )
}

const VERDICT = {
  stands: { label: 'CLAIM STANDS', color: '#34d399' },
  weakened: { label: 'WEAKENED', color: '#fbbf24' },
  falls: { label: 'CLAIM FALLS', color: '#ef4444' },
}

function ChallengeTab({ c }: { c: Claim }) {
  const { docId, challenges, recordChallenge } = useWorkspace()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const history = challenges[c.id] ?? []

  async function submit(t = text) {
    if (!t.trim() || busy) return
    setBusy(true); setErr(null)
    try {
      recordChallenge(c.id, t, await challenge(docId, c.id, t))
      setText('')
    } catch (e) {
      setErr(String((e as Error).message))
    }
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-white/50">Play skeptic. Gemini referees your objection against what the paper actually shows.</div>
      <div className="flex flex-col gap-1.5">
        {c.objections.map((o, i) => (
          <button key={i} onClick={() => { setText(o); void submit(o) }} disabled={busy}
            className="flex items-start gap-2 rounded-lg border border-pink-400/20 bg-pink-500/[0.06] px-2.5 py-2 text-left text-xs text-pink-50/80 transition hover:border-pink-300/50 hover:bg-pink-500/15 disabled:opacity-50">
            <Swords size={12} className="mt-0.5 shrink-0 text-pink-300" /> {o}
          </button>
        ))}
      </div>
      <div className="relative">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit() }}
          placeholder="e.g. “Their baseline was under-tuned, so the gain is an artifact…”"
          className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 pr-24 text-sm text-white placeholder:text-white/25 focus:border-pink-300/50 focus:outline-none" />
        <button onClick={() => submit()} disabled={busy || !text.trim()}
          className="absolute bottom-3 right-2 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-pink-500/30 disabled:opacity-40">
          {busy ? <Spinner className="h-3 w-3" /> : <Gavel size={13} />} Challenge
        </button>
      </div>
      {busy && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60">
          <div className="mb-2 flex items-center gap-2"><Gavel size={13} className="animate-bounce text-pink-300" /> The referee is cross-examining the paper…</div>
          <div className="h-1 overflow-hidden rounded bg-white/5"><motion.div className="h-full w-1/3 bg-gradient-to-r from-transparent via-pink-400 to-transparent" animate={{ x: ['-100%', '300%'] }} transition={{ repeat: Infinity, duration: 1.2 }} /></div>
        </motion.div>
      )}
      {err && <div className="text-xs text-red-300">{err}</div>}
      <AnimatePresence initial={false}>
        {history.map((h, i) => <Verdict key={history.length - i} text={h.text} r={h.result} fresh={i === 0} />)}
      </AnimatePresence>
    </div>
  )
}

function Verdict({ text, r, fresh }: { text: string; r: import('../../shared/types').ChallengeResult; fresh: boolean }) {
  const v = VERDICT[r.verdict]
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-xl border p-3" style={{ borderColor: `${v.color}40`, background: `${v.color}0d` }}>
      <div className="mb-2 pr-28 text-[11px] italic text-white/45">“{text}”</div>
      <motion.div initial={fresh ? { scale: 2.6, rotate: -25, opacity: 0 } : false} animate={{ scale: 1, rotate: -8, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
        className="absolute right-3 top-3 rounded-md border-2 px-2 py-0.5 font-display text-xs font-bold tracking-widest"
        style={{ color: v.color, borderColor: v.color, boxShadow: `0 0 20px ${v.color}55` }}>
        {v.label}
      </motion.div>
      <p className="text-xs leading-relaxed text-white/75"><Rich text={r.rebuttal} /></p>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-white/45">
        Support now <b className="font-mono" style={{ color: confidenceColor(r.newConfidence) }}>{r.newConfidence}</b>
      </div>
      {r.counterQuotes.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/35"><Quote size={10} /> From the paper</div>
          {r.counterQuotes.map((q, i) => <QuoteBlock key={i} quote={q.quote} page={q.page} color={v.color} />)}
        </div>
      )}
      <div className="mt-2 rounded-lg bg-black/25 p-2 text-[11px] text-white/55">🔬 <b className="text-white/75">Would settle it:</b> {r.whatWouldConvince}</div>
    </motion.div>
  )
}

// ---------------- other entities ----------------

function EntityView({ id }: { id: string }) {
  const { analysis: a, showInPdf, cascade, broken } = useWorkspace()
  const kind = kindOf(id) as NodeKind
  const color = KIND_COLOR[kind]
  const dmg = broken.has(id) ? 1 : cascade.damage.get(id) ?? 0
  const ev = a.evidence.find(x => x.id === id)
  const as = a.assumptions.find(x => x.id === id)
  const me = a.methods.find(x => x.id === id)
  const eq = a.equations.find(x => x.id === id)
  const li = a.limitations.find(x => x.id === id)
  const ci = a.citations.find(x => x.id === id)
  const title = ev?.short ?? as?.short ?? me?.short ?? eq?.name ?? li?.short ?? ci?.title ?? id
  const page = ev?.page ?? as?.page ?? me?.page ?? eq?.page ?? li?.page

  return (
    <div>
      <Back />
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill color={color}>{kind} {id}</Pill>
        {ev && <Pill color={color}>{ev.kind}</Pill>}
        {as && <Pill color={as.explicit ? color : '#fb923c'}>{as.explicit ? 'stated' : 'hidden'}</Pill>}
        {li && <Pill color={li.acknowledged ? '#94a3b8' : '#ef4444'}>{li.acknowledged ? 'acknowledged by authors' : 'not acknowledged'}</Pill>}
        {ci && <Pill color={color}>{ci.role} · {ci.year}</Pill>}
        {dmg > 0.05 && <Pill color="#ef4444">{broken.has(id) ? 'assumed false' : `-${Math.round(dmg * 100)}% cascade`}</Pill>}
      </div>
      <h2 className="mt-2 font-display text-xl font-bold leading-tight" style={{ textShadow: `0 0 24px ${color}55` }}>{title}</h2>

      {ev && <><p className="mt-3 text-sm leading-relaxed text-white/70">{ev.summary}</p><div className="mt-3"><Meter value={ev.strength} color={color} label="strength" /></div><div className="mt-3"><QuoteBlock quote={ev.quote} page={ev.page} color={color} /></div></>}
      {as && <><p className="mt-3 text-sm leading-relaxed text-white/70">{as.text}</p><div className="mt-3"><Meter value={as.fragility} color="#fb923c" label="fragility" /></div>{as.quote && <div className="mt-3"><QuoteBlock quote={as.quote} page={as.page} color={color} /></div>}</>}
      {me && <p className="mt-3 text-sm leading-relaxed text-white/70">{me.description}</p>}
      {li && <><p className="mt-3 text-sm leading-relaxed text-white/70">{li.text}</p><div className="mt-3"><Meter value={li.severity} color={color} label="severity" /></div></>}
      {ci && <p className="mt-2 text-sm text-white/55">{ci.authors}</p>}
      {eq && (
        <>
          <div className="mt-4 rounded-xl border border-pink-300/20 bg-black/30 px-3 py-2 text-white"><Tex latex={eq.latex} /></div>
          <p className="mt-3 text-sm leading-relaxed text-white/70">{eq.meaning}</p>
          {eq.variables.length > 0 && (
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-white/[0.03] p-3 text-xs">
              {eq.variables.map(v => (
                <div key={v.symbol} className="contents">
                  <span className="text-pink-200"><Tex latex={v.symbol} display={false} /></span>
                  <span className="text-white/60">{v.meaning}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4"><PlayableEquation equationId={eq.id} /></div>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {page != null && (
          <button onClick={() => showInPdf(page, ev?.quote ?? as?.quote)} className="flex items-center gap-1.5 rounded-lg border border-amber-300/25 bg-amber-400/5 px-2.5 py-1.5 text-xs text-amber-100 hover:bg-amber-400/15">
            <FileSearch size={13} /> Show in paper
          </button>
        )}
        {kind !== 'limitation' && kind !== 'equation' && <BreakButton id={id} />}
      </div>
      <Connections id={id} />
    </div>
  )
}
