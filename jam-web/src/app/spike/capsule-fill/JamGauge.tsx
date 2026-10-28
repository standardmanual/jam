'use client'

import { useEffect, useRef, type Ref } from 'react'
import { prefersReducedMotion } from '@/lib/motion'
import { graphPercentToFillRatio } from './capsuleFillMath'

/**
 * 잼 게이지 — 어두운 캡슐 안에서 오렌지 캡슐이 오른쪽으로 차오르는 표현 컴포넌트 (티켓 20261028_1516)
 *
 * 화면 기록(2026-10-28)에서 읽은 모양이다. 어두운 트랙 위에 점 4개(20·40·60·80%)가 있고, 오렌지 채움은 왼쪽 끝에서 시작한다.
 * 그래프 2%(`graphPercent` 2)가 지름이 트랙 안쪽 높이와 같은 원이고, 100%는 트랙 안쪽을 가득 채운다.
 * 번개 아이콘은 채움의 오른쪽 끝 원 안에 붙어 같이 움직인다. 점은 채움 아래에 깔려서 채움이 지나가면 가려진다.
 *
 * 값과 시간은 모두 호출부가 정한다(`graphPercent`·`durationMs`·`easing`). 이 파일은 그리기만 하고 타이머를 모른다.
 * 수치(숫자·퍼센트)는 어디에도 그리지 않는다 — 상태는 `ariaLabel`로만 글자로 알린다.
 */

/** 오렌지 채움 색 (화면 기록의 채움 색) */
export const JAM_ORANGE = '#F94C31'
/** 어두운 트랙 색 */
export const GAUGE_TRACK = '#19201C'
/** 트랙 바깥 테두리 색 */
const GAUGE_RING = '#0B0F0D'
/** 번개와 흰 글자 색 */
export const GAUGE_ICON = '#FFFFFF'

/** 테두리 두께(px) */
const BORDER_PX = 3
/** 테두리 안쪽에서 채움까지의 간격(px) */
const PADDING_PX = 3
/** 트랙 위 점의 위치(트랙 안쪽 너비 기준 %) */
const DOT_POSITIONS = [20, 40, 60, 80] as const
const DOT_SIZE_PX = 5

/** 게이지 높이(px)가 정해지면 채움 원의 지름이 정해진다 */
export function gaugeCircleDiameter(height: number): number {
  return height - (BORDER_PX + PADDING_PX) * 2
}

/** 번개 아이콘 — 채움 오른쪽 끝 원과 오버레이가 같은 모양을 쓴다 */
export function JamBolt({ size, svgRef }: { size: number; svgRef?: Ref<SVGSVGElement> }) {
  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <path
        d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6l1-8Z"
        fill={GAUGE_ICON}
        stroke={GAUGE_ICON}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface Props {
  /** 그래프 눈금(2~100). 2가 캡슐 잼 0%다 */
  graphPercent: number
  /** 채움이 움직이는 시간(ms). 0이면 바로 옮겨 간다 */
  durationMs: number
  /** 채움이 움직이는 가속 곡선(CSS timing-function) */
  easing: string
  /** 게이지 높이(px) */
  height?: number
  /** 움직이는 동안 등 누를 수 없는 상태. 포커스는 그대로 둔다 */
  disabled?: boolean
  onClick: () => void
  ariaLabel: string
  /** 이 값이 바뀔 때마다 번개가 한 번 튄다. 0은 튀지 않는다 */
  pulseKey?: number
  /** 채움 요소 — 오버레이가 시작 자리를 잴 때 쓴다 */
  fillRef?: Ref<HTMLSpanElement>
}

export default function JamGauge({
  graphPercent,
  durationMs,
  easing,
  height = 72,
  disabled = false,
  onClick,
  ariaLabel,
  pulseKey = 0,
  fillRef,
}: Props) {
  const boltRef = useRef<SVGSVGElement>(null)
  const circle = gaugeCircleDiameter(height)
  const ratio = graphPercentToFillRatio(graphPercent)

  useEffect(() => {
    if (pulseKey === 0 || prefersReducedMotion()) return
    const bolt = boltRef.current
    if (!bolt) return
    const pulse = bolt.animate(
      [
        { transform: 'scale(1) rotate(0deg)' },
        { transform: 'scale(1.32) rotate(-12deg)', offset: 0.38 },
        { transform: 'scale(1) rotate(0deg)' },
      ],
      { duration: 520, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' }
    )
    return () => pulse.cancel()
  }, [pulseKey])

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onClick()
      }}
      className={`jam-press relative block w-full select-none rounded-full p-0 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      style={{
        height,
        boxSizing: 'border-box',
        padding: PADDING_PX,
        background: GAUGE_TRACK,
        border: `${BORDER_PX}px solid ${GAUGE_RING}`,
        boxShadow: '0 4px 0 rgba(25, 32, 28, 0.1)',
        touchAction: 'manipulation',
      }}
    >
      {/* 트랙 안쪽 — 점과 채움의 기준 상자 */}
      <span className="relative block h-full w-full">
        {DOT_POSITIONS.map((position) => (
          <span
            key={position}
            aria-hidden="true"
            className="absolute top-1/2 block rounded-full"
            style={{
              left: `${position}%`,
              width: DOT_SIZE_PX,
              height: DOT_SIZE_PX,
              transform: 'translate(-50%, -50%)',
              background: 'rgba(249, 249, 244, 0.22)',
            }}
          />
        ))}

        {/* 오렌지 채움: 너비 = 원 지름 + (트랙 안쪽 너비 - 원 지름) × 채움 정도 */}
        <span
          ref={fillRef}
          className="absolute left-0 top-0 block h-full rounded-full"
          style={{
            width: `calc(${circle}px + (100% - ${circle}px) * ${ratio})`,
            background: JAM_ORANGE,
            transition: durationMs > 0 ? `width ${durationMs}ms ${easing}` : 'none',
          }}
        >
          <span className="absolute right-0 top-0 grid h-full place-items-center" style={{ width: circle }}>
            <JamBolt size={Math.round(circle * 0.42)} svgRef={boltRef} />
          </span>
        </span>
      </span>
    </button>
  )
}
