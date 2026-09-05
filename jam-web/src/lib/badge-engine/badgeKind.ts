/**
 * 배지 «종류» 판정 — 등급형 / 레벨형 / 반복형을 가르는 단일 출처 (티켓 20260905_0030)
 *
 * 이 판정이 index.ts 비공개로 있으면 `sync.ts`의 계열 프런티어 산출과 `badgeTree.ts`의
 * 정렬이 각자 다시 선언하게 된다. 이 저장소엔 이미 그 전례가 있다 — `sync.ts`의
 * `FAMILY_RARITY_ORDER`가 「재사용이 아니라 재선언」이라고 주석에 남아 있고,
 * `RARITY_LABEL`은 5곳에 복제돼 누락 사고를 냈다(티켓 20260813_003 · 20260905_0027).
 * 티켓 0035가 레벨형 550종을 시딩하면 세 곳이 같은 판정을 해야 하므로 미리 한 곳으로 둔다.
 */
import type { BadgeCondition, BadgeRow } from '@/types/database'

/**
 * 배지의 종류. **세 가지다** — 등급형/레벨형 이진 판정이 반복형을 등급형 경로로 흘려보내
 * `rarityTier <= highestOwned`에서 매번 탈락시키던 것을 v5 B1에서 갈랐다
 * (티켓 20260905_0030 B-1).
 *
 * - `graded`     — 등급형. 이름당 최상위 등급 1개(성장 티어)
 * - `leveled`    — 무한레벨형(`rarity IS NULL`). 계열당 «보유 레벨 + 1»부터 연속 발급
 * - `repeatable` — 반복형(등급 있음 + `condition_json.repeat_count`). 보유해도 후보에서
 *   빠지지 않는다 — 임계값을 넘지 않은 회차는 `earn_count`만 올린다
 */
export type BadgeKind = 'graded' | 'leveled' | 'repeatable'

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


/**
 * 반복형의 발급 임계값(회차). 값이 없거나 형태가 어긋나면 null — 반복형이 아니다.
 *
 * `condition_json`은 jsonb라 형태 보장이 없다. 시딩(티켓 20260905_0035)이 문자열이나
 * 0을 넣어도 이 함수가 null을 돌려주면 그 배지는 그냥 등급형으로 평가된다(조용히
 * 반복형으로 오분류되지 않는다). 값 자체의 유효성은 `evaluateConditionDetailed`가
 * 다시 본다.
 */
export function repeatCountOf(badge: Pick<BadgeRow, 'condition_json'>): number | null {
  const raw = (badge.condition_json as BadgeCondition | null)?.repeat_count
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) return null
  return raw
}

/**
 * 반복형 배지인가 — **등급이 있고** `repeat_count`가 있으면 반복형이다.
 *
 * 등급을 함께 요구하는 이유: 마스터 티켓 20260905_0026이 «평면 반복은 횟수에 등급,
 * 자동 상승 반복은 숫자만»으로 갈랐다. 등급이 없으면(= 레벨형) 계열 안 순서를 `level`이
 * 이미 결정하므로 반복 카운터가 아니라 레벨 레일을 타야 한다.
 */
export function isRepeatableBadge(badge: Pick<BadgeRow, 'rarity' | 'condition_json'>): boolean {
  return badge.rarity != null && repeatCountOf(badge) != null
}

/**
 * 배지 종류 판정의 단일 진입점. **레벨형이 반복형보다 우선한다** — 둘 다 성립하는
 * 형태(`rarity IS NULL` + `repeat_count`)는 카탈로그 오류이며, 그 경우 계열 레일(`level`)을
 * 따르게 두는 편이 «레벨 구멍»을 만들지 않는다.
 */
export function badgeKindOf(badge: Pick<BadgeRow, 'rarity' | 'condition_json'>): BadgeKind {
  if (isLeveledBadge(badge)) return 'leveled'
  return isRepeatableBadge(badge) ? 'repeatable' : 'graded'
}
