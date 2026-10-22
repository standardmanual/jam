import type { SupabaseClient } from '@supabase/supabase-js'
// 같은 상수가 서버 전용 의존이 없는 순수 파일에 있다. 서버 모듈이 끌려오면 운영툴 예약 등록 핸들러(순수 모듈 계약)가
// 이 파일을 쓸 수 없다(티켓 20261004_1756. 예전에는 `@/lib/drop-engine/index`에서 가져오던 길이 막혀 있었고, 그 파일은 티켓 20261022_0938에서 지웠다).
import { CUMULATIVE_CONDITION_FIELDS } from '@/lib/drop-engine/cumulativeConditionFields'
import { ALL_CONDITION_KEYS } from '@/lib/badge-engine/condition-schema'
import { CROSS_GATE_CONDITION_KEYS } from '@/lib/badge-engine/crossGate'
import { familyKeyOf } from '@/lib/badge-engine/badgeKind'
import type { SaveBlock } from '@/lib/missions/reward-badges'
// 순수 판정은 서버 전용 의존이 없는 파일에 있다 — 어드민 조건 폼(클라이언트 컴포넌트)이
// **같은 문자열**을 쓰려면 이 파일(→ drop-engine → next/headers)을 import할 수 없다.
import {
  findConditionShapeSaveError,
  findUnpairedConditionError,
  findRepeatRestConflictError,
  findUsageMetricRepeatConflictError,
  findRarityLevelError,
  findCrossGateShapeError,
} from './badge-condition-guards'
import type { BadgeCondition, BadgeRow } from '@/types/database'

export {
  findConditionShapeSaveError,
  findUnpairedConditionError,
  findRepeatRestConflictError,
  findUsageMetricRepeatConflictError,
  findRarityLevelError,
  findCrossGateShapeError,
}

/**
 * 아이템 배지(type='item')에 누적조건(monthly_km 등)을 걸면 활동 1건으로는 조건을 평가할 수 없어
 * (`drop-engine/cumulativeConditionFields.ts`의 `hasCumulativeCondition()`이 true) 이 배지가
 * 구조적으로 영원히 드랍 후보에 오르지 못한다 — 저장 단계에서 미리 막는다.
 */
export function findCumulativeConditionError(type: string, condition: BadgeCondition | null): string | null {
  if (type !== 'item' || !condition) return null
  const offending = CUMULATIVE_CONDITION_FIELDS.filter((f) => condition[f] !== undefined)
  if (offending.length === 0) return null
  return `아이템 배지에는 누적조건(${offending.join(', ')})을 설정할 수 없습니다. 이 조건이 있으면 드랍 후보에서 영구 제외됩니다.`
}

/**
 * condition_json에 badge-engine이 모르는 필드가 있으면 저장 단계에서 미리 막는다.
 * DB CHECK 제약(badges_condition_json_known_keys, 마이그레이션 102)이 최후 방어선이지만,
 * 그 위반 시 raw Postgres 에러가 그대로 어드민 사용자에게 노출되면 불친절하다 — API
 * 사전 검증으로 한국어 에러 메시지를 먼저 준다(티켓 20260825_031).
 *
 * 배경: 마이그레이션 084가 미션보상배지 15종에 넣은 {"mission_reward": true}처럼, 엔진이
 * 모르는 필드만 있는 조건이 "검사 스킵 → pass:true"로 새어나가 미션 없이 배지가 발급되는
 * 사고가 있었다(티켓 20260825_028). 허용 필드 목록 밖의 키는 애초에 저장을 막는다.
 */
export function findUnknownConditionKeyError(condition: BadgeCondition | null): string | null {
  if (!condition) return null
  const allowed = new Set<string>(ALL_CONDITION_KEYS)
  const unknown = Object.keys(condition).filter((key) => !allowed.has(key))
  if (unknown.length === 0) return null
  return `condition_json에 엔진이 모르는 필드(${unknown.join(', ')})가 있습니다. 허용된 필드만 저장할 수 있습니다.`
}

/**
 * `checkin_badge_count`의 배지 이름 목록(CSV로 입력)에 실제로 존재하지 않는 체크인 배지
 * 이름이 있으면 저장을 막는다(AC5, 티켓 20260914_1725 — "구현 중 택1, 저장 시점 검증을
 * 우선한다"). 이름은 `type='checkin'` 배지로만 해석한다(§2.8 "이름은 유일 식별자가 아니다" —
 * 동명이인이 있어도 체크인 배지로 한정하면 판정 대상이 명확하다).
 *
 * DB 조회가 필요해(체크인 배지 카탈로그 대조) 이 파일의 나머지 검사와 달리 **비동기**다 —
 * `findBadgeConditionSaveError`의 동기 체인에 합류시키지 않고 API 라우트가 별도로 await한다.
 * 조회 자체가 실패하면(DB 장애) 저장을 막지 않는다 — 평가 시점(`evaluateCheckinUsageBadges`)의
 * "카탈로그에 없는 이름은 무시" 처리가 최종 안전망이다.
 */
