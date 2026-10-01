'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { trackEvent } from '@/lib/analytics/gtag'
import {
  IMPRESSION_THRESHOLD,
  createClickReporter,
  hasSeenImpression,
  markImpressionSeen,
  sendTodayCardEvent,
  todayCardClickParams,
} from '@/lib/today/cardEventClient'

/**
 * 투데이 카드 노출·클릭 트래커 (티켓 20260924_0004).
 *
 * 자식으로 받은 카드 `<Link>`를 그대로 렌더하고, 노출(`IntersectionObserver`, 세션당 카드당
 * 1회 — `sessionStorage`로 억제)과 클릭(옵션)을 `/api/today/events`로 보고한다. 유저 식별자는
 * 페이로드에 넣지 않는다(`cardId`·`event`만 전송) — 개인 식별자는 저장하지 않는다는 원칙은
 * 서버가 아니라 클라이언트에서부터 지킨다.
 */
export default function TodayCardTracker({
  cardId,
  contentTypeId,
  templateType,
  shape,
  trackClick = true,
  children,
}: {
  cardId: string
  /** GA `today_card_click` 파라미터(티켓 20260924_0859) — 카드 클릭을 GA에서도 유형별로 보기 위함 */
  contentTypeId?: string | null
  templateType?: string
  /**
   * GA `today_card_click`의 `shape` 파라미터(티켓 20261001_1458) — 그 카드가 화면에 그려진 모양. 새 틀(`CardFrame`)은 표시 데이터의
   * `tracking.shape`를, 옛 렌더러는 `drawnShape`(전환 전 옛 카드는 null)를 넘긴다. 이 값은 GA에만 간다(`/api/today/events`는 서버가
   * 카드를 다시 조회해 모양을 정한다).
   */
  shape?: string | null
  /**
   * ranking_list 레이아웃은 클릭이 행별 링크(유저 프로필)에서 일어나므로 카드 단위 클릭을
   * 세지 않는다(노출만 추적) — `TodayCardStack.tsx`의 `RankingListCard` 참고.
   */
  trackClick?: boolean
  children: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const reportClick = createClickReporter(cardId, trackClick)

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    if (hasSeenImpression(cardId)) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        markImpressionSeen(cardId)
        sendTodayCardEvent(cardId, 'impression')
        observer.disconnect()
      },
      { threshold: IMPRESSION_THRESHOLD }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [cardId])

  return (
    <div
      ref={containerRef}
      onClick={
        reportClick
          ? () => {
              reportClick()
              trackEvent('today_card_click', todayCardClickParams({ cardId, contentTypeId, templateType, shape }))
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}
