/**
 * 색 덮어쓰기 캐시된 읽기 — 서버 전용 (티켓 20261121_2145)
 *
 * 확인하는 것: 캐시 태그·재검증 시간 설정, 읽기가 실패해도 기본값(빈 덮어쓰기), 무효화가 태그와 `{ expire: 0 }`로 호출되는지.
 * `unstable_cache`는 캐시 없이 함수를 그대로 부르는 대역으로 바꾼다(Next 런타임 밖이라 캐시 저장소가 없다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedColorOverridesServer.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  cacheOptions: undefined as undefined | { tags?: string[]; revalidate?: number },
  cacheKeyParts: undefined as undefined | string[],
  revalidateTag: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  fail: false,
}))

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[], options: { tags?: string[]; revalidate?: number }) => {
    h.cacheKeyParts = keyParts
    h.cacheOptions = options
    return fn
  },
  revalidateTag: h.revalidateTag,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: async () => {
        if (table !== 'feed_color_overrides') throw new Error(`예상 밖 표: ${table}`)
        return h.fail ? { data: null, error: { message: 'boom' } } : { data: h.rows, error: null }
      },
    }),
  }),
}))

import {
  FEED_COLORS_CACHE_TAG,
  FEED_COLORS_REVALIDATE_SECONDS,
  getFeedColorOverrides,
  invalidateFeedColors,
} from '../feedColorOverridesServer'

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  h.rows = []
  h.fail = false
  h.revalidateTag.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
})

describe('getFeedColorOverrides', () => {
  it('캐시 태그는 feed-colors고 재검증 시간이 짧다', () => {
    expect(FEED_COLORS_CACHE_TAG).toBe('feed-colors')
    expect(h.cacheOptions?.tags).toEqual(['feed-colors'])
    expect(h.cacheOptions?.revalidate).toBe(FEED_COLORS_REVALIDATE_SECONDS)
    expect(FEED_COLORS_REVALIDATE_SECONDS).toBeLessThanOrEqual(300)
  })

  it('행이 없으면 빈 덮어쓰기다', async () => {
    expect(await getFeedColorOverrides()).toEqual({})
  })

  it('행을 정리해서 돌려준다', async () => {
    h.rows = [
      { color_key: 'red', hex: '#AA0000' },
      { color_key: 'ghost', hex: '#00ff00' },
    ]
    expect(await getFeedColorOverrides()).toEqual({ red: '#aa0000' })
  })

  it('읽기가 실패하면 빈 덮어쓰기(기본값)고 서버 로그에 남긴다', async () => {
    h.rows = [{ color_key: 'red', hex: '#aa0000' }]
    h.fail = true
    expect(await getFeedColorOverrides()).toEqual({})
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('invalidateFeedColors', () => {
  it('태그를 두 번째 인자 { expire: 0 }으로 무효화한다(다음 요청이 바로 새로 읽는다)', () => {
    invalidateFeedColors()
    expect(h.revalidateTag).toHaveBeenCalledTimes(1)
    expect(h.revalidateTag).toHaveBeenCalledWith('feed-colors', { expire: 0 })
  })
})
