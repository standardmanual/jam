import type { CSSProperties } from 'react'

/**
 * 화면 공통 배경 — 지금은 `--background`(크림 #fafaf0) 단색이다.
 * 다크 시절(티켓 20260917_2105)에는 위쪽 74.038%가 검정, 그 아래가 #3d3d3d로 밝아지는 세로
 * 그라데이션이었다. 라이트 전환(티켓 20261015_2131)에서 마지막 정지점 #3d3d3d만 남아
 * 크림 → 짙은 회색으로 어두워져 하단 글자 대비가 무너졌으므로 그라데이션을 걷었다.
 * 색을 새로 만들지 않는다 — 라이트용 그라데이션 재설계는 하위 티켓 20261015_2133에서 한다.
 * background-attachment: fixed는 그라데이션을 다시 얹을 때 쓰려고 그대로 둔다(단색에서는
 * 시각 차이가 없다).
 *
 * `(main)/layout.tsx`와 `(legal)/layout.tsx`가 이 값을 함께 쓴다(티켓 20260929_1400) —
 * 값을 바꿀 때 한 곳만 고치면 된다. 이름의 GRADIENT는 재설계 때 쓸 자리를 지키려고 바꾸지 않았다.
 */
export const PAGE_GRADIENT_BACKGROUND: CSSProperties = {
  background: 'var(--background)',
  backgroundAttachment: 'fixed',
}
