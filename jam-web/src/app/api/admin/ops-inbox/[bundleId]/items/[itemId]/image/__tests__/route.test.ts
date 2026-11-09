/**
 * POST /api/admin/ops-inbox/[bundleId]/items/[itemId]/image — 항목 이미지 저장 (티켓 20261006_1801)
 *
 * 저장 규칙(합쳐 쓰기·자원 갱신·정리)은 `opsInbox/__tests__/image.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * 인증 403, ID·파일 검증 400, 종류·상태·시험 묶음 거절, WebP 변환(sharp 실제 실행)과 두 파일 업로드, 항목에 쓰기, 오류 문장 고정.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import sharp from 'sharp'
import { FakeDb } from '@/lib/admin/opsInbox/execute/__tests__/fakeDb'
import { makeItem, type ItemSpec } from '@/lib/admin/opsInbox/execute/__tests__/fixtures'

const B = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
const ITEM = '00000000-0000-4000-8000-000000000001'

const h = vi.hoisted(() => ({
  admin: { id: 'admin-1' } as { id: string } | null,
  db: null as unknown,
  upload: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => h.admin }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    const db = h.db as FakeDb
    return {
      from: (table: string) => db.from(table),
      storage: { from: () => ({ upload: h.upload, remove: h.remove, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/images/${path}` } }) }) },
    }
  },
}))

const { POST, maxDuration } = await import('../route')

function setup(spec: ItemSpec = {}, bundle: Record<string, unknown> = {}) {
  const db = new FakeDb()
  db.tables.ops_bundles = [{ id: B, is_sample: false, ...bundle }]
  db.tables.ops_bundle_items = [{ ...makeItem({ id: ITEM, key: 'k', kind: 'mission', status: 'approved', ...spec }), bundle_id: B }]
  h.db = db
  return db
}

async function pngFile(type = 'image/png'): Promise<File> {
  const buffer = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).png().toBuffer()
  return new File([new Uint8Array(buffer)], 'a.png', { type })
}

async function call(file?: File | null, ids: { bundleId?: string; itemId?: string } = {}) {
  const form = new FormData()
  if (file) form.set('image', file)
  const req = new Request('https://j-a-m.app/api/admin/ops-inbox/x/items/y/image', { method: 'POST', body: form })
  const res = await POST(req, { params: Promise.resolve({ bundleId: ids.bundleId ?? B, itemId: ids.itemId ?? ITEM }) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

beforeEach(() => {
  h.admin = { id: 'admin-1' }
  h.upload.mockReset().mockResolvedValue({ error: null })
  h.remove.mockReset().mockResolvedValue({ error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('image 라우트', () => {
  it('maxDuration은 60이다', () => {
    expect(maxDuration).toBe(60)
  })

  it('관리자가 아니면 403이고 아무것도 읽거나 올리지 않는다', async () => {
    const db = setup()
    h.admin = null
    expect((await call(await pngFile())).status).toBe(403)
    expect(db.calls).toEqual([])
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('ID가 UUID가 아니면 400이다', async () => {
    setup()
    expect((await call(await pngFile(), { bundleId: 'x' })).status).toBe(400)
    expect((await call(await pngFile(), { itemId: 'x' })).status).toBe(400)
  })

  it('파일이 없거나 PNG가 아니거나 5MB를 넘으면 400이다', async () => {
    setup()
    expect((await call(null)).status).toBe(400)
    expect((await call(await pngFile('image/jpeg'))).status).toBe(400)
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'b.png', { type: 'image/png' })
    expect((await call(big)).status).toBe(400)
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('이미지 칸이 없는 종류·반려 항목·시험 묶음·없는 항목은 올리기 전에 거절한다', async () => {
    setup({ kind: 'recipe' })
    expect((await call(await pngFile())).status).toBe(409)
    setup({ status: 'rejected' })
    expect((await call(await pngFile())).status).toBe(409)
    setup({}, { is_sample: true })
    expect((await call(await pngFile())).status).toBe(409)
    setup()
    expect((await call(await pngFile(), { itemId: '00000000-0000-4000-8000-0000000000ff' })).status).toBe(404)
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('다른 기획의 항목 ID로는 저장할 수 없다', async () => {
    const db = setup()
    db.tables.ops_bundles.push({ id: '00000000-0000-4000-8000-0000000000aa', is_sample: false })
    expect((await call(await pngFile(), { bundleId: '00000000-0000-4000-8000-0000000000aa' })).status).toBe(404)
  })

  it('PNG 원본과 WebP를 항목 ID 기준 경로에 올리고 항목에 WebP 주소를 쓴다', async () => {
    const db = setup()
    const { status, body } = await call(await pngFile())
    expect(status).toBe(200)
    expect(h.upload.mock.calls.map((args) => [args[0], args[2]])).toEqual([
      [`ops-inbox/missions/${ITEM}.png`, { contentType: 'image/png', upsert: true }],
      [`ops-inbox/missions/${ITEM}.webp`, { contentType: 'image/webp', upsert: true }],
    ])
    expect(Buffer.isBuffer(h.upload.mock.calls[1][1])).toBe(true)
    expect(String(body.url)).toMatch(new RegExp(`^https://cdn.test/images/ops-inbox/missions/${ITEM}\\.webp\\?v=\\d+$`))
    expect(db.item(ITEM).edited).toEqual({ resource: { image_url: body.url } })
    expect(db.decisions()).toEqual([])
  })

  it('업로드가 실패하면 500 고정 문장이고 항목에는 쓰지 않는다. 원문은 응답에 없다', async () => {
    const db = setup()
    h.upload.mockResolvedValueOnce({ error: { message: 'secret storage detail' } })
    const { status, body } = await call(await pngFile())
    expect(status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(db.itemWrites()).toEqual([])
  })

  it('PNG가 아닌 바이트는 변환에 실패해 500이고 올리지 않는다', async () => {
    setup()
    const broken = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })
    expect((await call(broken)).status).toBe(500)
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('빈 파일은 400 noFile이고, 정확히 5MB는 크기 검사를 통과한다(PNG가 아니라 변환에서 500)', async () => {
    setup()
    const empty = await call(new File([], 'e.png', { type: 'image/png' }))
    expect(empty.status).toBe(400)
    expect(empty.body.error).toBe('이미지 파일이 없어요.')
    const exact = await call(new File([new Uint8Array(5 * 1024 * 1024)], 'c.png', { type: 'image/png' }))
    expect(exact.status).toBe(500)
    expect(exact.body.error).toContain('WebP로 바꾸지 못했어요')
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('묶음·항목 조회가 DB 오류면 500 고정 문장이고 올리지 않는다. 원문은 응답에 없다', async () => {
    for (const table of ['ops_bundles', 'ops_bundle_items']) {
      const db = setup()
      db.failIf = (c) => c.table === table && c.op === 'select'
      const { status, body } = await call(await pngFile())
      expect(status).toBe(500)
      expect(body.error).toContain('저장하지 못했어요')
      expect(JSON.stringify(body)).not.toContain('secret')
    }
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('WebP 업로드만 실패해도 500 고정 문장이고 항목에는 쓰지 않는다', async () => {
    const db = setup()
    h.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'secret webp detail' } })
    const { status, body } = await call(await pngFile())
    expect(status).toBe(500)
    expect(body.error).toContain('올리지 못했어요')
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(h.upload).toHaveBeenCalledTimes(2)
    expect(db.itemWrites()).toEqual([])
  })

  describe('업로드 뒤 applyItemImage 결과 변환', () => {
    /** 라우트의 사전 조회(첫 항목 select)는 통과시키고, applyItemImage의 두 번째 항목 select 직전에 `mutate`를 건다. */
    function onApplyRead(db: FakeDb, mutate: (db: FakeDb) => void) {
      let selects = 0
      db.beforeRun = (c) => {
        if (c.table === 'ops_bundle_items' && c.op === 'select' && ++selects === 2) mutate(db)
      }
    }

    it('그사이 반려됐으면 409 notAllowed다', async () => {
      const db = setup()
      onApplyRead(db, (d) => { d.item(ITEM).status = 'rejected' })
      const { status, body } = await call(await pngFile())
      expect(status).toBe(409)
      expect(body.error).toContain('반려·취소·실패·종료')
      // 올린 두 파일을 쓸 곳이 없으니 지운다(티켓 20261007_0952)
      expect(h.remove).toHaveBeenCalledTimes(1)
      expect(h.remove).toHaveBeenCalledWith([`ops-inbox/missions/${ITEM}.png`, `ops-inbox/missions/${ITEM}.webp`])
    })

    it('그사이 이미지 칸이 없는 종류가 되면 409 noImageField이고 올린 두 파일을 지운다', async () => {
      const db = setup()
      onApplyRead(db, (d) => { d.item(ITEM).kind = 'recipe' })
      const { status, body } = await call(await pngFile())
      expect(status).toBe(409)
      expect(body.error).toBe('이미지를 쓰지 않는 종류예요.')
      expect(h.remove).toHaveBeenCalledWith([`ops-inbox/missions/${ITEM}.png`, `ops-inbox/missions/${ITEM}.webp`])
    })

    it('계속 충돌하다 항목이 취소됐으면 409 conflict이고 올린 두 파일을 지운다', async () => {
      const db = setup()
      let n = 0
      db.beforeRun = (c) => {
        if (c.table === 'ops_bundle_items' && c.op === 'update') {
          db.item(ITEM).updated_at = `2026-10-05T00:00:0${++n}.000Z`
          if (n === 2) db.item(ITEM).status = 'cancelled'
        }
      }
      const { status, body } = await call(await pngFile())
      expect(status).toBe(409)
      expect(body.error).toContain('그사이 항목이 바뀌었어요')
      expect(h.remove).toHaveBeenCalledTimes(1)
      expect(h.remove).toHaveBeenCalledWith([`ops-inbox/missions/${ITEM}.png`, `ops-inbox/missions/${ITEM}.webp`])
    })

    it('그사이 항목이 사라졌으면 404다', async () => {
      const db = setup()
      onApplyRead(db, (d) => { d.tables.ops_bundle_items = [] })
      expect((await call(await pngFile())).status).toBe(404)
    })

    it('계속 충돌하면 409 conflict다', async () => {
      const db = setup()
      let n = 0
      db.beforeRun = (c) => {
        if (c.table === 'ops_bundle_items' && c.op === 'update') db.item(ITEM).updated_at = `2026-10-05T00:00:0${++n}.000Z`
      }
      const { status, body } = await call(await pngFile())
      expect(status).toBe(409)
      expect(body.error).toContain('그사이 항목이 바뀌었어요')
      // 항목이 유효한 상태면 같은 경로의 파일은 다른 업로드가 쓴 정상 파일일 수 있어 지우지 않는다
      expect(h.remove).not.toHaveBeenCalled()
    })

    it('충돌 뒤 항목 상태를 다시 읽지 못하면 파일을 지우지 않는다', async () => {
      const db = setup()
      let n = 0
      db.beforeRun = (c) => {
        if (c.table === 'ops_bundle_items' && c.op === 'update') db.item(ITEM).updated_at = `2026-10-05T00:00:0${++n}.000Z`
      }
      let selects = 0
      db.failIf = (c) => c.table === 'ops_bundle_items' && c.op === 'select' && ++selects === 4
      expect((await call(await pngFile())).status).toBe(409)
      expect(h.remove).not.toHaveBeenCalled()
    })

    it('항목 저장이 DB 오류면 500 고정 문장이다. 원문은 응답에 없다', async () => {
      const db = setup()
      db.failIf = (c) => c.table === 'ops_bundle_items' && c.op === 'update'
      const { status, body } = await call(await pngFile())
      expect(status).toBe(500)
      expect(body.error).toContain('저장하지 못했어요')
      expect(JSON.stringify(body)).not.toContain('secret')
    })
  })

  it('같은 항목에 두 업로드가 동시에 와도 둘 다 upsert로 같은 경로에 올리고 파일은 지우지 않는다', async () => {
    const db = setup()
    const [a, b] = await Promise.all([call(await pngFile()), call(await pngFile())])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(h.upload).toHaveBeenCalledTimes(4)
    const paths = h.upload.mock.calls.map((args) => args[0])
    expect(new Set(paths)).toEqual(new Set([`ops-inbox/missions/${ITEM}.png`, `ops-inbox/missions/${ITEM}.webp`]))
    expect(h.upload.mock.calls.every((args) => args[2].upsert === true)).toBe(true)
    expect(h.remove).not.toHaveBeenCalled()
    expect(db.item(ITEM).edited).toEqual({ resource: { image_url: expect.stringContaining(`${ITEM}.webp`) } })
  })

  it('예약된 항목은 자원 행에도 쓴다', async () => {
    const db = setup({ status: 'scheduled', createdResource: { mission_id: 'res-1' } })
    db.tables.missions = [{ id: 'res-1' }]
    const { status, body } = await call(await pngFile())
    expect(status).toBe(200)
    expect(db.tables.missions).toEqual([{ id: 'res-1', image_url: body.url }])
  })

  it('자원에 쓰지 못하면 500 고정 문장이다', async () => {
    const db = setup({ status: 'scheduled', createdResource: { mission_id: 'res-1' } })
    db.tables.missions = [{ id: 'res-1' }]
    db.failIf = (c) => c.table === 'missions' && c.op === 'update'
    const { status, body } = await call(await pngFile())
    expect(status).toBe(500)
    expect(String(body.error)).toContain('예약된 자원')
  })
})
