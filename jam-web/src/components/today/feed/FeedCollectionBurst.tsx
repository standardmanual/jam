'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import SafeImage from '@/components/SafeImage'
import { FEED_BURST, FEED_CARD_ROOT_ATTR, FEED_MOTION } from '@/lib/today/feedConstants'

/**
 * 컬렉션 소개의 모션 래퍼 (티켓 20261121_0115, 상위 20261120_2026 4회차-3). 서비스 전용(홈피드 한정). 컬렉션 소개에서 브라우저 스크립트가 필요한 유일한 부분이다.
 *
 * 영역(높이 240) 안에 아이템 배지를 가운데에 겹쳐 두고, **카드 전체**가 화면에 55% 넘게 들어오면 배지마다 정한 자리·기울기로 퍼뜨린다(영역이 아니라 카드 루트 요소를 관찰한다 — 샘플도 카드 요소다). 카드가 화면 밖으로 완전히 나가면 다시 모으고,
 * 다시 들어오면 퍼뜨려 재생한다(PRD 「컬렉션 모션」). `children`(대표 그림·칩·도장)은 서버가 그린 마크업이고 배지들 위에 놓인다.
 *
 * - **기본 HTML은 퍼진 모습**이다(`static`). 스크립트가 늦거나 꺼져도 배지가 사라지지 않는다. 스크립트가 도착해 첫 관찰 결과를 받으면 «모인 모습»을 전환 없이 걸고(`collected`),
 *   그다음 프레임에 전환을 켜서 퍼뜨린다 — 화면에 이미 보이는 카드도 모였다 퍼지는 장면이 재생된다.
 * - **동작 줄이기**(`prefers-reduced-motion: reduce`)가 켜져 있으면 관찰자를 만들지 않아 퍼진 모습 그대로이고 전환이 없다. 관찰자가 없는 브라우저도 같다.
 * - 모션은 `transform`·`opacity`만 쓴다. 배지의 퍼진 자리는 영역 크기에 비례(`50cqw`·`50cqh`)해 카드 폭이 달라도 같은 비율로 닿는다.
 * - 관찰 대상은 가장 가까운 카드 루트(`FEED_CARD_ROOT_ATTR` 표식, `FeedCardShell`의 `markRoot`)다. 표식 조상이 없으면(단독으로 쓰는 경우) 영역 요소를 관찰한다. 서버 컴포넌트 구조는 그대로다.
 * - 이 관찰자(임계값 0.55)는 노출 계측의 관찰자(`TodayCardTracker`, 50%)와 따로 만든다. 서로의 콜백·해제에 영향을 주지 않는다.
 * - 배지는 장식이다: `alt=""`·`aria-hidden`(카드 제목이 이름을 말한다).
 */

/** 그릴 배지 한 개: 그림 주소와 `look.burst`의 한 칸. */
export interface FeedBurstBadge {
  imageUrl: string
  /** −1~1, 영역 가운데에서 가장자리까지가 1 */
  x: number
  y: number
  tilt: number
  size: number
  delayMs: number
}

type FeedBurstPhase = 'static' | 'collected' | 'spread'

/** `animate`가 거짓이면 전환이 없다(첫 «모인 모습»을 건 순간과 동작 줄이기). */
export interface FeedBurstView {
  phase: FeedBurstPhase
  animate: boolean
}

export const INITIAL_BURST_VIEW: FeedBurstView = { phase: 'static', animate: false }

