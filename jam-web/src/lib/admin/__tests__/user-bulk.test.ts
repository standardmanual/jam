import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  partitionUserTargets,
  readGrantPayload,
  userBulkPhraseAction,
  sumCounts,
  SKIP_REASON_ADMIN,
  SKIP_REASON_SELF,
  SKIP_REASON_NOT_FOUND,
} from '../user-bulk'

afterEach(() => {
  vi.unstubAllEnvs()
})

const ADMIN_ID = 'admin-1'

describe('partitionUserTargets', () => {
  it('일반 유저는 처리 대상으로 남고 요청 순서를 유지한다', () => {
    const result = partitionUserTargets(
      ['u2', 'u1'],
      [
        { id: 'u1', email: 'a@x.com', is_admin: false },
        { id: 'u2', email: 'b@x.com', is_admin: false },
      ],
      ADMIN_ID
    )
    expect(result.eligible).toEqual(['u2', 'u1'])
    expect(result.skipped).toEqual([])
  })

  it('is_admin 계정은 "어드민 계정"으로 건너뛴다', () => {
    const result = partitionUserTargets(
      ['u1', 'u2'],
      [
        { id: 'u1', email: 'a@x.com', is_admin: true },
        { id: 'u2', email: 'b@x.com', is_admin: false },
      ],
      ADMIN_ID
    )
    expect(result.eligible).toEqual(['u2'])
    expect(result.skipped).toEqual([{ id: 'u1', reason: SKIP_REASON_ADMIN, label: 'a@x.com' }])
    expect(result.excludedAdminCount).toBe(1)
  })

  it('ADMIN_EMAILS 화이트리스트 이메일은 is_admin이 false여도 어드민으로 건너뛴다', () => {
    vi.stubEnv('ADMIN_EMAILS', 'boss@jam.app, other@jam.app')
    const result = partitionUserTargets(
      ['u1'],
      [{ id: 'u1', email: 'boss@jam.app', is_admin: false }],
      ADMIN_ID
    )
    expect(result.eligible).toEqual([])
    expect(result.skipped).toEqual([{ id: 'u1', reason: SKIP_REASON_ADMIN, label: 'boss@jam.app' }])
  })

  it('실행 어드민 본인은 어드민이기도 하지만 "본인 계정"으로 먼저 분류한다', () => {
    const result = partitionUserTargets(
      [ADMIN_ID, 'u1'],
      [
        { id: ADMIN_ID, email: 'me@x.com', is_admin: true },
        { id: 'u1', email: 'a@x.com', is_admin: false },
      ],
      ADMIN_ID
    )
    expect(result.eligible).toEqual(['u1'])
    expect(result.skipped).toEqual([{ id: ADMIN_ID, reason: SKIP_REASON_SELF, label: 'me@x.com' }])
    expect(result.excludedSelfCount).toBe(1)
    expect(result.excludedAdminCount).toBe(0)
  })

  it('조회되지 않은 id는 "유저를 찾을 수 없습니다"로 건너뛴다', () => {
    const result = partitionUserTargets(['ghost'], [], ADMIN_ID)
    expect(result.eligible).toEqual([])
    expect(result.skipped).toEqual([{ id: 'ghost', reason: SKIP_REASON_NOT_FOUND }])
  })

  it('처리 대상 + 건너뜀 = 요청 수', () => {
    const ids = ['a', 'b', 'c', ADMIN_ID, 'ghost']
    const result = partitionUserTargets(
      ids,
      [
        { id: 'a', email: 'a@x.com', is_admin: false },
        { id: 'b', email: 'b@x.com', is_admin: true },
        { id: 'c', email: null, is_admin: null },
        { id: ADMIN_ID, email: 'me@x.com', is_admin: true },
      ],
      ADMIN_ID
    )
    expect(result.eligible).toEqual(['a', 'c'])
    expect(result.eligible.length + result.skipped.length).toBe(ids.length)
  })
})

describe('userBulkPhraseAction', () => {
  it('포인트는 금액 부호로 지급·회수를 구분한다', () => {
    expect(userBulkPhraseAction('grant_points', 100)).toBe('지급')
    expect(userBulkPhraseAction('grant_points', -100)).toBe('회수')
  })

  it('초기화·삭제는 동작 이름 그대로다', () => {
    expect(userBulkPhraseAction('reset')).toBe('초기화')
    expect(userBulkPhraseAction('delete')).toBe('삭제')
  })
})

describe('readGrantPayload', () => {
  it('객체가 아니면 빈 객체를 돌려준다', () => {
    expect(readGrantPayload(undefined)).toEqual({})
    expect(readGrantPayload('x')).toEqual({})
  })

  it('지급 입력 4개 키만 꺼낸다', () => {
    expect(readGrantPayload({ amount: 5, reasonLabel: 'other', note: 'n', confirmed: true, extra: 1 })).toEqual({
      amount: 5,
      reasonLabel: 'other',
      note: 'n',
      confirmed: true,
    })
  })
})

describe('sumCounts', () => {
  it('맵의 값을 모두 더한다', () => {
    expect(sumCounts({ a: 1, b: 4 })).toBe(5)
    expect(sumCounts({})).toBe(0)
  })
})
