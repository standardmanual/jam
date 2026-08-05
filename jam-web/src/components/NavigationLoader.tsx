'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import WanderingEyesLoader from '@/components/ui/wanderingeyesloader'

const SHOW_DELAY_MS = 1000 // 이 시간 안에 탐색이 끝나면 로더를 아예 띄우지 않는다
const MIN_VISIBLE_MS = 400  // flash 방지 — 일단 뜬 뒤엔 최소 이 시간만큼은 표시
const FADE_OUT_MS   = 200  // 페이드아웃 duration
const MAX_VISIBLE_MS = 8000 // 오류 등으로 탐색이 멈혔을 때 강제 숨김

// 'pending' — 탐색은 시작됐지만 아직 SHOW_DELAY_MS가 지나지 않아 화면엔 아무것도 안 보이는 상태
type Phase = 'hidden' | 'pending' | 'showing' | 'fading'

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

  // 라우트 전환 완료
  useEffect(() => {
    if (phase === 'hidden') return

    if (phase === 'pending') {
      // SHOW_DELAY_MS가 지나기 전에 탐색이 끝남 — 로더를 한 번도 보여주지 않고 종료
      clearTimer()
      timerRef.current = setTimeout(() => setPhase('hidden'), 0)
      return clearTimer
    }

    // 이미 보이는 중이었다면 최소 표시 시간을 채운 뒤 페이드아웃
    clearTimer()
    const elapsed = Date.now() - showTimeRef.current
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed)
    timerRef.current = setTimeout(fadeOut, delay)
    return clearTimer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  // 앱 내부 링크 클릭 감지 → SHOW_DELAY_MS 후에도 탐색 중이면 그때 표시
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
      setPhase('pending')
      timerRef.current = setTimeout(() => {
        showTimeRef.current = Date.now()
        setPhase('showing')
        // 안전장치: 표시된 뒤 8초가 더 지나면 강제 숨김
        timerRef.current = setTimeout(fadeOut, MAX_VISIBLE_MS)
      }, SHOW_DELAY_MS)
    }

    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      clearTimer()
    }
  }, [fadeOut])

  if (phase === 'hidden' || phase === 'pending') return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-surface/90 backdrop-blur-sm"
      style={{
        opacity: phase === 'fading' ? 0 : 1,
        transition: phase === 'fading' ? `opacity ${FADE_OUT_MS}ms ease-out` : 'opacity 80ms ease-in',
      }}
    >
      <WanderingEyesLoader duration="2s" eyeColor="#f8fafc" pupilColor="#0f172a" />
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
