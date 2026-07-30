'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cssDurationMs } from '@/lib/motion'

/**
 * SwapText — 같은 자리에서 텍스트가 바뀔 때 위로 빠지고 아래에서 들어오는 전환.
 *
 * transitions.dev `04-text-states-swap.md`의 3단계 오케스트레이션을 React로
 * 옮긴 것입니다. CSS는 `src/components/transitions.css`의 "Text states swap".
 *
 *   1. `.is-exit`        — 기존 텍스트가 위로 + 블러 + 페이드아웃
 *   2. --text-swap-dur 후 텍스트 교체 + `.is-enter-start`(아래로 점프, 트랜지션 없음)
 *   3. reflow 강제 후 `.is-enter-start` 제거 — 새 텍스트가 제자리로 애니메이션
 *
 * 사용처: 팔로우/팔로잉 버튼 라벨, 상태 문구("확인 중…" → "사용 가능") 등.
 */
export default function SwapText({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [text, setText] = useState(value)
  // 진입 단계 대기 중 플래그 — text가 DOM에 반영된 직후 useLayoutEffect에서 처리
  const enteringRef = useRef(false)

  // 1단계 — value가 바뀌면 exit부터
  useEffect(() => {
    if (value === text) return
    const el = ref.current
    if (!el) {
      setText(value)
      return
    }
    el.classList.add('is-exit')
    const dur = cssDurationMs('--text-swap-dur', 150)
    const timer = setTimeout(() => {
      enteringRef.current = true
      setText(value) // 2단계 — 새 텍스트를 DOM에 반영
    }, dur)
    return () => clearTimeout(timer)
    // text는 의도적으로 제외 — value 변화만 스왑을 트리거합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // 2·3단계 — 새 텍스트가 커밋된 직후(페인트 전) 진입 애니메이션을 건다
  useLayoutEffect(() => {
    if (!enteringRef.current) return
    enteringRef.current = false
    const el = ref.current
    if (!el) return
    el.classList.remove('is-exit')
    el.classList.add('is-enter-start')
    void el.offsetHeight // force reflow so the next change transitions
    el.classList.remove('is-enter-start')
  }, [text])

  return (
    <span ref={ref} className={['t-text-swap', className].filter(Boolean).join(' ')}>
      {text}
    </span>
  )
}
