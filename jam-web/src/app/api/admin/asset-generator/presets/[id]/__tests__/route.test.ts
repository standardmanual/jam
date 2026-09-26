/**
 * /api/admin/asset-generator/presets/[id] — 상세 조회·삭제 (티켓 20260924_2159)
 * 삭제는 저장소 list → remove 경로 목록, 그 다음 테이블 delete 호출 순서를 확인한다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/asset-generator/presets/[id]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

function makeQueryBuilder(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {}
  const chain = ['select', 'delete', 'eq'] as const
  for (const method of chain) {
    builder[method] = vi.fn(() => builder)
  }
  builder.maybeSingle = vi.fn(async () => result)
  ;(builder as { then: PromiseLike<typeof result>['then'] }).then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject)
  return builder as unknown as Record<string, ReturnType<typeof vi.fn>>
}

let presetsBuilder = makeQueryBuilder({ data: null, error: null })
const fromMock = vi.fn(() => presetsBuilder)

const listMock = vi.fn(async () => ({ data: [{ name: 'i1.png' }] as { name: string }[] | null, error: null as { message: string } | null }))
const removeMock = vi.fn(async () => ({ error: null as { message: string } | null }))
const storageFromMock = vi.fn(() => ({ list: listMock, remove: removeMock }))

// 세션은 createClient의 getUser로 흉내 낸다 — 읽기 토큰 경로(requireAdminRead)가 auth.ts 내부의
// getAdminUser를 부르므로 auth 모듈을 통째로 목킹하면 토큰 분기를 검증할 수 없다(티켓 20260926_1203).
// ADMIN_EMAILS 화이트리스트에 든 이메일은 DB 조회 없이 어드민으로 통과한다.
let sessionUser: { id: string; email: string } | null = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@jam.app' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
  createServiceClient: () => ({ from: fromMock, storage: { from: storageFromMock } }),
}))

const READ_TOKEN = 'test-admin-read-token'
const P1 = '3f2a9c1e-0000-4000-8000-0000000000a1'
const P2 = '3f2a9c1e-0000-4000-8000-0000000000a2'
const MISSING = '3f2a9c1e-0000-4000-8000-0000000000ff'

const { GET, DELETE } = await import('../route')

function req(headers: Record<string, string> = {}, method = 'GET'): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/asset-generator/presets/p1', { method, headers })
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAILS', 'admin@jam.app')
  vi.stubEnv('ADMIN_API_READ_TOKEN', READ_TOKEN)
  sessionUser = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@jam.app' }
  presetsBuilder = makeQueryBuilder({ data: null, error: null })
  fromMock.mockReset().mockImplementation(() => presetsBuilder)
  storageFromMock.mockClear()
  listMock.mockReset().mockResolvedValue({ data: [{ name: 'i1.png' }], error: null })
  removeMock.mockReset().mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET', () => {
  it('무권한이면 403이고 DB를 조회하지 않는다(티켓 20260925_0240)', async () => {
    sessionUser = null
    const res = await GET(req(), params(P1))
    expect(res.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('세션 없이 유효한 읽기 토큰이면 200과 { preset }을 돌려준다(티켓 20260926_1203)', async () => {
    sessionUser = null
    presetsBuilder = makeQueryBuilder({
      data: {
        id: 'p1',
        name: '홈피드',
        target_type: 'home_feed',
        stage_ratio: '4:5',
        layers: [{ type: 'text', id: 't1', content: '', font: { family: 'system-ui', weight: 400 } }],
        created_by: 'admin-id',
        created_at: 't1',
        updated_at: 't1',
      },
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)
    const res = await GET(req({ 'x-admin-read-token': READ_TOKEN }), params(P1))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.preset).toMatchObject({ id: 'p1', targetType: 'home_feed' })
  })

  it('세션 없이 잘못된 토큰이면 403이고 DB를 조회하지 않는다(티켓 20260926_1203)', async () => {
    sessionUser = null
    const res = await GET(req({ 'x-admin-read-token': 'wrong-token' }), params(P1))
    expect(res.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it.each(['3', 'p1', 'not-a-uuid', '3f2a9c1e-0000-4000-8000-0000000000a'])(
    '형식이 틀린 id(%s)는 400이고 DB를 조회하지 않는다(티켓 20260926_1509)',
    async (badId) => {
      const res = await GET(req(), params(badId))
      expect(res.status).toBe(400)
      expect(fromMock).not.toHaveBeenCalled()
    }
  )

  it('DB 오류가 나면 500이고 오류 원문을 응답에 싣지 않는다(티켓 20260926_1509)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    presetsBuilder = makeQueryBuilder({ data: null, error: { message: 'invalid input syntax for type uuid: "3"' } })
    fromMock.mockImplementation(() => presetsBuilder)
    const res = await GET(req(), params(P1))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('invalid input syntax')
  })

  it('없으면 404', async () => {
    const res = await GET(req(), params(MISSING))
    expect(res.status).toBe(404)
  })

  it('target_type이 mission인 프리셋을 불러오면 이미지·텍스트 레이어 구성이 그대로 복원된다(티켓 20260925_1406)', async () => {
    presetsBuilder = makeQueryBuilder({
      data: {
        id: 'p2',
        name: '미션 프리셋 A',
        target_type: 'mission',
        stage_ratio: '1:1',
        layers: [
          { type: 'image', id: 'i1', assetUrl: 'https://cdn.test.jam.app/images/i1.png', xPct: 50, yPct: 50, widthPct: 30, heightPct: 30, rotationDeg: 0, opacityPct: 100 },
          { type: 'text', id: 't1', content: '', font: { family: 'system-ui', weight: 400 } },
        ],
        created_by: 'admin-id',
        created_at: 't1',
        updated_at: 't1',
      },
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)

    const res = await GET(req(), params(P2))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.preset.targetType).toBe('mission')
    expect(body.preset.layers).toHaveLength(2)
    expect(body.preset.layers[0]).toMatchObject({ type: 'image', assetUrl: 'https://cdn.test.jam.app/images/i1.png' })
    expect(body.preset.layers[1]).toMatchObject({ type: 'text', content: '' })
  })

  it('텍스트 content가 빈 문자열로 복원된 레이어를 돌려준다', async () => {
    presetsBuilder = makeQueryBuilder({
      data: {
        id: 'p1',
        name: '프리셋 A',
        target_type: 'badge',
        stage_ratio: '1:1',
        layers: [{ type: 'text', id: 't1', content: '', font: { family: 'system-ui', weight: 400 } }],
        created_by: 'admin-id',
        created_at: 't1',
        updated_at: 't1',
      },
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)

    const res = await GET(req(), params(P1))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.preset.layers[0].content).toBe('')
  })
})

describe('DELETE', () => {
  it('세션 없이 읽기 토큰만 있으면 403이고 삭제하지 않는다(티켓 20260926_1203)', async () => {
    sessionUser = null
    const res = await DELETE(req({ 'x-admin-read-token': READ_TOKEN }, 'DELETE'), params('p1'))
    expect(res.status).toBe(403)
    expect(storageFromMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('무권한이면 403이고 저장소·DB를 건드리지 않는다(티켓 20260925_0240)', async () => {
    sessionUser = null
    const res = await DELETE(req(), params('p1'))
    expect(res.status).toBe(403)
    expect(storageFromMock).not.toHaveBeenCalled()
    expect(listMock).not.toHaveBeenCalled()
    expect(removeMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('저장소 폴더의 파일을 지운 뒤 테이블 행을 지운다', async () => {
    const res = await DELETE(req(), params('p1'))
    expect(res.status).toBe(200)

    expect(listMock).toHaveBeenCalledWith('asset-generator/presets/p1')
    expect(removeMock).toHaveBeenCalledWith(['asset-generator/presets/p1/i1.png'])
    expect(presetsBuilder.delete).toHaveBeenCalled()
    expect(presetsBuilder.eq).toHaveBeenCalledWith('id', 'p1')
  })

  it('폴더에 파일이 없으면 remove를 호출하지 않고 행만 지운다', async () => {
    listMock.mockResolvedValue({ data: [], error: null })
    const res = await DELETE(req(), params('p1'))
    expect(res.status).toBe(200)
    expect(removeMock).not.toHaveBeenCalled()
    expect(presetsBuilder.delete).toHaveBeenCalled()
  })

  it('목록 조회에 실패하면 500이고 행을 지우지 않는다', async () => {
    listMock.mockResolvedValue({ data: null, error: { message: '목록 조회 실패' } })
    const res = await DELETE(req(), params('p1'))
    expect(res.status).toBe(500)
    expect(presetsBuilder.delete).not.toHaveBeenCalled()
  })
})

describe('DELETE — 경로 값 검증(티켓 20260926_0201)', () => {
  it.each(['..', 'a b', 'a.b', 'a%2Fb', 'x'.repeat(101)])('형식이 틀린 id(%s)는 400이고 저장소·DB를 건드리지 않는다', async (badId) => {
    const res = await DELETE(req({}, 'DELETE'), params(badId))
    expect(res.status).toBe(400)
    expect(storageFromMock).not.toHaveBeenCalled()
    expect(listMock).not.toHaveBeenCalled()
    expect(removeMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('UUID와 영숫자·밑줄·하이픈 id는 통과한다', async () => {
    const res = await DELETE(req({}, 'DELETE'), params('3f2a9c1e-0000-4000-8000-0000000000aa'))
    expect(res.status).toBe(200)
    expect(listMock).toHaveBeenCalledWith('asset-generator/presets/3f2a9c1e-0000-4000-8000-0000000000aa')
  })
})
