import { formatPaceSecPerKm } from '@/types/strava'
import {
  CONDITION_FIELDS,
  type AnyConditionFieldMeta,
} from '@/lib/badge-engine/conditionRegistry'
import type { BadgeCondition } from '@/types/database'

/**
 * 조건값 한 줄 표기 — 「이 배지를 받으려면 무엇이 얼마나 필요한가」.
 *
 * 이 파일은 진행 수치를 한국어 문구로 바꾸던 표시 레이어였다(티켓 20260904_0921). 서비스의 배지
 * 트리 화면이 제거되면서(티켓 20261018_1817, 2회) 진행 문구 조립 함수는 모두 걷어냈고, `badgeTree.ts`가
 * 계열 눈금의 조건 문구에 쓰는 `formatStopConditionValue` 하나만 남았다.
 */

// ── 조건값 표기 (티켓 20260906_1323 §7·§9) ────────────────────────────────

/**
 * 조건값 한 줄에 잇는 필드 최대 개수. 레일 눈금 캡션의 폭이 92px이라 넷을 넘기면 카드를
 * 밀어낸다 — 조건이 더 길면 「자세히」를 펼쳐 전체 설명을 본다.
 */
const MAX_CONDITION_VALUE_PARTS = 3

/**
 * 필드 하나의 조건값 문구. **`conditionRegistry`의 `chip()`을 그대로 쓴다** — 조건 어휘의
 * 단일 출처를 늘리지 않는다.
 *
 * `{값}{unit}`만 적는 방식을 쓰지 않는 이유(실측): 「완전한 하루」의 조건은
 * `{streak_days: 6, rest_after_streak: 1, repeat_count: 5}`라 단위만 붙이면
 * 「6일 · 1일 · 5회」가 되어 무엇의 숫자인지 사라진다. registry의 `chip`은 개념을 달고 있고
 * (「6일 연속」·「연속 후 휴식 1일」·「5회」) 이미 압축형이라 이 자리에 맞다.
 *
 * `condition_json`은 jsonb라 형태 보장이 없다 — `chip`이 내부를 파다 터지거나
 * `undefined`/`NaN`을 뱉으면 그 필드만 조용히 건너뛴다(`conditionRegistry.safeFormat`과 같은
 * 태도지만, 여기서는 「형태 오류」를 유저 화면에 내보내지 않고 생략한다).
 */
function conditionFieldValueText(meta: AnyConditionFieldMeta, condition: BadgeCondition): string | null {
  const value = condition[meta.key]
  if (value === undefined || value === null) return null
  if (meta.chip) {
    try {
      const text = meta.chip(condition)
      if (text && !text.includes('undefined') && !text.includes('NaN')) return text
    } catch {
      // 형태가 깨진 필드 — 아래 폴백으로 내려간다
    }
  }
  // `chip`이 없는 필드만 폴백. 숫자가 아닌 값(객체·목록)은 단위를 붙일 수 없어 생략한다.
  if (typeof value !== 'number') return null
  // `unit`이 null인 축(페이스)은 원값이 「초」라 그대로 적으면 의미가 없다.
  if (meta.key === 'max_pace_sec_per_km') return formatPaceSecPerKm(value)
  return `${value}${meta.unit ?? ''}`
}

/**
 * 「이 배지를 받으려면 무엇이 얼마나 필요한가」 한 줄 — 티켓 20260906_1323.
 *
 * **값의 출처는 `condition_json`뿐이다.** 유저 지표를 읽지 않으므로 630종 전부에 대해
 * 계산해도 추가 쿼리가 없고, 프런티어만 진행 계산하는 성능 구조를 깨지 않는다.
 * 진행값(`현재/목표`)을 만들지 않는다 — 그건 `formatFrontierProgressText`의 몫이다.
 *
 * `role === 'measurable'`인 필드만 고른다. `formatConditionChips`(registry)를 그대로 쓰지
 * 않는 이유가 이것이다 — 그 함수는 filter·meta 역할 필드까지 전부 포함해 어드민 목록용으로 길다.
 *
 * measurable이 하나도 없으면(미션 보상·수동 발급 등) `null` — 호출부가 기존 폴백
 * (레일은 `'—'`, 캡션은 「진행률을 표시할 수 없어요」)으로 떨어진다.
 */
export function formatStopConditionValue(condition: BadgeCondition | null | undefined): string | null {
  if (!condition) return null
  const parts: string[] = []
  for (const meta of CONDITION_FIELDS as readonly AnyConditionFieldMeta[]) {
    if (parts.length >= MAX_CONDITION_VALUE_PARTS) break
    if (meta.role !== 'measurable') continue
    const text = conditionFieldValueText(meta, condition)
    if (text) parts.push(text)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}
