import {
  parseLedgerListParams,
  applyLedgerListQuery,
  ledgerReasonLabel,
  LEDGER_REASON_OPTIONS,
  type LedgerListQuery,
} from '../points-ledger-query'
import { HIGH_VALUE_THRESHOLD } from '@/lib/points/reasons'

interface RecordedCall {
  method: string
  args: unknown[]
}

/** 기록형 스텁 — `poi-list-query.test.ts`와 같은 방식 */
function createStubQuery<T>() {
  const calls: RecordedCall[] = []
  const query: LedgerListQuery<T> = {
    or: (...args) => {
      calls.push({ method: 'or', args })
      return query
    },
    eq: (...args) => {
      calls.push({ method: 'eq', args })
      return query
    },
    gte: (...args) => {
      calls.push({ method: 'gte', args })
      return query
    },
    lt: (...args) => {
      calls.push({ method: 'lt', args })
      return query
    },
    order: (...args) => {
      calls.push({ method: 'order', args })
      return query
    },
    range: async () => ({ data: [], count: 0, error: null }),
  }
  return { query, calls }
}

describe('parseLedgerListParams', () => {
  it('빈 파라미터는 필터 없음 + 최신순이다', () => {
    expect(parseLedgerListParams({})).toEqual({ reason: 'all', from: undefined, to: undefined, sort: 'created_desc' })
  })

  it('알려진 값은 그대로 좁혀진다', () => {
    expect(
      parseLedgerListParams({ reason: 'admin_grant', from: '2026-09-01', to: '2026-09-24', sort: 'amount_asc' })
    ).toEqual({ reason: 'admin_grant', from: '2026-09-01', to: '2026-09-24', sort: 'amount_asc' })
  })

  it('모르는 사유·정렬과 잘못된 날짜는 버린다', () => {
    const parsed = parseLedgerListParams({
      reason: 'toString',
      sort: 'whatever',
      from: '2026-02-30',
      to: '9/24/2026',
    })
    expect(parsed).toEqual({ reason: 'all', from: undefined, to: undefined, sort: 'created_desc' })
  })
})

describe('applyLedgerListQuery', () => {
  it('기준액 조건과 정렬은 필터가 없어도 항상 건다', () => {
    const { query, calls } = createStubQuery<unknown>()
    applyLedgerListQuery(query, parseLedgerListParams({}))

    expect(calls).toEqual([
      { method: 'or', args: [`amount.gte.${HIGH_VALUE_THRESHOLD},amount.lte.-${HIGH_VALUE_THRESHOLD}`] },
      { method: 'order', args: ['created_at', { ascending: false }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })

  it('사유 필터와 기간(한국 날짜 하루 전체 포함)이 쿼리 호출로 나간다', () => {
    const { query, calls } = createStubQuery<unknown>()
    applyLedgerListQuery(
      query,
      parseLedgerListParams({ reason: 'admin_deduct', from: '2026-09-01', to: '2026-09-24', sort: 'amount_desc' })
    )

    expect(calls).toContainEqual({ method: 'eq', args: ['reason', 'admin_deduct'] })
    // 9월 1일 0시(KST) = 8월 31일 15:00Z, 종료일 다음 날 0시(KST) = 9월 24일 15:00Z
    expect(calls).toContainEqual({ method: 'gte', args: ['created_at', '2026-08-31T15:00:00.000Z'] })
    expect(calls).toContainEqual({ method: 'lt', args: ['created_at', '2026-09-24T15:00:00.000Z'] })
    expect(calls).toContainEqual({ method: 'order', args: ['amount', { ascending: false }] })
  })
})

describe('ledgerReasonLabel', () => {
  it('운영자 지급·회수는 세부 사유 라벨을, 나머지는 사유 종류 라벨을 보여 준다', () => {
    expect(ledgerReasonLabel('admin_grant', 'cs_compensation')).toBe('CS 보상')
    expect(ledgerReasonLabel('admin_deduct', null)).toBe('—')
    expect(ledgerReasonLabel('badge_point_reward', null)).toBe('배지 보상')
  })

  it('사유 필터 선택지가 사유 종류 7개를 모두 담는다', () => {
    expect(LEDGER_REASON_OPTIONS.map((o) => o.value)).toEqual([
      'badge_point_reward',
      'mission_point_reward',
      'admin_grant',
      'admin_deduct',
      'combine_fail_reward',
      'combine_recipe_reward',
      'item_book_completion_point_reward',
    ])
  })
})
