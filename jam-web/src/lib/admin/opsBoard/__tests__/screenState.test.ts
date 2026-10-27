/**
 * 운영 상황판 화면 상태 (티켓 20261026_2023 1회차, 어드민 상황판 PRD §3.1 표)
 *
 * 지키는 것: 안쪽 상태 10개가 PRD 표대로 다섯 화면 상태로 묶이고, 10개 밖 값은 null이며,
 * 내 차례에는 결정 필요·문제만 뜬다.
 */
import { describe, expect, it } from 'vitest'
import { OPS_ITEM_STATUSES } from '@/lib/admin/opsInbox/constants'
import {
  SCREEN_STATES,
  SCREEN_STATE_LABELS,
  isMyTurnState,
  screenDetailOfItemStatus,
  screenStateOfItemStatus,
} from '@/lib/admin/opsBoard/screenState'

describe('screenStateOfItemStatus', () => {
  const expected: Record<string, string> = {
    arrived: 'decide',
    reviewing: 'decide',
    approved: 'progress',
    preparing: 'progress',
    scheduled: 'progress',
    live: 'live',
    failed: 'problem',
    ended: 'done',
    rejected: 'done',
    cancelled: 'done',
  }

  it('10개 상태가 모두 PRD 표대로 바뀐다', () => {
    expect(Object.keys(expected).sort()).toEqual([...OPS_ITEM_STATUSES].sort())
    for (const status of OPS_ITEM_STATUSES) {
      expect(screenStateOfItemStatus(status), status).toBe(expected[status])
    }
  })

  it('10개 밖 값은 null이다', () => {
    expect(screenStateOfItemStatus('unknown')).toBeNull()
    expect(screenStateOfItemStatus('')).toBeNull()
    expect(screenStateOfItemStatus('ARRIVED')).toBeNull()
  })
})

describe('screenDetailOfItemStatus', () => {
  it('세부가 있는 상태는 작게 쓸 글을 돌려준다', () => {
    expect(screenDetailOfItemStatus('approved')).toBe('승인됨')
    expect(screenDetailOfItemStatus('preparing')).toBe('준비중')
    expect(screenDetailOfItemStatus('scheduled')).toBe('예약됨')
    expect(screenDetailOfItemStatus('ended')).toBe('종료')
    expect(screenDetailOfItemStatus('rejected')).toBe('반려')
    expect(screenDetailOfItemStatus('cancelled')).toBe('취소')
  })

  it('나머지 상태와 10개 밖 값은 null이다', () => {
    for (const status of ['arrived', 'reviewing', 'live', 'failed', 'unknown']) {
      expect(screenDetailOfItemStatus(status), status).toBeNull()
    }
  })
})

describe('화면 상태 목록', () => {
  it('다섯 가지이고 글자가 모두 있다', () => {
    expect(SCREEN_STATES).toEqual(['decide', 'progress', 'live', 'problem', 'done'])
    expect(SCREEN_STATES.map((state) => SCREEN_STATE_LABELS[state])).toEqual(['결정 필요', '진행 중', '게재 중', '문제', '끝남'])
  })

  it('내 차례에는 결정 필요와 문제만 뜬다', () => {
    expect(SCREEN_STATES.filter(isMyTurnState)).toEqual(['decide', 'problem'])
  })
})
