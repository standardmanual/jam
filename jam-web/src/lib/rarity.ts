/**
 * 배지 등급(희귀도) 공용 상수 — 등급 체계는 서비스 전체에서 하나뿐이다.
 *
 * 모든 맵은 `Record<BadgeRarity, X>`로 좁혀 둔다. `Record<string, X>`로 두면 등급명이 바뀔 때
 * 키를 안 고쳐도 TypeScript가 잡지 못하고 런타임에 `undefined`가 된다
 * (티켓 20260813_003의 누락 3곳이 이 경로로 발생했다 — 티켓 20260831_1115).
 *
 * **`RARITY_LABEL`은 서비스 코드(`src/`)의 유일한 등급 라벨 정의다.** 티켓 20260905_0027에서
 * `badgeProgressText.ts`·`BadgeFamilyRailItem.tsx`의 중복 재선언을 여기로 흡수했다 —
 * v5의 nullable 전환으로 «등급 칩 대신 Lv.N 칩» 분기가 늘어나기 때문에 중복을 남기면
 * 20260813_003과 같은 누락 사고가 반복된다.
 * ⚠️ MODULAR(`design-system/`)은 서비스 코드를 import할 수 없어(자립형 카탈로그) 같은 파일을
 *    공유하지 못한다. DS 쪽 단일 소스는 `design-system/components/cards/RarityBadge.jsx`의
 *    `config` / `getRarityLabel()`이며, 두 소스는 같은 값을 유지해야 한다.
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

/**
 * 등급 → 티어 값 접근자. **무한레벨형(`rarity = null`)은 0을 돌려준다.**
 *
 * 마이그레이션 130에서 `badges.rarity`가 nullable이 되면서 `RARITY_TIER[badge.rarity]` 직접
 * 색인이 타입 에러가 됐다. 그 자리를 이 함수로 대체한다 — 기존 `?? 0` 폴백과 결과가 같으므로
 * 동작은 바뀌지 않는다.
 *
 * ⚠️ 0은 "등급 서열의 맨 아래"가 아니라 "이 서열에 속하지 않는다"는 뜻이다. 발급 엔진이 이
 * 값을 성장 티어 비교(`rarityTier(badge.rarity) <= highestOwned`)에 그대로 쓰면 무한레벨형은
 * `0 <= 0`으로 매번 후보에서 탈락한다(마스터 티켓 20260905_0026 B-1). 그 판정을 고치는 것은
 * **티켓 20260905_0030(발급 엔진 v5 전면 개편) 범위**이며, 이 티켓은 스키마가 레벨형을
 * "표현 가능"하게만 만든다.
 */
export function rarityTier(rarity: BadgeRarity | null | undefined): number {
  return rarity ? RARITY_TIER[rarity] : 0
}
