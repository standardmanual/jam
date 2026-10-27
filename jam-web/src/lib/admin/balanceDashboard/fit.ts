/**
 * 값과 목표의 견줌 (티켓 20261026_2027 2회차)
 *
 * 밸런스 지표 카드(`MetricCard.tsx`)에 있던 보이는 자릿수와 `compareToTarget`을 옮겼다. 생태계 상황판의 상태 규칙(`lib/admin/ecosystem/status.ts`)이
 * 화면 컴포넌트를 가져오지 않고 같은 견줌을 쓰려는 것이다. 동작은 바꾸지 않았다.
 *
 * 순수 모듈이다. 서버 모듈을 값으로 가져오지 않는다.
 */
import type { PartTarget, ValueUnit } from './types'

/** 단위별로 보이는 소수 자릿수. 견줄 때도 보이는 자릿수로 맞춘 값을 써서 «주 1번»으로 보이는데 «낮아요»가 뜨지 않게 한다 */
export const DISPLAY_DIGITS: Record<ValueUnit, number> = { per_week: 2, per_month: 2, count_30d: 1, ratio: 3 }

export type TargetFit = 'below' | 'within' | 'above'

/**
 * 값이 목표 범위 아래인지, 안인지, 위인지 본다. 범위의 양 끝은 안이지만, 목표가 `highExclusive`(«미만»)이면
 * 위쪽 끝은 밖이다. 보이는 자릿수로 맞춘 값으로 견준다
 */
export function compareToTarget(unit: ValueUnit, value: number, target: PartTarget): TargetFit {
  const shown = Number(value.toFixed(DISPLAY_DIGITS[unit]))
  if (shown < target.low) return 'below'
  if (target.highExclusive ? shown >= target.high : shown > target.high) return 'above'
  return 'within'
}
