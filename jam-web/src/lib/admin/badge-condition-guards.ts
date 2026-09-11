/**
 * 「저장은 되는데 영원히 안 나오는 배지」를 저장 시점에 막는 순수 판정 (티켓 20260905_0032 A-1)
 *
 * ## 왜 `badge-validation.ts`와 파일이 갈렸나
 *
 * `badge-validation.ts`는 `@/lib/drop-engine/index`(→ `createServiceClient` → `next/headers`)를
 * 물어 **서버 전용**이다. 어드민 조건 폼은 클라이언트 컴포넌트라 그 파일을 import할 수 없고,
 * 그렇다고 폼에서 같은 문구를 다시 적으면 「화면 경고와 API 거부가 서로 다른 말을 하는」
 * 상태가 된다. 그래서 서버 전용 의존이 없는 판정만 여기 모아 **양쪽이 같은 문자열을 쓴다.**
 *
 * ## 아래 경로들은 판정 함수가 이미 있다 — 여기서는 «부르기만» 한다
 *
 * | 경로 | 이미 있는 함수 |
 * |---|---|
 * | 짝 필드 없음 | `findBlockingConditionKeys().unpaired` (conditionRegistry) |
 * | 회차 + 휴식 조합 | `restConditionKeysIn` (activityFilters) |
 * | 교차 게이트 형태 오류 | `findCrossGateShapeError` (crossGate) |
 *
 * 위 셋은 **발급 시점에만** 돌았고, 그 사유(`missed`)는 어드민 시뮬레이터만 읽는다.
 *
 * 아래 하나는 다르다 — 판정 함수가 없어 이 파일에 새로 둔다.
 *
 * | 경로 | 판정 |
 * |---|---|
 * | 사용량 지표 + 회차 조합 | `findUsageMetricRepeatConflictError` (이 파일, 신규) |
 */
import { findBlockingConditionKeys, getConditionField } from '@/lib/badge-engine/conditionRegistry'
import { restConditionKeysIn } from '@/lib/badge-engine/activityFilters'
// 휴식 키가 정확히 1개면 회차와 함께 저장할 수 있다(티켓 20260906_2056, §B-10 재설계) —
// 엔진(index.ts)의 회차 차단 분기·진행 계산(badgeProgress.ts)과 같은 판정을 봐야
// 「저장은 막히는데 엔진은 발급하는」 어긋남이 생기지 않는다.
import { isRestDrivenRepeatCondition } from '@/lib/badge-engine/repeatOccurrences'
import { findCrossGateShapeError } from '@/lib/badge-engine/crossGate'
import { RARITY_TIER } from '@/lib/rarity'
import type { BadgeCondition, BadgeRow } from '@/types/database'

export { findCrossGateShapeError }

/**
 * 짝 필드가 없어 **뜻이 완성되지 않는** 조건을 막는다.
 *
 * `rest_after_streak`는 `streak_days`가 없으면 「며칠 연속 뒤인가」가 정의되지 않는다.
 * 값 자체는 유효하고 DB CHECK도 키 이름만 보므로 지금은 그대로 저장되고, 발급 시점에
 * fail-closed로 조용히 막힌다.
 *
 * **`pending`(평가 구현 대기)은 막지 않는다.** 그건 카탈로그 오류가 아니라 엔진 진도의
 * 문제이고, 시딩(티켓 20260905_0035)이 평가 구현보다 먼저 들어오는 것을 전제로 설계됐다 —
 * 어드민 화면은 「평가 대기」 표시로 알린다.
 */
export function findUnpairedConditionError(condition: BadgeCondition | null): string | null {
  if (!condition) return null
  const unpaired = findBlockingConditionKeys(condition).unpaired
  if (unpaired.length === 0) return null
  const described = unpaired.map((key) => {
    const meta = getConditionField(key)
    const pairs = (meta?.pairedWith ?? []).map((p) => getConditionField(p as string)?.label ?? p)
    return `${meta?.label ?? key}(${key}) ← ${pairs.join(' 또는 ')}`
  })
  return `저장할 수 없습니다. 짝 필드가 없어 뜻이 완성되지 않는 조건이 있습니다 — ${described.join(', ')}. 짝이 되는 필드를 함께 입력해주세요.`
}

/**
 * 회차(`repeat_count`)와 휴식 조건 «2개 이상»의 조합을 막는다.
 *
 * 휴식 4종은 이력 패턴 술어라 회차 술어가 그대로 소비하지 못한다. 휴식 키가 정확히 1개면
 * "휴식 조건을 만족한 복귀 사건"만 세는 전용 계산(`isRestDrivenRepeatCondition`)이 있어
 * 저장을 막지 않는다(티켓 20260906_2056, §B-10 재설계). 휴식 키가 2개 이상이면 "사건 하나"의
 * 경계가 정의되지 않아 `evaluateConditionDetailed`가 여전히 「회차와 함께 쓸 수 없는 조건」으로
 * **매번** fail한다 — 발급이 영원히 되지 않으므로 저장 시점에 막는다.
 */
export function findRepeatRestConflictError(condition: BadgeCondition | null): string | null {
  if (!condition || condition.repeat_count === undefined) return null
  const restKeys = restConditionKeysIn(condition)
  if (restKeys.length === 0) return null
  if (isRestDrivenRepeatCondition(condition)) return null
  const labels = restKeys.map((key) => `${getConditionField(key)?.label ?? key}(${key})`)
  return `저장할 수 없습니다. 충족 횟수(repeat_count)는 휴식 조건 1개까지만 함께 쓸 수 있습니다 — ${labels.join(', ')}. 휴식 조건을 1개만 남겨주세요.`
}

