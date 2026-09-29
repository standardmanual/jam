/**
 * POST /api/profile/avatar — 저장 바이트에서 EXIF(GPS) 제거 (티켓 20260929_1317)
 *
 * avatarImage.ts는 실물을 쓰고 Supabase 클라이언트만 목으로 바꿔, `upload`에 전달된 바이트를
 * sharp로 다시 읽어 메타데이터가 남지 않았는지 본다.
 */
import sharp from 'sharp'

const { getUser, upload, getPublicUrl, updateEq, update, from } = vi.hoisted(() => {
  const upload = vi.fn()
  const getPublicUrl = vi.fn()
  const updateEq = vi.fn()
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn((table: string) =>
    table === 'users' ? { update } : { upload, getPublicUrl },
  )
  return { getUser: vi.fn(), upload, getPublicUrl, updateEq, update, from }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceClient: () => ({ from, storage: { from } }),
}))

const { POST } = await import('../route')

const BG = { r: 10, g: 120, b: 200 }

function post(bytes: Buffer, type: string): Request {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(bytes)], 'a', { type }))
  return new Request('https://j-a-m.app/api/profile/avatar', { method: 'POST', body: form })
}

async function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: BG } })
    .withExif({
      IFD0: { Make: 'TestPhone' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '37/1 33/1 59/1' },
    })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer()
}

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } })
  upload.mockReset().mockResolvedValue({ error: null })
  getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: 'https://cdn/avatar' } })
  updateEq.mockReset().mockResolvedValue({ error: null })
  update.mockClear()
})

describe('POST /api/profile/avatar', () => {
  it('GPS·Make·방향 EXIF가 든 JPEG는 EXIF 없이 저장하고 방향을 픽셀에 적용한다', async () => {
    const res = await POST(post(await jpegWithGps(), 'image/jpeg') as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ avatar_url: 'https://cdn/avatar' })

    const [path, body, opts] = upload.mock.calls[0]
    expect(path).toMatch(/^user-1\/\d+\.jpg$/)
    expect(opts.contentType).toBe('image/jpeg')

    const meta = await sharp(body as Buffer).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.orientation).toBeUndefined()
    expect([meta.width, meta.height]).toEqual([20, 40])
  })

  it.each([
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)('%s는 같은 형식·contentType·확장자로 저장한다', async (fmt, mime) => {
    const input = await sharp({ create: { width: 16, height: 16, channels: 3, background: BG } })
      [fmt]()
      .toBuffer()
    const res = await POST(post(input, mime) as never)
    expect(res.status).toBe(200)

    const [path, body, opts] = upload.mock.calls[0]
    expect(path).toMatch(new RegExp(`\\.${fmt}$`))
    expect(opts.contentType).toBe(mime)
    expect((await sharp(body as Buffer).metadata()).format).toBe(fmt)
  })

  it('클라이언트가 보낸 MIME이 아니라 실제 형식으로 contentType을 정한다', async () => {
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: BG } })
      .png()
      .toBuffer()
    const res = await POST(post(png, 'image/jpeg') as never)
    expect(res.status).toBe(200)
    const [path, , opts] = upload.mock.calls[0]
    expect(path).toMatch(/\.png$/)
    expect(opts.contentType).toBe('image/png')
  })

  it('이미지가 아닌 바이트를 image/jpeg로 보내면 400이고 업로드·DB 갱신을 하지 않는다', async () => {
    const res = await POST(post(Buffer.from('not an image'), 'image/jpeg') as never)
    expect(res.status).toBe(400)
    expect(upload).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('로그인하지 않으면 401이다', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(post(await jpegWithGps(), 'image/jpeg') as never)
    expect(res.status).toBe(401)
    expect(upload).not.toHaveBeenCalled()
  })
})
