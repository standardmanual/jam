/**
 * 미션·컬렉션·가입 경과일·활동일·체크인 일수 지표가 «다시 볼 지표»를 정하는 규칙
 * (순수 함수·상수, 티켓 20261001_0633, 상위 20260930_1456 ③)
 *
 * 동기화 끝(`sync.ts`)과 컬렉션 장착 라우트(`/api/itembooks/[id]/slot`)가 `evaluateJamActionBadges`에 넘기는
 * `triggers`를 여기서 정한다. 호출 지점마다 분기를 흩어 두지 않고 DB 없이 테스트할 수 있게 한다.
 * 지표 정의와 세는 규칙은 `jamActionCompletionMetrics.ts`·`jamActionDayMetrics.ts`에 있다.
 *
 * ⚠️ 이 파일은 `@/lib/strava/sync`를 import하지 않는다 — `sync.ts`가 이 파일을 import하므로 순환을 막기 위해서다.
 * `jamActionBadges`는 type만 가져온다.
 *
 * ## 왜 동기화 끝에서 한 번에 판정하는가
 * 활동 기록 저장(`recordProcessedActivities`)이 판정 호출보다 앞서야 주간 활동일이 이번 배치를 볼 수 있다.
 * 체크인 루프 안에서 따로 부르면 호출이 늘어 배지 읽기도 늘어나고(호출마다 배지 전체 조회 1회), 미션 완료·컬렉션
 * 보정은 동기화가 끝나는 시점에 이미 DB에 있다. 체크인과 미션 완료는 동기화 안에서만 일어나므로(라우트에서 일어나지
 * 않는다) 동기화 끝 한 번이 판정 시점으로 충분하다. 컬렉션 완성은 장착 라우트에서도 일어나 따로 판정한다.
 */
import type { JamActionTrigger } from './jamActionBadges'

/**
 * 새 활동이 있는 동기화가 끝날 때 다시 볼 지표 — 주 키 17개.
 * 보조 키(`signup_recent_active_days`·`active_week_min_days`·`jam_week_min_earned`)는 트리거가 아니라 짝 지표 배지를 거르거나 정하는 조건이라 넣지 않는다.
 *
 * 잼 2종(`jam_total_earned`·`jam_weekly_earned`)은 잼 정산(`settleActivities`)이 동기화 안에서 일어나므로 정산 뒤 여기서 본다.
 * 챕터(`chapter_reached`)는 챕터가 오른 직후에도 판정한다(티켓 20261019_1316) — 챕터 1 시작(`chapter_start`,
 * `lib/chapter/start.ts`)과 자동 채움이 오름 처리(`lib/chapter/rise.ts`)를 부르고, 오름 처리가 `runJamActionEvaluation(userId, ['chapter_reached'])`를 부른다. 동기화 안의 잼 정산에서 난
 * 오름은 정산 뒤 여기서 읽으므로 오름 직후 판정을 건너뛴다(이중 판정 규칙은 `rise.ts` 머리말). 오름 직후 판정이 실패해도 이 목록의 동기화 끝 판정이 다음 동기화에서 따라잡는다(티켓 20261018_1815 결정 10).
 */
export const JAM_SYNC_TRIGGERS: readonly JamActionTrigger[] = [
  'mission_complete_count',
  'collection_complete_count',
  'days_since_signup',
  'weekly_active_days',
  'same_spot_checkin_days',
  'jam_total_earned',
  'jam_weekly_earned',
  'chapter_reached',
  // 활동 기반 새 지표 5종 (티켓 20261019_0542) — 인정된 활동 기록이 값을 정하므로 동기화 끝에서 한 번에 본다(활동 기록 저장 뒤)
  'active_week_streak',
  'return_streak_weeks',
  'full_week_count',
  'full_season_year_count',
  'distinct_activity_type_count',
  // 체크인·잼 새 지표 4종 (티켓 20261019_0542 2회) — 체크인 배지 발급은 동기화 안의 체크인 루프에서, 잼 정산은 동기화 안에서 일어나므로
  // 둘 다 끝난 뒤 동기화 끝에서 본다. 드랍 픽업 지표(`dropped_item_picked_up_count`)는 픽업 라우트가 정한다(`jamActionDropTriggers.ts`).
  'new_checkin_badge_count',
  'checkin_season_year_count',
  'jam_week_count',
  'jam_week_streak',
]

/**
 * 새 활동이 없는 동기화가 끝날 때 다시 볼 지표 — 가입 경과일만.
 * 날짜가 지나면 값이 바뀌는 지표는 가입 경과일뿐이다. 오래 쉰 계정은 배지의 보조 키(최근 30일 활동일)가 막는다.
 */
export const JAM_EMPTY_SYNC_TRIGGERS: readonly JamActionTrigger[] = ['days_since_signup']

/**
 * 컬렉션 장착이 성공하면 컬렉션 완성 수를 다시 본다.
 * 장착 RPC가 완성 여부를 돌려주지 않으므로 장착이 성공할 때마다 판정한다 — 완성이 아닌 장착이면 값이 그대로라
 * 잘못 발급되지 않는다.
 */
export function jamTriggersForSlot(): JamActionTrigger[] {
  return ['collection_complete_count']
}

/**
 * 캡슐을 열면 연 횟수와 다른 트라이브 아이템 종류 수를 다시 본다.
 * 열면 개체가 인벤토리에 들어오고 캡슐은 트라이브를 가리지 않고 뽑으므로 두 값이 모두 바뀔 수 있다.
 * 잠긴 채 나온 개체는 열지 않았으므로 `locked_item_open_count`는 보지 않는다.
 */
export function jamTriggersForCapsuleOpen(): JamActionTrigger[] {
  return ['capsule_open_count', 'other_tribe_item_kinds_count']
}

/** 잠긴 아이템 배지를 열면 잠긴 개체를 연 횟수를 다시 본다. 가진 개체는 그대로라 종류 수는 보지 않는다 */
export function jamTriggersForLockedItemOpen(): JamActionTrigger[] {
  return ['locked_item_open_count']
}

/**
 * 서비스 활동 잼이 지급되면 잼 조건 주 키 4개를 다시 본다 (티켓 20261028_1736 1회, 동작 설계 6).
 * 서비스 활동 잼은 동기화 밖(배지 받기·컬렉션 완성·믹스 등)에서 지급되고, 잼 조건은 서비스 활동 잼을 합산해 세므로(`jamActionJamMetrics.ts`)
 * 서비스 활동으로 문턱을 넘어도 다음 동기화까지 배지가 오지 않는 것을 막는다. 지급이 0이거나 중복 재전송이면 값이 그대로라 부르지 않는다(호출부 `lib/jam/serviceActivity.ts`).
 */
export function jamTriggersForServiceJam(): JamActionTrigger[] {
  return ['jam_total_earned', 'jam_weekly_earned', 'jam_week_count', 'jam_week_streak']
}
