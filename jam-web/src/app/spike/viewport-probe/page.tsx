'use client'

// 측정용 화면(티켓 20261115_1557) — 아이폰 사파리가 화면 아래쪽을 어떻게 계산하는지 캡처 한 장으로 확인한다.
// 주소: /spike/viewport-probe (로그인 없이 열린다). 확인이 끝나면 지운다.

import { useEffect, useRef, useState, type CSSProperties } from 'react'

const COLUMNS: { label: string; name: string; color: string; style: CSSProperties }[] = [
  { label: '1', name: 'fixed top0 bottom0', color: 'rgba(239,68,68,.5)', style: { position: 'fixed', top: 0, bottom: 0 } },
  { label: '2', name: 'fixed 100dvh', color: 'rgba(249,115,22,.5)', style: { position: 'fixed', top: 0, height: '100dvh' } },
  { label: '3', name: 'fixed 100lvh', color: 'rgba(234,179,8,.55)', style: { position: 'fixed', top: 0, height: '100lvh' } },
  { label: '4', name: 'fixed bottom-60', color: 'rgba(34,197,94,.5)', style: { position: 'fixed', top: 0, bottom: -60 } },
  { label: '5', name: 'abs 100dvh', color: 'rgba(59,130,246,.5)', style: { position: 'absolute', top: 0, height: '100dvh' } },
  { label: '6', name: 'abs 100lvh', color: 'rgba(168,85,247,.5)', style: { position: 'absolute', top: 0, height: '100lvh' } },
]
const UNITS = ['100svh', '100dvh', '100lvh', '100vh'] as const
const TICKS = 'repeating-linear-gradient(to bottom, rgba(0,0,0,.45) 0 1px, transparent 1px 20px)'
const MARKS = [300, 400, 500, 600, 700, 800, 900, 1000]
const RULER = Array.from({ length: 17 }, (_, i) => 250 + i * 50)

export default function Page() {
  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  const unitRefs = useRef<(HTMLDivElement | null)[]>([])
  const safeRef = useRef<HTMLDivElement | null>(null)
  const [rows, setRows] = useState<string[]>([])

  useEffect(() => {
    const r1 = (n: number) => String(Math.round(n * 10) / 10)
    const measure = () => {
      const vv = window.visualViewport
      const safe = safeRef.current ? getComputedStyle(safeRef.current) : null
      const ua = navigator.userAgent
      const os = (ua.match(/OS (\d+[_\d]*)/) || [])[1]?.replace(/_/g, '.') ?? '?'
      const ver = (ua.match(/Version\/([\d.]+)/) || [])[1] ?? '?'
      const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
      setRows([
        `inner ${window.innerWidth}x${window.innerHeight} · client ${document.documentElement.clientHeight} · scrollY ${r1(window.scrollY)}`,
        `visual h ${vv ? r1(vv.height) : '-'} · offsetTop ${vv ? r1(vv.offsetTop) : '-'} · pageTop ${vv ? r1(vv.pageTop) : '-'} · scale ${vv ? r1(vv.scale) : '-'}`,
        `screen ${screen.width}x${screen.height} · dpr ${window.devicePixelRatio} · safe top ${safe?.paddingTop ?? '-'} bottom ${safe?.paddingBottom ?? '-'}`,
        UNITS.map((u, i) => `${u.slice(3)} ${r1(unitRefs.current[i]?.getBoundingClientRect().height ?? 0)}`).join(' · '),
        COLUMNS.map((c, i) => `${c.label}=${r1(colRefs.current[i]?.getBoundingClientRect().bottom ?? 0)}`).join(' · '),
        `iOS ${os} · Safari ${ver} · standalone ${standalone ? 'Y' : 'N'}`,
      ])
    }
    measure()
    const vv = window.visualViewport
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    vv?.addEventListener('resize', measure)
    vv?.addEventListener('scroll', measure)
    const timer = setInterval(measure, 1000)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure)
      vv?.removeEventListener('resize', measure)
      vv?.removeEventListener('scroll', measure)
      clearInterval(timer)
    }
  }, [])

  return (
    <div style={{ position: 'relative', minHeight: 1100, background: '#f3f4f6', color: '#111', fontFamily: 'ui-monospace, Menlo, monospace' }}>
      {COLUMNS.map((c, i) => (
        <div
          key={c.label}
          ref={(el) => { colRefs.current[i] = el }}
          style={{ ...c.style, left: `${i * 14}%`, width: '13%', backgroundColor: c.color, backgroundImage: TICKS, overflow: 'hidden', zIndex: 1 }}
        >
          {MARKS.map((y) => (
            <span key={y} style={{ position: 'absolute', top: y, left: 2, fontSize: 11, fontWeight: 700, lineHeight: '12px' }}>
              {c.label}·{y}
            </span>
          ))}
        </div>
      ))}

      {/* 문서 좌표 눈금자 */}
      <div style={{ position: 'absolute', top: 0, left: '86%', width: '14%', height: 1100, backgroundColor: '#fff', backgroundImage: TICKS, zIndex: 1 }}>
        {RULER.map((y) => (
          <span key={y} style={{ position: 'absolute', top: y, left: 2, fontSize: 11, lineHeight: '12px' }}>{y}</span>
        ))}
      </div>

      {/* 수치 패널 */}
      <div style={{ position: 'fixed', top: 'env(safe-area-inset-top)', left: 0, right: 0, zIndex: 5, background: 'rgba(255,255,255,.94)', padding: '6px 8px', fontSize: 11, lineHeight: '15px', borderBottom: '1px solid #111' }}>
        <div style={{ fontWeight: 700 }}>맨 위에 둔 채로 캡처해 주세요</div>
        {rows.map((row) => (
          <div key={row}>{row}</div>
        ))}
        <div>{COLUMNS.map((c) => `${c.label} ${c.name}`).join(' / ')}</div>
      </div>

      {/* 단위와 안전 영역을 재는 보이지 않는 요소 */}
      {UNITS.map((u, i) => (
        <div key={u} ref={(el) => { unitRefs.current[i] = el }} style={{ position: 'fixed', top: 0, left: 0, width: 0, height: u, visibility: 'hidden', pointerEvents: 'none' }} />
      ))}
      <div ref={safeRef} style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', visibility: 'hidden', pointerEvents: 'none' }} />
    </div>
  )
}
