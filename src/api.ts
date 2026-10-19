import type { ChallengeResult, Playable, Simulation, StreamEvent } from '../shared/types'

// POST the PDF and consume the server-sent event stream of build progress.
export async function analyze(file: File, onEvent: (e: StreamEvent) => void) {
  const form = new FormData()
  form.append('pdf', file)
  const res = await fetch('/api/analyze', { method: 'POST', body: form })
  if (!res.body) throw new Error('No response stream')
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    const frames = buf.split('\n\n')
    buf = frames.pop() ?? ''
    for (const f of frames) if (f.startsWith('data: ')) onEvent(JSON.parse(f.slice(6)))
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Request failed')
  return json
}

export const challenge = (docId: string, claimId: string, text: string) =>
  post<ChallengeResult>('/api/challenge', { docId, claimId, challenge: text })
export const playable = (docId: string, equationId: string) => post<Playable>('/api/playable', { docId, equationId })
export const simulate = (docId: string, claimId: string) => post<Simulation>('/api/simulate', { docId, claimId })

export async function loadSample(): Promise<File> {
  const blob = await (await fetch('/samples/attention.pdf')).blob()
  return new File([blob], 'Attention Is All You Need.pdf', { type: 'application/pdf' })
}