export async function findCheckinBadgeNamesNotFoundError(
  condition: BadgeCondition | null,
  supabase: SupabaseClient
): Promise<string | null> {
  const names = condition?.checkin_badge_count?.checkin_badge_names
  if (!names || names.length === 0) return null

  const { data, error } = await supabase.from('badges').select('name').eq('type', 'checkin').in('name', names)
  if (error) {
    console.error('[findCheckinBadgeNamesNotFoundError] 체크인 배지 이름 조회 오류:', error)
    return null
  }
  const found = new Set((data ?? []).map((r: { name: string }) => r.name))
  const missing = names.filter((n) => !found.has(n))
  if (missing.length === 0) return null
  return `저장할 수 없습니다. 체크인 배지 이름 목록에 존재하지 않는 이름이 있습니다 — ${missing.join(', ')}. 실제 체크인 배지(type='checkin') 이름과 정확히 일치해야 저장할 수 있어요.`
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `recipe_first_success`의 레시피 ID가 UUID 모양이고 실제 믹스 레시피(`combination_recipes`)인지 확인한다
 * (티켓 20261001_0631). 없는 레시피에 붙인 배지는 저장은 되지만 영원히 발급되지 않으므로 저장 시점에 막는다.
 *  - 키 없음 → `null`(통과)
 *  - 값이 객체가 아니거나 `recipe_id`가 UUID 형식이 아님 → 형식 오류
 *  - `combination_recipes`에 없음 → 존재하지 않는 ID
 *  - 조회 자체가 실패하면(DB 장애) 저장을 막지 않는다 — `findCheckinBadgeNamesNotFoundError`와 같은 원칙이고,
 *    평가 시점에는 최초 성공 기록과 맞는 레시피가 없어 발급되지 않는 쪽으로만 안전하게 실패한다.
 *
 * DB 조회가 필요해 **비동기**다 — 동기 체인(`findBadgeConditionSaveError`)에 합류시키지 않고 API 라우트가
 * 별도로 await한다.
 */
export async function findRecipeFirstSuccessNotFoundError(
  condition: BadgeCondition | null,
  supabase: SupabaseClient
): Promise<string | null> {
  if (!condition || !Object.prototype.hasOwnProperty.call(condition, 'recipe_first_success')) return null

  const value: unknown = condition.recipe_first_success
  const recipeId =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as { recipe_id?: unknown }).recipe_id
      : undefined
  if (typeof recipeId !== 'string' || !UUID_PATTERN.test(recipeId)) {
    return '저장할 수 없습니다. 레시피 ID 형식이 올바르지 않아요. 믹스 레시피 목록의 ID를 그대로 붙여 넣어주세요.'
  }

  const { data, error } = await supabase.from('combination_recipes').select('id').eq('id', recipeId).maybeSingle()
  if (error) {
    console.error('[findRecipeFirstSuccessNotFoundError] 믹스 레시피 조회 오류:', error)
    return null
  }
  if (!data) {
    return '저장할 수 없습니다. 존재하지 않는 레시피 ID예요. 믹스 레시피 목록에서 ID를 다시 확인해주세요.'
  }
  return null
}

/** 교차 게이트 키 → 문구에 쓰는 이름 */
const GATE_KEY_LABEL: Record<(typeof CROSS_GATE_CONDITION_KEYS)[number], string> = {
  cross_in_axis: '축 내 교차',
  cross_between_axis: '축 간 교차',
  gate_mission_badge: '미션 보상 배지',
}

const GATE_READ_FAILED_MESSAGE =
  '저장하지 못했어요. 서버에서 선행 배지와 교차 게이트의 배지를 확인하다가 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

/**
 * 선행 배지(`prerequisite_badge_names`)·교차 게이트(`cross_in_axis`·`cross_between_axis`·`gate_mission_badge`)가 가리키는 배지가
 * 실제로 있고 숨김이 아닌지 본다 (티켓 20261019_1313 2회, 티켓 20261019_0012).
 *
 * 숨김 배지는 받기 전에 이름이 보이면 안 되는데, 선행 배지와 교차 게이트는 다른 배지의 잠금칩과 조건 문구로 받기 전에 보인다.
 * 그래서 숨김 배지를 이런 자리에 쓰지 못하게 저장에서 막는다.
 *  - 선행 배지 이름: 삭제되지 않은 배지로 실제 있어야 하고, 그 이름의 배지가 숨김이면 거절한다.
 *  - 교차 게이트: 가리키는 계열(`family_keys`)에 숨김 배지가 들어 있으면 거절한다. 자기 계열은 대상에서 빠지므로 뺀다.
 * 읽기에 실패하면 통과시키지 않는다(숨김 배지가 새는 쪽이 더 나쁘다). 나머지 비동기 검사와 달리 `SaveBlock`을 돌려준다.
 *
 * DB 조회가 필요해 **비동기**다 — 동기 체인(`findBadgeConditionSaveError`)에 합류시키지 않고 API 라우트가 별도로 await한다.
 */
