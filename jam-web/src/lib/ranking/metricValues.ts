/**
 * 랭킹모드 정렬 지표 — 필드 키 → 현재값 조회 계층 (순수 함수, 티켓 20260911_1440)
 *
 * 배지 조건 레지스트리(`conditionRegistry.ts`)는 "이 값이 기준치를 넘었는가"만 boolean으로
 * 보면 되지만, 랭킹은 그 값 자체를 유저 간에 비교해서 순서를 매겨야 한다. 레지스트리 필드
 * 상당수는 하나의 숫자로 떨어지는 성격이 아니거나(필터·관계 필드), 대표값을 어떻게 뽑을지
 * (역대 최고 vs 최근값) 제품 판단이 필요해 1차 범위에서 제외된다 — 이 파일의 화이트리스트가
 * 그 1차 지원 범위의 단일 출처다.
 *
 * ## 1차 지원 필드 선정 기준
 * - **누적 목표 그룹**(distance_km·total_count·elevation_gain_m·active_days_count·
 *   streak_days) — "가입 이후 지금까지 쌓인 값"이 유일하게 정해지는 대표값이라 역대
 *   최고/최근값 선택 문제가 없다. 배지 진행률 표시가 쓰는 것과 같은 계산(`activityFilters.ts`의
 *   `calcMaxStreak`, 나머지는 단순 합·개수)을 그대로 쓴다.
 * - **사용량 지표 그룹**(follower_count·following_count·daily_sync_count) — 활동 이력과
 *   무관하게 "지금 값"이 하나로 정해진다(팔로워 수는 현재 팔로워 수, 하루 동기화 횟수는
 *   오늘 KST 기준 카운트). `usageBadges.ts`가 배지 판정에 쓰는 것과 같은 소스다.
 * - **배지 보유 개수** — 레지스트리 필드는 아니지만 같은 성격(대표값이 유일)이라 같은
 *   화이트리스트 취급으로 묶는다(타입별 카운트, `metricValues.ts` 밖의 별도 조회).
 *
 * **제외된 것**: 한 번의 활동 기록류(single 섹션)·개인 기록 비교(record 섹션)는 대표값 기준
 * (역대 최고 vs 최근값)이 정해지지 않아 제외. 기간류(period 섹션의 weekly_count·monthly_km
 * 등)는 "역대 최고 주/달" vs "지금 이 주/달" 기준이 정해지지 않아 제외. 필터·관계 필드(scope·
 * rhythm·repeat·gate 섹션)는 애초에 "유저 한 명당 숫자 하나"가 아니라 정렬 지표가 될 수 없다.
 * 자세한 근거는 티켓 20260911_1440 Out of Scope 절 참고.
 *
 * 이 파일은 순수 함수만 둔다(Supabase 의존 없음) — DB 조회(활동 이력·팔로워 수 등)는
 * `rankingDataSource.ts`(서버 전용)가 담당하고, 그 결과를 이 파일의 계산 함수에 넘긴다.
 */
import type { NormalizedActivity } from '@/types/strava'
import { calcMaxStreak } from '@/lib/badge-engine/activityFilters'

/** 활동 이력만으로 계산되는 1차 지원 지표 — 배지 진행률 표시와 같은 계산을 쓴다(누적 목표 그룹) */
export const RANKING_ACTIVITY_METRIC_KEYS = [
  'distance_km',
  'total_count',
  'elevation_gain_m',
  'active_days_count',
  'streak_days',
] as const
export type RankingActivityMetricKey = (typeof RANKING_ACTIVITY_METRIC_KEYS)[number]

/** 활동 이력과 무관하게 "지금 값"이 하나로 정해지는 사용량 지표(usageBadges.ts와 같은 소스) */
export const RANKING_USAGE_METRIC_KEYS = ['follower_count', 'following_count', 'daily_sync_count'] as const
export type RankingUsageMetricKey = (typeof RANKING_USAGE_METRIC_KEYS)[number]

/** metric_type='condition_field'일 때 1차로 선택 가능한 필드 키 전체(활동 이력 + 사용량) */
export const RANKING_SUPPORTED_CONDITION_FIELD_KEYS = [
  ...RANKING_ACTIVITY_METRIC_KEYS,
  ...RANKING_USAGE_METRIC_KEYS,
] as const
export type RankingSupportedConditionFieldKey = (typeof RANKING_SUPPORTED_CONDITION_FIELD_KEYS)[number]

export function isRankingSupportedConditionField(key: string): key is RankingSupportedConditionFieldKey {
  return (RANKING_SUPPORTED_CONDITION_FIELD_KEYS as readonly string[]).includes(key)
}

export function isRankingActivityMetric(key: string): key is RankingActivityMetricKey {
  return (RANKING_ACTIVITY_METRIC_KEYS as readonly string[]).includes(key)
}

export function isRankingUsageMetric(key: string): key is RankingUsageMetricKey {
  return (RANKING_USAGE_METRIC_KEYS as readonly string[]).includes(key)
}

/** 활동 시작일(현지시간 우선) — YYYY-MM-DD. `computeUserPeriodMetrics`의 dateKey와 동일 규칙 */
function dateKey(a: NormalizedActivity): string {
  return (a.startDateLocal ?? a.startDate).slice(0, 10)
}

/**
 * 활동 이력 기반 지표 하나의 현재값을 계산한다.
 *
 * `activities`는 이미 "가입 시점 이후" 이력으로 좁혀진 상태를 기대한다(호출부가
 * `getActivityHistory(supabase, userId, signupAnchor)`로 조회) — 배지 진행률 표시와 같은
 * 전제(v5 확정: 가입 이전 이력은 배제)를 지켜야 두 곳의 값이 어긋나지 않는다.
 *
 * 활동 종목(activity_type) 범위는 두지 않는다 — 랭킹모드에는 배지처럼 "대상 활동" 축이 없어
 * (이번 범위는 지표 하나만 선택), 넘어온 활동 전체(모든 종목 혼재)를 대상으로 계산한다.
 */
export function computeActivityMetricValue(key: RankingActivityMetricKey, activities: NormalizedActivity[]): number {
  switch (key) {
    case 'distance_km':
      return activities.reduce((sum, a) => sum + a.distanceKm, 0)
    case 'elevation_gain_m':
      return activities.reduce((sum, a) => sum + a.elevationGainM, 0)
    case 'total_count':
      return activities.length
    case 'active_days_count':
      return new Set(activities.map(dateKey)).size
    case 'streak_days':
      return calcMaxStreak(activities)
  }
}
