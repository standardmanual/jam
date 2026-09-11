/**
 * 드랍 후보에서 빠지는 누적·기간 조건 목록 — 드랍 엔진·저장 검증·어드민 폼의 단일 출처.
 *
 * `drop-engine/index.ts`는 서버 전용 의존(supabase server 클라이언트 등)을 물어 클라이언트
 * 컴포넌트가 import할 수 없다. 그래서 어드민 폼이 이 목록을 5개로 따로 복제해 두었고, 엔진이
 * 11개로 늘어나는 동안 폼만 뒤처졌다(티켓 20260911_0901 D-2). 의존이 없는 이 파일로 옮겨
 * 세 곳이 같은 배열을 쓰게 한다.
 *
 * 드랍엔진은 활동 1건(또는 이번 싱크 배치)만으로 조건을 평가한다.
 * 누적/기간 집계 필드를 가진 배지는 단일 활동 시점 평가가 불가능하므로 드랍 제외.
 *
 * `distance_km`/`elevation_gain_m`은 2026-08-31(티켓 20260831_2100)부터 badge-engine에서
 * 기본이 "전체 이력 누적 합계"로 평가되므로(활동 1건만으로는 판정 불가) 여기 추가한다.
 * `isDroppableForActivity`가 badge-engine의 `checkCondition`(=`evaluateConditionDetailed`)을
 * 그대로 재사용하는 이상 두 엔진의 "단일 활동 평가 가능 여부" 판단은 일치해야 한다.
 * (`same_activity:true`로 예외 처리되는 배지가 있어도 안전한 방향으로 보수적으로 제외한다 —
 * 현재 `type='item'` 배지는 전부 `condition_json`이 비어 있어 실질 영향 없음.)
 */
import type { BadgeCondition } from '@/types/database'

export const CUMULATIVE_CONDITION_FIELDS: (keyof BadgeCondition)[] = [
  'monthly_km',
  'season_count',
  'weekly_count',
  'streak_days',
  'total_count',
  'distance_km',
  'elevation_gain_m',
  // 휴식 4종(티켓 20260905_0030 §4) — 「활동이 없는 기간」은 이력 전반 술어라 활동 1건으로는
  // 판정할 수 없다. 빠져 있으면 「단일 활동으로 판정 가능」으로 분류돼 checkCondition까지
  // 흘러가고, 거기서 「휴식 판정 불가」로 막히긴 하지만 분류 자체가 틀린다 — 아이템 배지에
  // 휴식 조건을 쓰는 순간 의도와 다른 경로로 판정된다(게이트 리뷰 지적).
  'rest_after_streak',
  'rest_after_long',
  'return_gap_days',
  'interval_days',
]

export function hasCumulativeCondition(cond: BadgeCondition): boolean {
  return CUMULATIVE_CONDITION_FIELDS.some((f) => cond[f] !== undefined)
}
