import type { CSSProperties } from 'react'
import type { BadgeRow } from '@/types/database'

/** 배경 테마 계산에 필요한 배지 필드만 — 상세화면·획득 알림 모달 등 호출부는 이 최소 shape만 맞추면 된다 */
export type BadgeBackgroundThemeSource = Pick<BadgeRow, 'background_color' | 'background_shader_id'>

/**
 * 배지 상세화면과 향후 획득 알림 중앙 모달이 공유하는 배경 테마 스타일 계산기 (20260818_002).
 *
 * 쉐이더 기술 스택(CSS vs WebGL)이 아직 미정([20260818_001] 보류 항목)이라 지금은 no-op —
 * `background_color`/`background_shader_id` 값이 있어도 항상 빈 스타일을 반환해 기존 렌더링
 * 결과를 그대로 유지한다. 스택이 확정되면 이 함수 내부만 확장하면 된다(호출부 변경 불필요).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 스택 확정 전까지 no-op. 시그니처는 미리 확정해 호출부 변경 없이 확장한다.
export function getBadgeBackgroundStyle(badge: BadgeBackgroundThemeSource): CSSProperties {
  return {}
}
