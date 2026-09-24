/**
 * weeklyCards.ts — 홈피드 카드를 「요일별 단기 카드 목록 · 활성 장기 카드 수 · 미편성 여부」로
 * 배분하는 순수 함수 유닛테스트(티켓 20260924_0906)
 *
 * 지키는 것:
 * 1. 기간이 정확히 SHORT_CARD_MAX_DAYS(7일)면 단기, 7일을 넘으면 장기로 분류한다
 * 2. KST 날짜 경계 — 하루의 끝(23:59:59.999)에 걸치는 카드는 그날에만, 다음 날 시작(00:00:00.000)
 *    카드는 다음 날에만 나타난다
 * 3. 여러 날에 걸친 단기 카드는 겹치는 날짜마다 나타난다
 * 4. 비활성 단기 카드는 shortCards에 포함되되(흐림 표시용) 미편성 판정에는 넣지 않는다
 * 5. 장기 카드 수는 활성 카드만 센다
 * 6. shortCards 정렬은 sort_order 오름차순 → starts_at 내림차순이다(`/admin/today`와 동일)
 */
import { describe, it, expect } from 'vitest'
import { weeklyCards, SHORT_CARD_MAX_DAYS, type WeeklyCardInput } from '../weeklyCards'

const MONDAY = '2026-09-21' // 이 주의 KST 하루 경계: 09-21은 UTC 09-20T15:00:00.000Z ~ 09-21T14:59:59.999Z

function card(overrides: Partial<WeeklyCardInput> & Pick<WeeklyCardInput, 'id' | 'starts_at' | 'ends_at'>): WeeklyCardInput {
  return {
    title: '카드',
    content_type_id: null,
    template_type: 'editorial_article',
    is_active: true,
    sort_order: 0,
    ...overrides,
  }
}

