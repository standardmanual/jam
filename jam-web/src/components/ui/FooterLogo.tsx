'use client'

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/motion'

/**
 * 푸터 맨 아래 JAM! 로고 (티켓 20261104_1642) — 화면에 나타날 때 아래에서 위로 Ease In으로 올라온다.
 *
 * 모션(사용자 지시 2026-11-04): 로고가 보이기 시작하면 자기 높이만큼 아래(`translateY(100%)`)에서 제자리로
 * 올라온다. 바깥 틀이 `overflow-hidden`이라 로고는 페이지 맨 끝 선 아래에서 솟아오르는 것처럼 보인다.
 * 이징은 `ease-in`(느리게 시작해 빨라진다), 시간은 `--duration-slow`(400ms)다. `ease-in` 토큰은 없어 키워드를 그대로 쓴다.
 *
 * 단계: `ready`(서버·첫 그리기, 모션 없음 — 완전히 보임) → `hidden`(관찰 시작, 아래에 숨김) → `shown`(보임, 위로 올라옴).
 * `ready`에서 시작하므로 JS가 없거나 관찰자가 없는 환경에서도 로고는 항상 보인다. 모션 줄이기 요청이면 `ready`에 머문다.
 * 한 번 올라오면 관찰자를 해제한다. 라우트가 바뀌면 `Footer`가 `key`로 새로 마운트해 다음 화면에서 다시 올라온다.
 */
export default function FooterLogo() {
  const frameRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'ready' | 'hidden' | 'shown'>('ready')

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || prefersReducedMotion() || typeof window.IntersectionObserver === 'undefined') return

    let raf = 0
    const observer = new window.IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      // 숨긴 상태가 한 번 그려진 뒤에 올려야 transition이 돈다
      raf = window.requestAnimationFrame(() => setPhase('shown'))
    })
    setPhase('hidden')
    observer.observe(frame)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={frameRef} className="w-full overflow-hidden">
      <div
        className="jam-logo-mark w-full bg-[color:var(--snow)]"
        role="img"
        aria-label="JAM!"
        style={{
          transform: phase === 'hidden' ? 'translateY(100%)' : 'translateY(0)',
          transition: phase === 'shown' ? 'transform var(--duration-slow) ease-in' : 'none',
        }}
      />
    </div>
  )
}
