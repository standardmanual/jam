/**
 * /api/admin/activity-badge-templates/register (티켓 20261116_0728)
 * sharp는 실제로 돌리고 Supabase·권한·after만 흉내 낸다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/activity-badge-templates
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import sharp from 'sharp'
import { DEFAULT_TEMPLATE_BADGE_PARAMS } from '@/lib/admin/activityBadgeTemplate/templateParams'

const BADGE_ID = '00000000-0000-4000-8000-0000000000bb'

let adminUser: { id: string } | null = { id: 'admin-1' }
let lookupResult: { data: { id: string; name: string } | null; error: { message: string } | null } = {
  data: { id: BADGE_ID, name: '테스트 배지' },
  error: null,
}
let updateError: { message: string } | null = null
let uploadErrorAt: string | null = null
const updatePayloads: Record<string, unknown>[] = []
const fromCalls: string[] = []

const builder: Record<string, unknown> = {}
builder.select = vi.fn(() => builder)
builder.eq = vi.fn(() => builder)
builder.is = vi.fn(() => builder)
builder.maybeSingle = vi.fn(async () => lookupResult)
builder.update = vi.fn((payload: Record<string, unknown>) => {
  updatePayloads.push(payload)
  return builder
})
;(builder as { then: PromiseLike<unknown>['then'] }).then = (resolve, reject) =>
  Promise.resolve({ error: updateError }).then(resolve, reject)

const uploadMock = vi.fn<(path: string, body: Buffer, options: { contentType: string; upsert?: boolean }) => Promise<{ error: { message: string } | null }>>(
  async (path) => ({ error: uploadErrorAt && path.endsWith(uploadErrorAt) ? { message: 'RAW DB ERROR' } : null })
)
const getPublicUrlMock = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/images/${path}` } }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (t: string) => {
      fromCalls.push(t)
      return builder
    },
    storage: { from: () => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }) },
  }),
}))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: vi.fn(async () => adminUser),
}))
const afterMock = vi.fn()
vi.mock('next/server', async (importActual) => ({
  ...(await importActual<typeof import('next/server')>()),
  after: (fn: () => void) => afterMock(fn),
}))
vi.mock('@/lib/images/warmImageVariants', () => ({ warmImageVariants: vi.fn() }))

const { POST } = await import('../route')

async function png(w: number, h = w): Promise<File> {
  const buf = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } })
    .png()
    .toBuffer()
  return new File([buf], 'b.png', { type: 'image/png' })
}

async function req(over: { badgeId?: string | null; params?: string | null; image?: File | null } = {}) {
  const form = new FormData()
  const badgeId = over.badgeId === undefined ? BADGE_ID : over.badgeId
  if (badgeId !== null) form.set('badgeId', badgeId)
  const params = over.params === undefined ? JSON.stringify(DEFAULT_TEMPLATE_BADGE_PARAMS) : over.params
  if (params !== null) form.set('params', params)
  const image = over.image === undefined ? await png(1024) : over.image
  if (image) form.set('image', image)
  return new NextRequest('https://j-a-m.app/api/admin/activity-badge-templates/register', { method: 'POST', body: form })
}

beforeEach(() => {
  adminUser = { id: 'admin-1' }
  lookupResult = { data: { id: BADGE_ID, name: '테스트 배지' }, error: null }
  updateError = null
  uploadErrorAt = null
  updatePayloads.length = 0
  fromCalls.length = 0
  uploadMock.mockClear()
  afterMock.mockClear()
})

async function expectError(res: Response, status: number, message: string) {
  expect(res.status).toBe(status)
  expect((await res.json()).error).toBe(message)
  expect(uploadMock).not.toHaveBeenCalled()
}

describe('register — 검증', () => {
  it('권한이 없으면 403이고 저장소·DB에 닿지 않는다', async () => {
    adminUser = null
    const res = await POST(await req())
    expect(res.status).toBe(403)
    expect(fromCalls).toHaveLength(0)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('배지 id가 없으면 400', async () => {
    await expectError(await POST(await req({ badgeId: null })), 400, '배지를 골라 주세요.')
  })

  it('조정값이 JSON이 아니거나 템플릿 값이 아니면 400', async () => {
    const msg = '조정값을 읽지 못했어요. 화면을 새로 고친 뒤 다시 시도해 주세요.'
    await expectError(await POST(await req({ params: 'not json' })), 400, msg)
    await expectError(await POST(await req({ params: '{"v":1}' })), 400, msg)
    await expectError(await POST(await req({ params: null })), 400, msg)
  })

  it('이미지가 없거나 PNG가 아니면 400', async () => {
    const msg = 'PNG 이미지가 없어요. 다시 시도해 주세요.'
    await expectError(await POST(await req({ image: null })), 400, msg)
    await expectError(await POST(await req({ image: new File([], 'a.png', { type: 'image/png' }) })), 400, msg)
    await expectError(await POST(await req({ image: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) })), 400, msg)
  })

  it('5MB를 넘으면 400', async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' })
    await expectError(await POST(await req({ image: big })), 400, '이미지가 너무 커요. 5MB 이하만 등록할 수 있어요.')
  })

  it('긴 변이 1024가 아니거나 읽지 못하면 400', async () => {
    const msg = '이미지 크기가 맞지 않아요. 긴 변이 1024px인 이미지만 등록할 수 있어요.'
    await expectError(await POST(await req({ image: await png(1280) })), 400, msg)
    await expectError(await POST(await req({ image: new File(['garbage'], 'a.png', { type: 'image/png' }) })), 400, msg)
  })

  it('긴 변이 1024이면 직사각형도 통과한다', async () => {
    const res = await POST(await req({ image: await png(1024, 512) }))
    expect(res.status).toBe(200)
  })

  it('액티비티 배지가 없으면 404', async () => {
    lookupResult = { data: null, error: null }
    await expectError(await POST(await req()), 404, '액티비티 배지를 찾지 못했어요.')
  })
})

describe('register — 저장', () => {
  it('PNG·WebP를 올리고 배지를 고친다', async () => {
    const res = await POST(await req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(uploadMock.mock.calls.map((c) => [c[0], c[2].contentType, c[2].upsert])).toEqual([
      [`badges/activity-template/${BADGE_ID}.png`, 'image/png', true],
      [`badges/activity-template/${BADGE_ID}.webp`, 'image/webp', true],
    ])
    expect(updatePayloads).toHaveLength(1)
    expect(updatePayloads[0].image_url).toMatch(/\.webp\?v=\d+$/)
    expect(updatePayloads[0].image_source).toBe('admin-generator')
    expect((updatePayloads[0].image_gen_params as { kind: string }).kind).toBe('activity-template')
    expect(body.badgeId).toBe(BADGE_ID)
    expect(body.badgeName).toBe('테스트 배지')
    expect(body.imageUrl).toBe(updatePayloads[0].image_url)
    expect(body.originalUrl).toBe(`https://cdn.test/images/badges/activity-template/${BADGE_ID}.png`)
    expect(body.webpBytes).toBeGreaterThan(0)
    expect(afterMock).toHaveBeenCalledTimes(1)
  })

  it('올리기가 실패하면 500이고 DB 오류 원문을 싣지 않는다', async () => {
    uploadErrorAt = '.webp'
    const res = await POST(await req())
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toContain('이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(text).not.toContain('RAW DB ERROR')
    expect(updatePayloads).toHaveLength(0)
  })

  it('표 고치기가 실패하면 500', async () => {
    updateError = { message: 'RAW DB ERROR' }
    const res = await POST(await req())
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toContain('이미지는 올렸지만 배지에 반영하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(text).not.toContain('RAW DB ERROR')
    expect(afterMock).not.toHaveBeenCalled()
  })
})
