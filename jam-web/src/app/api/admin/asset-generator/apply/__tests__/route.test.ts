/**
 * /api/admin/asset-generator/apply — 스테이지 이미지 → 배지 반영 (티켓 20260924_2200)
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
const MAX_APPLY_IMAGE_BYTES = 5 * 1024 * 1024

let badgeLookupResult: { data: { id: string; name: string } | null; error: { message: string } | null } = {
  data: { id: BADGE_ID, name: '테스트 배지' },
  error: null,
}
let updateError: { message: string } | null = null
const updatePayloads: Record<string, unknown>[] = []

function makeBadgesBuilder() {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.is = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(async () => badgeLookupResult)
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    updatePayloads.push(payload)
    return builder
  })
  // update(...).eq(...)는 그 자체로 await 가능해야 한다(Supabase 쿼리 빌더 관례)
  ;(builder as { then: PromiseLike<{ error: typeof updateError }>['then'] }).then = (resolve, reject) =>
    Promise.resolve({ error: updateError }).then(resolve, reject)
  return builder
}

let badgesBuilder = makeBadgesBuilder()
const fromMock = vi.fn(() => badgesBuilder)

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
  badgeLookupResult = { data: { id: BADGE_ID, name: '테스트 배지' }, error: null }
  updateError = null
  updatePayloads.length = 0
  badgesBuilder = makeBadgesBuilder()
  fromMock.mockReset().mockImplementation(() => badgesBuilder)
  uploadMock.mockReset().mockResolvedValue({ error: null })
  getPublicUrlMock.mockReset().mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.test.jam.app/images/${path}` } }))
})

describe('POST /api/admin/asset-generator/apply', () => {
  it('무권한이면 403', async () => {
    const { getAdminUser } = await import('@/lib/admin/auth')
    vi.mocked(getAdminUser).mockResolvedValueOnce(null)
    const form = new FormData()
    form.append('badgeId', BADGE_ID)
    form.append('image', await makeSmallPngFile())
    const res = await POST(postReq(form))
    expect(res.status).toBe(403)
  })

  it('배지를 선택하지 않으면 400', async () => {
    const form = new FormData()
    form.append('image', await makeSmallPngFile())
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
  })

  it('이미지가 5MB를 넘으면 400 — sharp 변환·업로드를 시도하지 않는다', async () => {
    const oversized = new File([new Uint8Array(MAX_APPLY_IMAGE_BYTES + 1)], 'stage.png', { type: 'image/png' })
    const form = new FormData()
    form.append('badgeId', BADGE_ID)
    form.append('image', oversized)
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('배지를 찾을 수 없으면 404', async () => {
    badgeLookupResult = { data: null, error: null }
    const form = new FormData()
    form.append('badgeId', BADGE_ID)
    form.append('image', await makeSmallPngFile())
    const res = await POST(postReq(form))
    expect(res.status).toBe(404)
  })

  it('원본 PNG·WebP를 각각 업로드하고 image_url(WebP)·image_source를 함께 갱신한다', async () => {
    const form = new FormData()
    form.append('badgeId', BADGE_ID)
    form.append('image', await makeSmallPngFile())

    const res = await POST(postReq(form))
    expect(res.status).toBe(200)

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
})
