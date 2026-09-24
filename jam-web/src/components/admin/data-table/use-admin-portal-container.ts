'use client'

import { useState } from 'react'

/**
 * Radix Portal(AlertDialog 등)의 렌더 대상 DOM 컨테이너(티켓 20260924_0940).
 *
 * Portal은 기본적으로 `document.body`에 렌더링되지만, shadcn 어드민 테마 실값은
 * `[data-admin-theme]` 스코프 안에만 존재한다 — 이 훅이 돌려주는 노드를 `container` prop에
 * 넘겨야 테마 토큰이 정상 적용된다(`BadgesTable.tsx`/`MissionTable.tsx` 등에 반복돼 있던
 * 패턴을 공용화, 20260827_002 게이트 리뷰에서 발견된 회귀 방지).
 */
export function useAdminPortalContainer(): HTMLElement | null {
  const [container] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )
  return container
}
