/**
 * 홈피드 카드 노출 판정 순수 함수 (티켓 20261026_2025 1회차).
 * `getTodayCards`의 SQL 규칙(기간 경계 포함, 태그 겹침 OR, 정렬)과 같은 결과를 내는지 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cardSelection.test.ts
 */
import { describe, it, expect } from 'vitest'
import { cardIsLiveDuring, cardMatchesTags, sortHomeCards } from '../cardSelection'

const DAY_START = '2026-10-05T00:00:00.000Z'
const DAY_END = '2026-10-05T23:59:59.999Z'

function card(overrides: Partial<{ is_active: boolean; starts_at: string; ends_at: string }> = {}) {
  return { is_active: true, starts_at: '2026-10-01T00:00:00.000Z', ends_at: '2026-10-31T00:00:00.000Z', ...overrides }
}

describe('cardIsLiveDuring — 기간 판정', () => {
  it('구간을 덮는 카드는 보인다', () => {
    expect(cardIsLiveDuring(card(), DAY_START, DAY_END)).toBe(true)
  })

  it('꺼진 카드는 기간이 맞아도 안 보인다', () => {
    expect(cardIsLiveDuring(card({ is_active: false }), DAY_START, DAY_END)).toBe(false)
  })

  it('시작이 구간 끝과 같으면 보인다(경계 포함), 1ms 뒤면 안 보인다', () => {
    expect(cardIsLiveDuring(card({ starts_at: DAY_END }), DAY_START, DAY_END)).toBe(true)
    expect(cardIsLiveDuring(card({ starts_at: '2026-10-06T00:00:00.000Z' }), DAY_START, DAY_END)).toBe(false)
  })

  it('종료가 구간 시작과 같으면 보인다(경계 포함), 1ms 앞이면 안 보인다', () => {
    expect(cardIsLiveDuring(card({ ends_at: DAY_START }), DAY_START, DAY_END)).toBe(true)
    expect(cardIsLiveDuring(card({ ends_at: '2026-10-04T23:59:59.999Z' }), DAY_START, DAY_END)).toBe(false)
  })

  it('하루 안에서 시작해 끝나는 카드도 보인다', () => {
    expect(cardIsLiveDuring(card({ starts_at: '2026-10-05T03:00:00Z', ends_at: '2026-10-05T04:00:00Z' }), DAY_START, DAY_END)).toBe(true)
  })

  it('시각 표기(Z와 +09:00)가 달라도 순간으로 비교한다', () => {
    // 2026-10-06 00:00 KST = 2026-10-05T15:00:00Z — 구간 안이다
    expect(cardIsLiveDuring(card({ starts_at: '2026-10-06T00:00:00+09:00' }), DAY_START, DAY_END)).toBe(true)
  })
})

describe('cardMatchesTags — 노출 태그 겹침(OR)', () => {
  it('하나라도 겹치면 참이다', () => {
    expect(cardMatchesTags(['time_morning', 'weather_rain'], ['all', 'time_morning'])).toBe(true)
  })

  it('겹치는 것이 없으면 거짓이다', () => {
    expect(cardMatchesTags(['weather_rain'], ['all', 'time_morning'])).toBe(false)
  })

  it('all이 붙은 카드는 유저 태그에 all이 늘 있어 보인다', () => {
    expect(cardMatchesTags(['all'], ['all', 'time_night'])).toBe(true)
  })

  it('카드 태그가 비었거나 없으면 거짓이다', () => {
    expect(cardMatchesTags([], ['all'])).toBe(false)
    expect(cardMatchesTags(null, ['all'])).toBe(false)
    expect(cardMatchesTags(undefined, ['all'])).toBe(false)
  })

  it('유저 태그가 비어 있으면 거짓이다', () => {
    expect(cardMatchesTags(['all'], [])).toBe(false)
  })
})

describe('sortHomeCards — 홈 정렬', () => {
  it('sort_order 오름차순, 같으면 starts_at 내림차순이다', () => {
    const sorted = sortHomeCards([
      { id: 'a', sort_order: 2, starts_at: '2026-10-03T00:00:00Z' },
      { id: 'b', sort_order: 1, starts_at: '2026-10-01T00:00:00Z' },
      { id: 'c', sort_order: 1, starts_at: '2026-10-02T00:00:00Z' },
    ])
    expect(sorted.map((c) => c.id)).toEqual(['c', 'b', 'a'])
  })

  it('두 키가 모두 같으면 들어온 순서를 지킨다(안정 정렬)', () => {
    const input = ['x', 'y', 'z', 'w'].map((id) => ({ id, sort_order: 0, starts_at: '2026-10-01T00:00:00Z' }))
    expect(sortHomeCards(input).map((c) => c.id)).toEqual(['x', 'y', 'z', 'w'])
  })

  it('입력 배열을 바꾸지 않는다', () => {
    const input = [
      { id: 'a', sort_order: 2, starts_at: '2026-10-01T00:00:00Z' },
      { id: 'b', sort_order: 1, starts_at: '2026-10-01T00:00:00Z' },
    ]
    sortHomeCards(input)
    expect(input.map((c) => c.id)).toEqual(['a', 'b'])
  })
})
