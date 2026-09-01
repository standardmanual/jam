/**
 * poi/search-cache — 조용한 실패(에러 삼킴) 회귀 테스트 (티켓 20260901_1843)
 *
 * `shouldSearch`/`markSearched`가 Supabase 쿼리의 `error`를 확인하지 않고 버렸다.
 * 캐시 계층이라 낮은 리스크(최악의 경우 네이버 API를 한 번 더 호출)로 판단해 fail-open
 * 방향은 유지하되, 이전에는 완전히 무음이었던 실패에 서버 로그를 남긴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/poi/__tests__/search-cache.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeGridKey, shouldSearch, markSearched } from '../search-cache'

const stub = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  selectError: null as { code: string; message: string } | null,
  upsertError: null as { code: string; message: string } | null,
  upsertPayloads: [] as Record<string, unknown>[],
}))

const builder = {
  select: () => builder,
  eq: () => builder,
  maybeSingle: async () => ({ data: stub.row, error: stub.selectError }),
  upsert: async (payload: Record<string, unknown>) => {
    stub.upsertPayloads.push(payload)
    return { error: stub.upsertError }
  },
}
const service = { from: () => builder } as unknown as Parameters<typeof shouldSearch>[0]

beforeEach(() => {
  stub.row = null
  stub.selectError = null
  stub.upsertError = null
  stub.upsertPayloads = []
})

describe('computeGridKey — 100m 격자 반올림', () => {
  it('소수점 3자리로 반올림한 좌표를 키로 만든다', () => {
    expect(computeGridKey(37.12345, 127.98765)).toBe('37.123_127.988')
  })
})

describe('shouldSearch — 조회 실패는 재검색 필요로 간주(fail-open) + 로그', () => {
  it('캐시가 없으면 true(검색 필요)다', async () => {
    expect(await shouldSearch(service, 'k', 'cafe')).toBe(true)
  })

  it('조회 실패는 true로 폴백하되 서버 로그를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.selectError = { code: 'PGRST500', message: 'internal error' }
    expect(await shouldSearch(service, 'k', 'cafe')).toBe(true)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('TTL이 지나지 않았으면 false다', async () => {
    stub.row = { searched_at: new Date().toISOString(), had_results: true }
    expect(await shouldSearch(service, 'k', 'cafe')).toBe(false)
  })
})

describe('markSearched — upsert 실패는 던지지 않되 로그를 남긴다', () => {
  it('upsert error가 있어도 예외를 던지지 않지만 console.error를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.upsertError = { code: 'PGRST204', message: 'column not found' }
    await expect(markSearched(service, 'k', 'cafe', true)).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('정상이면 로그 없이 저장한다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await markSearched(service, 'k', 'cafe', true)
    expect(spy).not.toHaveBeenCalled()
    expect(stub.upsertPayloads).toHaveLength(1)
    spy.mockRestore()
  })
})
