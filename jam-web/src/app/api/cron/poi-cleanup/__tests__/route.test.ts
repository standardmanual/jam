/**
 * GET /api/cron/poi-cleanup — 인증과 응답 계약 (티켓 20260929_1636)
 *
 * 만료 드랍 소각(`expire_stale_poi_drops` RPC)과 abusing_logs 보유기간 파기(`purgeExpiredAbusingLogs`)를 한 번에 돈다. 여기서는 라우트가 맡은 것만 본다:
 * - `CRON_SECRET`이 비었거나 헤더가 없거나 다르면 401이고, 그 경우 RPC도 파기도 부르지 않는다(「Bearer undefined」가 통과하지 않는다)
 * - RPC 오류는 500이고 파기를 부르지 않는다
 * - 파기가 실패해도 드랍 소각 결과는 200으로 돌려주고 `abusingLogPurgeError`로만 알린다
 * - 응답은 `expired`·`orphanedByDeletedBadge`·`purgedAbusingLogs`·`purgedRetainedRecords`를 싣는다
 * - 보관 만료 보관 행 파기(`purgeExpiredRetainedRecords`, 티켓 20261021_1249 2회): 부정 이용 탐지 기록 파기가 실패해도 부르고,
 *   이 파기가 실패해도 200이며 `retainedRecordPurgeError`로만 알린다. 인증 실패와 RPC 오류 때는 부르지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/cron/poi-cleanup/__tests__/route.test.ts
 */
import { NextRequest } from 'next/server'

const { rpc, purge, purgeRetained } = vi.hoisted(() => ({
  rpc: vi.fn(),
  purge: vi.fn(),
  purgeRetained: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ rpc }) }))
vi.mock('@/lib/abusing/purge-logs', () => ({ purgeExpiredAbusingLogs: purge }))
vi.mock('@/lib/account/purge-retained', () => ({ purgeExpiredRetainedRecords: purgeRetained }))

const { GET } = await import('../route')

const SECRET = 'test-cron-secret'

function requestWith(auth?: string): NextRequest {
  return new NextRequest('https://j-a-m.app/api/cron/poi-cleanup', {
    headers: auth ? { authorization: auth } : {},
  })
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET)
  rpc.mockReset().mockResolvedValue({ data: { expired: 3, orphaned_by_deleted_badge: 1 }, error: null })
  purge.mockReset().mockResolvedValue({ deleted: 5, error: null })
  purgeRetained.mockReset().mockResolvedValue({ deleted: 2, error: null })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('인증', () => {
  it('Authorization 헤더가 없거나 틀리면 401이고 RPC도 파기도 부르지 않는다', async () => {
    for (const auth of [undefined, 'Bearer wrong', SECRET]) {
      const res = await GET(requestWith(auth))
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Unauthorized' })
    }
    expect(rpc).not.toHaveBeenCalled()
    expect(purge).not.toHaveBeenCalled()
    expect(purgeRetained).not.toHaveBeenCalled()
  })

  it('CRON_SECRET이 비어 있으면 「Bearer undefined」를 보내도 401이다 (P1 20260929_1636)', async () => {
    vi.stubEnv('CRON_SECRET', undefined)
    const res = await GET(requestWith('Bearer undefined'))
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(purge).not.toHaveBeenCalled()
  })

  it('CRON_SECRET이 빈 문자열이어도 「Bearer 」를 보내면 401이다', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const res = await GET(requestWith('Bearer '))
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(purge).not.toHaveBeenCalled()
  })
})

describe('만료 드랍 소각', () => {
  it('expire_stale_poi_drops RPC를 한 번 부른다', async () => {
    await GET(requestWith(`Bearer ${SECRET}`))
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('expire_stale_poi_drops')
  })

  it('RPC 오류는 500이고 오류 메시지를 싣고 파기를 부르지 않는다', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc boom' } })
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'rpc boom' })
    expect(purge).not.toHaveBeenCalled()
    expect(purgeRetained).not.toHaveBeenCalled()
  })
})

describe('응답 계약', () => {
  it('성공하면 200이고 expired·orphanedByDeletedBadge·purgedAbusingLogs를 싣는다', async () => {
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ expired: 3, orphanedByDeletedBadge: 1, purgedAbusingLogs: 5, purgedRetainedRecords: 2 })
    expect(purge).toHaveBeenCalledTimes(1)
    expect(purgeRetained).toHaveBeenCalledTimes(1)
  })

  it('파기가 실패해도 드랍 소각 결과는 200으로 돌려주고 abusingLogPurgeError를 싣는다', async () => {
    purge.mockResolvedValue({ deleted: 0, error: 'purge boom' })
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      expired: 3,
      orphanedByDeletedBadge: 1,
      purgedAbusingLogs: 0,
      abusingLogPurgeError: 'purge boom',
      purgedRetainedRecords: 2,
    })
  })

  it('부정 이용 탐지 기록 파기가 실패해도 보관 만료 보관 행 파기는 한다', async () => {
    purge.mockResolvedValue({ deleted: 0, error: 'purge boom' })
    await GET(requestWith(`Bearer ${SECRET}`))
    expect(purgeRetained).toHaveBeenCalledTimes(1)
  })

  it('보관 행 파기가 실패해도 200이고 retainedRecordPurgeError로만 알린다', async () => {
    purgeRetained.mockResolvedValue({ deleted: 0, error: 'retained boom' })
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      expired: 3,
      orphanedByDeletedBadge: 1,
      purgedAbusingLogs: 5,
      purgedRetainedRecords: 0,
      retainedRecordPurgeError: 'retained boom',
    })
  })

  it('보관 행 파기 오류가 없으면 retainedRecordPurgeError 필드가 없다', async () => {
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(await res.json()).not.toHaveProperty('retainedRecordPurgeError')
  })

  it('파기 오류가 없으면 abusingLogPurgeError 필드가 없다', async () => {
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(await res.json()).not.toHaveProperty('abusingLogPurgeError')
  })

  it('소각 건이 0이어도 200이고 0을 그대로 싣는다', async () => {
    rpc.mockResolvedValue({ data: { expired: 0, orphaned_by_deleted_badge: 0 }, error: null })
    purge.mockResolvedValue({ deleted: 0, error: null })
    purgeRetained.mockResolvedValue({ deleted: 0, error: null })
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ expired: 0, orphanedByDeletedBadge: 0, purgedAbusingLogs: 0, purgedRetainedRecords: 0 })
  })
})
