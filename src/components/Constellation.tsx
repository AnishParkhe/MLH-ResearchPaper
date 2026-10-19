import { useEffect, useRef } from 'react'

const COLORS = ['#a78bfa', '#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#67e8f9']

// Drifting particle network that reacts to the cursor.
export default function Constellation({ density = 0.00009 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, raf = 0
    const mouse = { x: -9999, y: -9999 }
    type P = { x: number; y: number; vx: number; vy: number; r: number; c: string }
    let ps: P[] = []
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.min(160, Math.floor(w * h * density))
      ps = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.8 + 0.6, c: COLORS[Math.floor(Math.random() * COLORS.length)],
      }))
    }
    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of ps) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy
        if (d2 < 22000) { p.vx += dx / d2 * 0.6; p.vy += dy / d2 * 0.6 }
        p.vx *= 0.99; p.vy *= 0.99
        p.x += p.vx + (Math.random() - 0.5) * 0.05; p.y += p.vy + (Math.random() - 0.5) * 0.05
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
      }
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i], b = ps[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d < 120) {
            ctx.strokeStyle = `rgba(167,139,250,${(1 - d / 120) * 0.22})`
            ctx.lineWidth = 0.6
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
          }
        }
      }
      for (const p of ps) {
        ctx.fillStyle = p.c
        ctx.shadowColor = p.c; ctx.shadowBlur = 8
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.shadowBlur = 0
      raf = requestAnimationFrame(tick)
    }
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top
    }
    resize(); tick()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('mousemove', onMove) }
  }, [density])
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />
}
