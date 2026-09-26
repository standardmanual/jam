/**
 * GET /api/admin/content-corpus — 라우트 분기 동작 (티켓 20260924_0854)
 * route-contract.test.ts는 소스를 정규식으로만 검사한다 — 이 파일은 실제로 호출해 검증한다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/content-corpus/__tests__/route.test.ts
 */
import { NextRequest } from 'next/server'

const { selectCorpusForType } = vi.hoisted(() => ({ selectCorpusForType: vi.fn() }))
vi.mock('@/lib/content-corpus/select', () => ({ selectCorpusForType }))

// 무권한 경로가 세션으로도 통과하지 않도록 고정한다(admin-read-token.test.ts와 같은 방식).
// getAdminUser는 user가 없으면 즉시 null을 돌려줘 createServiceClient까지는 가지 않는다.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

const { GET } = await import('../route')
const TOKEN = 'test-admin-read-token'

function req(params: Record<string, string> = {}, withToken = true): NextRequest {
  const url = new URL('https://j-a-m.app/api/admin/content-corpus')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url, { headers: withToken ? { 'x-admin-read-token': TOKEN } : {} })
}

beforeEach(() => {
  vi.stubEnv('ADMIN_API_READ_TOKEN', TOKEN)
  selectCorpusForType.mockReset().mockResolvedValue({ typeId: 'T02', targets: [], quotes: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// 티켓 표기는 401이지만 실제 응답은 requireAdmin()의 403이다(admin-read-token.test.ts 기존 검증과 동일)
it('무권한 요청은 403으로 거부되고 selectCorpusForType을 호출하지 않는다', async () => {
  const res = await GET(req({ type: 'T02' }, false))
  expect(res.status).toBe(403)
  expect(selectCorpusForType).not.toHaveBeenCalled()
})

it.each(['', 'T99'])('type이 없거나(%s) T01~T17 밖이면 400이고 조회하지 않는다', async (type) => {
  const res = await GET(req(type ? { type } : {}))
  expect(res.status).toBe(400)
  expect(selectCorpusForType).not.toHaveBeenCalled()
})

it.each([['0', 3], ['-1', 3], ['abc', 3], ['5', 5]])('limit=%s이면 %i을 전달한다', async (limit, expected) => {
  await GET(req({ type: 'T02', limit }))
  expect(selectCorpusForType).toHaveBeenCalledWith('T02', expect.anything(), expected)
})

const ID_A = '3f2a9c1e-0000-4000-8000-0000000000a1'
const ID_B = '3f2a9c1e-0000-4000-8000-0000000000b2'
const ID_C = '3F2A9C1E-0000-4000-8000-0000000000C3'

it('콤마로 구분한 UUID를 트림해 배열로 전달한다', async () => {
  await GET(req({ type: 'T02', badgeIds: `${ID_A}, ${ID_B} ,,${ID_C}` }))
  expect(selectCorpusForType).toHaveBeenCalledWith('T02', { tribeIds: [], itemBookIds: [], badgeIds: [ID_A, ID_B, ID_C] }, 3)
})

it.each(['tribeIds', 'itemBookIds', 'badgeIds'])(
  'UUID가 아닌 값이 %s에 있으면 400이고 조회하지 않는다(티켓 20260926_1509)',
  async (key) => {
    const res = await GET(req({ type: 'T02', [key]: `${ID_A},3` }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toContain('UUID')
    expect(selectCorpusForType).not.toHaveBeenCalled()
  }
)

it('조회 중 오류가 나면 500이고 오류 원문을 응답에 싣지 않는다', async () => {
  selectCorpusForType.mockRejectedValue(new Error('invalid input syntax for type uuid: "3"'))
  const res = await GET(req({ type: 'T02' }))
  expect(res.status).toBe(500)
  expect(JSON.stringify(await res.json())).not.toContain('invalid input syntax')
})
