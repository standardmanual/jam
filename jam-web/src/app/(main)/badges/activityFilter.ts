import type { ActivityType } from '@/types/database'

/**
 * 배지함 액티비티 탭의 종목 필터 값. 실제 종목(`ActivityType`)에 `'common'`(공통)을 더한 값이다.
 *
 * `'common'`은 종목에 묶이지 않는 배지, 곧 `activity_types`가 비어 있는 모든 배지(서비스 사용량
 * 지표 배지와 합산 배지 포함)다. `activity_types` DB 컬럼에 `'common'`이 채워지는 것은 아니므로
 * `ActivityType` 유니온에 합치지 않고 필터 전용 타입으로 분리한다 — 배지엔진 등 실제 종목 값을
 * 다루는 코드에 섞여 들어가지 않게 하기 위함이다(티켓 20260910_2258, 20261018_1817 2회).
 */
export type ActivityFilterValue = ActivityType | 'common'

/** 필터가 `'all'`이면 모두 통과, `'common'`이면 종목이 비어 있는 배지만, 그 밖에는 그 종목을 가진 배지만 통과한다 */
export function matchesActivityFilter(activityTypes: readonly ActivityType[], filter: ActivityFilterValue | 'all'): boolean {
  if (filter === 'all') return true
  if (filter === 'common') return activityTypes.length === 0
  return activityTypes.includes(filter)
}
