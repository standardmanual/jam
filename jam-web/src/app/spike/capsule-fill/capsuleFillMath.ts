/**
 * 캡슐 채움 계산 — 프로토타입 전용 순수 로직 (티켓 20261028_1516)
 *
 * 그래프 눈금과 캡슐 잼 양을 오가는 변환, 한 번 채울 때 100%를 몇 번 넘는지 나누는 계획만 맡는다.
 * 화면·타이머를 모르는 순수 모듈이라 서버·클라이언트 어느 쪽에서도 쓴다.
 */

import { GRAPH_MAX_PERCENT, GRAPH_MIN_PERCENT, graphPercentToFillRatio, jamPercentToGraphPercent } from '@/lib/capsule/capsule-gauge'

// 그래프 눈금 변환은 서비스 게이지와 함께 쓰므로 `lib/capsule/capsule-gauge.ts`로 옮겼다(티켓 20261028_1739 2회). 프로토타입은 같은 이름으로 다시 내보낸다.
export { GRAPH_MAX_PERCENT, GRAPH_MIN_PERCENT, graphPercentToFillRatio, jamPercentToGraphPercent }

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** 캡슐에 든 잼 양 → 그래프 눈금. 용량이 0 이하이면 비어 있는 것으로 본다 */
export function jamToGraphPercent(jam: number, capacity: number): number {
  if (!(capacity > 0)) return GRAPH_MIN_PERCENT
  return jamPercentToGraphPercent((clamp(jam, 0, capacity) / capacity) * 100)
}

export interface FillSegment {
  /** 이 구간이 끝날 때 캡슐에 든 잼 양(0~용량) */
  to: number
  /** 이 구간이 100%에 닿아 챕터가 오르는지 */
  levelUp: boolean
}

export interface FillPlan {
  /** 위에서부터 차례로 실행할 구간. 챕터가 오른 뒤에는 캡슐이 0에서 다시 시작한다 */
  segments: FillSegment[]
  /** 채우기를 모두 마친 뒤 캡슐에 남는 잼 양 */
  filledAfter: number
  /** 챕터가 오르는 횟수 */
  levelUps: number
}

/**
 * 지금 든 양(`filled`)에 `amount`를 더할 때의 실행 계획을 만든다.
 * 용량(`capacity`)에 닿을 때마다 구간을 끊고, 넘친 양은 빈 캡슐에서 이어 채운다.
 * 용량에 딱 맞게 끝나면 마지막 구간 뒤에 남는 양이 없어 `filledAfter`는 0이다.
 */
export function planFill({ filled, amount, capacity }: { filled: number; amount: number; capacity: number }): FillPlan {
  if (!(capacity > 0)) return { segments: [], filledAfter: 0, levelUps: 0 }

  const start = clamp(filled, 0, capacity)
  const add = Number.isFinite(amount) ? Math.max(0, amount) : 0
  let rest = start + add

  const segments: FillSegment[] = []
  while (rest >= capacity) {
    segments.push({ to: capacity, levelUp: true })
    rest -= capacity
  }
  if (rest > 0 || segments.length === 0) segments.push({ to: rest, levelUp: false })

  return { segments, filledAfter: rest, levelUps: segments.filter((s) => s.levelUp).length }
}
