/**
 * 배지 등급(희귀도) 공용 상수 — 등급 체계는 서비스 전체에서 하나뿐이다.
 *
 * 모든 맵은 `Record<BadgeRarity, X>`로 좁혀 둔다. `Record<string, X>`로 두면 등급명이 바뀔 때
 * 키를 안 고쳐도 TypeScript가 잡지 못하고 런타임에 `undefined`가 된다
 * (티켓 20260813_003의 누락 3곳이 이 경로로 발생했다 — 티켓 20260831_1115).
 */
import { d } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

export const RARITY_LABEL: Record<BadgeRarity, string> = {
  common: d.feed.rarityCommon,
  rare: d.feed.rarityRare,
  epic: d.feed.rarityEpic,
  mystic: d.feed.rarityMystic,
}

/**
 * 배지 등급 → 티어 값(서열). 배지 발급 엔진과 미션 노출 판정이 함께 쓴다.
 * 두 곳에 복사돼 있던 것을 이 파일로 통합했다 (티켓 20260831_1115).
 */
export const RARITY_TIER: Record<BadgeRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  mystic: 4,
}
