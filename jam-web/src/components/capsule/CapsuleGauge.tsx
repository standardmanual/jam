'use client'

import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import { useCapsuleResult } from '@/components/capsule/capsuleResultContext'
import PopInNumber from '@/components/ui/PopInNumber'
import { prefersReducedMotion } from '@/lib/motion'
import {
  GAUGE_ENTRY_DELAY_MS,
  GAUGE_ENTRY_MS,
  GAUGE_ENTRY_TABBAR_CLEARANCE_PX,
  GAUGE_ENTRY_VISIBLE_RATIO,
  GRAPH_MIN_PERCENT,
  capsuleGraphPercent,
  capsuleNumberPlacement,
  capsuleNumberText,
  gaugeMoveDurationMs,
  graphPercentToFillRatio,
} from '@/lib/capsule/capsule-gauge'

/**
 * 캡슐 게이지 — 어두운 트랙 위에 오렌지 채움이 오른쪽으로 차오르는 서비스 전용 컴포넌트 (티켓 20261028_1739 2회, 채원 사전 판정 2026-10-30)
 *
 * 프로토타입 `JamGauge`(`app/spike/capsule-fill`, 4회차에 삭제)를 옮겼다. 어두운 트랙 위에 점 4개(20·40·60·80%)가 있고, 오렌지 채움은 왼쪽 끝에서 시작한다.
 * 그래프 2%가 지름이 트랙 안쪽 높이와 같은 원이고, 100%는 트랙 안쪽을 가득 채운다. 번개 아이콘은 채움의 오른쪽 끝 원 안에 붙어 같이 움직인다.
 *
 * 눌러도 아무 일도 없다 — `button`·`jam-press`·커서가 없고 접근성 역할은 `role="img"`다. 상태는 숫자 없는 `ariaLabel`로만 글자로 알린다.
 * `message`가 있으면(막힘) 숫자를 지우고 같은 자리(채움 안쪽 왼쪽, 트랙 색 글자)에 그 문구를 보인다. 채움이 도착한 뒤 투명에서 나타난다.
 * 퍼센트는 그리지 않는다. 채운 양(`filled`)의 숫자만 그리고(2026-11-04 사용자 결정, 이전에는 숫자를 그리지 않았다), 자리는 두 가지다.
 *  - 채운 비율이 50% 미만: 트랙 안쪽 오른쪽 끝, 오렌지 글자.
 *  - 채운 비율이 50% 이상: 채움 안쪽 왼쪽, 트랙 색 글자. 채움이 차오를 때 숫자도 번개 앞까지 같이 드러난다(번개를 덮지 않는다).
 *  숫자는 채움이 움직이기 시작하는 순간 같이 한 번 «팝인»한다(두 모션이 동시에 시작한다, 2026-11-04 사용자 결정, 이전에는 채움이 닿은 뒤였다. transitions.dev Number pop-in, 공유 `PopInNumber`: 각 자리가 블러와 함께 아래에서 들어오고 끝 두 자리가 뒤따른다, 2026-11-04 사용자 요청).
 *  시작 전에는 보이지 않고, 같은 화면에서 값이 바뀌면 새 값으로 옮겨 가기 시작할 때 다시 팝인한다. 모션 줄이기에서는 전환 없이 바로 보인다.
 *  합친 연출이 게이지를 붙드는 동안에는 안쪽·바깥쪽 모두 보이지 않는다(2% 원 안에 들어가지 않고, 연출 전에 값이 드러나지 않게 한다).
 *
 * 모션(채원 판정):
 *  - 진입: 한 방문에 한 번. 시작 눈금 2%, 끝은 `filled / required`. 260ms 쉰 뒤 1,500ms, `--ease-smooth-out`. 값이 0이면 모션이 없다.
 *    시작 시점은 «마운트»가 아니라 «트랙이 절반 이상 보일 때»다(티켓 20261031_1806, 하단 탭바가 가리는 높이는 보임에서 뺀다).
 *    이미 보이면 바로 260ms 뒤 시작하고, 시작하면 관찰자를 해제한다. `IntersectionObserver`가 없는 환경(시험·구형)에서는 즉시 시작한다.
 *  - 같은 화면에서 값이 바뀌면 처음부터 다시 돌지 않고 지금 값에서 새 값으로 700~1500ms 동안 옮겨 간다.
 *  - `prefers-reduced-motion`이면 쉼도 시간도 0이다.
 *  - 합친 연출(`CapsuleResultProvider`, 티켓 20261028_1740 3회)이 게이지를 붙들면(`gaugeHeld`) 값과 상관없이 2% 원으로 그리고 모션을 걸지 않는다.
 *    진입 모션도 돌지 않는다. 풀리면 2%에서 지금 값까지 위의 «값이 바뀜» 경로(`gaugeMoveDurationMs`)로 옮겨 간 뒤 번개가 한 번 튄다.
 *    모션 줄이기에서는 이동 시간이 0이고 번개도 튀지 않는다. 프로바이더 밖에서는 붙들리지 않는다.
 */