/**
 * 서비스 사용량 지표 4종(팔로워·팔로잉·일일동기화·연속동기화일수, 티켓 20260910_1557·
 * 20260911_2304) — `usageBadges.ts`의 발급 경로는 등급형(이름 그룹 내 최상위 tier 1개만
 * 순차 발급)·레벨형(family_key 내 보유 레벨+1부터 연속 발급)만 구현돼 있다.
 *
 * ⚠️ 이 배열은 `conditionRegistry.ts`(단일 소스)가 아니라 여기 직접 선언한다 — 이 가드는
 * 그 키들이 `ALL_CONDITION_KEYS`에 아직 등록되지 않은 시점(리뷰 브랜치 병합 순서에 따라
 * 일시적으로 그럴 수 있다)에도 먼저 활성화돼 있어야 한다. `ALL_CONDITION_KEYS`에 없는 동안은
 * `findUnknownConditionKeyError`가 이미 저장을 막으므로 이중 방어라도 충돌하지 않는다.
 */
const USAGE_METRIC_CONDITION_KEYS = [
  'follower_count',
  'following_count',
  'daily_sync_count',
  'daily_sync_streak_days',
] as const

/**
 * 사용량 지표(팔로워·팔로잉·일일동기화)와 충족 횟수(`repeat_count`, 반복 획득) 조합을 막는다.
 *
 * `isLeveledBadge()`가 `rarity == null` 여부로만 이진 판정하기 때문에, rarity가 있는(등급형)
 * 배지에 이 지표 조건과 `repeat_count`를 함께 넣으면 에러 없이 저장은 되지만 실제로는
 * 등급형 경로(`gradedByName`)로 흘러간다 — "이름 그룹 내 최상위 tier 1개만 발급,
 * repeat_count 무시, 재발급 없음"으로 조용히 오처리된다(티켓 20260910_1719).
 */
export function findUsageMetricRepeatConflictError(condition: BadgeCondition | null): string | null {
  if (!condition || condition.repeat_count === undefined) return null
  const present = Object.keys(condition).filter((key) =>
    (USAGE_METRIC_CONDITION_KEYS as readonly string[]).includes(key)
  )
  if (present.length === 0) return null
  const labels = present.map((key) => `${getConditionField(key)?.label ?? key}(${key})`)
  return `저장할 수 없습니다. 등급형·레벨형만 지원하는 지표가 충족 횟수(repeat_count)와 함께 있습니다 — ${labels.join(', ')}. 충족 횟수 조건을 빼고 저장해주세요.`
}

/**
 * 등급형/레벨형 배타 규칙 (티켓 20260905_0032 A-3).
 *
 * DB가 `CHECK ((rarity IS NULL) = (level IS NOT NULL))`로 강제하지만(마이그레이션 130),
 * 위반하면 Postgres 원문(`new row for relation "badges" violates check constraint
 * "badges_rarity_level_exclusive"`)이 그대로 어드민 화면에 뜬다. 사람이 읽을 수 있는
 * 문구로 먼저 막는다.
 */
export function findRarityLevelError(rarity: unknown, level: unknown): string | null {
  const hasRarity = rarity !== null && rarity !== undefined && rarity !== ''
  const hasLevel = level !== null && level !== undefined && level !== ''

  if (hasRarity && hasLevel) {
    return '저장할 수 없습니다. 등급형과 레벨형은 함께 지정할 수 없습니다. 등급(common~mystic)이나 레벨(Lv.1 이상) 중 하나만 남겨주세요.'
  }
  if (!hasRarity && !hasLevel) {
    return '저장할 수 없습니다. 배지 종류가 정해지지 않았습니다. 등급(common~mystic) 또는 레벨(Lv.1 이상) 중 하나를 지정해주세요.'
  }
  if (hasRarity) {
    if (typeof rarity !== 'string' || !(rarity in RARITY_TIER)) {
      return `저장할 수 없습니다. 등급 값(${String(rarity)})을 알 수 없습니다. ${Object.keys(RARITY_TIER).join(' · ')} 중 하나를 선택해주세요.`
    }
    return null
  }
  const parsed = typeof level === 'number' ? level : parseInt(String(level), 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return `저장할 수 없습니다. 레벨 값(${String(level)})이 올바르지 않습니다. 1 이상의 정수를 입력해주세요.`
  }
  return null
}

/**
 * 조건 «형태» 검사 4종을 순서대로 돌린다. 첫 번째 오류만 돌려준다 —
 * 한 번에 한 가지씩 고치게 하는 편이 550종 카탈로그에서 덜 헷갈린다.
 *
 * 어드민 저장 API(`badge-validation.ts`)와 조건 폼(클라이언트) 양쪽이 이 함수를 부른다.
 */
export function findConditionShapeSaveError(
  badge: Pick<BadgeRow, 'name' | 'family_key'>,
  condition: BadgeCondition | null
): string | null {
  return (
    findUnpairedConditionError(condition) ??
    findRepeatRestConflictError(condition) ??
    findUsageMetricRepeatConflictError(condition) ??
    findCrossGateShapeError(badge, condition)
  )
}
