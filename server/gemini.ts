import { GoogleGenAI, ThinkingLevel, type Part } from '@google/genai'
import type { Analysis, ChallengeResult, Edge, Playable, Simulation } from '../shared/types.ts'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
const MODELS = (process.env.GEMINI_MODELS || 'gemini-3.5-flash,gemini-flash-latest').split(',').map(s => s.trim())

// Errors worth retrying on the next model in the chain (quota, overload, retired model).
function isRetryable(err: unknown) {
  const msg = String((err as Error)?.message ?? err)
  return /\b(429|500|503|404)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|high demand|no longer available/i.test(msg)
}

// Walk the model chain; on transient overload, back off and walk it again.
async function withFallback<T>(fn: (model: string) => Promise<T>): Promise<{ result: T; model: string }> {
  let lastErr: unknown
  for (const delay of [0, 2000, 5000]) {
    if (delay) await new Promise(r => setTimeout(r, delay))
    for (const model of MODELS) {
      try {
        return { result: await fn(model), model }
      } catch (err) {
        lastErr = err
        console.warn(`[gemini] ${model} failed: ${String((err as Error)?.message ?? err).slice(0, 160)}`)
        if (!isRetryable(err)) throw err
      }
    }
  }
  throw lastErr
}

const pdfPart = (pdf: Buffer): Part => ({ inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } })

// ---------- JSON schemas (Gemini structured output) ----------

const str = { type: 'string' }
const int = { type: 'integer' }
const strArr = { type: 'array', items: str }
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties) })
const arr = (items: unknown) => ({ type: 'array', items })
const enumOf = (...values: string[]) => ({ type: 'string', enum: values })

const analysisSchema = obj({
  paper: obj({ title: str, authors: strArr, year: int, venue: str, field: str, tldr: str, hook: str }),
  claims: arr(obj({
    id: str, text: str, short: str,
    type: enumOf('central', 'supporting', 'empirical', 'theoretical'),
    confidence: int, page: int, quote: str,
    evidenceIds: strArr, assumptionIds: strArr, objections: strArr,
    falsify: obj({
      hypothesis: str, setup: strArr, metric: str, predictionIfFalse: str,
      difficulty: enumOf('easy', 'medium', 'hard'), cost: str, timeEstimate: str,
    }),
  })),
  evidence: arr(obj({
    id: str, kind: enumOf('experiment', 'dataset', 'theorem', 'figure', 'table', 'citation', 'observation'),
    short: str, summary: str, quote: str, page: int, strength: int,
  })),
  assumptions: arr(obj({ id: str, short: str, text: str, explicit: { type: 'boolean' }, fragility: int, page: int, quote: str })),
  methods: arr(obj({ id: str, short: str, description: str, page: int })),
  equations: arr(obj({ id: str, name: str, latex: str, meaning: str, page: int, variables: arr(obj({ symbol: str, meaning: str })) })),
  limitations: arr(obj({ id: str, short: str, text: str, acknowledged: { type: 'boolean' }, severity: int, page: int })),
  citations: arr(obj({ id: str, title: str, authors: str, year: int, role: enumOf('foundation', 'method', 'dataset', 'contrast', 'related') })),
  edges: arr(obj({
    source: str, target: str,
    relation: enumOf('supports', 'assumes', 'uses', 'derives', 'limits', 'builds_on', 'contradicts', 'leads_to'),
  })),
})

const ANALYSIS_PROMPT = `You are a meticulous scientific analyst turning a research paper into an interactive, falsifiable knowledge graph.

Read the attached PDF fully and extract:

- paper: metadata. "tldr" = 2 sentences for a smart non-expert. "hook" = one punchy sentence on why this paper matters.
- claims (5-9): the paper's actual claims, ids C1..Cn, most central first. "short" = 2-5 word label. "confidence" 0-100 = how strongly the paper's OWN evidence supports it (be honest and critical; not everything is 90+). "evidenceIds"/"assumptionIds" reference items below. "objections" = the 2 strongest skeptical challenges a reviewer could raise (one sentence each). "falsify" = a concrete, feasible experiment that could DISPROVE the claim: falsifiable hypothesis, 3-5 setup steps, the metric, what you'd observe if the claim were false, difficulty, rough cost, time estimate.
- evidence (6-14): ids E1..En — experiments, results, tables, figures, theorems backing claims. "strength" 0-100.
- assumptions (4-8): ids A1..An — explicit AND hidden assumptions the claims rely on. "fragility" 0-100 = how likely it is to fail in the real world.
- methods (2-6): ids M1..Mn.
- equations (0-6): ids Q1..Qn — the most important equations, as valid KaTeX LaTeX (no $ delimiters, no \\label, no equation numbers). Explain each variable.
- limitations (3-6): ids L1..Ln, including ones the authors did NOT acknowledge. "severity" 0-100.
- citations (6-15): ids R1..Rn — the most influential cited works with their publication year.
- edges: relationships BEYOND claim->evidence/assumption links (those are implied). Use:
  method -uses-> evidence, equation -derives-> claim, citation -builds_on-> claim or method,
  limitation -limits-> claim, claim -leads_to-> claim (logical dependency: source enables target),
  evidence -contradicts-> claim (if any tension exists).

CRITICAL RULES:
- "quote" fields must be copied VERBATIM from the PDF text (8-25 consecutive words, exact spelling, no paraphrase, no ellipsis) so they can be located and highlighted.
- "page" is the 1-based PDF page index where the quote appears.
- Every claim must link to at least one evidence item and one assumption.
- Use only ids you defined.`

