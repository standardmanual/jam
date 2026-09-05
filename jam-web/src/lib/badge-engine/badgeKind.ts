/**
 * 배지 «종류» 판정 — 등급형 / 레벨형을 가르는 단일 출처 (티켓 20260905_0030)
 *
 * 이 판정이 index.ts 비공개로 있으면 `sync.ts`의 계열 프런티어 산출과 `badgeTree.ts`의
 * 정렬이 각자 다시 선언하게 된다. 이 저장소엔 이미 그 전례가 있다 — `sync.ts`의
 * `FAMILY_RARITY_ORDER`가 「재사용이 아니라 재선언」이라고 주석에 남아 있고,
 * `RARITY_LABEL`은 5곳에 복제돼 누락 사고를 냈다(티켓 20260813_003 · 20260905_0027).
 * 티켓 0035가 레벨형 550종을 시딩하면 세 곳이 같은 판정을 해야 하므로 미리 한 곳으로 둔다.
 */
import type { BadgeRow } from '@/types/database'

/**
 * 무한레벨형 배지인가 — **판정 기준은 `rarity IS NULL` 하나뿐이다.**
 *
 * 마이그레이션 130이 `CHECK ((rarity IS NULL) = (level IS NOT NULL))`로 둘의 일치를 강제하므로
 * `level != null`로 물어도 결과는 같지만, 기준을 두 개 두면 언젠가 어긋난다(0027에서 확정).
 */
export function isLeveledBadge(badge: Pick<BadgeRow, 'rarity'>): boolean {
  return badge.rarity == null
}

/**
 * 무한레벨형 배지를 묶는 계열 키.
 *
 * `family_key`가 정본이다. 다만 이 컬럼은 NOT NULL이 아니라(등급형·아이템 배지는 비어 있다)
 * 레벨형인데 비어 있을 수 있어, 그 경우에만 이름으로 폴백한다. 폴백 값에 `#name:` 접두어를
 * 붙여 실제 `family_key` 값과 절대 충돌하지 않게 한다.
 */
export function familyKeyOf(badge: Pick<BadgeRow, 'name' | 'family_key'>): string {
  return badge.family_key ?? `#name:${badge.name}`
}

/** 발급 로그·미발급 사유에 쓰는 배지 종류 라벨 — 레벨형은 `Lv.N`, 등급형은 등급 문자열 */
export function badgeKindLabel(badge: Pick<BadgeRow, 'rarity' | 'level'>): string {
  if (badge.rarity) return badge.rarity
  return badge.level != null ? `Lv.${badge.level}` : '등급 없음'
}

