/**
 * 홈피드 카드 노출 판정 순수 함수 (티켓 20261026_2025 1회차).
 * `getTodayCards`의 SQL 규칙(기간 경계 포함, 태그 겹침 OR, 정렬)과 같은 결과를 내는지 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cardSelection.test.ts
 */
import { describe, it, expect } from 'vitest'
import { cardIsLiveDuring, cardMatchesTags, homeCardBgKey, sortHomeCards, spreadAdjacentBg } from '../cardSelection'

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

describe('sortHomeCards — 홈 정렬 (신규 우선 + 하루 단위 섞기)', () => {
  const NOW = new Date('2026-11-02T03:00:00Z')
  const OLD = '2026-10-01T00:00:00Z'
  const makeCards = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: `card-${String(i).padStart(2, '0')}`, sort_order: i, starts_at: OLD }))
  const ids = (cards: Array<{ id: string }>) => cards.map((c) => c.id)

  it('노출 시작 24시간 안인 새 카드는 sort_order와 상관없이 맨 앞에 오고 starts_at 내림차순이다', () => {
    const sorted = sortHomeCards(
      [
        { id: 'old-first', sort_order: 0, starts_at: OLD },
        { id: 'new-a', sort_order: 99, starts_at: '2026-11-01T12:00:00Z' },
        { id: 'new-b', sort_order: 50, starts_at: '2026-11-02T01:00:00Z' },
        { id: 'old-second', sort_order: 1, starts_at: OLD },
      ],
      { seed: 'u1:2026-11-02', now: NOW },
    )
    expect(ids(sorted).slice(0, 2)).toEqual(['new-b', 'new-a'])
    expect(ids(sorted).slice(2).sort()).toEqual(['old-first', 'old-second'])
  })

  it('24시간이 지나면 섞이는 묶음으로 들어간다', () => {
    const justOver = new Date(NOW.getTime() - 24 * 3600_000).toISOString()
    const justUnder = new Date(NOW.getTime() - 24 * 3600_000 + 1000).toISOString()
    const sorted = sortHomeCards(
      [
        { id: 'over', sort_order: 0, starts_at: justOver },
        { id: 'under', sort_order: 9, starts_at: justUnder },
      ],
      { seed: 's', now: NOW },
    )
    expect(ids(sorted)[0]).toBe('under')
  })

  it('같은 씨앗은 같은 순서다', () => {
    const cards = makeCards(20)
    const a = sortHomeCards(cards, { seed: 'u1:2026-11-02', now: NOW })
    const b = sortHomeCards(cards, { seed: 'u1:2026-11-02', now: NOW })
    expect(ids(a)).toEqual(ids(b))
  })

  it('날짜나 유저 씨앗이 다르면 순서가 달라진다', () => {
    const cards = makeCards(20)
    const base = ids(sortHomeCards(cards, { seed: 'u1:2026-11-02', now: NOW }))
    expect(ids(sortHomeCards(cards, { seed: 'u1:2026-11-03', now: NOW }))).not.toEqual(base)
    expect(ids(sortHomeCards(cards, { seed: 'u2:2026-11-02', now: NOW }))).not.toEqual(base)
  })

  it('sort_order가 낮다는 이유로 같은 카드가 매일 맨 위에 오지 않는다', () => {
    const cards = makeCards(20)
    const tops = new Set<string>()
    for (let day = 1; day <= 10; day++) {
      tops.add(sortHomeCards(cards, { seed: `u1:2026-11-${String(day).padStart(2, '0')}`, now: NOW })[0].id)
    }
    expect(tops.size).toBeGreaterThan(1)
  })

  it('같은 카드 집합이면 입력 순서와 무관하게 결과가 같다', () => {
    const cards = [...makeCards(15), { id: 'fresh', sort_order: 5, starts_at: '2026-11-02T00:00:00Z' }]
    const options = { seed: 'u1:2026-11-02', now: NOW }
    expect(ids(sortHomeCards([...cards].reverse(), options))).toEqual(ids(sortHomeCards(cards, options)))
  })

  it('같은 시각에 시작한 새 카드도 씨앗 순서로 섞이고, 같은 씨앗이면 입력 순서와 무관하게 같다', () => {
    const sameStart = '2026-11-02T01:00:00Z'
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, sort_order: i, starts_at: sameStart }))
    const first = ids(sortHomeCards(cards, { seed: 's1', now: NOW }))
    expect(ids(sortHomeCards([...cards].reverse(), { seed: 's1', now: NOW }))).toEqual(first)
    const tops = new Set(['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'].map((seed) => ids(sortHomeCards(cards, { seed, now: NOW }))[0]))
    expect(tops.size).toBeGreaterThan(1)
  })

  it('입력 배열을 바꾸지 않는다', () => {
    const input = [
      { id: 'a', sort_order: 2, starts_at: OLD },
      { id: 'b', sort_order: 1, starts_at: '2026-11-02T01:00:00Z' },
    ]
    sortHomeCards(input, { seed: 's', now: NOW })
    expect(ids(input)).toEqual(['a', 'b'])
  })
})

