import { motion } from 'framer-motion'
import { AlertTriangle, FileText, FlaskConical, GitBranch, Hourglass, Sparkles, Swords, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import clsx from 'clsx'
import { loadSample } from '../api'
import Constellation from './Constellation'

const FEATURES = [
  { icon: GitBranch, label: 'Citation-linked knowledge graph', color: '#a78bfa' },
  { icon: Swords, label: 'Challenge any claim', color: '#f472b6' },
  { icon: FlaskConical, label: 'Experiments that could disprove it', color: '#34d399' },
  { icon: Hourglass, label: 'Travel the paper’s timeline', color: '#fbbf24' },
]

export default function Landing({ onFile, error }: { onFile: (f: File) => void; error?: string }) {
  const [drag, setDrag] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const take = (f?: File | null) => f && f.type === 'application/pdf' && onFile(f)

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.25),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(16,185,129,0.15),transparent_50%)]" />
      <Constellation />

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center px-6 text-center">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
          <Sparkles size={13} /> Powered by Google Gemini
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="font-display text-6xl font-bold tracking-tight md:text-7xl">
          <span className="text-gradient">Research</span><br />Time Machine
        </motion.h1>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="mt-5 max-w-xl text-lg text-white/60">
          Drop in a paper. Watch it become a living experiment: every claim, the evidence behind it,
          the assumptions under it, and the experiment that could prove it wrong.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files[0]) }}
          onClick={() => input.current?.click()}
          className={clsx(
            'glass group mt-10 flex w-full cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-8 py-10 transition-all',
            drag ? 'scale-[1.02] border-violet-300 shadow-[0_0_60px_rgba(167,139,250,0.45)]' : 'border-violet-400/25 hover:border-violet-300/60 hover:shadow-[0_0_40px_rgba(167,139,250,0.25)]',
          )}>
          <motion.div animate={{ y: drag ? -6 : [0, -5, 0] }} transition={{ repeat: drag ? 0 : Infinity, duration: 2.4 }}
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/40">
            <Upload className="text-white" />
          </motion.div>
          <div className="font-display text-xl font-semibold">Drop a research paper PDF</div>
          <div className="text-sm text-white/45">or click to browse · up to 20 MB</div>
          <input ref={input} type="file" accept="application/pdf" hidden onChange={e => take(e.target.files?.[0])} />
        </motion.div>

        <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          disabled={loadingSample}
          onClick={async () => { setLoadingSample(true); onFile(await loadSample()) }}
          className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-emerald-300/50 hover:bg-emerald-400/10 hover:text-white">
          <FileText size={15} className="text-emerald-300" /> Try it on <em className="font-serif">“Attention Is All You Need”</em>
        </motion.button>

        {error && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="mt-5 flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
            <AlertTriangle size={15} /> {error}
          </motion.div>
        )}

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {FEATURES.map((f, i) => (
            <motion.div key={f.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 + i * 0.08 }}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60">
              <f.icon size={13} style={{ color: f.color }} /> {f.label}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
