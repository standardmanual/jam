/**
 * 새 배지의 포인트 기본값 (티켓 20261022_1135 1회, 운영 로직 10.5·11.4·14.1절)
 *
 * 순수 파일이다. 어드민 배지 양식(클라이언트 컴포넌트)과 배지 생성 API(POST)가 **같은 함수**를 쓴다.
 * 서버 전용 모듈을 가져오지 않는다 — 일괄 값은 호출부가 `badge_point_policy`에서 읽어 넘긴다(API는 `getBadgePointPolicy`, 양식은 서버 페이지가 props로 내림).
 * 타입만 가져오므로(`import type`) 번들에 서버 모듈이 들어가지 않는다.
 *
 * 규칙
 *  - 숨김 배지는 0이다(마이그레이션 243의 `badges_hidden_no_points` 제약).
 *  - 레벨형 배지(등급이 없고 레벨이 있는 액티비티)는 `leveled_points`다.
 *  - 그 밖에는 등급 값이다(Common·Rare·Epic·Mystic).
 *  - 등급도 레벨형도 아니면(비정상 입력) 0이다. 저장 검사가 따로 막으므로 여기서는 값을 지어내지 않는다.
 */
import type { BadgeRarity } from '@/types/database'
import type { BadgePointPolicy } from '@/lib/badge/pointPolicy'

export interface BadgePointDefaultInput {
  /** 등급형이면 등급, 레벨형이면 null */
  rarity: BadgeRarity | null
  isLeveled: boolean
  isHidden: boolean
}

const RARITY_POINT_KEY: Record<BadgeRarity, keyof BadgePointPolicy> = {
  common: 'common_points',
  rare: 'rare_points',
  epic: 'epic_points',
  mystic: 'mystic_points',
}

/** 새 배지의 포인트 기본값. 숨김이면 0, 레벨형이면 레벨형 값, 아니면 등급 값. */
export function defaultPointFor({ rarity, isLeveled, isHidden }: BadgePointDefaultInput, policy: BadgePointPolicy): number {
  if (isHidden) return 0
  if (isLeveled) return policy.leveled_points
  if (!rarity) return 0
  const key = RARITY_POINT_KEY[rarity]
  return key ? policy[key] : 0
}
