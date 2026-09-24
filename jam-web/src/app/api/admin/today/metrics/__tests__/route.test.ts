/** GET /api/admin/today/metrics — 기간 해석·집계 분기 (티켓 20260924_0851) */
import { NextRequest } from 'next/server'

const { aggregate } = vi.hoisted(() => ({ aggregate: vi.fn() }))
vi.mock('@/lib/today/events', () => ({ aggregateTodayCardEvents: aggregate }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

const { GET } = await import('../route')
const NOW = new Date('2026-09-24T00:00:00.000Z')
const DEFAULT_RANGE = { from: '2026-09-17T00:00:00.000Z', to: NOW.toISOString() }

function call(params: Record<string, string> = {}) {
  const url = new URL('https://j-a-m.app/api/admin/today/metrics')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return GET(new NextRequest(url, { headers: { 'x-admin-read-token': 'tok' } }))
}
const typesOf = async (rows: unknown[]) => {
  aggregate.mockResolvedValue(rows)
  return (await (await call()).json()).types
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.stubEnv('ADMIN_API_READ_TOKEN', 'tok')
  aggregate.mockReset().mockResolvedValue([])
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('기간 해석', () => {
  it('from·to가 없으면 지금 기준 최근 7일이다', async () => {
    expect((await (await call()).json()).range).toEqual(DEFAULT_RANGE)
    expect(aggregate).toHaveBeenCalledWith(DEFAULT_RANGE.from, DEFAULT_RANGE.to)
  })

  it('잘못된 from은 to 기준 7일 전, 잘못된 to는 현재로 폴백한다', async () => {
    expect((await (await call({ from: 'x', to: 'y' })).json()).range).toEqual(DEFAULT_RANGE)
    const { range } = await (await call({ from: 'x', to: '2026-09-10T00:00:00Z' })).json()
    expect(range).toEqual({ from: '2026-09-03T00:00:00.000Z', to: '2026-09-10T00:00:00.000Z' })
  })

  it('from이 to보다 늦으면 400이고 집계하지 않는다', async () => {
    const res = await call({ from: '2026-09-20T00:00:00Z', to: '2026-09-10T00:00:00Z' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('시작일이 종료일보다 늦어요. 기간을 다시 확인해 주세요.')
    expect(aggregate).not.toHaveBeenCalled()
  })

  it('from과 to가 같으면 정상 집계한다', async () => {
    expect((await call({ from: '2026-09-10T00:00:00Z', to: '2026-09-10T00:00:00Z' })).status).toBe(200)
  })
})

describe('집계 결과 가공', () => {
  it('노출 0이면 열람률 null, 있으면 click/impression', async () => {
    const rows = [
      { contentTypeId: 'T01', event: 'click', count: 3 },
      { contentTypeId: 'T02', event: 'impression', count: 4 },
      { contentTypeId: 'T02', event: 'click', count: 1 },
    ]
    expect(await typesOf(rows)).toEqual([
      { contentTypeId: 'T01', impression: 0, click: 3, followup: 0, clickThroughRate: null },
      { contentTypeId: 'T02', impression: 4, click: 1, followup: 0, clickThroughRate: 0.25 },
    ])
  })

  it('contentTypeId가 null이면 unknown 버킷에 합산된다', async () => {
    const rows = [
      { contentTypeId: null, event: 'impression', count: 2 },
      { contentTypeId: null, event: 'followup', count: 1 },
    ]
    expect(await typesOf(rows)).toEqual([{ contentTypeId: 'unknown', impression: 2, click: 0, followup: 1, clickThroughRate: 0 }])
  })

  it('유형은 contentTypeId 오름차순이다', async () => {
    const rows = ['T10', 'T02', 'T01'].map((id) => ({ contentTypeId: id, event: 'impression', count: 1 }))
    expect((await typesOf(rows)).map((t: { contentTypeId: string }) => t.contentTypeId)).toEqual(['T01', 'T02', 'T10'])
  })
})

it('집계가 실패하면 500과 안내 문구를 돌려준다', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  aggregate.mockRejectedValue(new Error('db down'))
  const res = await call()
  expect([res.status, await res.json()]).toEqual([500, { error: '집계 중 오류가 발생했습니다.' }])
})