export async function findHiddenBadgeReferenceError(
  badge: Pick<BadgeRow, 'name' | 'family_key'>,
  condition: BadgeCondition | null,
  supabase: SupabaseClient
): Promise<SaveBlock | null> {
  if (!condition) return null

  const names = Array.isArray(condition.prerequisite_badge_names)
    ? condition.prerequisite_badge_names.filter((name): name is string => typeof name === 'string' && name.length > 0)
    : []

  const selfFamilyKey = familyKeyOf(badge)
  const gateFamilyKeys = CROSS_GATE_CONDITION_KEYS.map((key) => {
    const raw = (condition[key] as { family_keys?: unknown } | undefined)?.family_keys
    const keys = Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string' && k.length > 0 && k !== selfFamilyKey) : []
    return [key, [...new Set(keys)]] as const
  }).filter(([, keys]) => keys.length > 0)

  if (names.length > 0) {
    const { data, error } = await supabase.from('badges').select('name, is_hidden').in('name', names).is('deleted_at', null)
    if (error) {
      console.error('[findHiddenBadgeReferenceError] 선행 배지 조회 오류:', error)
      return { status: 500, error: GATE_READ_FAILED_MESSAGE }
    }
    const rows = (data ?? []) as { name: string; is_hidden: boolean | null }[]
    const found = new Set(rows.map((row) => row.name))
    const missing = [...new Set(names)].filter((name) => !found.has(name))
    if (missing.length > 0) {
      return {
        status: 400,
        error: `저장할 수 없습니다. 선행 배지 이름 목록에 없는 배지가 있어요(${missing.join(', ')}). 없거나 삭제된 배지예요. 실제 배지 이름과 정확히 같게 입력해 주세요.`,
      }
    }
    const hidden = [...new Set(rows.filter((row) => row.is_hidden === true).map((row) => row.name))]
    if (hidden.length > 0) {
      return {
        status: 400,
        error: `저장할 수 없습니다. 선행 배지로 쓸 수 없는 숨김 배지가 있어요(${hidden.join(', ')}). 선행 배지는 다른 배지의 잠금칩으로 받기 전에 보이는데, 숨김 배지는 받기 전에 이름이 보이면 안 돼요. 숨김이 아닌 배지로 바꿔 주세요.`,
      }
    }
  }

  if (gateFamilyKeys.length > 0) {
    const allKeys = [...new Set(gateFamilyKeys.flatMap(([, keys]) => keys))]
    const { data, error } = await supabase
      .from('badges')
      .select('name, family_key, is_hidden')
      .in('family_key', allKeys)
      .eq('is_hidden', true)
      .is('deleted_at', null)
    if (error) {
      console.error('[findHiddenBadgeReferenceError] 교차 게이트 계열 조회 오류:', error)
      return { status: 500, error: GATE_READ_FAILED_MESSAGE }
    }
    const hiddenRows = ((data ?? []) as { name: string; family_key: string | null; is_hidden: boolean | null }[]).filter(
      (row) => row.is_hidden === true
    )
    for (const [key, keys] of gateFamilyKeys) {
      const hits = hiddenRows.filter((row) => row.family_key !== null && keys.includes(row.family_key))
      if (hits.length > 0) {
        const hitNames = [...new Set(hits.map((row) => row.name))].join(', ')
        return {
          status: 400,
          error: `저장할 수 없습니다. ${GATE_KEY_LABEL[key]} 게이트가 가리키는 계열에 숨김 배지가 있어요(${hitNames}). 교차 게이트는 다른 배지의 조건 문구로 받기 전에 보이는데, 숨김 배지는 받기 전에 이름이 보이면 안 돼요. 숨김 배지가 없는 계열을 가리키거나 그 배지의 숨김을 꺼 주세요.`,
        }
      }
    }
  }
  return null
}

/**
 * 조건 저장 전 검사 전체를 한 번에 돌린다 — 어드민 POST·PUT이 같은 순서로 같은 규칙을
 * 적용하도록 진입점을 하나로 둔다. 첫 번째 오류만 돌려준다(한 번에 한 가지씩 고치게 한다).
 */
export function findBadgeConditionSaveError(
  badge: Pick<BadgeRow, 'name' | 'family_key'>,
  type: string,
  condition: BadgeCondition | null
): string | null {
  return (
    findCumulativeConditionError(type, condition) ??
    findUnknownConditionKeyError(condition) ??
    findConditionShapeSaveError(badge, condition)
  )
}