export async function analyzePaper(
  pdf: Buffer,
  onFound: (ids: string[]) => void,
  onStage: (stage: string) => void,
): Promise<{ analysis: Analysis; model: string }> {
  const { result, model } = await withFallback(async model => {
    const stream = await ai.models.generateContentStream({
      model,
      contents: [{ role: 'user', parts: [pdfPart(pdf), { text: ANALYSIS_PROMPT }] }],
      config: { responseMimeType: 'application/json', responseJsonSchema: analysisSchema, temperature: 0.4 },
    })
    let text = ''
    const seen = new Set<string>()
    const stages: [string, string][] = [
      ['"paper"', 'Reading the paper'], ['"claims"', 'Extracting claims'], ['"evidence"', 'Tracing evidence'],
      ['"assumptions"', 'Exposing hidden assumptions'], ['"methods"', 'Mapping methodology'],
      ['"equations"', 'Parsing equations'], ['"limitations"', 'Hunting limitations'],
      ['"citations"', 'Walking the citation graph'], ['"edges"', 'Wiring the knowledge graph'],
    ]
    let stageIdx = -1
    for await (const chunk of stream) {
      text += chunk.text ?? ''
      for (let i = stageIdx + 1; i < stages.length; i++) {
        if (text.includes(stages[i][0])) { stageIdx = i; onStage(stages[i][1]) }
      }
      const fresh: string[] = []
      for (const m of text.matchAll(/"id"\s*:\s*"([CEAMQLR]\d+)"/g)) {
        if (!seen.has(m[1])) { seen.add(m[1]); fresh.push(m[1]) }
      }
      if (fresh.length) onFound(fresh)
    }
    return JSON.parse(text) as Analysis
  })
  return { analysis: sanitize(result), model }
}

// Make the graph consistent: drop dangling refs, derive implied edges, dedupe.
function sanitize(a: Analysis): Analysis {
  for (const k of ['claims', 'evidence', 'assumptions', 'methods', 'equations', 'limitations', 'citations'] as const) {
    a[k] = (a[k] ?? []) as never
  }
  const ids = new Set([...a.claims, ...a.evidence, ...a.assumptions, ...a.methods, ...a.equations, ...a.limitations, ...a.citations].map(x => x.id))
  const edges: Edge[] = []
  const key = new Set<string>()
  const add = (e: Edge) => {
    const k = `${e.source}>${e.target}`
    if (e.source !== e.target && ids.has(e.source) && ids.has(e.target) && !key.has(k)) { key.add(k); edges.push(e) }
  }
  for (const c of a.claims) {
    c.evidenceIds = (c.evidenceIds ?? []).filter(id => ids.has(id))
    c.assumptionIds = (c.assumptionIds ?? []).filter(id => ids.has(id))
    c.confidence = clamp(c.confidence)
    c.evidenceIds.forEach(id => add({ source: id, target: c.id, relation: 'supports' }))
    c.assumptionIds.forEach(id => add({ source: id, target: c.id, relation: 'assumes' }))
  }
  for (const e of a.edges ?? []) add(e)
  a.edges = edges
  return a
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))

// ---------- Interactive follow-ups ----------

function claimContext(a: Analysis, claimId: string) {
  const c = a.claims.find(x => x.id === claimId)
  if (!c) throw new Error(`Unknown claim ${claimId}`)
  const ev = a.evidence.filter(e => c.evidenceIds.includes(e.id))
  const as = a.assumptions.filter(x => c.assumptionIds.includes(x.id))
  return { c, ctx: JSON.stringify({ paper: a.paper.title, claim: c, evidence: ev, assumptions: as, limitations: a.limitations }, null, 1) }
}

