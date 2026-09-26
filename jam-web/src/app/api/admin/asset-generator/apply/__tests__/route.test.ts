/**
 * /api/admin/asset-generator/apply — 스테이지 이미지 → 배지·미션 반영 (티켓 20260924_2200,
 * 미션 확장 20260925_1407)
 * supabase 클라이언트는 최소 체이닝만 흉내 낸 스텁으로 바꿔, 원본·WebP 두 경로에 업로드하고
 * update payload에 image_url(WebP)·image_source가 담기는지만 본다.
 * sharp 변환은 실제로 돌린다(sharp로 만든 유효한 PNG 바이트를 넘긴다) — 별도 단위 테스트는
 * `src/lib/admin/__tests__/badgeImageWebp.test.ts`.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/asset-generator/apply/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import sharp from 'sharp'

const BADGE_ID = '00000000-0000-4000-8000-0000000000bb'
const MISSION_ID = '00000000-0000-4000-8000-0000000000mm'
const COLLECTION_ID = '00000000-0000-4000-8000-0000000000cc'
const HOME_FEED_ID = '00000000-0000-4000-8000-0000000000hf'
const MAX_APPLY_IMAGE_BYTES = 5 * 1024 * 1024

let lookupResult: { data: Record<string, string> | null; error: { message: string } | null } = {
  data: { id: BADGE_ID, name: '테스트 배지' },
  error: null,
}
let updateError: { message: string } | null = null
const updatePayloads: Record<string, unknown>[] = []
const fromCalls: string[] = []

function makeTableBuilder() {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.is = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(async () => lookupResult)
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    updatePayloads.push(payload)
    return builder
  })
  // update(...).eq(...)는 그 자체로 await 가능해야 한다(Supabase 쿼리 빌더 관례)
  ;(builder as { then: PromiseLike<{ error: typeof updateError }>['then'] }).then = (resolve, reject) =>
    Promise.resolve({ error: updateError }).then(resolve, reject)
  return builder
}

let tableBuilder = makeTableBuilder()
const fromMock = vi.fn((table: string) => {
  fromCalls.push(table)
  return tableBuilder
})

const uploadMock = vi.fn(
  async (_path: string, _body: Buffer, _options: { contentType: string; upsert?: boolean }) =>
    ({ error: null as { message: string } | null })
)
const getPublicUrlMock = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test.jam.app/images/${path}` } }))
const storageFromMock = vi.fn(() => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: fromMock, storage: { from: storageFromMock } }),
}))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: vi.fn(async () => ({ id: 'admin-1', email: 'admin@jam.app' })),
}))

const { POST } = await import('../route')

async function makeSmallPngFile(): Promise<File> {
  const buffer = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } })
    .png()
    .toBuffer()
  return new File([buffer], 'stage.png', { type: 'image/png' })
}

function postReq(form: FormData): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/asset-generator/apply', { method: 'POST', body: form })
}

beforeEach(() => {
  lookupResult = { data: { id: BADGE_ID, name: '테스트 배지' }, error: null }
  updateError = null
  updatePayloads.length = 0
  fromCalls.length = 0
  tableBuilder = makeTableBuilder()
  fromMock.mockReset().mockImplementation((table: string) => {
    fromCalls.push(table)
    return tableBuilder
  })
  uploadMock.mockReset().mockResolvedValue({ error: null })
  getPublicUrlMock.mockReset().mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.test.jam.app/images/${path}` } }))
})

describe('POST /api/admin/asset-generator/apply', () => {
  it('무권한이면 403', async () => {
    const { getAdminUser } = await import('@/lib/admin/auth')
    vi.mocked(getAdminUser).mockResolvedValueOnce(null)
    const form = new FormData()
    form.append('targetType', 'badge')
    form.append('targetId', BADGE_ID)
    form.append('image', await makeSmallPngFile())
    const res = await POST(postReq(form))
    expect(res.status).toBe(403)
  })

  it('콘텐츠 유형이 badge/mission/collection이 아니면 400', async () => {
    const form = new FormData()
    form.append('targetType', 'unknown')
    form.append('targetId', BADGE_ID)
    form.append('image', await makeSmallPngFile())
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
  })

  it('대상을 선택하지 않으면 400', async () => {
    const form = new FormData()
    form.append('targetType', 'badge')
    form.append('image', await makeSmallPngFile())
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
  })

  it('이미지가 5MB를 넘으면 400 — sharp 변환·업로드를 시도하지 않는다', async () => {
    const oversized = new File([new Uint8Array(MAX_APPLY_IMAGE_BYTES + 1)], 'stage.png', { type: 'image/png' })
    const form = new FormData()
    form.append('targetType', 'badge')
    form.append('targetId', BADGE_ID)
    form.append('image', oversized)
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('대상을 찾을 수 없으면 404', async () => {
    lookupResult = { data: null, error: null }
    const form = new FormData()
    form.append('targetType', 'badge')
    form.append('targetId', BADGE_ID)
    form.append('image', await makeSmallPngFile())
    const res = await POST(postReq(form))
    expect(res.status).toBe(404)
  })

  it('배지: 원본 PNG·WebP를 각각 업로드하고 image_url(WebP)·image_source를 함께 갱신한다', async () => {
    const form = new FormData()
    form.append('targetType', 'badge')
    form.append('targetId', BADGE_ID)
    form.append('image', await makeSmallPngFile())

    const res = await POST(postReq(form))
    expect(res.status).toBe(200)

    expect(fromCalls).toEqual(['badges'])
    expect(uploadMock).toHaveBeenCalledTimes(2)
    const [pngPath, pngBody, pngOptions] = uploadMock.mock.calls[0]
    const [webpPath, , webpOptions] = uploadMock.mock.calls[1]
    expect(pngPath).toBe(`badges/asset-generator/${BADGE_ID}.png`)
    expect(webpPath).toBe(`badges/asset-generator/${BADGE_ID}.webp`)
    expect(pngOptions.contentType).toBe('image/png')
    expect(webpOptions.contentType).toBe('image/webp')
    expect(Buffer.isBuffer(pngBody)).toBe(true)

    expect(updatePayloads).toHaveLength(1)
    expect(updatePayloads[0].image_source).toBe('admin-generator')
    expect(updatePayloads[0].image_url).toContain(`badges/asset-generator/${BADGE_ID}.webp`)

    const body = await res.json()
    expect(body.name).toBe('테스트 배지')
    expect(body.webpUrl).toBe(updatePayloads[0].image_url)
    expect(body.webpBytes).toBeGreaterThan(0)
  })

  it('미션: missions 테이블에 title로 조회하고 저장 경로가 missions/ 접두사다(티켓 20260925_1407)', async () => {
    lookupResult = { data: { id: MISSION_ID, title: '테스트 미션' }, error: null }
    const form = new FormData()
    form.append('targetType', 'mission')
    form.append('targetId', MISSION_ID)
    form.append('image', await makeSmallPngFile())

    const res = await POST(postReq(form))
    expect(res.status).toBe(200)

    expect(fromCalls).toEqual(['missions'])
    const [pngPath] = uploadMock.mock.calls[0]
    const [webpPath] = uploadMock.mock.calls[1]
    expect(pngPath).toBe(`missions/asset-generator/${MISSION_ID}.png`)
    expect(webpPath).toBe(`missions/asset-generator/${MISSION_ID}.webp`)

    expect(updatePayloads[0].image_source).toBe('admin-generator')

    const body = await res.json()
    expect(body.name).toBe('테스트 미션')
  })

  it('컬렉션: item_books 테이블에 name으로 조회하고 저장 경로가 item_books/ 접두사다(티켓 20260925_1409)', async () => {
    lookupResult = { data: { id: COLLECTION_ID, name: '테스트 컬렉션' }, error: null }
    const form = new FormData()
    form.append('targetType', 'collection')
    form.append('targetId', COLLECTION_ID)
    form.append('image', await makeSmallPngFile())

    const res = await POST(postReq(form))
    expect(res.status).toBe(200)

    expect(fromCalls).toEqual(['item_books'])
    const [pngPath] = uploadMock.mock.calls[0]
    const [webpPath] = uploadMock.mock.calls[1]
    expect(pngPath).toBe(`item_books/asset-generator/${COLLECTION_ID}.png`)
    expect(webpPath).toBe(`item_books/asset-generator/${COLLECTION_ID}.webp`)

    expect(updatePayloads[0].image_source).toBe('admin-generator')

    const body = await res.json()
    expect(body.name).toBe('테스트 컬렉션')
  })

  it('홈피드: today_cards 테이블에 title로 조회하고 cover_image_url을 갱신한다(티켓 20260925_1411)', async () => {
    lookupResult = { data: { id: HOME_FEED_ID, title: '테스트 카드' }, error: null }
    const form = new FormData()
    form.append('targetType', 'home_feed')
    form.append('targetId', HOME_FEED_ID)
    form.append('image', await makeSmallPngFile())

    const res = await POST(postReq(form))
    expect(res.status).toBe(200)

    expect(fromCalls).toEqual(['today_cards'])
    const [pngPath] = uploadMock.mock.calls[0]
    const [webpPath] = uploadMock.mock.calls[1]
    expect(pngPath).toBe(`today_cards/asset-generator/${HOME_FEED_ID}.png`)
    expect(webpPath).toBe(`today_cards/asset-generator/${HOME_FEED_ID}.webp`)

    // 다른 콘텐츠 유형과 달리 image_url이 아니라 cover_image_url을 갱신한다
    expect(updatePayloads[0].image_url).toBeUndefined()
    expect(updatePayloads[0].cover_image_url).toContain(`today_cards/asset-generator/${HOME_FEED_ID}.webp`)
    expect(updatePayloads[0].image_source).toBe('admin-generator')

    const body = await res.json()
    expect(body.name).toBe('테스트 카드')
  })

  // 실패 경로(티켓 20260926_0202) — DB·Storage는 위 스텁이고 실제 조회·업로드는 하지 않는다.
  describe('실패 경로', () => {
    async function postBadge(image: File): Promise<Response> {
      const form = new FormData()
      form.append('targetType', 'badge')
      form.append('targetId', BADGE_ID)
      form.append('image', image)
      return POST(postReq(form))
    }

    it('이미지 파일이 없으면 400이고 대상 조회·업로드를 하지 않는다', async () => {
      const form = new FormData()
      form.append('targetType', 'badge')
      form.append('targetId', BADGE_ID)
      const res = await POST(postReq(form))
      expect(res.status).toBe(400)
      expect(fromCalls).toEqual([])
      expect(uploadMock).not.toHaveBeenCalled()
    })

    it('빈 파일(0바이트)이면 400', async () => {
      const res = await postBadge(new File([], 'stage.png', { type: 'image/png' }))
      expect(res.status).toBe(400)
      expect(uploadMock).not.toHaveBeenCalled()
    })

    it('PNG가 아닌 파일이면 400이고 업로드하지 않는다', async () => {
      const res = await postBadge(new File([new Uint8Array([1, 2, 3])], 'stage.jpg', { type: 'image/jpeg' }))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('PNG')
      expect(uploadMock).not.toHaveBeenCalled()
    })

    it('배지 조회는 소프트 삭제된 행을 제외하고, 삭제된 배지면 404다', async () => {
      lookupResult = { data: null, error: null }
      const res = await postBadge(await makeSmallPngFile())
      expect(res.status).toBe(404)
      expect(tableBuilder.is).toHaveBeenCalledWith('deleted_at', null)
      expect(uploadMock).not.toHaveBeenCalled()
    })

    it('미션 조회에는 deleted_at 조건을 붙이지 않는다', async () => {
      lookupResult = { data: { id: MISSION_ID, title: '테스트 미션' }, error: null }
      const form = new FormData()
      form.append('targetType', 'mission')
      form.append('targetId', MISSION_ID)
      form.append('image', await makeSmallPngFile())
      await POST(postReq(form))
      expect(tableBuilder.is).not.toHaveBeenCalled()
    })

    it('대상 조회가 DB 오류면 500이고 업로드하지 않는다', async () => {
      lookupResult = { data: null, error: { message: 'db down' } }
      const res = await postBadge(await makeSmallPngFile())
      expect(res.status).toBe(500)
      expect(uploadMock).not.toHaveBeenCalled()
    })

    it('WebP 변환에 실패하면 500이고 아무것도 업로드하지 않는다', async () => {
      // PNG 헤더만 흉내 낸 깨진 바이트 — sharp가 실제로 던진다
      const broken = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], 'stage.png', { type: 'image/png' })
      const res = await postBadge(broken)
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('이미지를 WebP로 변환하지 못했습니다.')
      expect(uploadMock).not.toHaveBeenCalled()
      expect(updatePayloads).toHaveLength(0)
    })

    it('PNG 업로드에 실패하면 500이고 WebP 업로드·컬럼 갱신을 하지 않는다', async () => {
      uploadMock.mockResolvedValueOnce({ error: { message: 'storage png down' } })
      const res = await postBadge(await makeSmallPngFile())
      expect(res.status).toBe(500)
      expect((await res.json()).error).toContain('원본 이미지 업로드 실패')
      expect(uploadMock).toHaveBeenCalledTimes(1)
      expect(updatePayloads).toHaveLength(0)
    })

    it('WebP 업로드에 실패하면 500이고 컬럼을 갱신하지 않는다', async () => {
      uploadMock.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'storage webp down' } })
      const res = await postBadge(await makeSmallPngFile())
      expect(res.status).toBe(500)
      expect((await res.json()).error).toContain('WebP 이미지 업로드 실패')
      expect(uploadMock).toHaveBeenCalledTimes(2)
      expect(updatePayloads).toHaveLength(0)
    })

    it('업로드 뒤 컬럼 갱신이 실패하면 500이고, 올린 파일 두 개는 정리하지 않고 남긴다(orphan)', async () => {
      updateError = { message: 'update failed' }
      const res = await postBadge(await makeSmallPngFile())
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toContain('이미지는 업로드됐지만 반영에 실패했습니다')
      expect(body.webpUrl).toBeUndefined()
      // 현재 동작의 고정: 두 파일이 올라간 채 남고, 스텁 storage에는 remove가 없어 정리 시도가 있었다면 여기서 던졌을 것이다
      expect(uploadMock).toHaveBeenCalledTimes(2)
      expect(updatePayloads).toHaveLength(1)
      // 같은 경로에 upsert하므로 같은 대상을 다시 반영하면 그 파일을 덮어쓴다
      expect(uploadMock.mock.calls.every((call) => call[2].upsert === true)).toBe(true)
    })
  })
})