describe('spreadAdjacentBg — 섞은 뒤 이웃 바탕색 보정 (티켓 20261124_2040)', () => {
  const bg = (id: string, key: string | null) => ({ id, bg_color_key: key })
  const keyOf = (c: { bg_color_key: string | null }) => c.bg_color_key
  const ids = (cards: Array<{ id: string }>) => cards.map((c) => c.id)

  it('노랑·노랑·파랑은 노랑·파랑·노랑으로 보정된다', () => {
    const out = spreadAdjacentBg([bg('y1', 'yellow'), bg('y2', 'yellow'), bg('b1', 'blue')], keyOf)
    expect(ids(out)).toEqual(['y1', 'b1', 'y2'])
  })

  it('겹침이 없으면 순서를 바꾸지 않는다', () => {
    const input = [bg('a', 'yellow'), bg('b', 'blue'), bg('c', 'pink'), bg('d', 'yellow')]
    expect(ids(spreadAdjacentBg(input, keyOf))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('바탕이 모두 같으면 순서가 그대로다', () => {
    const input = [bg('a', 'yellow'), bg('b', 'yellow'), bg('c', 'yellow')]
    expect(ids(spreadAdjacentBg(input, keyOf))).toEqual(['a', 'b', 'c'])
  })

  it('바탕이 다른 카드가 둘 이상이면 이웃이 같은 쌍이 생기지 않는다', () => {
    const input = [bg('a', 'yellow'), bg('b', 'yellow'), bg('c', 'blue'), bg('d', 'blue'), bg('e', 'pink')]
    const out = spreadAdjacentBg(input, keyOf)
    expect(ids(out)).toEqual(['a', 'c', 'b', 'd', 'e'])
    for (let i = 1; i < out.length; i++) expect(out[i].bg_color_key).not.toBe(out[i - 1].bg_color_key)
  })

  it('남은 카드가 모두 같은 바탕이면 앞선 순서대로 둔다(겹침이 남는 예외)', () => {
    const input = [bg('a', 'yellow'), bg('b', 'blue'), bg('c', 'blue'), bg('d', 'blue')]
    expect(ids(spreadAdjacentBg(input, keyOf))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('바탕을 모르는 카드(NULL)는 겹침으로 보지 않는다', () => {
    const input = [bg('a', null), bg('b', null), bg('c', 'yellow'), bg('d', 'yellow')]
    expect(ids(spreadAdjacentBg(input, keyOf))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('같은 입력은 같은 결과를 내고 입력 배열을 바꾸지 않는다', () => {
    const input = [bg('y1', 'yellow'), bg('y2', 'yellow'), bg('b1', 'blue'), bg('y3', 'yellow')]
    const snapshot = ids(input)
    const first = ids(spreadAdjacentBg(input, keyOf))
    expect(ids(spreadAdjacentBg(input, keyOf))).toEqual(first)
    expect(ids(input)).toEqual(snapshot)
  })

  it('새 카드 묶음이 앞에 오는 정렬 위에서 겹치지 않으면 새 카드가 그대로 앞에 있다', () => {
    const NOW = new Date('2026-11-02T03:00:00Z')
    const cards = [
      { id: 'old-a', sort_order: 0, starts_at: '2026-10-01T00:00:00Z', bg_color_key: 'blue' },
      { id: 'new-a', sort_order: 1, starts_at: '2026-11-02T01:00:00Z', bg_color_key: 'yellow' },
      { id: 'new-b', sort_order: 2, starts_at: '2026-11-02T02:00:00Z', bg_color_key: 'pink' },
    ]
    const sorted = sortHomeCards(cards, { seed: 's', now: NOW })
    expect(ids(spreadAdjacentBg(sorted, homeCardBgKey)).slice(0, 2)).toEqual(['new-b', 'new-a'])
  })
})

describe('homeCardBgKey — 겹침 판정에 쓰는 바탕색 키', () => {
  it('팔레트 9키는 그대로 돌려준다', () => {
    expect(homeCardBgKey({ feed_type: 'text_box', bg_color_key: 'yellow' })).toBe('yellow')
  })

  it('NULL이거나 모르는 키는 null이다', () => {
    expect(homeCardBgKey({ bg_color_key: null })).toBeNull()
    expect(homeCardBgKey({ bg_color_key: 'mint' })).toBeNull()
  })

  it('바탕이 이미지에 가려지는 full_image는 null이다', () => {
    expect(homeCardBgKey({ feed_type: 'full_image', bg_color_key: 'yellow' })).toBeNull()
  })
})
