/**
 * 배지 등급(희귀도) 공용 상수 — 등급 체계는 서비스 전체에서 하나뿐이다.
 *
 * 모든 맵은 `Record<BadgeRarity, X>`로 좁혀 둔다. `Record<string, X>`로 두면 등급명이 바뀔 때
 * 키를 안 고쳐도 TypeScript가 잡지 못하고 런타임에 `undefined`가 된다
 * (티켓 20260813_003의 누락 3곳이 이 경로로 발생했다 — 티켓 20260831_1115).
 *
 * **`RARITY_LABEL`은 서비스 코드(`src/`)의 유일한 등급 라벨 정의다.** 티켓 20260905_0027에서
 * `badgeProgressText.ts`·`BadgeFamilyRow.tsx`의 중복 재선언을 여기로 흡수했다 —
 * v5의 nullable 전환으로 «등급 칩 대신 Lv.N 칩» 분기가 늘어나기 때문에 중복을 남기면
 * 20260813_003과 같은 누락 사고가 반복된다.
 * ⚠️ MODULAR(`design-system/`)은 서비스 코드를 import할 수 없어(자립형 카탈로그) 같은 파일을
 *    공유하지 못한다. DS 쪽 단일 소스는 `src/components/ui/RarityBadge.tsx`의
 *    `config` / `getRarityLabel()`이며, 두 소스는 같은 값을 유지해야 한다.
 */
import { d } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

// 서열 값은 한국어 사전 없이 쓸 수 있도록 `rarityTier.ts`로 옮겼다(이벤트 API 번들에 사전이 실리지 않게, 티켓 20261115_0030). 기존 import 경로는 그대로 쓸 수 있다.
export { RARITY_TIER, rarityTier } from '@/lib/rarityTier'

export const RARITY_LABEL: Record<BadgeRarity, string> = {
  common: d.feed.rarityCommon,
  rare: d.feed.rarityRare,
  epic: d.feed.rarityEpic,
  mystic: d.feed.rarityMystic,
}