/** 관찰 결과 한 번이 낳는 다음 상태. `armed`는 «모인 모습»을 이미 건 뒤인지다. */
export function nextBurstView(
  entry: { isIntersecting: boolean; intersectionRatio: number },
  current: FeedBurstView,
  armed: boolean,
): { view: FeedBurstView; spreadAfterFrame: boolean } {
  const visibleEnough = entry.isIntersecting && entry.intersectionRatio >= FEED_BURST.visibleRatio
  if (!armed) {
    // 첫 결과: 모인 모습을 전환 없이 걸고, 이미 충분히 보이면 한 프레임 뒤 퍼뜨린다
    return { view: { phase: 'collected', animate: false }, spreadAfterFrame: visibleEnough }
  }
  if (visibleEnough) return { view: { phase: 'spread', animate: true }, spreadAfterFrame: false }
  if (!entry.isIntersecting) return { view: { phase: 'collected', animate: true }, spreadAfterFrame: false }
  // 일부만 보이는 중(0 초과 55% 이하): 지금 모습을 유지한다
  return { view: current, spreadAfterFrame: false }
}

/** 배지 한 개의 인라인 스타일. 퍼진 모습(`static`·`spread`)과 모인 모습(`collected`)은 같은 `transform` 함수 목록이라 전환이 보간된다. */
export function burstBadgeStyle(badge: FeedBurstBadge, view: FeedBurstView): CSSProperties {
  const collected = view.phase === 'collected'
  const transition = view.animate
    ? `transform ${FEED_MOTION.durationSeconds}s ${FEED_MOTION.easing} ${badge.delayMs}ms, opacity ${FEED_BURST.opacitySeconds}s ease-out ${badge.delayMs}ms`
    : 'none'
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: badge.size,
    height: badge.size,
    marginLeft: -badge.size / 2,
    marginTop: -badge.size / 2,
    transform: collected
      ? `translate(0px, 0px) rotate(0deg) scale(${FEED_BURST.collectedScale})`
      : `translate(calc(${badge.x} * 50cqw), calc(${badge.y} * 50cqh)) rotate(${badge.tilt}deg) scale(1)`,
    opacity: collected ? 0 : 1,
    transition,
  }
}

export default function FeedCollectionBurst({
  badges,
  previewPhase,
  children,
}: {
  badges: FeedBurstBadge[]
  /** Story 전용: 주면 관찰자를 만들지 않고 이 모습(`collected` 모인·`spread` 퍼진)으로 고정한다. 홈은 주지 않는다. */
  previewPhase?: 'collected' | 'spread'
  children?: ReactNode
}) {
  const areaRef = useRef<HTMLDivElement | null>(null)
  const [observed, setView] = useState<FeedBurstView>(INITIAL_BURST_VIEW)
  const viewRef = useRef<FeedBurstView>(INITIAL_BURST_VIEW)
  const view: FeedBurstView = previewPhase ? { phase: previewPhase, animate: false } : observed

  useEffect(() => {
    const el = areaRef.current
    if (previewPhase || !el || typeof IntersectionObserver === 'undefined') return
    // 동작 줄이기: 관찰자를 만들지 않아 퍼진 모습이 그대로이고 전환도 없다
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let armed = false
    let frame = 0
    const apply = (next: FeedBurstView) => {
      viewRef.current = next
      setView(next)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (!entry) return
        const { view: next, spreadAfterFrame } = nextBurstView(entry, viewRef.current, armed)
        armed = true
        apply(next)
        if (spreadAfterFrame) {
          // 모인 모습이 한 번 그려진 뒤에 전환을 켜야 «모임 → 퍼짐»이 재생된다
          frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => apply({ phase: 'spread', animate: true }))
          })
        }
      },
      { threshold: [0, FEED_BURST.visibleRatio] },
    )
    // 카드 루트(표식 조상)를 관찰한다. 없으면 영역 요소다
    observer.observe(el.closest?.(`[${FEED_CARD_ROOT_ATTR}]`) ?? el)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [previewPhase])

  return (
    <div ref={areaRef} className="relative flex-none" style={{ height: FEED_BURST.areaHeight, containerType: 'size' }}>
      {badges.map((badge, index) => (
        <span key={index} aria-hidden="true" className="pointer-events-none" style={burstBadgeStyle(badge, view)}>
          <SafeImage src={badge.imageUrl} alt="" width={badge.size} height={badge.size} className="h-full w-full object-contain" />
        </span>
      ))}
      {children}
    </div>
  )
}
