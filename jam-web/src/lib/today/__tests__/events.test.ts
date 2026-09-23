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
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const fixtures = vi.hoisted(() => ({
  cardsById: {} as Record<string, { content_type_id: string | null } | undefined>,
  insertedPayloads: [] as Record<string, unknown>[],
  eventRows: [] as { content_type_id: string | null; event: string }[],
}))

function mockSupabase() {
  const from = (table: string) => {
    const state: { eq?: { col: string; val: unknown } } = {}
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = (col: string, val: unknown) => {
      state.eq = { col, val }
      return builder
    }
    builder.gte = () => builder
    builder.lt = () => builder
    builder.maybeSingle = () => {
      if (table !== 'today_cards') return Promise.resolve({ data: null, error: null })
      const id = state.eq?.val as string
      return Promise.resolve({ data: fixtures.cardsById[id] ?? null, error: null })
    }
    builder.insert = (payload: Record<string, unknown>) => {
      fixtures.insertedPayloads.push(payload)
      return Promise.resolve({ error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => {
      if (table === 'today_card_events') {
        return Promise.resolve({ data: fixtures.eventRows, error: null }).then(resolve)
      }
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))

import { parseTodayCardEventInput, recordTodayCardEvent, aggregateTodayCardEvents } from '../events'

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

  it('event가 impression/click/followup이 아니면 거부한다', () => {
    const result = parseTodayCardEventInput({ cardId: VALID_UUID, event: 'unknown_event' })
    expect(result.ok).toBe(false)
  })

  it('followupAction이 80자를 넘으면 거부한다', () => {
    const result = parseTodayCardEventInput({
      cardId: VALID_UUID,
      event: 'followup',
      followupAction: 'a'.repeat(81),
    })
    expect(result.ok).toBe(false)
  })

  it('followup 이벤트인데 followupAction이 없으면 거부한다', () => {
    const result = parseTodayCardEventInput({ cardId: VALID_UUID, event: 'followup' })
    expect(result.ok).toBe(false)
  })

  it('followup 이벤트에 followupAction(80자 이내)을 채우면 통과한다', () => {
    const result = parseTodayCardEventInput({
      cardId: VALID_UUID,
      event: 'followup',
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

    const result = await recordTodayCardEvent({ cardId: VALID_UUID, event: 'impression', followupAction: null })

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

    await recordTodayCardEvent({ cardId: VALID_UUID, event: 'click', followupAction: null })

    const keys = Object.keys(fixtures.insertedPayloads[0])
    for (const forbidden of ['user_id', 'userId', 'user', 'email', 'nickname']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('카드를 찾지 못하면 오류를 반환한다', async () => {
    const result = await recordTodayCardEvent({
      cardId: '22222222-2222-4222-8222-222222222222',
      event: 'impression',
      followupAction: null,
    })
    expect(result.ok).toBe(false)
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
})
