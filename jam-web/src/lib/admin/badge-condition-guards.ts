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
 * ## 세 경로 모두 판정 함수가 이미 있다 — 여기서는 «부르기만» 한다
 *
 * | 경로 | 이미 있는 함수 |
 * |---|---|
 * | 짝 필드 없음 | `findBlockingConditionKeys().unpaired` (conditionRegistry) |
 * | 회차 + 휴식 조합 | `restConditionKeysIn` (activityFilters) |
 * | 교차 게이트 형태 오류 | `findCrossGateShapeError` (crossGate) |
 *
 * 지금까지 셋 다 **발급 시점에만** 돌았고, 그 사유(`missed`)는 어드민 시뮬레이터만 읽는다.
 */
import { findBlockingConditionKeys, getConditionField } from '@/lib/badge-engine/conditionRegistry'
import { restConditionKeysIn } from '@/lib/badge-engine/activityFilters'
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
 * 회차(`repeat_count`)와 휴식 조건의 조합을 막는다.
 *
 * 휴식 4종은 이력 패턴 술어라 회차 술어가 소비하지 못한다. 조합을 저장하면
 * `evaluateConditionDetailed`가 「회차와 함께 쓸 수 없는 조건」으로 **매번** fail한다
 * (티켓 20260905_0030 B-10) — 발급이 영원히 되지 않는다.
 */
export function findRepeatRestConflictError(condition: BadgeCondition | null): string | null {
  if (!condition || condition.repeat_count === undefined) return null
  const restKeys = restConditionKeysIn(condition)
  if (restKeys.length === 0) return null
  const labels = restKeys.map((key) => `${getConditionField(key)?.label ?? key}(${key})`)
  return `저장할 수 없습니다. 충족 횟수(repeat_count)는 휴식 조건과 함께 쓸 수 없습니다 — ${labels.join(', ')}. 둘 중 하나만 남겨주세요.`
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
 * 조건 «형태» 검사 3종을 순서대로 돌린다. 첫 번째 오류만 돌려준다 —
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
    findCrossGateShapeError(badge, condition)
  )
}
