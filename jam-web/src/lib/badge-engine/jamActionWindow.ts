/**
 * JAM! 행동 지표의 «기간 한정» 선택 인자 (서버 사이드 전용, 티켓 20261019_1445 1회)
 *
 * 지표 읽기 함수는 지금까지 «가입 이후 평생값»만 돌려줬다. 미션은 «참가한 뒤, 지정한 기간 안»의 값만 세어야 해서
 * 같은 함수에 **선택 인자** `window`를 더했다. 인자를 주지 않으면 필터를 하나도 걸지 않으므로 동작이 예전과 같다 —
 * 배지 엔진 호출처(`jamActionBadges.ts`의 `METRIC_COMPUTERS`)는 이 인자를 모르고 그대로 부른다.
 *
 * 하한·상한은 모두 **포함**이다(`lib/missions/window.ts`의 `activitiesWithinMissionWindow`와 같은 규칙).
 * 시각은 DB에서 비교한다(`gte`/`lte`) — 문자열 표기(`...Z`와 `...+00:00`)가 달라도 같은 시각으로 본다.
 */

/** 지표를 셀 시각 범위. `toIso`가 없으면(null·생략) 상한이 없다 */
export interface MetricWindow {
  /** 하한(포함) — ISO 시각 */
  fromIso: string
  /** 상한(포함) — ISO 시각. null·생략이면 상한 없음(상시 미션) */
  toIso?: string | null
}

/** `.gte()`·`.lte()`를 가진 쿼리 빌더의 최소 모양 — supabase-js 빌더가 구조적으로 맞는다 */
interface RangeFilterable<Q> {
  gte(column: string, value: string): Q
  lte(column: string, value: string): Q
}

/**
 * 쿼리에 시각 범위 필터를 건다. `window`가 없으면 쿼리를 그대로 돌려준다.
 * `column`이 NULL인 행은 `gte`/`lte` 어느 쪽에도 맞지 않아 빠진다 — 시각이 없는 행은 «기간 안»이라 할 수 없다.
 *
 * 인자 타입에 `Q extends RangeFilterable<Q>` 제약을 걸지 않은 이유: supabase-js 빌더(`select` 문자열을 타입으로 풀어 읽는다)에
 * 그 재귀 제약을 걸면 TS가 «Type instantiation is excessively deep»(TS2589)로 컴파일을 거부한다. 빌더를 받아 같은 빌더를
 * 돌려주는 통과 함수라 호출부의 타입은 그대로 유지된다.
 */
export function applyMetricWindow<Q>(query: Q, column: string, window?: MetricWindow): Q {
  if (!window) return query
  const filterable = query as unknown as RangeFilterable<Q>
  const lowered = filterable.gte(column, window.fromIso)
  return window.toIso ? (lowered as unknown as RangeFilterable<Q>).lte(column, window.toIso) : lowered
}
