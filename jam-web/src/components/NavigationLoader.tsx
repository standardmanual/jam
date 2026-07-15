'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { DotmHex8 } from '@/components/ui/dotm-hex-8'

const MIN_VISIBLE_MS = 400  // flash 방지 — 최소 이 시간만큼은 표시
const FADE_OUT_MS   = 200  // 페이드아웃 duration
const MAX_VISIBLE_MS = 8000 // 오류 등으로 탐색이 멈혔을 때 강제 숨김

type Phase = 'hidden' | 'showing' | 'fading'

function Inner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [phase, setPhase] = useState<Phase>('hidden')

  const showTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  const fadeOut = useCallback(() => {
    setPhase('fading')
    timerRef.current = setTimeout(() => setPhase('hidden'), FADE_OUT_MS)
  }, [])

  // 라우트 전환 완료 → 최소 표시 시간을 채운 뒤 페이드아웃
  useEffect(() => {
    if (phase === 'hidden') return
    clearTimer()
    const elapsed = Date.now() - showTimeRef.current
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed)
    timerRef.current = setTimeout(fadeOut, delay)
    return clearTimer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  // 앱 내부 링크 클릭 감지 → 즉시 표시
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest('a[href]')
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      if (
        href.startsWith('http') ||
        href.startsWith('//') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('#')
      ) return

      clearTimer()
      showTimeRef.current = Date.now()
      setPhase('showing')
      // 안전장치: 8초 후 강제 숨김
      timerRef.current = setTimeout(fadeOut, MAX_VISIBLE_MS)
    }

    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      clearTimer()
    }
  }, [fadeOut])

  if (phase === 'hidden') return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-jam-cream/90 backdrop-blur-sm"
      style={{
        opacity: phase === 'fading' ? 0 : 1,
        transition: phase === 'fading' ? `opacity ${FADE_OUT_MS}ms ease-out` : 'opacity 80ms ease-in',
      }}
    >
      <DotmHex8
        size={89}
        dotSize={14}
        speed={1.35}
        pattern="full"
        colorPreset="grad-fire"
        animated
        opacityBase={0.12}
        opacityMid={0.42}
        opacityPeak={1}
      />
    </div>
  )
}

export function NavigationLoader() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  )
}
