import type { Analysis, Edge, NodeKind } from '../shared/types'

export const KIND_COLOR: Record<NodeKind, string> = {
  claim: '#a78bfa',
  evidence: '#34d399',
  assumption: '#fbbf24',
  method: '#60a5fa',
  equation: '#f472b6',
  limitation: '#f87171',
  citation: '#94a3b8',
}

export const KIND_LABEL: Record<NodeKind, string> = {
  claim: 'Claims', evidence: 'Evidence', assumption: 'Assumptions', method: 'Methods',
  equation: 'Equations', limitation: 'Limitations', citation: 'Citations',
}

export const PREFIX_KIND: Record<string, NodeKind> = {
  C: 'claim', E: 'evidence', A: 'assumption', M: 'method', Q: 'equation', L: 'limitation', R: 'citation',
}

export const kindOf = (id: string): NodeKind => PREFIX_KIND[id[0]] ?? 'citation'

export interface GNode {
  id: string
  kind: NodeKind
  label: string
  weight: number // 0-100 intrinsic (confidence / strength / fragility / severity)
  central?: boolean
  x?: number
  y?: number
}
export interface GLink { source: string | GNode; target: string | GNode; relation: Edge['relation'] }

export function buildGraph(a: Analysis): { nodes: GNode[]; links: GLink[] } {
  const nodes: GNode[] = [
    ...a.claims.map(c => ({ id: c.id, kind: 'claim' as const, label: c.short, weight: c.confidence, central: c.type === 'central' })),
    ...a.evidence.map(e => ({ id: e.id, kind: 'evidence' as const, label: e.short, weight: e.strength })),
    ...a.assumptions.map(x => ({ id: x.id, kind: 'assumption' as const, label: x.short, weight: x.fragility })),
    ...a.methods.map(m => ({ id: m.id, kind: 'method' as const, label: m.short, weight: 50 })),
    ...a.equations.map(q => ({ id: q.id, kind: 'equation' as const, label: q.name, weight: 50 })),
    ...a.limitations.map(l => ({ id: l.id, kind: 'limitation' as const, label: l.short, weight: l.severity })),
    ...a.citations.map(r => ({ id: r.id, kind: 'citation' as const, label: `${shortTitle(r.title)} '${String(r.year).slice(2)}`, weight: 30 })),
  ]
  return { nodes, links: a.edges.map(e => ({ ...e })) }
}

const shortTitle = (t: string) => (t.length > 28 ? t.slice(0, 26) + '…' : t)

// How strongly damage flows along each relation (source -> target means target depends on source).
const FLOW: Partial<Record<Edge['relation'], number>> = {
  assumes: 0.9, leads_to: 0.8, supports: 0.65, derives: 0.6, uses: 0.5, builds_on: 0.4,
}

export interface Cascade {
  damage: Map<string, number> // 0..1
  depth: Map<string, number> // hops from nearest broken node (for staggered animation)
}

// Noisy-OR propagation of "what if this were false" through the dependency graph.
export function propagate(a: Analysis, broken: Set<string>): Cascade {
  const damage = new Map<string, number>()
  const depth = new Map<string, number>()
  broken.forEach(id => { damage.set(id, 1); depth.set(id, 0) })
  const incoming = new Map<string, Edge[]>()
  for (const e of a.edges) if (FLOW[e.relation]) incoming.set(e.target, [...(incoming.get(e.target) ?? []), e])

  for (let pass = 0; pass < 8; pass++) {
    let changed = false
    for (const [target, edges] of incoming) {
      if (broken.has(target)) continue
      let survive = 1
      let minDepth = Infinity
      for (const e of edges) {
        const d = damage.get(e.source) ?? 0
        if (d > 0.01) {
          survive *= 1 - d * FLOW[e.relation]!
          minDepth = Math.min(minDepth, (depth.get(e.source) ?? 0) + 1)
        }
      }
      const dmg = 1 - survive
      if (dmg > (damage.get(target) ?? 0) + 1e-3) {
        damage.set(target, dmg)
        depth.set(target, minDepth)
        changed = true
      }
    }
    if (!changed) break
  }
  return { damage, depth }
}

export function effectiveConfidence(base: number, damage = 0) {
  return Math.round(base * (1 - damage))
}

export function robustness(a: Analysis, cascade: Cascade, overrides: Record<string, number>) {
  let sum = 0
  let w = 0
  for (const c of a.claims) {
    const weight = c.type === 'central' ? 2 : 1
    sum += effectiveConfidence(overrides[c.id] ?? c.confidence, cascade.damage.get(c.id)) * weight
    w += weight
  }
  return w ? Math.round(sum / w) : 0
}

export function confidenceColor(v: number) {
  const hue = Math.max(0, Math.min(140, (v / 100) * 140))
  return `hsl(${hue} 85% 62%)`
}

export function neighbors(links: GLink[], id: string) {
  const set = new Set<string>([id])
  for (const l of links) {
    const s = typeof l.source === 'string' ? l.source : l.source.id
    const t = typeof l.target === 'string' ? l.target : l.target.id
    if (s === id) set.add(t)
    if (t === id) set.add(s)
  }
  return set
}
