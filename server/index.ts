import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Analysis, StreamEvent } from '../shared/types.ts'
import { analyzePaper, challengeClaim, makePlayable, simulateExperiment } from './gemini.ts'

const DATA = join(import.meta.dirname, '..', 'data')
mkdirSync(DATA, { recursive: true })

const app = express()
app.use(express.json({ limit: '1mb' }))
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// Docs are content-addressed: same PDF -> same docId -> instant cached analysis.
const pdfPath = (id: string) => join(DATA, `${id}.pdf`)
const jsonPath = (id: string) => join(DATA, `${id}.json`)

function loadDoc(id: string): { pdf: Buffer; analysis: Analysis } {
  if (!/^[a-f0-9]{16}$/.test(id) || !existsSync(jsonPath(id))) throw Object.assign(new Error('Unknown document'), { status: 404 })
  return { pdf: readFileSync(pdfPath(id)), analysis: JSON.parse(readFileSync(jsonPath(id), 'utf8')) }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

app.post('/api/analyze', upload.single('pdf'), async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  const send = (e: StreamEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`)
  try {
    const file = req.file
    if (!file || file.mimetype !== 'application/pdf') throw new Error('Please upload a PDF file.')
    const docId = createHash('sha256').update(file.buffer).digest('hex').slice(0, 16)

    if (existsSync(jsonPath(docId))) {
      // Cached: replay the build animation quickly so the demo still feels alive.
      const { analysis } = loadDoc(docId)
      const all = [analysis.claims, analysis.evidence, analysis.assumptions, analysis.methods, analysis.equations, analysis.limitations, analysis.citations]
      const stages = ['Extracting claims', 'Tracing evidence', 'Exposing hidden assumptions', 'Mapping methodology', 'Parsing equations', 'Hunting limitations', 'Walking the citation graph']
      for (let i = 0; i < all.length; i++) {
        send({ type: 'stage', stage: stages[i] })
        for (const item of all[i]) { send({ type: 'found', ids: [item.id] }); await sleep(70) }
      }
      send({ type: 'stage', stage: 'Wiring the knowledge graph' })
      await sleep(400)
      send({ type: 'done', docId, analysis, cached: true, model: 'cache' })
      return res.end()
    }

    writeFileSync(pdfPath(docId), file.buffer)
    const { analysis, model } = await analyzePaper(
      file.buffer,
      ids => send({ type: 'found', ids }),
      stage => send({ type: 'stage', stage }),
    )
    writeFileSync(jsonPath(docId), JSON.stringify(analysis, null, 2))
    send({ type: 'done', docId, analysis, cached: false, model })
  } catch (err) {
    console.error(err)
    send({ type: 'error', message: friendlyError(err) })
  }
  res.end()
})

app.get('/api/doc/:id/pdf', (req, res, next) => {
  try { res.type('application/pdf').send(loadDoc(req.params.id).pdf) } catch (e) { next(e) }
})

// Follow-up results are cached per doc so demo replays are instant and survive Gemini overloads.
async function cached<T>(docId: string, key: string, make: () => Promise<T>): Promise<T> {
  const file = join(DATA, `${docId}.extras.json`)
  const store: Record<string, T> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  if (store[key]) return store[key]
  const value = await make()
  store[key] = value
  writeFileSync(file, JSON.stringify(store, null, 1))
  return value
}

app.post('/api/challenge', async (req, res, next) => {
  try {
    const { docId, claimId } = req.body
    const challenge = String(req.body.challenge ?? '').trim()
    const { pdf, analysis } = loadDoc(docId)
    const key = `challenge:${claimId}:${createHash('sha1').update(challenge.toLowerCase()).digest('hex').slice(0, 12)}`
    res.json(await cached(docId, key, () => challengeClaim(pdf, analysis, claimId, challenge)))
  } catch (e) { next(e) }
})

app.post('/api/playable', async (req, res, next) => {
  try {
    const { docId, equationId } = req.body
    res.json(await cached(docId, `playable:${equationId}`, () => makePlayable(loadDoc(docId).analysis, equationId)))
  } catch (e) { next(e) }
})

app.post('/api/simulate', async (req, res, next) => {
  try {
    const { docId, claimId } = req.body
    res.json(await cached(docId, `simulate:${claimId}`, () => simulateExperiment(loadDoc(docId).analysis, claimId)))
  } catch (e) { next(e) }
})

function friendlyError(err: unknown) {
  const msg = String((err as Error)?.message ?? err)
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return 'Gemini free-tier quota hit. Wait a minute and try again (or try the sample paper — it is cached).'
  if (/503|overloaded|high demand/i.test(msg)) return 'Gemini is overloaded right now. Try again in a few seconds.'
  return msg.slice(0, 300)
}

app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.message)
  res.status(err.status ?? 500).json({ error: friendlyError(err) })
})

const port = Number(process.env.PORT || 8787)
app.listen(port, () => console.log(`⏳ Research Time Machine API on http://localhost:${port}`))
