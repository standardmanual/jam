import type { CSSProperties } from 'react'

/**
 * 화면 공통 배경 — 피그마 디자인(티켓 20260917_2105)의 세로 그라데이션.
 * 위쪽 74.038%는 순정 검정(--color-bg), 그 아래부터 #3d3d3d로 밝아진다.
 * #3d3d3d는 대응하는 기존 토큰이 없어 리터럴로 둔다(단발성 사용).
 * background-attachment: fixed로 스크롤해도 뷰포트에 고정되게 한다.
 *
 * `(main)/layout.tsx`와 `(legal)/layout.tsx`가 이 값을 함께 쓴다(티켓 20260929_1400) —
 * 값을 바꿀 때 한 곳만 고치면 된다.
 */
export const PAGE_GRADIENT_BACKGROUND: CSSProperties = {
  background:
    'linear-gradient(to bottom, var(--color-bg) 0%, var(--color-bg) 74.038%, #3d3d3d 100%)',
  backgroundAttachment: 'fixed',
}
