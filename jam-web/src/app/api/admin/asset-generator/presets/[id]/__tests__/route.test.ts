/**
 * /api/admin/asset-generator/presets/[id] — 상세 조회·삭제 (티켓 20260924_2159)
 * 삭제는 저장소 list → remove 경로 목록, 그 다음 테이블 delete 호출 순서를 확인한다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/asset-generator/presets/[id]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: fromMock, storage: { from: storageFromMock } }),
}))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => ({ id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@jam.app' }),
}))

const { GET, DELETE } = await import('../route')

function req(): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/asset-generator/presets/p1')
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  presetsBuilder = makeQueryBuilder({ data: null, error: null })
  fromMock.mockReset().mockImplementation(() => presetsBuilder)
  listMock.mockReset().mockResolvedValue({ data: [{ name: 'i1.png' }], error: null })
  removeMock.mockReset().mockResolvedValue({ error: null })
})

describe('GET', () => {
  it('없으면 404', async () => {
    const res = await GET(req(), params('missing'))
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

    const res = await GET(req(), params('p2'))
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

    const res = await GET(req(), params('p1'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.preset.layers[0].content).toBe('')
  })
})

describe('DELETE', () => {
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
