'use client'

import { useEffect, useRef } from 'react'
import { cssDurationMs } from '@/lib/motion'

/** 재시작 이후 애니메이션이 대략 이 정도 지속된다고 보고, 그 안에 다시 값이 바뀌면
 *  즉시 재시작하지 않고 애니메이션이 끝날 때까지 기다렸다가 마지막 값만 반영한다. */
function totalAnimationMs(): number {
  return cssDurationMs('--digit-dur', 500) + cssDurationMs('--digit-stagger', 70) * 2
}

/**
 * PopInNumber — 숫자가 갱신될 때 각 자리가 블러와 함께 아래에서 들어오는 전환.
 *
 * transitions.dev `02-number-pop-in.md`의 리플레이 오케스트레이션
 * (`.is-animating` 제거 → reflow 강제 → 재부착)을 React로 옮긴 것입니다.
 * CSS는 `src/components/transitions.css`의 "Number pop-in".
 *
 * 마지막 두 글자에 data-stagger="1" / "2"를 붙여 1×/2× --digit-stagger 만큼
 * 뒤따라오게 합니다. 첫 렌더에서는 애니메이션하지 않습니다(값이 "바뀐" 게 아니므로).
 *
 * 사용처: 팔로워 수, 포인트 잔액 등.
 */
export default function PopInNumber({
  value,
  className,
}: {
  value: string | number
  className?: string
}) {
  const text = String(value)
  const ref = useRef<HTMLSpanElement>(null)
  const prevRef = useRef(text)
  // 마지막으로 재시작한 애니메이션이 끝나는 예상 시각 — 그 전에 값이 또 바뀌면
  // 강제 재시작(classList remove→reflow→add)을 스킵하고 debounce한다.
  const animatingUntilRef = useRef(0)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (prevRef.current === text) return
    prevRef.current = text
    const el = ref.current
    if (!el) return

    function restart(target: HTMLSpanElement) {
      target.classList.remove('is-animating')
      void target.offsetHeight // force reflow
      target.classList.add('is-animating')
      animatingUntilRef.current = Date.now() + totalAnimationMs()
    }

    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current)
      pendingTimerRef.current = null
    }

    const remaining = animatingUntilRef.current - Date.now()
    if (remaining > 0) {
      // 이미 애니메이션 진행 중 — 재시작으로 끊지 않고, 진행 중인 애니메이션이 끝난
      // 뒤에 마지막 값(이 시점의 el 내용)만 반영한다.
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null
        if (ref.current) restart(ref.current)
      }, remaining)
      return
    }

    restart(el)

    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    }
  }, [text])

  const chars = text.split('')

  return (
    <span ref={ref} className={['t-digit-group', className].filter(Boolean).join(' ')}>
      {chars.map((ch, i) => (
        <span
          key={`${i}-${ch}`}
          className="t-digit"
          data-stagger={
            chars.length > 1 && i === chars.length - 2
              ? '1'
              : i === chars.length - 1
                ? '2'
                : undefined
          }
        >
          {ch}
        </span>
      ))}
    </span>
  )
}
