/**
 * 투데이 카드 이벤트 기록·집계 (티켓 20260924_0004)
 *
 * 확인하는 것:
 * 1. 입력 검증(`parseTodayCardEventInput`) — cardId UUID, event 종류, followupAction 길이·필수 여부
 * 2. `recordTodayCardEvent` — 카드의 content_type_id를 조회해 함께 insert하고,
 *    insert 페이로드에 유저 식별자 키(user_id 등)가 전혀 없다
 * 3. `aggregateTodayCardEvents` — 유형 ID×이벤트별 건수 집계 형태
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/events.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const fixtures = vi.hoisted(() => ({
  cardsById: {} as Record<string, { content_type_id?: string | null; is_active?: boolean; starts_at?: string; ends_at?: string } | undefined>,
  insertedPayloads: [] as Record<string, unknown>[],
  eventRows: [] as { content_type_id: string | null; event: string }[],
  cardQueryCount: 0,
  cardError: null as { message: string } | null,
}))

function mockSupabase() {
  const from = (table: string) => {
    const state: { eq?: { col: string; val: unknown }; range?: [number, number] } = {}
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = (col: string, val: unknown) => {
      state.eq = { col, val }
      return builder
    }
    builder.gte = () => builder
    builder.lt = () => builder
    builder.order = () => builder
    builder.range = (start: number, end: number) => {
      state.range = [start, end]
      return builder
    }
    builder.maybeSingle = () => {
      if (table !== 'today_cards') return Promise.resolve({ data: null, error: null })
      fixtures.cardQueryCount++
      if (fixtures.cardError) return Promise.resolve({ data: null, error: fixtures.cardError })
      const id = state.eq?.val as string
      return Promise.resolve({ data: fixtures.cardsById[id] ?? null, error: null })
    }
    builder.insert = (payload: Record<string, unknown>) => {
      fixtures.insertedPayloads.push(payload)
      return Promise.resolve({ error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => {
      if (table === 'today_card_events') {
        const rows = state.range ? fixtures.eventRows.slice(state.range[0], state.range[1] + 1) : fixtures.eventRows
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      }
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))

import { parseTodayCardEventInput, recordTodayCardEvent, aggregateTodayCardEvents, assertCardExposable, checkRateLimit, getRateLimitKeyCount } from '../events'

const VALID_UUID = '11111111-1111-4111-8111-111111111111'

describe('parseTodayCardEventInput — 입력 검증', () => {
  it('cardId·event가 올바르면 통과한다', () => {
    const result = parseTodayCardEventInput({ cardId: VALID_UUID, event: 'impression' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ cardId: VALID_UUID, event: 'impression', followupAction: null })
    }
  })

  it('cardId가 UUID 형식이 아니면 거부한다', () => {
    const result = parseTodayCardEventInput({ cardId: 'not-a-uuid', event: 'impression' })
    expect(result.ok).toBe(false)
  })

  it('event가 impression/click이 아니면 거부한다', () => {
    const result = parseTodayCardEventInput({ cardId: VALID_UUID, event: 'unknown_event' })
    expect(result.ok).toBe(false)
  })

  it('event가 followup이면 거부한다(후속 행동은 수집하지 않는다, 티켓 20260924_0810)', () => {
    const result = parseTodayCardEventInput({ cardId: VALID_UUID, event: 'followup', followupAction: '트라이브 상세 진입' })
    expect(result.ok).toBe(false)
  })

  it('followupAction이 80자를 넘으면 거부한다', () => {
    const result = parseTodayCardEventInput({
      cardId: VALID_UUID,
      event: 'click',
      followupAction: 'a'.repeat(81),
    })
    expect(result.ok).toBe(false)
  })

  it('followupAction(80자 이내)을 채우면 통과한다', () => {
    const result = parseTodayCardEventInput({
      cardId: VALID_UUID,
      event: 'click',
      followupAction: '트라이브 상세 진입',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.followupAction).toBe('트라이브 상세 진입')
  })
})

describe('recordTodayCardEvent — 카드 유형 ID 동봉 insert, 유저 식별자 미포함', () => {
  it('카드의 content_type_id를 조회해 이벤트와 함께 insert한다', async () => {
    fixtures.insertedPayloads.length = 0
    fixtures.cardsById[VALID_UUID] = { content_type_id: 'T05' }

    const result = await recordTodayCardEvent({ cardId: VALID_UUID, event: 'impression', followupAction: null }, { content_type_id: 'T05' })

    expect(result.ok).toBe(true)
    expect(fixtures.insertedPayloads).toHaveLength(1)
    expect(fixtures.insertedPayloads[0]).toEqual({
      card_id: VALID_UUID,
      content_type_id: 'T05',
      event: 'impression',
      followup_action: null,
    })
  })

  it('insert 페이로드에 유저 식별자 키가 전혀 없다', async () => {
    fixtures.insertedPayloads.length = 0
    fixtures.cardsById[VALID_UUID] = { content_type_id: 'T05' }

    await recordTodayCardEvent({ cardId: VALID_UUID, event: 'click', followupAction: null }, { content_type_id: 'T05' })

    const keys = Object.keys(fixtures.insertedPayloads[0])
    for (const forbidden of ['user_id', 'userId', 'user', 'email', 'nickname']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})

describe('aggregateTodayCardEvents — 유형 ID×이벤트별 건수 집계', () => {
  it('같은 유형·이벤트 행을 건수로 묶는다', async () => {
    fixtures.eventRows = [
      { content_type_id: 'T05', event: 'impression' },
      { content_type_id: 'T05', event: 'impression' },
      { content_type_id: 'T05', event: 'click' },
      { content_type_id: 'T01', event: 'impression' },
      { content_type_id: null, event: 'impression' },
    ]

    const rows = await aggregateTodayCardEvents('2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    const byKey = new Map(rows.map((r) => [`${r.contentTypeId}::${r.event}`, r.count]))

    expect(byKey.get('T05::impression')).toBe(2)
    expect(byKey.get('T05::click')).toBe(1)
    expect(byKey.get('T01::impression')).toBe(1)
    expect(byKey.get('null::impression')).toBe(1)
  })

  it('1,000행을 넘는 이벤트도 페이지를 나눠 정확히 집계한다(PostgREST 기본 상한 대응)', async () => {
    fixtures.eventRows = Array.from({ length: 1500 }, () => ({ content_type_id: 'T05', event: 'impression' }))

    const rows = await aggregateTodayCardEvents('2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z')

    expect(rows).toEqual([{ contentTypeId: 'T05', event: 'impression', count: 1500 }])
  })
})

describe('assertCardExposable — 카드 노출 상태 검증', () => {
  const ACTIVE_UUID = '33333333-3333-4333-8333-333333333333'
  const now = new Date('2026-09-24T00:00:00Z')

  it('존재하지 않는 카드는 거부한다', async () => {
    expect((await assertCardExposable('44444444-4444-4444-8444-444444444444', now)).ok).toBe(false)
  })

  it('is_active가 false인 카드는 거부한다', async () => {
    fixtures.cardsById[ACTIVE_UUID] = { is_active: false, starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-10-01T00:00:00Z' }
    expect((await assertCardExposable(ACTIVE_UUID, now)).ok).toBe(false)
  })

  it('노출 기간 밖이면 거부한다', async () => {
    fixtures.cardsById[ACTIVE_UUID] = { is_active: true, starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-09-10T00:00:00Z' }
    expect((await assertCardExposable(ACTIVE_UUID, now)).ok).toBe(false)
  })

  it('노출 종료 시각(ends_at)과 같은 순간이면 통과한다(양끝 포함)', async () => {
    fixtures.cardsById[ACTIVE_UUID] = { is_active: true, starts_at: '2026-09-01T00:00:00Z', ends_at: now.toISOString() }
    expect((await assertCardExposable(ACTIVE_UUID, now)).ok).toBe(true)
  })

  it('DB 조회 오류면 클라이언트에는 일반 문구만 돌려준다', async () => {
    fixtures.cardError = { message: 'connection refused: secret-host' }
    const result = await assertCardExposable(ACTIVE_UUID, now)
    fixtures.cardError = null
    expect(result).toEqual({ ok: false, error: '카드를 확인할 수 없습니다.' })
  })

  it('이벤트 1건(검증+기록)에 today_cards를 1회만 조회한다', async () => {
    fixtures.cardsById[ACTIVE_UUID] = { is_active: true, starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-10-01T00:00:00Z', content_type_id: 'T05' }
    fixtures.cardQueryCount = 0
    const exposure = await assertCardExposable(ACTIVE_UUID, now)
    if (exposure.ok) await recordTodayCardEvent({ cardId: ACTIVE_UUID, event: 'impression', followupAction: null }, exposure.card)
    expect(fixtures.cardQueryCount).toBe(1)
  })
})

describe('checkRateLimit — 유저별 분당 요청 상한', () => {
  it('상한 초과 요청을 거부한다', () => {
    const key = 'rate-limit-test-user'
    for (let i = 0; i < 3; i++) expect(checkRateLimit(key, 3, 60_000).ok).toBe(true)
    expect(checkRateLimit(key, 3, 60_000).ok).toBe(false)
  })

  it('요청이 창 밖으로 밀린 유저 키는 다른 요청 시점에 Map에서 지운다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    checkRateLimit('sweep-user-a', 3, 60_000)
    expect(getRateLimitKeyCount()).toBe(1)
    vi.setSystemTime(new Date('2030-01-01T00:01:01Z'))
    checkRateLimit('sweep-user-b', 3, 60_000)
    expect(getRateLimitKeyCount()).toBe(1)
  })

  afterEach(() => vi.useRealTimers())
})
