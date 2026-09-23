'use client'

import { useEffect, useRef, type ReactNode } from 'react'

const IMPRESSION_KEY_PREFIX = 'jam_today_impression_'

function sendTodayCardEvent(cardId: string, event: 'impression' | 'click'): void {
  const payload = JSON.stringify({ cardId, event })
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([payload], { type: 'application/json' })
    if (navigator.sendBeacon('/api/today/events', blob)) return
  }
  // sendBeacon이 없거나(구형 브라우저) 큐잉에 실패했을 때만 폴백한다. keepalive로 페이지
  // 이동 중에도 요청이 취소되지 않게 한다.
  fetch('/api/today/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // 계측 전송 실패는 사용자 경험에 영향을 주지 않는다 — 조용히 무시
  })
}

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
  trackClick = true,
  children,
}: {
  cardId: string
  /**
   * ranking_list 레이아웃은 클릭이 행별 링크(유저 프로필)에서 일어나므로 카드 단위 클릭을
   * 세지 않는다(노출만 추적) — `TodayCardStack.tsx`의 `RankingListCard` 참고.
   */
  trackClick?: boolean
  children: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const storageKey = IMPRESSION_KEY_PREFIX + cardId
    let alreadySeen = false
    try {
      alreadySeen = sessionStorage.getItem(storageKey) === '1'
    } catch {
      // sessionStorage 접근 불가(프라이빗 모드 등) — 이번 세션에서 중복 전송될 수 있다, 무시
    }
    if (alreadySeen) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        try {
          sessionStorage.setItem(storageKey, '1')
        } catch {
          // 위와 동일 — 저장 실패해도 이번 전송 자체는 막지 않는다
        }
        sendTodayCardEvent(cardId, 'impression')
        observer.disconnect()
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [cardId])

  return (
    <div ref={containerRef} onClick={trackClick ? () => sendTodayCardEvent(cardId, 'click') : undefined}>
      {children}
    </div>
  )
}
