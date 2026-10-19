import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Analysis, ChallengeResult } from '../shared/types'
import { propagate, robustness, type Cascade } from './graph'

export interface PdfTarget { page: number; quote?: string; nonce: number }

interface Workspace {
  docId: string
  analysis: Analysis
  model: string
  selected: string | null
  select: (id: string | null) => void
  broken: Set<string>
  toggleBroken: (id: string) => void
  resetBroken: () => void
  cascade: Cascade
  overrides: Record<string, number>
  challenges: Record<string, { text: string; result: ChallengeResult }[]>
  recordChallenge: (claimId: string, text: string, result: ChallengeResult) => void
  score: number
  pdfTarget: PdfTarget | null
  showInPdf: (page: number, quote?: string) => void
  tab: string
  setTab: (t: string) => void
}

const Ctx = createContext<Workspace | null>(null)

export function WorkspaceProvider({ docId, analysis, model, children }: { docId: string; analysis: Analysis; model: string; children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [broken, setBroken] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [challenges, setChallenges] = useState<Workspace['challenges']>({})
  const [pdfTarget, setPdfTarget] = useState<PdfTarget | null>(null)
  const [tab, setTab] = useState('evidence')

  const toggleBroken = useCallback((id: string) => {
    setBroken(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const recordChallenge = useCallback((claimId: string, text: string, result: ChallengeResult) => {
    setChallenges(prev => ({ ...prev, [claimId]: [{ text, result }, ...(prev[claimId] ?? [])] }))
    setOverrides(prev => ({ ...prev, [claimId]: result.newConfidence }))
    if (result.verdict === 'falls') setBroken(prev => new Set(prev).add(claimId))
  }, [])

  const cascade = useMemo(() => propagate(analysis, broken), [analysis, broken])
  const score = useMemo(() => robustness(analysis, cascade, overrides), [analysis, cascade, overrides])

  const value: Workspace = {
    docId, analysis, model, selected, select: setSelected, broken, toggleBroken,
    resetBroken: () => { setBroken(new Set()); setOverrides({}) },
    cascade, overrides, challenges, recordChallenge, score, pdfTarget,
    showInPdf: (page, quote) => setPdfTarget({ page, quote, nonce: Date.now() }),
    tab, setTab,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWorkspace() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWorkspace outside provider')
  return v
}
