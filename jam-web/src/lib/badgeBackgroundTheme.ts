import type { CSSProperties } from 'react'
import type { BadgeRow } from '@/types/database'

/** 배경 테마 계산에 필요한 배지 필드만 — 상세화면·획득 알림 모달 등 호출부는 이 최소 shape만 맞추면 된다 */
export type BadgeBackgroundThemeSource = Pick<BadgeRow, 'background_color' | 'background_shader_id'>

/**
 * 배지 상세화면과 향후 획득 알림 중앙 모달이 공유하는 배경 테마 스타일 계산기.
 * (20260818_002에서 no-op 뼈대로 도입, 20260818_003에서 background_color 실제 렌더링 연결)
 *
 * - `background_color`가 있으면 해당 색을 배경색으로 반환한다.
 * - `background_shader_id`는 쉐이더 기술 스택(CSS vs WebGL)이 아직 미정([20260818_001] 보류
 *   항목)이라 이번 범위에서는 값이 있어도 항상 무시한다 — 어드민에서 선택·저장은 되지만
 *   렌더링에는 관여하지 않는다. 스택이 확정되면 이 함수 내부만 확장하면 된다(호출부 변경 불필요).
 */
export function getBadgeBackgroundStyle(badge: BadgeBackgroundThemeSource): CSSProperties {
  if (!badge.background_color) return {}
  return { backgroundColor: badge.background_color }
}
