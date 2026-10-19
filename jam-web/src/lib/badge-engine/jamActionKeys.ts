/**
 * JAM! 행동 지표 키 상수 (순수 파일, 티켓 20261004_1756 ⑨-a).
 *
 * 원래 `jamActionBadges.ts`에 있던 것을 옮겼다. 그 파일은 서비스 클라이언트(`@/lib/supabase/server`)를 값으로 가져와, 키 목록만 필요한
 * 순수 모듈(운영툴 예약 등록 핸들러 `opsInbox/execute/jamBadge.ts`)이 쓸 수 없었다. `jamActionBadges.ts`가 이 상수를 다시 내보내므로
 * 기존 호출부는 그대로 `./jamActionBadges`에서 가져온다. 키를 더하는 법은 `jamActionBadges.ts` 머리 주석을 따른다(이 파일의 키 1개 + 같은 절차).
 *
 * 서버 모듈·`node:`·Supabase를 가져오지 않는다.
 */

/** JAM! 행동 지표 키 — `conditionRegistry.ts` 선언과 1:1 대응 */
export const JAM_ACTION_CONDITION_KEYS = [
  'combine_attempt_count',
  'combine_success_count',
  'combine_fail_count',
  'recipe_first_success',
  // 드랍·픽업 4종 (티켓 20261001_0632)
  'drop_item_count',
  'pickup_item_count',
  'pickup_from_user_count',
  'picked_up_by_user_count',
  // 미션·컬렉션·가입 경과일·활동일·체크인 일수 5종 (티켓 20261001_0633)
  'mission_complete_count',
  'collection_complete_count',
  'days_since_signup',
  'weekly_active_days',
  'same_spot_checkin_days',
  // 새 JAM 조건 5종과 잼·챕터 3종 (티켓 20261018_1815 2회, 운영 로직 10.2절)
  'capsule_open_count',
  'locked_item_open_count',
  'locked_item_pickup_count',
  'other_tribe_item_kinds_count',
  'cross_tribe_combine_success_count',
  'jam_total_earned',
  'jam_weekly_earned',
  'chapter_reached',
  // 활동 기반 새 지표 5종 (티켓 20261019_0542 1회, 마이그레이션 246) — 보조 키 `active_week_min_days`는 아래 MODIFIER_KEYS
  'active_week_streak',
  'return_streak_weeks',
  'full_week_count',
  'full_season_year_count',
  'distinct_activity_type_count',
] as const

/**
 * 판정 트리거가 아닌 보조 키 — 짝 지표(`days_since_signup`·`active_week_streak`)가 붙은 배지의 판정을 거르거나 정하는 조건이다.
 * `conditionRegistry.ts`에서는 `USAGE_METRIC_CONDITION_KEYS`에서 빠지는 키와 1:1 대응한다.
 *  - `signup_recent_active_days`: 값이 있으면 `days_since_signup` 배지는 «오늘(KST)을 포함한 최근 30일 가운데
 *    활동한 날 수 ≥ 값»도 채워야 발급한다.
 *  - `active_week_min_days`: `active_week_streak` 배지가 «채운 주»로 치는 한 주(월~일, KST)의 최소 활동일(1~7, 없으면 1).
 */
export const JAM_ACTION_MODIFIER_KEYS = ['signup_recent_active_days', 'active_week_min_days'] as const

export type JamActionConditionKey = (typeof JAM_ACTION_CONDITION_KEYS)[number]
