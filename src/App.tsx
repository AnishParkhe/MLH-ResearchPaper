import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import type { Analysis } from '../shared/types'
import { analyze } from './api'
import Building from './components/Building'
import Landing from './components/Landing'
import Workspace from './components/Workspace'
import { WorkspaceProvider } from './store'

type Phase =
  | { name: 'landing'; error?: string }
  | { name: 'building'; file: File }
  | { name: 'ready'; docId: string; analysis: Analysis; model: string }

export default function App() {
  const [phase, setPhase] = useState<Phase>({ name: 'landing' })
  const [stage, setStage] = useState('Uploading')
  const [found, setFound] = useState<string[]>([])

  async function start(file: File) {
    setStage('Uploading to Gemini')
    setFound([])
    setPhase({ name: 'building', file })
    let pending: Phase | null = null
    try {
      await analyze(file, e => {
        if (e.type === 'stage') setStage(e.stage)
        else if (e.type === 'found') setFound(f => [...f, ...e.ids])
        else if (e.type === 'done') pending = { name: 'ready', docId: e.docId, analysis: e.analysis, model: e.model }
        else if (e.type === 'error') pending = { name: 'landing', error: e.message }
      })
    } catch (err) {
      pending = { name: 'landing', error: String((err as Error).message) }
    }
    if (pending && (pending as Phase).name === 'ready') {
      setStage('Igniting the time machine')
      await new Promise(r => setTimeout(r, 700))
    }
    setPhase(pending ?? { name: 'landing', error: 'Analysis ended unexpectedly.' })
  }

  return (
    <AnimatePresence mode="wait">
      {phase.name === 'landing' && (
        <motion.div key="landing" className="h-full" exit={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }} transition={{ duration: 0.5 }}>
          <Landing onFile={start} error={phase.error} />
        </motion.div>
      )}
      {phase.name === 'building' && (
        <motion.div key="building" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.15, filter: 'blur(12px)' }} transition={{ duration: 0.6 }}>
          <Building fileName={phase.file.name} stage={stage} found={found} />
        </motion.div>
      )}
      {phase.name === 'ready' && (
        <motion.div key={phase.docId} className="h-full" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>
          <WorkspaceProvider docId={phase.docId} analysis={phase.analysis} model={phase.model}>
            <Workspace onExit={() => setPhase({ name: 'landing' })} />
          </WorkspaceProvider>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