async function structured<T>(pdf: Buffer | null, prompt: string, schema: unknown): Promise<T> {
  const parts: Part[] = pdf ? [pdfPart(pdf), { text: prompt }] : [{ text: prompt }]
  const { result } = await withFallback(async model => {
    const config = { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.6 }
    // Low thinking keeps interactive calls snappy; fall back to defaults if a model rejects it.
    const res = await ai.models
      .generateContent({ model, contents: [{ role: 'user', parts }], config: { ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } })
      .catch(err => {
        if (/thinking/i.test(String(err?.message))) return ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config })
        throw err
      })
    return JSON.parse(res.text ?? '{}') as T
  })
  return result
}

export async function challengeClaim(pdf: Buffer, a: Analysis, claimId: string, challenge: string): Promise<ChallengeResult> {
  const { ctx } = claimContext(a, claimId)
  const r = await structured<ChallengeResult>(pdf, `You are an impartial, sharp scientific referee. A user is challenging a claim from the attached paper.

CONTEXT (extracted analysis):
${ctx}

USER'S CHALLENGE: """${challenge.slice(0, 1500)}"""

Judge the challenge strictly against what the paper actually shows. Be decisive, not diplomatic:
- verdict: "stands" (challenge fails), "weakened" (partially valid), or "falls" (challenge is fatal to the claim).
- newConfidence: updated 0-100 support for the claim (current: see claim.confidence).
- rebuttal: 2-4 punchy sentences explaining the ruling, citing specifics. Use **bold** for key phrases.
- counterQuotes: 1-3 VERBATIM quotes (8-25 words, exact text) from the PDF most relevant to the ruling, with 1-based page.
- whatWouldConvince: one sentence on what evidence would settle it.`, obj({
    verdict: enumOf('stands', 'weakened', 'falls'), newConfidence: int, rebuttal: str,
    counterQuotes: arr(obj({ quote: str, page: int })), whatWouldConvince: str,
  }))
  r.newConfidence = clamp(r.newConfidence)
  return r
}

export async function makePlayable(a: Analysis, equationId: string): Promise<Playable> {
  const q = a.equations.find(e => e.id === equationId)
  if (!q) throw new Error(`Unknown equation ${equationId}`)
  return structured<Playable>(null, `Turn this equation from the paper "${a.paper.title}" into an interactive explorable plot.

EQUATION: ${JSON.stringify(q)}

Produce a 1-D function y = f(x) that captures the equation's most insightful behaviour (simplify, reduce dimensions, or pick a representative slice if needed):
- expression: valid math.js syntax using ONLY the variable xVar and the param symbols (ASCII identifiers like alpha, d_k, T — no LaTeX, no backslashes). Allowed functions: exp, log, sqrt, sin, cos, tanh, abs, max, min, pow.
- xVar: the plain identifier used for the x axis; xMin/xMax: a sensible range where it's well-defined.
- params: 2-4 tunable parameters with plausible ranges, defaults ("value") and steps. Their symbol must appear in expression.
- xLabel / yLabel: short axis labels with meaning.
- insight: one sentence telling the user what to try ("Drag d_k up and watch...").`, obj({
    expression: str, xVar: str, xMin: { type: 'number' }, xMax: { type: 'number' }, xLabel: str, yLabel: str,
    params: arr(obj({ symbol: str, name: str, min: { type: 'number' }, max: { type: 'number' }, value: { type: 'number' }, step: { type: 'number' } })),
    insight: str,
  }))
}

export async function simulateExperiment(a: Analysis, claimId: string): Promise<Simulation> {
  const { ctx } = claimContext(a, claimId)
  return structured<Simulation>(null, `Simulate the predicted outcome of this falsification experiment, under two worlds: the claim is TRUE vs the claim is FALSE.

CONTEXT:
${ctx}

Produce 12-20 plausible data points along a meaningful x-axis (e.g. dataset size, dose, time, model scale) for the experiment's metric. "ifTrue" = what the metric looks like if the claim holds; "ifFalse" = if it is false. Make the curves diverge clearly in a decisive region.
- narrative: 2-3 sentences explaining how to read the chart.
- decisiveRegion: one sentence naming where on the x-axis the experiment decides the question.`, obj({
    xLabel: str, yLabel: str,
    points: arr(obj({ x: { type: 'number' }, ifTrue: { type: 'number' }, ifFalse: { type: 'number' } })),
    narrative: str, decisiveRegion: str,
  }))
}
