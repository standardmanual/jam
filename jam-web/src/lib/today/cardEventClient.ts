/**
 * 투데이 카드 노출·클릭 이벤트 전송 로직 (티켓 20260924_1147).
 *
 * `TodayCardTracker.tsx`(클라이언트 컴포넌트)에서 그대로 옮겨 온 함수들이다. 노드 환경(vitest
 * `node`)에서는 컴포넌트를 렌더할 수 없어, 전송 동작을 테스트로 고정하려면 로직이 컴포넌트
 * 밖에 있어야 한다. 페이로드(`cardId`·`event`)와 임계값은 이전과 같다.
 */

const IMPRESSION_KEY_PREFIX = 'jam_today_impression_'

/** 카드가 이 비율 이상 보일 때 노출로 센다 */
export const IMPRESSION_THRESHOLD = 0.5

export function sendTodayCardEvent(cardId: string, event: 'impression' | 'click'): void {
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

/** 이번 세션에서 이 카드의 노출을 이미 보고했는지 */
export function hasSeenImpression(cardId: string): boolean {
  try {
    return sessionStorage.getItem(IMPRESSION_KEY_PREFIX + cardId) === '1'
  } catch {
    // sessionStorage 접근 불가(프라이빗 모드 등) — 이번 세션에서 중복 전송될 수 있다, 무시
    return false
  }
}

/** 노출 보고 사실을 세션에 남긴다. 저장에 실패해도 이번 전송 자체는 막지 않는다 */
export function markImpressionSeen(cardId: string): void {
  try {
    sessionStorage.setItem(IMPRESSION_KEY_PREFIX + cardId, '1')
  } catch {
    // 위와 동일 — 무시
  }
}

/**
 * 카드 클릭 전송 함수. `trackClick=false`(ranking_list처럼 클릭이 행별 링크에서 일어나는
 * 레이아웃)면 `undefined`를 돌려줘 클릭을 세지 않는다.
 */
export function createClickReporter(cardId: string, trackClick: boolean): (() => void) | undefined {
  if (!trackClick) return undefined
  return () => sendTodayCardEvent(cardId, 'click')
}
