/**
 * 장소에 연결하는 배지는 체크인 배지만 (티켓 20261018_1813)
 *
 * 실행: `npx vitest run src/lib/admin/__tests__/poi-linked-badge-validation.test.ts`
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { validatePoiLinkedBadge } from '../poi-linked-badge-validation'

type Row = Record<string, unknown>
type Result = { data: Row | null; error: { message: string } | null }

/** from(표).select().eq().maybeSingle() 한 갈래만 흉내 내는 가짜 클라이언트 — 조회한 표 이름을 남긴다 */
function fakeClient(tables: Record<string, Result>, calls: string[] = []): SupabaseClient {
  return {
    from: (table: string) => {
      calls.push(table)
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: async () => tables[table] ?? { data: null, error: null },
      }
      return chain
    },
  } as unknown as SupabaseClient
}

describe('validatePoiLinkedBadge', () => {
  it.each([null, undefined, ''])('연결 배지가 %j이면 조회 없이 통과한다', async (value) => {
    const calls: string[] = []
    const result = await validatePoiLinkedBadge(fakeClient({}, calls), value)
    expect(result).toEqual({ valid: true })
    expect(calls).toEqual([])
  })

  it('체크인 배지는 통과한다', async () => {
    const client = fakeClient({ badges: { data: { id: 'b1', type: 'checkin' }, error: null } })
    expect(await validatePoiLinkedBadge(client, 'b1')).toEqual({ valid: true })
  })

  it.each(['activity', 'item', 'tribe', 'mission', 'jam'])('%s 배지는 400으로 거절한다', async (type) => {
    const client = fakeClient({ badges: { data: { id: 'b1', type }, error: null } })
    const result = await validatePoiLinkedBadge(client, 'b1')
    expect(result).toMatchObject({ valid: false, status: 400 })
    expect(result.valid === false && result.error).toContain('체크인 배지만')
  })

  it('없는 배지는 400으로 거절한다', async () => {
    const result = await validatePoiLinkedBadge(fakeClient({ badges: { data: null, error: null } }), 'ghost')
    expect(result).toMatchObject({ valid: false, status: 400 })
  })

  it('문자열이 아닌 값은 400으로 거절한다', async () => {
    expect(await validatePoiLinkedBadge(fakeClient({}), 123)).toMatchObject({ valid: false, status: 400 })
    expect(await validatePoiLinkedBadge(fakeClient({}), { id: 'b1' })).toMatchObject({ valid: false, status: 400 })
  })

  it('조회 오류는 500으로 돌려준다', async () => {
    const client = fakeClient({ badges: { data: null, error: { message: 'db down' } } })
    expect(await validatePoiLinkedBadge(client, 'b1')).toEqual({ valid: false, status: 500, error: 'db down' })
  })

  describe('수정 요청(poiId를 줄 때)', () => {
    it('이미 그 배지에 연결된 장소는 배지 종류를 다시 보지 않고 통과한다', async () => {
      const calls: string[] = []
      const client = fakeClient(
        {
          poi: { data: { linked_badge_id: 'legacy' }, error: null },
          badges: { data: { id: 'legacy', type: 'activity' }, error: null },
        },
        calls
      )
      expect(await validatePoiLinkedBadge(client, 'legacy', { poiId: 'p1' })).toEqual({ valid: true })
      expect(calls).toEqual(['poi'])
    })

    it('다른 배지로 바꾸면 새 배지를 검사해 체크인이 아니면 거절한다', async () => {
      const client = fakeClient({
        poi: { data: { linked_badge_id: 'old' }, error: null },
        badges: { data: { id: 'b2', type: 'item' }, error: null },
      })
      expect(await validatePoiLinkedBadge(client, 'b2', { poiId: 'p1' })).toMatchObject({ valid: false, status: 400 })
    })

    it('다른 체크인 배지로 바꾸면 통과한다', async () => {
      const client = fakeClient({
        poi: { data: { linked_badge_id: 'old' }, error: null },
        badges: { data: { id: 'b2', type: 'checkin' }, error: null },
      })
      expect(await validatePoiLinkedBadge(client, 'b2', { poiId: 'p1' })).toEqual({ valid: true })
    })
  })
})
