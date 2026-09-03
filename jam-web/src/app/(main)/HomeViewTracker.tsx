'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics/gtag'

/**
 * GA4 home_view 계측 전용 (티켓 20260903_1034).
 *
 * 홈("투데이") 화면은 서버 컴포넌트(`page.tsx`)라 클라이언트 훅을 직접 쓸 수 없어,
 * 마운트할 때 이벤트 하나만 보내는 최소 클라이언트 컴포넌트로 분리한다.
 * 렌더하는 UI가 없다 — "재방문" 지표는 화면 진입 자체가 신호이므로 페이지뷰마다 1회 전송한다.
 */
export default function HomeViewTracker() {
  useEffect(() => {
    trackEvent('home_view')
  }, [])

  return null
}
