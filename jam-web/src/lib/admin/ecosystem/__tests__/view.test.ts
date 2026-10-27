/**
 * 생태계 상황판 화면용 순수 함수 (티켓 20261026_2027 3-1). 지키는 것:
 * - 목표 대비 줄은 중단 → 주의 → 읽지 못함 → 부족 → 정상 순이고 같은 상태는 원래 순서, 원본 배열은 그대로
 * - `?node=`는 허용 마디 10개만 받고 나머지는 선택 없음
 * - 요약 줄 수는 스냅샷이 센 값, 열린 요청은 정책마다 번호가 큰 것
 */
import { describe, it, expect } from 'vitest'
import { ECOSYSTEM_NODE_IDS, type GoalRow, type NodeStatus } from '../types'
import { openRequestByPolicy, parseNodeParam, sortGoalRows, summaryOf } from '../view'

function row(policyId: string, status: NodeStatus): GoalRow {
  return { policyId, title: policyId, status, parts: [] }
}

describe('sortGoalRows', () => {
  it('중단 → 주의 → 읽지 못함 → 부족 → 정상 → 목표 없음 순으로 올린다', () => {
    const rows = [row('a', 'ok'), row('b', 'insufficient'), row('c', 'error'), row('d', 'warn'), row('e', 'stop'), row('f', 'no_target')]
    expect(sortGoalRows(rows).map((r) => r.policyId)).toEqual(['e', 'd', 'c', 'b', 'a', 'f'])
  })

  it('같은 상태는 원래 순서를 지키고 원본은 바꾸지 않는다', () => {
    const rows = [row('a', 'warn'), row('b', 'ok'), row('c', 'warn'), row('d', 'ok')]
    expect(sortGoalRows(rows).map((r) => r.policyId)).toEqual(['a', 'c', 'b', 'd'])
    expect(rows.map((r) => r.policyId)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('빈 목록은 빈 목록이다', () => {
    expect(sortGoalRows([])).toEqual([])
  })
})

describe('parseNodeParam', () => {
  it('허용 마디 10개는 그대로 돌려준다', () => {
    for (const id of ECOSYSTEM_NODE_IDS) expect(parseNodeParam(id)).toBe(id)
  })

  it('없음·빈 값·모르는 키·대소문자 다른 값·공백은 선택 없음이다', () => {
    for (const value of [undefined, null, '', 'unknown', 'Inventory', ' inventory', 'inventory ', '__proto__', 'constructor']) {
      expect(parseNodeParam(value)).toBeNull()
    }
  })
})

describe('summaryOf', () => {
  it('스냅샷의 주의 이상과 읽지 못함 수를 그대로 돌려준다', () => {
    expect(summaryOf({ attentionCount: 2, errorCount: 1 })).toEqual({ attention: 2, errors: 1 })
    expect(summaryOf({ attentionCount: 0, errorCount: 0 })).toEqual({ attention: 0, errors: 0 })
  })
})

describe('openRequestByPolicy', () => {
  it('정책 ID로 열린 요청의 id와 번호를 찾는다', () => {
    const map = openRequestByPolicy([{ id: 'x', no: 3, policyId: 'p1' }])
    expect(map.get('p1')).toEqual({ id: 'x', no: 3 })
    expect(map.get('p2')).toBeUndefined()
  })

  it('같은 정책에 둘이면 번호가 큰 것을 쓴다 (목록 순서와 무관)', () => {
    const forward = openRequestByPolicy([
      { id: 'a', no: 2, policyId: 'p1' },
      { id: 'b', no: 5, policyId: 'p1' },
    ])
    const backward = openRequestByPolicy([
      { id: 'b', no: 5, policyId: 'p1' },
      { id: 'a', no: 2, policyId: 'p1' },
    ])
    expect(forward.get('p1')).toEqual({ id: 'b', no: 5 })
    expect(backward.get('p1')).toEqual({ id: 'b', no: 5 })
  })

  it('정책 ID가 없는 요청은 건너뛴다', () => {
    expect(openRequestByPolicy([{ id: 'a', no: 1, policyId: null }]).size).toBe(0)
  })
})
