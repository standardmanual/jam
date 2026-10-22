/**
 * 아이템 배지에 걸 수 없는 누적·기간 조건 목록 — 저장 검증(`lib/admin/badge-validation.ts`)과
 * 어드민 배지 폼(`app/admin/badges/BadgeForm.tsx`)의 단일 출처.
 *
 * 서버 전용 의존(supabase server 클라이언트 등)이 없는 파일이라 클라이언트 컴포넌트도 import할
 * 수 있다. 예전에는 어드민 폼이 이 목록을 5개로 따로 복제해 두었고, 옛 드랍 엔진이 11개로 늘어나는
 * 동안 폼만 뒤처졌다(티켓 20260911_0901 D-2). 의존이 없는 이 파일로 옮겨 폼과 서버 검증이 같은 배열을 쓴다.
 * 옛 드랍 엔진(`drop-engine/index.ts`의 `isDroppableForActivity`)은 티켓 20261022_0938에서 지웠다.
 *
 * 누적/기간 집계 필드를 가진 배지는 활동 1건만으로 조건을 평가할 수 없어 아이템 배지에 걸 수 없다.
 *
 * `distance_km`/`elevation_gain_m`은 2026-08-31(티켓 20260831_2100)부터 badge-engine에서
 * 기본이 "전체 이력 누적 합계"로 평가되므로(활동 1건만으로는 판정 불가) 여기 추가한다.
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
