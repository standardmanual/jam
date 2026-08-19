import type { CSSProperties } from 'react'
import type { BadgeRow } from '@/types/database'

/** 배경 테마 계산에 필요한 배지 필드만 — 상세화면·획득 알림 모달 등 호출부는 이 최소 shape만 맞추면 된다 */
export type BadgeBackgroundThemeSource = Pick<BadgeRow, 'background_color' | 'background_shader_id' | 'background_image_url'>

/**
 * 배지 상세화면과 향후 획득 알림 중앙 모달이 공유하는 배경 테마 스타일 계산기.
 * (20260818_002에서 no-op 뼈대로 도입, 20260818_003에서 background_color 실제 렌더링 연결,
 * 20260819_008에서 background_image_url 우선 렌더링 추가)
 *
 * - `background_image_url`(배경 제너레이터로 구운 정적 PNG)이 있으면 최우선 — 배경 이미지로
 *   렌더링한다. `background_color`와 상호 배타적으로 저장되므로(어드민 저장 시점에 보장) 실무상
 *   둘 다 값이 있는 경우는 없지만, 방어적으로 이미지가 있으면 색상은 무시한다.
 * - 없으면 `background_color`가 있는 경우 해당 색을 배경색으로 반환한다.
 * - `background_shader_id`는 쉐이더 기술 스택(CSS vs WebGL)이 아직 미정([20260818_001] 보류
 *   항목)이라 이번 범위에서는 값이 있어도 항상 무시한다 — 어드민에서 선택·저장은 되지만
 *   렌더링에는 관여하지 않는다. 스택이 확정되면 이 함수 내부만 확장하면 된다(호출부 변경 불필요).
 */
export function getBadgeBackgroundStyle(badge: BadgeBackgroundThemeSource): CSSProperties {
  if (badge.background_image_url) {
    // 이미 SERVICE_WIDTH(430px) 기준 앱 컬럼 폭에 맞춰 합성·저장된 정사각 이미지 — 호출부(고정
    // 배경 레이어/Hero 카드)마다 실제 박스 크기·비율이 달라 cover로 잘림 없이 채운다.
    return {
      backgroundImage: `url(${badge.background_image_url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  }
  if (!badge.background_color) return {}
  return { backgroundColor: badge.background_color }
}