/** 게이지 높이(px) — 로딩 자리(Skeleton)와 오류 상자도 같은 높이를 쓴다 */
export const CAPSULE_GAUGE_HEIGHT_PX = 36
/** 테두리 두께(px) */
const BORDER_PX = 2
/** 테두리 안쪽에서 채움까지의 간격(px) */
const PADDING_PX = 2
/** 트랙 위 점의 위치(트랙 안쪽 너비 기준 %) */
const DOT_POSITIONS = [20, 40, 60, 80] as const
const DOT_SIZE_PX = 3
/** 숫자와 트랙·채움 가장자리 사이 간격(px) */
const NUMBER_EDGE_GAP_PX = 14
/** 숫자를 위로 올리는 양(px) — 글자 줄 상자의 가운데가 숫자 모양의 가운데보다 아래라 트랙 가운데에 맞추려고 올린다(2026-11-04 사용자 요청) */
const NUMBER_RISE_PX = 1
/** 번개와 흰 글자 색 */
const GAUGE_ICON = '#FFFFFF'
/** 번개 튐 — 이 컴포넌트 전용 수치라 모션 토큰을 새로 만들지 않는다 */
const BOLT_PULSE_MS = 420
const BOLT_PULSE_SCALE = 1.45

/** 게이지 높이(px)가 정해지면 채움 원의 지름이 정해진다 */
export function gaugeCircleDiameter(height: number): number {
  return height - (BORDER_PX + PADDING_PX) * 2
}

/** 번개 아이콘 — 채움 오른쪽 끝 원이 쓴다. U9의 챕터 오름 오버레이도 같은 모양을 쓴다 */
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
  /** 지금 채운 양 */
  filled: number
  /** 필요량 */
  required: number
  /** 상태 문장(숫자 없음) */
  ariaLabel: string
  /** 채움 요소 — U9 오버레이가 시작 자리를 잴 때 쓴다 */
  fillRef?: Ref<HTMLSpanElement>
  /** 있으면 채운 양 숫자를 지우고 그 자리(채움 안쪽 왼쪽)에 이 문구를 보인다. 캡슐이 가득 차 막혔을 때 쓴다(2026-11-05 사용자 요청) */
  message?: string
}

/** 호출부가 준 ref(함수형·객체형 모두)에 요소를 넣는다 */
function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) (ref as { current: T | null }).current = value
}

interface Motion {
  graph: number
  durationMs: number
}

