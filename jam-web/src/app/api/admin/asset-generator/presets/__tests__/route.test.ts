/**
 * /api/admin/asset-generator/presets — 목록·저장(신규/덮어쓰기) (티켓 20260924_2159)
 * supabase 클라이언트는 최소 체이닝만 흉내 낸 스텁으로 바꿔, 저장 시 upload 경로·insert/update
 * 페이로드가 규칙(텍스트 content 비움, 이미지 assetUrl을 저장소 공개 URL로 치환)대로
 * 만들어지는지만 본다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/asset-generator/presets/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: fromMock, storage: { from: storageFromMock } }),
}))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: vi.fn(async () => ({ id: ADMIN_ID, email: 'admin@jam.app' })),
}))

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
    heightPct: 30,
    rotationDeg: 0,
    opacityPct: 100,
  }
}

function postReq(form: FormData): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/asset-generator/presets', { method: 'POST', body: form })
}

function getReq(query = ''): NextRequest {
  return new NextRequest(`https://j-a-m.app/api/admin/asset-generator/presets${query}`)
}

beforeEach(() => {
  presetsBuilder = makeQueryBuilder({ data: null, error: null })
  fromMock.mockReset().mockImplementation(() => presetsBuilder)
  uploadMock.mockReset().mockResolvedValue({ error: null })
  getPublicUrlMock.mockReset().mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.test.jam.app/images/${path}` } }))
})

describe('GET', () => {
  it('무권한이면 403', async () => {
    const { getAdminUser } = await import('@/lib/admin/auth')
    vi.mocked(getAdminUser).mockResolvedValueOnce(null)
    const res = await GET(getReq())
    expect(res.status).toBe(403)
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

  it('targetType=home_feed면 다른 유형과 섞이지 않게 필터링한다(티켓 20260925_1410)', async () => {
    presetsBuilder = makeQueryBuilder({ data: [], error: null })
    fromMock.mockImplementation(() => presetsBuilder)
    const res = await GET(getReq('?targetType=home_feed'))
    expect(res.status).toBe(200)
    expect(presetsBuilder.eq).toHaveBeenCalledWith('target_type', 'home_feed')
  })
})

describe('POST — 신규 저장', () => {
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
