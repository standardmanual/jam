'use client'

import { useEffect, useState } from 'react'

/** Tailwind `md` 브레이크포인트와 동일하게 맞춘다 (`md:` = 768px 이상) */
const DESKTOP_QUERY = '(min-width: 768px)'

/**
 * 모바일 카드 그리드 / 데스크톱 테이블처럼 뷰포트별로 배타적인 마크업을 렌더링할 때,
 * `hidden md:block` 같은 CSS만으로 감추면 두 쪽이 전부 DOM에 마운트돼(이미지 개수가
 * 2배가 되는 등) 렌더 비용이 이중으로 든다(20260826_011 A4). 이 훅으로 실제 뷰포트를 판별해
 * 한쪽만 마운트한다.
 *
 * 서버 렌더 시점에는 뷰포트를 알 수 없으므로 `null`을 반환하고(아무것도 마운트하지 않음),
 * 클라이언트에서 `matchMedia`로 실제 값을 확정한 뒤 리렌더한다 — 첫 페인트에 잠깐 빈 화면이
 * 보일 수 있지만 하이드레이션 불일치보다 안전하다.
 */
export function useIsDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    const update = () => setIsDesktop(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return isDesktop
}
