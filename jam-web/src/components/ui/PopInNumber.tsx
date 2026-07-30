'use client'

import { useEffect, useRef } from 'react'

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

  useEffect(() => {
    if (prevRef.current === text) return
    prevRef.current = text
    const el = ref.current
    if (!el) return
    el.classList.remove('is-animating')
    void el.offsetHeight // force reflow
    el.classList.add('is-animating')
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
