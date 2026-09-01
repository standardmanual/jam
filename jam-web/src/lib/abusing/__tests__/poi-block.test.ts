/**
 * abusing/poi-block — 조용한 실패(에러 삼킴) 회귀 테스트 (티켓 20260901_1843)
 *
 * 1. `isPoiBlocked`는 fail-open(`false`) 방향을 유지한다 — 모든 픽업 요청마다 호출되므로
 *    fail-closed로 바꾸면 DB 일시 장애가 전체 픽업 정지로 번진다. 다만 이전에는 실패가
 *    완전히 무음이었다 — 로그를 남기는지 확인한다.
 * 2. `blockPoiForUser`/`unblockPoi`는 upsert/delete 실패를 던지는지 확인한다
 *    (이전에는 삼켜서 "블록 적용/해제됨"으로 처리됐다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/poi-block.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_POLICY } from '../policy'

const stub = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  selectError: null as { code: string; message: string } | null,
  upsertError: null as { code: string; message: string } | null,
  deleteError: null as { code: string; message: string } | null,
  upsertPayloads: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => {
    // `unblockPoi`는 `.delete().eq(...).eq(...)`처럼 eq를 여러 번 체이닝한 뒤 그 결과를 직접
    // await한다 — 실제 supabase-js 빌더가 그 자체로 thenable이라 마지막 `.eq()`가 반환한
    // 값을 그냥 await할 수 있는 것과 같다. `.select()` 경로는 `.maybeSingle()`로 명시 종료되므로
    // deleteMode 여부와 무관하게 안전하다.
    let deleteMode = false
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: stub.row, error: stub.selectError }),
      upsert: async (payload: Record<string, unknown>) => {
        stub.upsertPayloads.push(payload)
        return { error: stub.upsertError }
      },
      delete: () => {
        deleteMode = true
        return builder
      },
      then: (resolve: (v: { error: unknown }) => void) => resolve({ error: deleteMode ? stub.deleteError : null }),
    }
    return { from: () => builder } as unknown as SupabaseClient
  },
}))

import { isPoiBlocked, blockPoiForUser, unblockPoi } from '../poi-block'

beforeEach(() => {
  stub.row = null
  stub.selectError = null
  stub.upsertError = null
  stub.deleteError = null
  stub.upsertPayloads = []
})

describe('isPoiBlocked — fail-open 유지 + 로그', () => {
  it('블록 레코드가 없으면 false다', async () => {
    expect(await isPoiBlocked('user-1', 'poi-1')).toBe(false)
  })

  it('blocked_until이 미래면 true다', async () => {
    stub.row = { blocked_until: new Date(Date.now() + 3_600_000).toISOString() }
    expect(await isPoiBlocked('user-1', 'poi-1')).toBe(true)
  })

  it('blocked_until이 과거면 false다', async () => {
    stub.row = { blocked_until: new Date(Date.now() - 3_600_000).toISOString() }
    expect(await isPoiBlocked('user-1', 'poi-1')).toBe(false)
  })

  it('조회 실패는 false(차단 아님)로 폴백하되 로그를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.selectError = { code: 'PGRST500', message: 'internal error' }
    expect(await isPoiBlocked('user-1', 'poi-1')).toBe(false)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('blockPoiForUser — upsert 실패 전파', () => {
  it('upsert error를 받으면 예외를 던진다 (이전에는 삼켰다)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.upsertError = { code: 'PGRST204', message: 'column not found' }
    await expect(blockPoiForUser('user-1', 'poi-1', DEFAULT_POLICY)).rejects.toThrow('PGRST204')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('정상이면 blocked_until을 poi_block_hours만큼 미래로 저장한다', async () => {
    await blockPoiForUser('user-1', 'poi-1', DEFAULT_POLICY)
    expect(stub.upsertPayloads).toHaveLength(1)
    const payload = stub.upsertPayloads[0]
    expect(payload.user_id).toBe('user-1')
    expect(payload.poi_id).toBe('poi-1')
    expect(new Date(payload.blocked_until as string).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('unblockPoi — delete 실패 전파', () => {
  it('delete error를 받으면 예외를 던진다 (이전에는 삼켰다)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.deleteError = { code: '42501', message: 'permission denied' }
    await expect(unblockPoi('user-1', 'poi-1')).rejects.toThrow('42501')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('정상이면 예외 없이 완료된다', async () => {
    await expect(unblockPoi('user-1', 'poi-1')).resolves.toBeUndefined()
  })
})
