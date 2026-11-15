/**
 * 배지 등급 서열 — 한국어 사전(`@/lib/i18n`)에 닿지 않는 순수 파일이다.
 * 라벨(`RARITY_LABEL`)은 `rarity.ts`에 있다. 사전이 필요 없는 서버 모듈(이벤트 API가 닿는 `combine/visibility.ts` 등)은 여기서 가져온다.
 */
import type { BadgeRarity } from '@/types/database'

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
