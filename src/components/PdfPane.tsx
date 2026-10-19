import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { useWorkspace } from '../store'
import { Spinner } from './ui'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

type Rect = { left: number; top: number; width: number; height: number }

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '')

// Locate a (possibly slightly imperfect) quote in a page's text layer and return highlight rects.
async function findQuote(page: PDFPageProxy, quote: string, scale: number): Promise<Rect[] | null> {
  const viewport = page.getViewport({ scale })
  const content = await page.getTextContent()
  const items = content.items.filter((i): i is typeof i & { str: string; transform: number[]; width: number; height: number } => 'str' in i)
  let text = ''
  const owner: number[] = []
  items.forEach((it, idx) => {
    const n = norm(it.str)
    text += n
    for (let k = 0; k < n.length; k++) owner.push(idx)
  })
  const q = norm(quote)
  if (q.length < 6) return null
  const candidates = [q, q.slice(0, 60), q.slice(-60), q.slice(0, 35), q.slice(-35), q.slice(Math.floor(q.length / 2) - 18, Math.floor(q.length / 2) + 18)]
  for (const c of candidates) {
    if (c.length < 12) continue
    const at = text.indexOf(c)
    if (at < 0) continue
    // Expand to the full quote span when we matched a fragment.
    const start = c === q.slice(-60) || c === q.slice(-35) ? Math.max(0, at + c.length - q.length) : at
    const end = Math.min(text.length - 1, start + q.length - 1)
    const first = owner[start], last = owner[end]
    const rects: Rect[] = []
    for (let i = first; i <= last; i++) {
      const it = items[i]
      if (!it.str.trim()) continue
      const [x, y] = [it.transform[4], it.transform[5]]
      const h = it.height || Math.hypot(it.transform[2], it.transform[3])
      const [x1, y1] = viewport.convertToViewportPoint(x, y)
      const [x2, y2] = viewport.convertToViewportPoint(x + it.width, y + h)
      rects.push({ left: Math.min(x1, x2) - 1, top: Math.min(y1, y2) - 1, width: Math.abs(x2 - x1) + 2, height: Math.abs(y2 - y1) + 2 })
    }
    return rects
  }
  return null
}

export default function PdfPane() {
  const { docId, pdfTarget } = useWorkspace()
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [width, setWidth] = useState(500)
  const [aspect, setAspect] = useState(1.3)
  const [hl, setHl] = useState<{ page: number; rects: Rect[]; nonce: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let alive = true
    const task = pdfjs.getDocument({ url: `/api/doc/${docId}/pdf` })
    task.promise.then(async d => {
      if (!alive) return
      const p1 = await d.getPage(1)
      const v = p1.getViewport({ scale: 1 })
      setAspect(v.height / v.width)
      setDoc(d)
    }).catch(() => {}) // aborted by StrictMode remount / unmount
    return () => { alive = false; task.destroy() }
  }, [docId])

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width - 24)))
    ro.observe(box.current!)
    return () => ro.disconnect()
  }, [])

  // Jump + highlight when something asks to "show in paper".
  useEffect(() => {
    if (!doc || !pdfTarget) return
    let cancelled = false
    ;(async () => {
      const n = doc.numPages
      const want = Math.min(Math.max(1, pdfTarget.page || 1), n)
      const order = [want, want - 1, want + 1, ...Array.from({ length: n }, (_, i) => i + 1)].filter((p, i, a) => p >= 1 && p <= n && a.indexOf(p) === i)
      let found: { page: number; rects: Rect[] } | null = null
      if (pdfTarget.quote) {
        for (const p of order) {
          const page = await doc.getPage(p)
          const base = page.getViewport({ scale: 1 })
          const rects = await findQuote(page, pdfTarget.quote, width / base.width)
          if (rects?.length) { found = { page: p, rects }; break }
        }
      }
      if (cancelled) return
      const page = found?.page ?? want
      setHl({ page, rects: found?.rects ?? [], nonce: pdfTarget.nonce })
      const el = pageRefs.current[page - 1]
      const top = found?.rects[0]?.top ?? 0
      if (el && box.current) box.current.scrollTo({ top: el.offsetTop + top - 120, behavior: 'smooth' })
    })()
    return () => { cancelled = true }
  }, [doc, pdfTarget, width])

  return (
    <div ref={box} className="scroll-thin h-full overflow-y-auto bg-ink-900/60 px-3 py-3">
      {!doc && <div className="flex h-full items-center justify-center gap-2 text-sm text-white/40"><Spinner /> Loading PDF…</div>}
      {doc && Array.from({ length: doc.numPages }, (_, i) => (
        <div key={i} ref={el => { pageRefs.current[i] = el }} className="relative mb-3">
          <PdfPage doc={doc} num={i + 1} width={width} height={width * aspect}
            rects={hl?.page === i + 1 ? hl.rects : null} nonce={hl?.nonce} flash={hl?.page === i + 1 && !hl.rects.length} />
        </div>
      ))}
    </div>
  )
}

function PdfPage({ doc, num, width, height, rects, nonce, flash }: {
  doc: PDFDocumentProxy; num: number; width: number; height: number; rects: Rect[] | null; nonce?: number; flash: boolean
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '600px' })
    io.observe(wrap.current!)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let task: ReturnType<PDFPageProxy['render']> | null = null
    let cancelled = false
    doc.getPage(num).then(page => {
      if (cancelled || !canvas.current) return
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      const dpr = window.devicePixelRatio || 1
      const c = canvas.current
      c.width = Math.floor(viewport.width * dpr)
      c.height = Math.floor(viewport.height * dpr)
      c.style.width = `${viewport.width}px`
      c.style.height = `${viewport.height}px`
      task = page.render({ canvas: c, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
      task.promise.catch(() => {})
    })
    return () => { cancelled = true; task?.cancel() }
  }, [visible, doc, num, width])

  return (
    <div ref={wrap} className={`relative overflow-hidden rounded-md bg-white shadow-xl shadow-black/40 transition-shadow ${flash ? 'ring-4 ring-amber-300/70' : ''}`}
      style={{ width, height }}>
      <canvas ref={canvas} />
      {rects?.map((r, i) => <div key={`${nonce}-${i}`} className="pdf-hl" style={r} />)}
      <div className="absolute bottom-1 right-2 rounded bg-black/60 px-1.5 font-mono text-[10px] text-white/70">{num}</div>
    </div>
  )
}
