/**
 * POST /api/profile/avatar — 저장 바이트에서 EXIF(GPS) 제거 (티켓 20260929_1317)
 *
 * avatarImage.ts는 실물을 쓰고 Supabase 클라이언트만 목으로 바꿔, `upload`에 전달된 바이트를
 * sharp로 다시 읽어 메타데이터가 남지 않았는지 본다.
 */
import sharp from 'sharp'

const { getUser, upload, getPublicUrl, remove, updateEq, update, selectMaybeSingle, from } =
  vi.hoisted(() => {
    const upload = vi.fn()
    const getPublicUrl = vi.fn()
    const remove = vi.fn()
    const updateEq = vi.fn()
    const update = vi.fn(() => ({ eq: updateEq }))
    const selectMaybeSingle = vi.fn()
    const select = vi.fn(() => ({ eq: () => ({ maybeSingle: selectMaybeSingle }) }))
    const from = vi.fn((table: string) =>
      table === 'users' ? { update, select } : { upload, getPublicUrl, remove },
    )
    return { getUser: vi.fn(), upload, getPublicUrl, remove, updateEq, update, selectMaybeSingle, from }
  })

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceClient: () => ({ from, storage: { from } }),
}))

const { POST } = await import('../route')

const PUBLIC_BASE = 'https://x.supabase.co/storage/v1/object/public/avatars/'
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
  getPublicUrl.mockReset().mockImplementation((p: string) => ({
    data: { publicUrl: `${PUBLIC_BASE}${p}` },
  }))
  remove.mockReset().mockResolvedValue({ error: null })
  selectMaybeSingle.mockReset().mockResolvedValue({ data: { avatar_url: null }, error: null })
  updateEq.mockReset().mockResolvedValue({ error: null })
  update.mockClear()
})

describe('POST /api/profile/avatar', () => {
  it('GPS·Make·방향 EXIF가 든 JPEG는 EXIF 없이 저장하고 방향을 픽셀에 적용한다', async () => {
    const res = await POST(post(await jpegWithGps(), 'image/jpeg') as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ avatar_url: `${PUBLIC_BASE}${upload.mock.calls[0][0]}` })

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

  describe('이전 아바타 파일 삭제 (티켓 20260929_1331)', () => {
    async function postPng() {
      const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: BG } })
        .png()
        .toBuffer()
      return POST(post(png, 'image/png') as never)
    }

    it('내 경로의 이전 객체에 대해 remove()를 한 번 부른다', async () => {
      selectMaybeSingle.mockResolvedValue({
        data: { avatar_url: `${PUBLIC_BASE}user-1/111.jpg` },
        error: null,
      })
      const res = await postPng()
      expect(res.status).toBe(200)
      expect(remove).toHaveBeenCalledTimes(1)
      expect(remove).toHaveBeenCalledWith(['user-1/111.jpg'])
    })

    it.each([
      ['구글 기본 이미지 같은 외부 URL', 'https://lh3.googleusercontent.com/a/abc=s96-c'],
      ['다른 이용자 경로', `${PUBLIC_BASE}user-2/111.jpg`],
      ['다른 버킷 주소', 'https://x.supabase.co/storage/v1/object/public/other/user-1/111.jpg'],
      ['경로 탈출 시도', `${PUBLIC_BASE}user-1/../user-2/111.jpg`],
      ['아바타가 없는 이용자', null],
    ])('%s이면 remove()를 부르지 않는다', async (_label, url) => {
      selectMaybeSingle.mockResolvedValue({ data: { avatar_url: url }, error: null })
      const res = await postPng()
      expect(res.status).toBe(200)
      expect(remove).not.toHaveBeenCalled()
    })

    it('remove()가 실패해도 200과 새 avatar_url을 돌려준다', async () => {
      selectMaybeSingle.mockResolvedValue({
        data: { avatar_url: `${PUBLIC_BASE}user-1/111.jpg` },
        error: null,
      })
      remove.mockResolvedValue({ error: { message: 'boom' } })
      const res = await postPng()
      expect(res.status).toBe(200)
      expect((await res.json()).avatar_url).toBe(`${PUBLIC_BASE}${upload.mock.calls[0][0]}`)
    })

    it('remove()가 예외를 던져도 200이다', async () => {
      selectMaybeSingle.mockResolvedValue({
        data: { avatar_url: `${PUBLIC_BASE}user-1/111.jpg` },
        error: null,
      })
      remove.mockRejectedValue(new Error('network'))
      const res = await postPng()
      expect(res.status).toBe(200)
    })

    it('DB 갱신이 실패하면 이전 객체를 지우지 않는다', async () => {
      selectMaybeSingle.mockResolvedValue({
        data: { avatar_url: `${PUBLIC_BASE}user-1/111.jpg` },
        error: null,
      })
      updateEq.mockResolvedValue({ error: { message: 'db' } })
      const res = await postPng()
      expect(res.status).toBe(500)
      expect(remove).not.toHaveBeenCalled()
    })
  })
})
