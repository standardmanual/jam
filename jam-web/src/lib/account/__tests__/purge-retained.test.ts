/**
 * purgeExpiredRetainedRecords — 보관 기간이 지난 보관 행 파기 (티켓 20261021_1249 2회, 운영 로직 17.2절)
 * 서비스 클라이언트는 가짜다 — 공용 DB를 부르지 않는다. 고정하는 것: DB 함수 `purge_expired_retained_records`를 인자 없이 한 번 부른다 ·
 * 지운 수를 그대로 돌려준다(0건 포함) · RPC 오류와 예외와 계약 밖 응답은 던지지 않고 `error`로 돌려준다(크론이 멈추지 않는다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/account/__tests__/purge-retained.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { rpc, createClient } = vi.hoisted(() => {
  const rpc = vi.fn()
  return { rpc, createClient: vi.fn(() => ({ rpc })) }
})

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: createClient }))

import { purgeExpiredRetainedRecords } from '../purge-retained'

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: 4, error: null })
  createClient.mockReset().mockImplementation(() => ({ rpc }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('purgeExpiredRetainedRecords', () => {
  it('DB 함수를 인자 없이 한 번 부르고 지운 수를 돌려준다', async () => {
    const result = await purgeExpiredRetainedRecords()

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('purge_expired_retained_records')
    expect(result).toEqual({ deleted: 4, error: null })
  })

  it('지울 행이 없으면 0건이고 오류가 아니다', async () => {
    rpc.mockResolvedValue({ data: 0, error: null })

    expect(await purgeExpiredRetainedRecords()).toEqual({ deleted: 0, error: null })
  })

  it('RPC 오류는 던지지 않고 error로 돌려준다', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc boom' } })

    expect(await purgeExpiredRetainedRecords()).toEqual({ deleted: 0, error: 'rpc boom' })
  })

  it('예외는 던지지 않고 error로 돌려준다', async () => {
    rpc.mockRejectedValue(new Error('network down'))

    expect(await purgeExpiredRetainedRecords()).toEqual({ deleted: 0, error: 'network down' })
  })

  it('서비스 클라이언트를 만드는 중 예외가 나도 던지지 않는다', async () => {
    createClient.mockImplementation(() => {
      throw new Error('env 없음')
    })

    expect(await purgeExpiredRetainedRecords()).toEqual({ deleted: 0, error: 'env 없음' })
  })

  it('정수가 아닌 응답은 0건으로 삼키지 않고 오류로 알린다', async () => {
    for (const data of [null, '3', 1.5, -1, { count: 3 }]) {
      rpc.mockResolvedValue({ data, error: null })
      const result = await purgeExpiredRetainedRecords()
      expect(result.deleted).toBe(0)
      expect(result.error).not.toBeNull()
    }
  })
})
