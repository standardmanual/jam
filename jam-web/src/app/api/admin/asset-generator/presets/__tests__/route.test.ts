/**
 * /api/admin/asset-generator/presets — 목록·저장(신규/덮어쓰기) (티켓 20260924_2159)
 * supabase 클라이언트는 최소 체이닝만 흉내 낸 스텁으로 바꿔, 저장 시 upload 경로·insert/update
 * 페이로드가 규칙(텍스트 content 비움, 이미지 assetUrl을 저장소 공개 URL로 치환)대로
 * 만들어지는지만 본다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/asset-generator/presets/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ADMIN_ID = '00000000-0000-4000-8000-0000000000aa'

function makeQueryBuilder(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {}
  const chain = ['select', 'insert', 'update', 'delete', 'eq', 'order'] as const
  for (const method of chain) {
    builder[method] = vi.fn((...args: unknown[]) => {
      if (method === 'insert') (builder as { insertPayload?: unknown }).insertPayload = args[0]
      if (method === 'update') (builder as { updatePayload?: unknown }).updatePayload = args[0]
      return builder
    })
  }
  builder.maybeSingle = vi.fn(async () => result)
  builder.single = vi.fn(async () => result)
  ;(builder as { then: PromiseLike<typeof result>['then'] }).then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject)
  return builder as unknown as Record<string, ReturnType<typeof vi.fn>> & {
    insertPayload?: unknown
    updatePayload?: unknown
  }
}

let presetsBuilder = makeQueryBuilder({ data: null, error: null })
const fromMock = vi.fn(() => presetsBuilder)

const uploadMock = vi.fn(async () => ({ error: null as { message: string } | null }))
const getPublicUrlMock = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test.jam.app/images/${path}` } }))
const storageFromMock = vi.fn(() => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }))

// 세션은 createClient의 getUser로 흉내 낸다 — 읽기 토큰 경로(requireAdminRead)가 auth.ts 내부의
// getAdminUser를 부르므로 auth 모듈을 통째로 목킹하면 토큰 분기를 검증할 수 없다(티켓 20260926_1203).
// ADMIN_EMAILS 화이트리스트에 든 이메일은 DB 조회 없이 어드민으로 통과한다.
let sessionUser: { id: string; email: string } | null = { id: ADMIN_ID, email: 'admin@jam.app' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
  createServiceClient: () => ({ from: fromMock, storage: { from: storageFromMock } }),
}))

const READ_TOKEN = 'test-admin-read-token'

const { GET, POST } = await import('../route')

function makeTextLayer(id: string, content: string) {
  return {
    type: 'text',
    id,
    content,
    font: { family: 'system-ui', weight: 400 },
    sizePct: 10,
    letterSpacing: 0,
    lineHeight: 1.2,
    align: 'center',
    color: '#111111',
    xPct: 50,
    yPct: 50,
    rotationDeg: 0,
    opacityPct: 100,
  }
}

function makeImageLayer(id: string, assetUrl: string) {
  return {
    type: 'image',
    id,
    assetUrl,
    xPct: 50,
    yPct: 50,
    widthPct: 30,
    rotationDeg: 0,
    opacityPct: 100,
  }
}

function postReq(form: FormData): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/asset-generator/presets', { method: 'POST', body: form })
}

function getReq(query = '', headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://j-a-m.app/api/admin/asset-generator/presets${query}`, { headers })
}

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAILS', 'admin@jam.app')
  vi.stubEnv('ADMIN_API_READ_TOKEN', READ_TOKEN)
  sessionUser = { id: ADMIN_ID, email: 'admin@jam.app' }
  presetsBuilder = makeQueryBuilder({ data: null, error: null })
  fromMock.mockReset().mockImplementation(() => presetsBuilder)
  uploadMock.mockReset().mockResolvedValue({ error: null })
  getPublicUrlMock.mockReset().mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.test.jam.app/images/${path}` } }))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET', () => {
  it('무권한이면 403', async () => {
    sessionUser = null
    const res = await GET(getReq())
    expect(res.status).toBe(403)
  })

  it('세션 없이 유효한 읽기 토큰이면 200과 { presets }를 돌려준다(티켓 20260926_1203)', async () => {
    sessionUser = null
    presetsBuilder = makeQueryBuilder({
      data: [{ id: 'p1', name: '프리셋 A', stage_ratio: '1:1', created_at: 't1', updated_at: 't2' }],
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)
    const res = await GET(getReq('', { 'x-admin-read-token': READ_TOKEN }))
    expect(res.status).toBe(200)
    expect((await res.json()).presets).toHaveLength(1)
  })

  it('세션 없이 targetType=home_feed 필터도 토큰 경로에서 동작한다(티켓 20260926_1203)', async () => {
    sessionUser = null
    presetsBuilder = makeQueryBuilder({ data: [], error: null })
    fromMock.mockImplementation(() => presetsBuilder)
    const res = await GET(getReq('?targetType=home_feed', { 'x-admin-read-token': READ_TOKEN }))
    expect(res.status).toBe(200)
    expect(presetsBuilder.eq).toHaveBeenCalledWith('target_type', 'home_feed')
  })

  it('세션 없이 잘못된 토큰이면 403이고 DB를 조회하지 않는다(티켓 20260926_1203)', async () => {
    sessionUser = null
    const res = await GET(getReq('', { 'x-admin-read-token': 'wrong-token' }))
    expect(res.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('유효한 토큰이어도 targetType이 올바르지 않으면 400이다(티켓 20260926_1203)', async () => {
    sessionUser = null
    const res = await GET(getReq('?targetType=not-a-type', { 'x-admin-read-token': READ_TOKEN }))
    expect(res.status).toBe(400)
  })

  it('목록을 요약 형태로 돌려준다', async () => {
    presetsBuilder = makeQueryBuilder({
      data: [{ id: 'p1', name: '프리셋 A', stage_ratio: '1:1', created_at: 't1', updated_at: 't2' }],
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)
    const res = await GET(getReq())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.presets).toEqual([{ id: 'p1', name: '프리셋 A', stageRatio: '1:1', createdAt: 't1', updatedAt: 't2' }])
  })

  it('targetType 쿼리가 있으면 그 유형으로 필터링한다(티켓 20260925_1405)', async () => {
    presetsBuilder = makeQueryBuilder({ data: [], error: null })
    fromMock.mockImplementation(() => presetsBuilder)
    const res = await GET(getReq('?targetType=mission'))
    expect(res.status).toBe(200)
    expect(presetsBuilder.eq).toHaveBeenCalledWith('target_type', 'mission')
  })

  it('targetType 쿼리가 올바르지 않으면 400', async () => {
    const res = await GET(getReq('?targetType=not-a-type'))
    expect(res.status).toBe(400)
  })

  it('targetType=collection이면 target_type=collection으로만 필터링한다(티켓 20260925_1408)', async () => {
    presetsBuilder = makeQueryBuilder({ data: [], error: null })
    fromMock.mockImplementation(() => presetsBuilder)
    const res = await GET(getReq('?targetType=collection'))
    expect(res.status).toBe(200)
    expect(presetsBuilder.eq).toHaveBeenCalledWith('target_type', 'collection')
  })

  it('targetType=home_feed면 다른 유형과 섞이지 않게 필터링한다(티켓 20260925_1410)', async () => {
    presetsBuilder = makeQueryBuilder({ data: [], error: null })
    fromMock.mockImplementation(() => presetsBuilder)
    const res = await GET(getReq('?targetType=home_feed'))
    expect(res.status).toBe(200)
    expect(presetsBuilder.eq).toHaveBeenCalledWith('target_type', 'home_feed')
  })
})

describe('POST — 신규 저장', () => {
  it('세션 없이 읽기 토큰만 있으면 403이고 저장하지 않는다(티켓 20260926_1203)', async () => {
    sessionUser = null
    const form = new FormData()
    form.append('name', '프리셋 A')
    form.append('stageRatio', '1:1')
    form.append('targetType', 'badge')
    form.append('layers', '[]')
    const res = await POST(
      new NextRequest('https://j-a-m.app/api/admin/asset-generator/presets', {
        method: 'POST',
        body: form,
        headers: { 'x-admin-read-token': READ_TOKEN },
      })
    )
    expect(res.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('이름이 비어 있으면 400', async () => {
    const form = new FormData()
    form.append('name', '  ')
    form.append('stageRatio', '1:1')
    form.append('layers', '[]')
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
  })

  it('대상 유형이 없거나 올바르지 않으면 400', async () => {
    const form = new FormData()
    form.append('name', '프리셋 A')
    form.append('stageRatio', '1:1')
    form.append('targetType', 'not-a-type')
    form.append('layers', '[]')
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
  })

  it('이미지 레이어의 blob URL을 저장소에 업로드하고 insert payload의 assetUrl을 공개 URL로 바꾼다', async () => {
    presetsBuilder = makeQueryBuilder({
      data: { id: 'new-preset-id', name: '프리셋 A', stage_ratio: '1:1', created_at: 't1', updated_at: 't1' },
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)

    const layers = [makeTextLayer('t1', '배지 이름'), makeImageLayer('i1', 'blob:http://localhost/abc')]
    const form = new FormData()
    form.append('name', '프리셋 A')
    form.append('stageRatio', '1:1')
    form.append('targetType', 'badge')
    form.append('layers', JSON.stringify(layers))
    form.append('image_i1', new File(['fake-png-bytes'], 'i1.png', { type: 'image/png' }))

    const res = await POST(postReq(form))
    expect(res.status).toBe(200)

    expect(uploadMock).toHaveBeenCalledTimes(1)
    const [uploadPath] = uploadMock.mock.calls[0] as unknown as [string, Buffer, unknown]
    expect(uploadPath).toMatch(/^asset-generator\/presets\/[^/]+\/i1\.png$/)

    const insertPayload = presetsBuilder.insertPayload as {
      target_type: string
      created_by: string
      layers: Array<{ type: string; content?: string; assetUrl?: string }>
    }
    expect(insertPayload.target_type).toBe('badge')
    expect(insertPayload.created_by).toBe(ADMIN_ID)
    expect(insertPayload.layers[0]).toMatchObject({ type: 'text', content: '' })
    expect(insertPayload.layers[1].assetUrl).toBe(`https://cdn.test.jam.app/images/${uploadPath}`)
  })

  it('대상 유형이 mission이면 이미지 레이어 + 텍스트 레이어를 함께 저장한다(티켓 20260925_1406)', async () => {
    presetsBuilder = makeQueryBuilder({
      data: { id: 'new-mission-preset-id', name: '미션 프리셋 A', stage_ratio: '1:1', created_at: 't1', updated_at: 't1' },
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)

    const layers = [makeTextLayer('t1', '미션 이름'), makeImageLayer('i1', 'blob:http://localhost/abc')]
    const form = new FormData()
    form.append('name', '미션 프리셋 A')
    form.append('stageRatio', '1:1')
    form.append('targetType', 'mission')
    form.append('layers', JSON.stringify(layers))
    form.append('image_i1', new File(['fake-png-bytes'], 'i1.png', { type: 'image/png' }))

    const res = await POST(postReq(form))
    expect(res.status).toBe(200)

    const insertPayload = presetsBuilder.insertPayload as {
      target_type: string
      layers: Array<{ type: string; content?: string; assetUrl?: string }>
    }
    expect(insertPayload.target_type).toBe('mission')
    expect(insertPayload.layers).toHaveLength(2)
    expect(insertPayload.layers[0]).toMatchObject({ type: 'text', content: '' })
    expect(insertPayload.layers[1].type).toBe('image')
    expect(insertPayload.layers[1].assetUrl).toMatch(/^https:\/\/cdn\.test\.jam\.app\//)
  })

  it('이미 저장소 URL(http)인 이미지 레이어는 다시 업로드하지 않는다', async () => {
    presetsBuilder = makeQueryBuilder({
      data: { id: 'new-preset-id', name: '프리셋 A', stage_ratio: '1:1', created_at: 't1', updated_at: 't1' },
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)

    const layers = [makeImageLayer('i1', 'https://cdn.test.jam.app/images/existing.png')]
    const form = new FormData()
    form.append('name', '프리셋 A')
    form.append('stageRatio', '1:1')
    form.append('targetType', 'badge')
    form.append('layers', JSON.stringify(layers))

    const res = await POST(postReq(form))
    expect(res.status).toBe(200)
    expect(uploadMock).not.toHaveBeenCalled()
    const insertPayload = presetsBuilder.insertPayload as { layers: Array<{ assetUrl?: string }> }
    expect(insertPayload.layers[0].assetUrl).toBe('https://cdn.test.jam.app/images/existing.png')
  })

  it('target_type=home_feed로 이미지+텍스트 레이어를 저장한다(티켓 20260925_1410)', async () => {
    presetsBuilder = makeQueryBuilder({
      data: { id: 'new-preset-id', name: '홈피드 프리셋 A', stage_ratio: '4:5', created_at: 't1', updated_at: 't1' },
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)

    const layers = [makeTextLayer('t1', '홈피드 카드 제목'), makeImageLayer('i1', 'blob:http://localhost/abc')]
    const form = new FormData()
    form.append('name', '홈피드 프리셋 A')
    form.append('stageRatio', '4:5')
    form.append('targetType', 'home_feed')
    form.append('layers', JSON.stringify(layers))
    form.append('image_i1', new File(['fake-png-bytes'], 'i1.png', { type: 'image/png' }))

    const res = await POST(postReq(form))
    expect(res.status).toBe(200)

    const insertPayload = presetsBuilder.insertPayload as { target_type: string }
    expect(insertPayload.target_type).toBe('home_feed')
  })

  it('blob URL 이미지 레이어인데 파일이 없으면 400', async () => {
    const layers = [makeImageLayer('i1', 'blob:http://localhost/abc')]
    const form = new FormData()
    form.append('name', '프리셋 A')
    form.append('stageRatio', '1:1')
    form.append('targetType', 'badge')
    form.append('layers', JSON.stringify(layers))

    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('targetType=collection으로 저장하면 insert payload의 target_type이 collection이다(티켓 20260925_1408)', async () => {
    presetsBuilder = makeQueryBuilder({
      data: { id: 'new-preset-id', name: '컬렉션 프리셋', stage_ratio: '1:1', created_at: 't1', updated_at: 't1' },
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)

    const layers = [makeTextLayer('t1', '컬렉션 이름'), makeImageLayer('i1', 'https://cdn.test.jam.app/images/existing.png')]
    const form = new FormData()
    form.append('name', '컬렉션 프리셋')
    form.append('stageRatio', '1:1')
    form.append('targetType', 'collection')
    form.append('layers', JSON.stringify(layers))

    const res = await POST(postReq(form))
    expect(res.status).toBe(200)

    const insertPayload = presetsBuilder.insertPayload as {
      target_type: string
      layers: Array<{ type: string; content?: string; assetUrl?: string }>
    }
    expect(insertPayload.target_type).toBe('collection')
    expect(insertPayload.layers[0]).toMatchObject({ type: 'text', content: '' })
    expect(insertPayload.layers[1].assetUrl).toBe('https://cdn.test.jam.app/images/existing.png')
  })
})

describe('POST — 덮어쓰기', () => {
  it('id가 있으면 update를 호출하고 존재하지 않으면 404', async () => {
    presetsBuilder = makeQueryBuilder({ data: null, error: null })
    fromMock.mockImplementation(() => presetsBuilder)

    const form = new FormData()
    form.append('id', 'existing-id')
    form.append('name', '프리셋 A')
    form.append('stageRatio', '1:1')
    form.append('targetType', 'badge')
    form.append('layers', '[]')

    const res = await POST(postReq(form))
    expect(res.status).toBe(404)
  })

  it('존재하는 프리셋이면 update payload에 새 이름·target_type·stage_ratio를 담는다', async () => {
    let call = 0
    presetsBuilder = makeQueryBuilder({ data: { id: 'existing-id' }, error: null })
    fromMock.mockImplementation(() => {
      call += 1
      if (call === 1) return presetsBuilder // findErr 조회(existing 존재 확인)
      const updateBuilder = makeQueryBuilder({
        data: { id: 'existing-id', name: '프리셋 B', stage_ratio: '4:5', created_at: 't1', updated_at: 't2' },
        error: null,
      })
      presetsBuilder = updateBuilder
      return updateBuilder
    })

    const form = new FormData()
    form.append('id', 'existing-id')
    form.append('name', '프리셋 B')
    form.append('stageRatio', '4:5')
    form.append('targetType', 'mission')
    form.append('layers', '[]')

    const res = await POST(postReq(form))
    expect(res.status).toBe(200)
    const updatePayload = presetsBuilder.updatePayload as { name: string; target_type: string; stage_ratio: string }
    expect(updatePayload.name).toBe('프리셋 B')
    expect(updatePayload.target_type).toBe('mission')
    expect(updatePayload.stage_ratio).toBe('4:5')
  })
})

describe('POST — 스토리지 경로 값 검증과 업로드 순서(티켓 20260926_0201)', () => {
  function baseForm(layers: unknown[] = []) {
    const form = new FormData()
    form.append('name', '프리셋 A')
    form.append('stageRatio', '1:1')
    form.append('targetType', 'badge')
    form.append('layers', JSON.stringify(layers))
    return form
  }

  it('세션이 없으면 403이고 DB·저장소를 건드리지 않는다', async () => {
    sessionUser = null
    const res = await POST(postReq(baseForm()))
    expect(res.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it.each(['../other', 'a/b', 'a b', 'a.b', 'x'.repeat(101)])('형식이 틀린 프리셋 id(%s)는 400이고 아무것도 쓰지 않는다', async (badId) => {
    const layers = [makeImageLayer('i1', 'blob:http://localhost/abc')]
    const form = baseForm(layers)
    form.append('id', badId)
    form.append('image_i1', new File(['fake-png-bytes'], 'i1.png', { type: 'image/png' }))
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it.each(['../x', 'a/b', 'a b', 'a.b', ''])('형식이 틀린 이미지 레이어 id(%j)는 400이고 아무것도 쓰지 않는다', async (badLayerId) => {
    const layers = [makeImageLayer(badLayerId, 'blob:http://localhost/abc')]
    const form = baseForm(layers)
    form.append(`image_${badLayerId}`, new File(['fake-png-bytes'], 'i1.png', { type: 'image/png' }))
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('두 번째 이미지 레이어 id만 틀려도 첫 번째 레이어를 올리기 전에 400이다', async () => {
    const layers = [makeImageLayer('i1', 'blob:http://localhost/a'), makeImageLayer('../evil', 'blob:http://localhost/b')]
    const form = baseForm(layers)
    form.append('image_i1', new File(['a'], 'i1.png', { type: 'image/png' }))
    form.append('image_../evil', new File(['b'], 'evil.png', { type: 'image/png' }))
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it.each([[null], [1], ['text'], [[]]])('layers에 객체가 아닌 원소(%j)가 있으면 400이고 아무것도 쓰지 않는다(티켓 20260926_1456)', async (bad) => {
    const res = await POST(postReq(baseForm([makeTextLayer('t1', '이름'), bad])))
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('텍스트 레이어 id는 경로에 쓰이지 않으므로 검사하지 않는다', async () => {
    presetsBuilder = makeQueryBuilder({
      data: { id: 'new-preset-id', name: '프리셋 A', stage_ratio: '1:1', created_at: 't1', updated_at: 't1' },
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)
    const res = await POST(postReq(baseForm([makeTextLayer('텍스트 1', '이름')])))
    expect(res.status).toBe(200)
  })

  it('UUID 형식 레이어 id와 image-layer 폴백 id는 통과한다', async () => {
    presetsBuilder = makeQueryBuilder({
      data: { id: 'new-preset-id', name: '프리셋 A', stage_ratio: '1:1', created_at: 't1', updated_at: 't1' },
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)
    const uuid = '3f2a9c1e-0000-4000-8000-0000000000aa'
    const fallback = 'image-layer-1727340000000-k3j9x2ab'
    const layers = [makeImageLayer(uuid, 'blob:http://localhost/a'), makeImageLayer(fallback, 'blob:http://localhost/b')]
    const form = baseForm(layers)
    form.append(`image_${uuid}`, new File(['a'], 'a.png', { type: 'image/png' }))
    form.append(`image_${fallback}`, new File(['b'], 'b.png', { type: 'image/png' }))
    const res = await POST(postReq(form))
    expect(res.status).toBe(200)
    expect(uploadMock).toHaveBeenCalledTimes(2)
  })

  it('없는 id로 덮어쓰면 404이고 이미지를 업로드하지 않는다(존재 확인이 업로드보다 먼저)', async () => {
    presetsBuilder = makeQueryBuilder({ data: null, error: null })
    fromMock.mockImplementation(() => presetsBuilder)
    const layers = [makeImageLayer('i1', 'blob:http://localhost/abc')]
    const form = baseForm(layers)
    form.append('id', 'missing-id')
    form.append('image_i1', new File(['fake-png-bytes'], 'i1.png', { type: 'image/png' }))
    const res = await POST(postReq(form))
    expect(res.status).toBe(404)
    expect(uploadMock).not.toHaveBeenCalled()
    expect(presetsBuilder.updatePayload).toBeUndefined()
  })

  it('존재 확인이 DB 오류면 500이고 업로드하지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    presetsBuilder = makeQueryBuilder({ data: null, error: { message: 'db down' } })
    fromMock.mockImplementation(() => presetsBuilder)
    const layers = [makeImageLayer('i1', 'blob:http://localhost/abc')]
    const form = baseForm(layers)
    form.append('id', 'existing-id')
    form.append('image_i1', new File(['fake-png-bytes'], 'i1.png', { type: 'image/png' }))
    const res = await POST(postReq(form))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('db down')
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('존재하는 id로 덮어쓰면 그 id 폴더에 업로드한다', async () => {
    let call = 0
    presetsBuilder = makeQueryBuilder({ data: { id: 'existing-id' }, error: null })
    fromMock.mockImplementation(() => {
      call += 1
      if (call === 1) return presetsBuilder
      return makeQueryBuilder({
        data: { id: 'existing-id', name: '프리셋 A', stage_ratio: '1:1', created_at: 't1', updated_at: 't2' },
        error: null,
      })
    })
    const layers = [makeImageLayer('i1', 'blob:http://localhost/abc')]
    const form = baseForm(layers)
    form.append('id', 'existing-id')
    form.append('image_i1', new File(['fake-png-bytes'], 'i1.png', { type: 'image/png' }))
    const res = await POST(postReq(form))
    expect(res.status).toBe(200)
    const [uploadPath] = uploadMock.mock.calls[0] as unknown as [string]
    expect(uploadPath).toBe('asset-generator/presets/existing-id/i1.png')
  })
})

describe('POST — 입력 경계(티켓 20260926_0201)', () => {
  function formWith(overrides: Record<string, string>) {
    const form = new FormData()
    const fields: Record<string, string> = { name: '프리셋 A', stageRatio: '1:1', targetType: 'badge', layers: '[]', ...overrides }
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    return form
  }

  it('이름이 60자면 통과하고 61자면 400이다', async () => {
    presetsBuilder = makeQueryBuilder({
      data: { id: 'new-preset-id', name: '가', stage_ratio: '1:1', created_at: 't1', updated_at: 't1' },
      error: null,
    })
    fromMock.mockImplementation(() => presetsBuilder)
    expect((await POST(postReq(formWith({ name: '가'.repeat(60) })))).status).toBe(200)
    expect((await POST(postReq(formWith({ name: '가'.repeat(61) })))).status).toBe(400)
  })

  it('허용 목록에 없는 stageRatio는 400', async () => {
    const res = await POST(postReq(formWith({ stageRatio: '16:9' })))
    expect(res.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('layers가 JSON이 아니면 400', async () => {
    const res = await POST(postReq(formWith({ layers: '{not json' })))
    expect(res.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('layers가 배열이 아니면 400', async () => {
    const res = await POST(postReq(formWith({ layers: '{"a":1}' })))
    expect(res.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('DB·스토리지 오류 원문 미노출(티켓 20260926_1602)', () => {
  let errorSpy: { mock: { calls: unknown[][] }; mockRestore: () => void }

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  function saveForm(layers: unknown[] = []) {
    const form = new FormData()
    form.append('name', '프리셋 A')
    form.append('stageRatio', '1:1')
    form.append('targetType', 'badge')
    form.append('layers', JSON.stringify(layers))
    return form
  }

  async function expectFixedError(res: Response, raw: string) {
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain(raw)
    expect(errorSpy.mock.calls.some((c) => String(c[0]).startsWith('[presets'))).toBe(true)
  }

  it('목록 조회 오류(GET)', async () => {
    presetsBuilder = makeQueryBuilder({ data: null, error: { message: 'list boom' } })
    fromMock.mockImplementation(() => presetsBuilder)
    await expectFixedError(await GET(getReq()), 'list boom')
  })

  it('덮어쓰기 대상 조회 오류(POST)', async () => {
    presetsBuilder = makeQueryBuilder({ data: null, error: { message: 'find boom' } })
    fromMock.mockImplementation(() => presetsBuilder)
    const form = saveForm()
    form.append('id', 'existing-id')
    await expectFixedError(await POST(postReq(form)), 'find boom')
  })

  it('이미지 업로드 오류(POST)', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'upload boom' } })
    const form = saveForm([makeImageLayer('i1', 'blob:http://localhost/abc')])
    form.append('image_i1', new File(['fake-png-bytes'], 'i1.png', { type: 'image/png' }))
    await expectFixedError(await POST(postReq(form)), 'upload boom')
  })

  it('신규 저장 insert 오류(POST)', async () => {
    presetsBuilder = makeQueryBuilder({ data: null, error: { message: 'insert boom' } })
    fromMock.mockImplementation(() => presetsBuilder)
    await expectFixedError(await POST(postReq(saveForm())), 'insert boom')
  })

  it('덮어쓰기 update 오류(POST)', async () => {
    let call = 0
    fromMock.mockImplementation(() => {
      call += 1
      return call === 1
        ? makeQueryBuilder({ data: { id: 'existing-id' }, error: null })
        : makeQueryBuilder({ data: null, error: { message: 'update boom' } })
    })
    const form = saveForm()
    form.append('id', 'existing-id')
    await expectFixedError(await POST(postReq(form)), 'update boom')
  })
})