export default function CapsuleGauge({ filled, required, ariaLabel, fillRef, message }: Props) {
  const target = capsuleGraphPercent(filled, required)
  const numberText = capsuleNumberText(filled)
  const { gaugeHeld: held, registerGaugeFill } = useCapsuleResult()
  // 처음 그리는 값은 늘 2%다. 진입 모션이 끝 눈금으로 옮긴다(값이 0이면 옮길 곳이 없어 그대로다)
  const [motion, setMotion] = useState<Motion>({ graph: GRAPH_MIN_PERCENT, durationMs: 0 })
  const enteredRef = useRef(false)
  // 트랙이 화면에 보였는가 — 관찰자가 없는 환경에서는 처음부터 보인 것으로 친다. 서버 렌더 값은 그리기에 쓰이지 않는다
  const trackRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined')
  const shownRef = useRef(GRAPH_MIN_PERCENT)
  // 붙들렸다가 풀린 뒤 번개를 한 번 튀겨야 한다
  const pulseArmedRef = useRef(false)
  // 채운 양 숫자를 보일 때가 되었는가 — 채움이 값을 향해 움직이기 시작할 때 같이 켜진다(서버 렌더와 첫 그리기에서는 꺼져 있다)
  const [numberReady, setNumberReady] = useState(false)
  const boltRef = useRef<SVGSVGElement>(null)
  // 붙들리는 순간 그려 둔 값도 2%로 되돌려 둔다 — 풀릴 때 «2% → 지금 값» 모션이 그 자리에서 시작해야 한다(렌더 중 갱신)
  const [wasHeld, setWasHeld] = useState(held)
  if (held !== wasHeld) {
    setWasHeld(held)
    if (held) setMotion({ graph: GRAPH_MIN_PERCENT, durationMs: 0 })
  }

  useEffect(() => {
    const reduced = prefersReducedMotion()

    if (held) {
      // 붙들림 — 2% 원으로 두고 모션을 걸지 않는다. 진입 모션은 이미 지난 것으로 본다(풀리면 «값이 바뀜» 경로로 옮겨 간다)
      enteredRef.current = true
      shownRef.current = GRAPH_MIN_PERCENT
      pulseArmedRef.current = true
      return
    }

    if (!enteredRef.current) {
      // 진입 모션 — 값이 0이면 모션 없이 진입을 마친 것으로 본다
      if (target <= GRAPH_MIN_PERCENT) {
        enteredRef.current = true
        return
      }
      // 아직 화면에 보이지 않았으면 기다린다 — 보이면 `visible`이 바뀌어 이 효과가 다시 돈다
      if (!visible) return
      const timer = window.setTimeout(
        () => {
          enteredRef.current = true
          shownRef.current = target
          setMotion({ graph: target, durationMs: reduced ? 0 : GAUGE_ENTRY_MS })
        },
        reduced ? 0 : GAUGE_ENTRY_DELAY_MS
      )
      return () => window.clearTimeout(timer)
    }

    // 같은 화면에서 값이 바뀜 — 지금 값에서 새 값으로 옮겨 간다(진행 중인 이동은 브라우저가 지금 자리에서 이어 받는다)
    const duration = shownRef.current === target || reduced ? 0 : gaugeMoveDurationMs(shownRef.current, target)
    if (shownRef.current !== target) {
      shownRef.current = target
      setMotion({ graph: target, durationMs: duration })
    }

    // 붙들림이 풀린 뒤 이동이 끝나면 번개가 한 번 튄다. 모션 줄이기에서는 튀지 않는다
    if (!pulseArmedRef.current) return
    if (reduced) {
      pulseArmedRef.current = false
      return
    }
    const timer = window.setTimeout(() => {
      pulseArmedRef.current = false
      boltRef.current?.animate?.(
        [{ transform: 'scale(1)' }, { transform: `scale(${BOLT_PULSE_SCALE})`, offset: 0.4 }, { transform: 'scale(1)' }],
        { duration: BOLT_PULSE_MS, easing: 'ease-out' }
      )
    }, duration)
    return () => window.clearTimeout(timer)
  }, [target, held, visible])

  // 숫자 팝인 시점 — 채움이 값을 향해 움직이기 시작하는 순간(`motion.graph`가 실제 값으로 바뀐 그 렌더) 같이 켠다. 채움이 닿기를 기다리지 않는다(2026-11-04 사용자 결정).
  // 효과로 켜는 이유: 서버 렌더와 첫 그리기에서는 꺼져 있어야 하이드레이션이 어긋나지 않는다. 값이 바뀌거나 붙들리면 꺼졌다가 다시 켜져 새 값으로 팝인한다
  const arrived = !held && visible && motion.graph === target
  useEffect(() => {
    if (!arrived) return
    const timer = window.setTimeout(() => setNumberReady(true), 0)
    return () => {
      window.clearTimeout(timer)
      setNumberReady(false)
    }
  }, [arrived, numberText])

  // 보임 관찰 — 트랙(바깥 상자)을 본다. 채움 요소는 2%에서 시작해 너비가 변하므로 기준으로 삼지 않는다. 보이면 해제한다
  useEffect(() => {
    if (visible || enteredRef.current) return
    const track = trackRef.current
    if (!track) return
    const observer = new window.IntersectionObserver(
      (entries) => {
        // 부동소수 오차로 0.4999가 올 수 있어 백분율로 반올림해 견준다
        if (entries.some((entry) => entry.isIntersecting && Math.round(entry.intersectionRatio * 100) >= GAUGE_ENTRY_VISIBLE_RATIO * 100)) {
          observer.disconnect()
          setVisible(true)
        }
      },
      { threshold: GAUGE_ENTRY_VISIBLE_RATIO, rootMargin: `0px 0px -${GAUGE_ENTRY_TABBAR_CLEARANCE_PX}px 0px` }
    )
    observer.observe(track)
    return () => observer.disconnect()
  }, [visible])

  // 채움 요소를 바깥에 알린다 — 합친 연출이 이 자리에서 번져 나가고, 호출부의 `fillRef`도 그대로 받는다
  const setFillElement = useCallback(
    (element: HTMLSpanElement | null) => {
      assignRef(fillRef, element)
      registerGaugeFill(element)
    },
    [fillRef, registerGaugeFill]
  )

  const circle = gaugeCircleDiameter(CAPSULE_GAUGE_HEIGHT_PX)
  // 붙들려 있으면 이 렌더에서 바로 2% 원이다(상태가 따라오기를 기다리지 않는다 — 연출이 이 자리를 재기 때문이다)
  const shownGraph = held ? GRAPH_MIN_PERCENT : motion.graph
  const shownDurationMs = held ? 0 : motion.durationMs
  const ratio = graphPercentToFillRatio(shownGraph)
  // 숫자 자리는 모션 중간값이 아니라 실제 값으로 정한다
  // 문구가 있으면 숫자가 아니라 문구이므로 늘 채움 안쪽에 둔다(막힘은 캡슐이 가득 찬 때라 채움이 트랙을 채운다)
  const placement = message ? 'inside' : capsuleNumberPlacement(filled, required)
  // 채움이 움직이기 시작한 뒤에만 보인다. 켜진 채로 붙들리거나 값이 바뀌는 렌더에서는 효과가 꺼 주기 전에도 바로 숨긴다
  const showNumber = numberReady && arrived
  const numberContent = message ?? (showNumber ? <PopInNumber key={numberText} value={numberText} playOnMount /> : numberText)
  const numberVisibility = showNumber ? undefined : 0
  const numberClass = message
    ? 'whitespace-nowrap text-base font-extrabold leading-none'
    : 'whitespace-nowrap text-xl font-extrabold leading-none tabular-nums'

  return (
    <div
      ref={trackRef}
      role="img"
      aria-label={ariaLabel}
      className="relative block w-full select-none rounded-full"
      style={{
        height: CAPSULE_GAUGE_HEIGHT_PX,
        boxSizing: 'border-box',
        padding: PADDING_PX,
        background: 'var(--capsule-track)',
        border: `${BORDER_PX}px solid var(--capsule-ring)`,
        boxShadow: '0 2px 0 rgba(25, 32, 28, 0.1)',
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

        {/* 채운 비율 50% 미만: 트랙 안쪽 오른쪽 끝에 오렌지 숫자. 닿기 전·붙들려 있는 동안은 투명하다 */}
        {placement === 'outside' && (
          <span
            data-capsule-number="outside"
            className={`absolute right-0 top-0 flex h-full items-center ${numberClass}`}
            style={{ paddingRight: NUMBER_EDGE_GAP_PX, color: 'var(--capsule-fill)', transform: `translateY(-${NUMBER_RISE_PX}px)`, opacity: numberVisibility }}
          >
            {numberContent}
          </span>
        )}

        {/* 오렌지 채움: 너비 = 원 지름 + (트랙 안쪽 너비 - 원 지름) × 채움 정도 */}
        <span
          ref={setFillElement}
          className="absolute left-0 top-0 block h-full rounded-full"
          style={{
            width: `calc(${circle}px + (100% - ${circle}px) * ${ratio})`,
            background: 'var(--capsule-fill)',
            transition: shownDurationMs > 0 ? `width ${shownDurationMs}ms var(--ease-smooth-out)` : 'none',
          }}
        >
          {/* 채운 비율 50% 이상: 채움 안쪽 왼쪽에 어두운 숫자. 번개 자리(원 지름)를 뺀 너비 안에서만 보여 2% 원일 때는 아무것도 보이지 않는다 */}
          {placement === 'inside' && (
            <span
              data-capsule-number="inside"
              className="absolute left-0 top-0 block h-full overflow-hidden"
              style={{ width: `calc(100% - ${circle}px)` }}
            >
              <span className={`flex h-full items-center ${numberClass}`} style={{ paddingLeft: NUMBER_EDGE_GAP_PX, color: 'var(--capsule-track)', transform: `translateY(-${NUMBER_RISE_PX}px)`, opacity: numberVisibility, transition: message ? 'opacity 240ms var(--ease-smooth-out)' : undefined }}>
                {numberContent}
              </span>
            </span>
          )}
          <span className="absolute right-0 top-0 grid h-full place-items-center" style={{ width: circle }}>
            <JamBolt size={Math.round(circle * 0.42)} svgRef={boltRef} />
          </span>
        </span>
      </span>
    </div>
  )
}