describe('weeklyCards', () => {
  it('SHORT_CARD_MAX_DAYS는 7이다', () => {
    expect(SHORT_CARD_MAX_DAYS).toBe(7)
  })

  it('기간이 정확히 7일이면 단기 카드로, 7일을 1ms라도 넘으면 장기 카드로 분류한다', () => {
    const shortExact7d = card({ id: 'short-7d', starts_at: '2026-09-15T00:00:00.000Z', ends_at: '2026-09-22T00:00:00.000Z' })
    const longOver7d = card({ id: 'long-7d-1ms', starts_at: '2026-09-15T00:00:00.000Z', ends_at: '2026-09-22T00:00:00.001Z' })
    const days = weeklyCards([shortExact7d, longOver7d], MONDAY)
    const monday = days[0]
    expect(monday.date).toBe('2026-09-21')
    expect(monday.shortCards.map((c) => c.id)).toEqual(['short-7d'])
    expect(monday.longActiveCount).toBe(1)
  })

  it('KST 하루의 끝(23:59:59.999)에 걸치는 카드는 그날에만 나타나고 다음 날에는 나타나지 않는다', () => {
    // ends_at이 09-21 23:59:59.999(KST) = 09-21T14:59:59.999Z — 09-22(KST) 시작(09-21T15:00:00.000Z)보다 이르다
    const endsAtDayBoundary = card({ id: 'ends-at-boundary', starts_at: '2026-09-20T00:00:00.000Z', ends_at: '2026-09-21T14:59:59.999Z' })
    const days = weeklyCards([endsAtDayBoundary], MONDAY)
    expect(days[0].shortCards.map((c) => c.id)).toEqual(['ends-at-boundary']) // 09-21
    expect(days[1].shortCards.map((c) => c.id)).toEqual([]) // 09-22
  })

  it('KST 다음 날 시작(00:00:00.000)에 걸치는 카드는 다음 날에만 나타나고 그 전날에는 나타나지 않는다', () => {
    // starts_at이 09-22 00:00:00.000(KST) = 09-21T15:00:00.000Z — 09-21(KST) 끝(09-21T14:59:59.999Z)보다 늦다
    const startsAtNextDayBoundary = card({ id: 'starts-at-boundary', starts_at: '2026-09-21T15:00:00.000Z', ends_at: '2026-09-25T00:00:00.000Z' })
    const days = weeklyCards([startsAtNextDayBoundary], MONDAY)
    expect(days[0].shortCards.map((c) => c.id)).toEqual([]) // 09-21
    expect(days[1].shortCards.map((c) => c.id)).toEqual(['starts-at-boundary']) // 09-22
  })

  it('여러 날에 걸친 단기 카드는 겹치는 날짜마다 나타난다', () => {
    // KST 09-21 00:00:00.000 ~ 09-23 23:59:59.999(3일) — 09-21·09-22·09-23에 나타나고 09-24·09-20에는 없다
    const threeDayCard = card({ id: 'three-day', starts_at: '2026-09-20T15:00:00.000Z', ends_at: '2026-09-23T14:59:59.999Z' })
    const days = weeklyCards([threeDayCard], MONDAY)
    expect(days[0].shortCards.map((c) => c.id)).toEqual(['three-day']) // 09-21
    expect(days[1].shortCards.map((c) => c.id)).toEqual(['three-day']) // 09-22
    expect(days[2].shortCards.map((c) => c.id)).toEqual(['three-day']) // 09-23
    expect(days[3].shortCards.map((c) => c.id)).toEqual([]) // 09-24
  })

  it('활성 단기 카드가 하나도 없으면 미편성이고, 비활성 단기 카드는 판정에 넣지 않는다', () => {
    const inactiveOnly = card({
      id: 'inactive-short',
      starts_at: '2026-09-20T15:00:00.000Z',
      ends_at: '2026-09-21T14:59:59.999Z',
      is_active: false,
    })
    const days = weeklyCards([inactiveOnly], MONDAY)
    expect(days[0].unprogrammed).toBe(true)
    // 비활성이어도 흐림 표시를 위해 shortCards 목록에는 그대로 남는다
    expect(days[0].shortCards.map((c) => c.id)).toEqual(['inactive-short'])
  })

  it('활성 단기 카드가 하나라도 있으면 미편성이 아니다(비활성 카드와 공존해도)', () => {
    const active = card({ id: 'active-short', starts_at: '2026-09-20T15:00:00.000Z', ends_at: '2026-09-21T14:59:59.999Z', is_active: true, sort_order: 1 })
    const inactive = card({ id: 'inactive-short', starts_at: '2026-09-20T15:00:00.000Z', ends_at: '2026-09-21T14:59:59.999Z', is_active: false, sort_order: 2 })
    const days = weeklyCards([active, inactive], MONDAY)
    expect(days[0].unprogrammed).toBe(false)
  })

  it('장기 카드 수는 활성 카드만 센다(비활성 장기 카드는 세지 않는다)', () => {
    const activeLong = card({ id: 'active-long', starts_at: '2026-08-01T00:00:00.000Z', ends_at: '2026-10-01T00:00:00.000Z', is_active: true })
    const inactiveLong = card({ id: 'inactive-long', starts_at: '2026-08-01T00:00:00.000Z', ends_at: '2026-10-01T00:00:00.000Z', is_active: false })
    const days = weeklyCards([activeLong, inactiveLong], MONDAY)
    expect(days[0].longActiveCount).toBe(1)
    expect(days[0].unprogrammed).toBe(true) // 단기 카드가 전혀 없으므로 미편성
  })

  it('shortCards 정렬은 sort_order 오름차순 → starts_at 내림차순이다', () => {
    const a = card({ id: 'a', starts_at: '2026-09-20T16:00:00.000Z', ends_at: '2026-09-21T14:59:59.999Z', sort_order: 2 })
    const b = card({ id: 'b', starts_at: '2026-09-20T15:00:00.000Z', ends_at: '2026-09-21T14:59:59.999Z', sort_order: 1 })
    const c = card({ id: 'c', starts_at: '2026-09-20T17:00:00.000Z', ends_at: '2026-09-21T14:59:59.999Z', sort_order: 1 })
    const days = weeklyCards([a, b, c], MONDAY)
    // sort_order 1인 b·c가 먼저, 그중 starts_at이 늦은 c가 먼저(내림차순). 그다음 sort_order 2인 a
    expect(days[0].shortCards.map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })
})
