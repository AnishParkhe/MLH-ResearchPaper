import { AnimatePresence, motion } from 'framer-motion'
import { BookOpenText, Hourglass, Network, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { confidenceColor } from '../graph'
import { useWorkspace } from '../store'
import Inspector from './Inspector'
import KnowledgeGraph from './KnowledgeGraph'
import PdfPane from './PdfPane'
import Timeline from './Timeline'

export default function Workspace({ onExit }: { onExit: () => void }) {
  const { analysis, score, model, select, pdfTarget } = useWorkspace()
  const [view, setView] = useState<'graph' | 'timeline'>('graph')
  const [pdfOpen, setPdfOpen] = useState(window.innerWidth > 1500)

  // Any "show in paper" request opens the PDF pane.
  useEffect(() => { if (pdfTarget) setPdfOpen(true) }, [pdfTarget])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  return (
    <div className="flex h-full flex-col bg-[radial-gradient(ellipse_at_center,rgba(76,29,149,0.18),transparent_70%)]">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-white/5 bg-ink-950/60 px-4 backdrop-blur">
        <button onClick={onExit} className="flex items-center gap-2 font-display font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <Hourglass size={16} />
          </span>
          <span className="hidden text-gradient lg:inline">Research Time Machine</span>
        </button>
        <div className="h-6 w-px bg-white/10" />
        <div className="min-w-0 flex-1 truncate text-sm text-white/70" title={analysis.paper.title}>{analysis.paper.title}</div>

        <div className="flex rounded-xl bg-white/[0.04] p-1">
          {([['graph', Network, 'Knowledge graph'], ['timeline', Hourglass, 'Time machine']] as const).map(([k, Icon, label]) => (
            <button key={k} onClick={() => { setView(k); if (k === 'timeline') setPdfOpen(false) }}
              className={clsx('relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition', view === k ? 'text-white' : 'text-white/45 hover:text-white/80')}>
              {view === k && <motion.span layoutId="view" className="absolute inset-0 rounded-lg bg-violet-500/30 ring-1 ring-violet-300/30" />}
              <Icon size={13} className="relative" /><span className="relative">{label}</span>
            </button>
          ))}
        </div>

        <button onClick={() => setPdfOpen(o => !o)}
          className={clsx('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition', pdfOpen ? 'bg-amber-400/15 text-amber-100' : 'text-white/50 hover:text-white')}>
          {pdfOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />} <BookOpenText size={14} /> Paper
        </button>

        <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Robustness</span>
          <motion.span key={score} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="font-mono text-sm font-bold" style={{ color: confidenceColor(score) }}>{score}</motion.span>
        </div>
        <div className="hidden items-center gap-1 text-[10px] text-white/30 xl:flex"><Sparkles size={11} /> {model === 'cache' ? 'Gemini · cached' : model}</div>
      </header>

      <div className="flex min-h-0 flex-1">
        <AnimatePresence initial={false}>
          {pdfOpen && (
            <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 'min(36vw, 560px)', opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="shrink-0 overflow-hidden border-r border-white/5">
              <PdfPane />
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="relative min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div key={view} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {view === 'graph' ? <KnowledgeGraph /> : <Timeline />}
            </motion.div>
          </AnimatePresence>
        </main>

        <aside className="glass w-[420px] shrink-0 border-y-0 border-r-0">
          <Inspector />
        </aside>
      </div>
    </div>
  )
}
