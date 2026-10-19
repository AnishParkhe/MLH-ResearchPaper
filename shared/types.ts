// Shared data model between the Gemini pipeline (server) and the UI.

export type NodeKind = 'claim' | 'evidence' | 'assumption' | 'method' | 'equation' | 'limitation' | 'citation'

export interface Falsification {
  hypothesis: string
  setup: string[]
  metric: string
  predictionIfFalse: string
  difficulty: 'easy' | 'medium' | 'hard'
  cost: string
  timeEstimate: string
}

export interface Claim {
  id: string
  text: string
  short: string
  type: 'central' | 'supporting' | 'empirical' | 'theoretical'
  confidence: number // 0-100: how well the paper supports it
  page: number
  quote: string
  evidenceIds: string[]
  assumptionIds: string[]
  objections: string[]
  falsify: Falsification
}

export interface Evidence {
  id: string
  kind: 'experiment' | 'dataset' | 'theorem' | 'figure' | 'table' | 'citation' | 'observation'
  short: string
  summary: string
  quote: string
  page: number
  strength: number
}

export interface Assumption {
  id: string
  short: string
  text: string
  explicit: boolean
  fragility: number
  page: number
  quote: string
}

export interface Method {
  id: string
  short: string
  description: string
  page: number
}

export interface Equation {
  id: string
  name: string
  latex: string
  meaning: string
  page: number
  variables: { symbol: string; meaning: string }[]
}

export interface Limitation {
  id: string
  short: string
  text: string
  acknowledged: boolean
  severity: number
  page: number
}

export interface Citation {
  id: string
  title: string
  authors: string
  year: number
  role: 'foundation' | 'method' | 'dataset' | 'contrast' | 'related'
}

export interface Edge {
  source: string
  target: string
  relation: 'supports' | 'assumes' | 'uses' | 'derives' | 'limits' | 'builds_on' | 'contradicts' | 'leads_to'
}

export interface Analysis {
  paper: {
    title: string
    authors: string[]
    year: number
    venue: string
    field: string
    tldr: string
    hook: string
  }
  claims: Claim[]
  evidence: Evidence[]
  assumptions: Assumption[]
  methods: Method[]
  equations: Equation[]
  limitations: Limitation[]
  citations: Citation[]
  edges: Edge[]
}

export interface ChallengeResult {
  verdict: 'stands' | 'weakened' | 'falls'
  newConfidence: number
  rebuttal: string
  counterQuotes: { quote: string; page: number }[]
  whatWouldConvince: string
}

export interface Playable {
  expression: string
  xVar: string
  xMin: number
  xMax: number
  xLabel: string
  yLabel: string
  params: { symbol: string; name: string; min: number; max: number; value: number; step: number }[]
  insight: string
}

export interface Simulation {
  xLabel: string
  yLabel: string
  points: { x: number; ifTrue: number; ifFalse: number }[]
  narrative: string
  decisiveRegion: string
}

export type StreamEvent =
  | { type: 'stage'; stage: string }
  | { type: 'found'; ids: string[] }
  | { type: 'done'; docId: string; analysis: Analysis; cached: boolean; model: string }
  | { type: 'error'; message: string }
