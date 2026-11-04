import type { CSSProperties } from 'react'

/**
 * (main) 화면 배경 — `--surface`(흰 #ffffff) 단색이다(티켓 20261104_1642). 상단 내비부터 푸터 로고까지 한 장의 흰 면이고,
 * 그 바깥(탭 바 뒤 여백·화면 밖 body)은 `--background` 크림이 비친다. 새 색을 만들지 않고 기존 토큰을 쓴다.
 * (legal)·(onboarding)은 이 값을 쓰지 않고 아래 `PAGE_GRADIENT_BACKGROUND`(크림)를 그대로 쓴다.
 */
export const MAIN_PAGE_BACKGROUND: CSSProperties = {
  background: 'var(--surface)',
}

/**
 * (legal)·(onboarding) 화면 공통 배경 — `--background`(크림 #f1f0eb) 단색이다.
 * 다크 시절(티켓 20260917_2105)에는 위쪽 74.038%가 검정, 그 아래가 #3d3d3d로 밝아지는 세로
 * 그라데이션이었다. 라이트 전환(티켓 20261015_2131)에서 마지막 정지점 #3d3d3d만 남아
 * 크림 → 짙은 회색으로 어두워져 하단 글자 대비가 무너졌으므로 그라데이션을 걷었다.
 * 색을 새로 만들지 않는다 — 라이트용 그라데이션은 아직 없다(티켓 20261015_2133은 이를 다루지 않고 닫혔다).
 * background-attachment: fixed는 그라데이션을 다시 얹을 때 쓰려고 그대로 둔다(단색에서는
 * 시각 차이가 없다).
 *
 * `(legal)/layout.tsx`와 `(onboarding)/layout.tsx`가 이 값을 함께 쓴다(티켓 20260929_1400) —
 * 값을 바꿀 때 한 곳만 고치면 된다. `(main)`은 티켓 20261104_1642부터 위 `MAIN_PAGE_BACKGROUND`를 쓴다.
 * 이름의 GRADIENT는 재설계 때 쓸 자리를 지키려고 바꾸지 않았다.
 */
export const PAGE_GRADIENT_BACKGROUND: CSSProperties = {
  background: 'var(--background)',
  backgroundAttachment: 'fixed',
}
