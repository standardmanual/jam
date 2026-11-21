/**
 * 어드민 투데이 카드 저장 API — 개편 칸 검증과 저장 때 자동 값 고정 (티켓 20261121_1315)
 *
 *  - POST·PATCH가 개편 칸을 검증해 잘못된 값은 400과 해요체 문구로 막는다
 *  - 개편 칸이 없는 옛 본문은 검증·조회 없이 이전과 똑같이 저장한다
 *  - POST는 유형이 있는 새 카드의 시드·비어 있는 색 키를 정해 저장하고, 사용자가 고른 값은 보존한다
 *  - PATCH는 이미 저장된 값을 다시 정하지 않는다(예외: 처음 유형 지정, 색을 자동으로 되돌림)
 *
 * 서비스 클라이언트는 모의 객체로 대신하고 관리자 확인은 통과시킨다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/today/__tests__/route.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { assignFeedColors } from '@/lib/today/feedAssign'
import { POST } from '../route'
import { PATCH } from '../[id]/route'

// 커버 대표 색 추출(sharp·fetch)은 모의로 대신한다(티켓 20261121_1724). 저장소 주소 판정 등 헬퍼 규칙은 coverColors.test.ts가 본다.
const extractMock = vi.hoisted(() => vi.fn<(url: string) => Promise<string[] | null>>())
vi.mock('@/lib/badgeColorExtract', () => ({ extractBadgeColors: (url: string) => extractMock(url) }))
const COVER_A = 'https://proj.supabase.co/storage/v1/object/public/assets/today_cards/a.webp'
const COVER_B = 'https://proj.supabase.co/storage/v1/object/public/assets/today_cards/b.webp'

interface FakeState {
  existing: Record<string, unknown> | null
  usageRows: Array<{ bg_color_key: string | null }>
  inserts: Array<Record<string, unknown>>
  updates: Array<Record<string, unknown>>
  /** 배경색 사용 빈도 조회에 건 필터(`메서드:열:값`) */
  usageFilters: string[]
  /** 저장 뒤 되읽기가 아닌 조회(select)의 열 목록 — 기존 카드 조회와 빈도 조회 */
  selects: string[]
}

const state = vi.hoisted(() => ({}) as FakeState)

function resetState(): void {
  state.existing = null
  state.usageRows = []
  state.inserts = []
  state.updates = []
  state.usageFilters = []
  state.selects = []
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      let mode: 'none' | 'insert' | 'update' | 'select' = 'none'
      let written: Record<string, unknown> = {}
      let selected = ''
      const builder: Record<string, unknown> = {}
      const chain = (name: string) => (column?: string, value?: unknown) => {
        if (mode === 'select' && selected === 'bg_color_key') state.usageFilters.push(`${name}:${column}:${String(value)}`)
        return builder
      }
      Object.assign(builder, {
        insert: (payload: Record<string, unknown>) => {
          mode = 'insert'
          written = payload
          state.inserts.push(payload)
          return builder
        },
        update: (payload: Record<string, unknown>) => {
          mode = 'update'
          written = payload
          state.updates.push(payload)
          return builder
        },
        select: (columns?: string) => {
          if (mode === 'none') {
            mode = 'select'
            selected = columns ?? '*'
            state.selects.push(selected)
          }
          return builder
        },
        eq: chain('eq'),
        neq: chain('neq'),
        lte: chain('lte'),
        gte: chain('gte'),
        not: chain('not'),
        single: async () => ({ data: { id: 'card-1', ...(mode === 'update' ? state.existing : {}), ...written }, error: null }),
        maybeSingle: async () => ({ data: state.existing, error: null }),
        // 배경색 사용 빈도 조회는 `await`로 끝난다
        then: (resolve: (value: unknown) => unknown) => resolve({ data: state.usageRows, error: null }),
      })
      return builder
    },
  }),
}))
vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: async () => null,
  getAdminUser: async () => ({ id: 'admin-1', email: 'admin@example.com' }),
}))

const URL = 'https://j-a-m.app/api/admin/today'
const BASE_BODY = {
  template_type: 'badge_spotlight',
  layout_type: 'large_thumbnail',
  title: '문경새재에서 걷는 주말',
  starts_at: '2026-11-21T00:00:00.000Z',
  ends_at: '2026-11-28T00:00:00.000Z',
}

function request(method: 'POST' | 'PATCH', body: unknown): NextRequest {
  return new NextRequest(URL, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
const post = (body: Record<string, unknown>) => POST(request('POST', body))
const patch = (body: Record<string, unknown>) => PATCH(request('PATCH', body), { params: Promise.resolve({ id: 'card-1' }) })

const COLOR_KEYS = ['bg_color_key', 'chip_color_key', 'box_color_key'] as const

beforeEach(() => {
  resetState()
  extractMock.mockReset()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // 서버 난수를 고정한다(같은 입력은 같은 값이라는 결론을 확인하려고)
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint32Array) => {
    array[0] = 12345
    return array
  }) as typeof crypto.getRandomValues)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('POST /api/admin/today — 검증', () => {
  it('잘못된 개편 칸은 400과 해요체 문구로 막고 저장하지 않는다', async () => {
    const res = await post({ ...BASE_BODY, feed_type: 'hero_box', list_items: [{ name: '항목', href: 'javascript:alert(1)' }] })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('주소를 쓸 수 없어요')
    expect(json.errors).toHaveLength(1)
    expect(state.inserts).toHaveLength(0)
  })

  it('제목에 없는 제목 칩 낱말은 400이다', async () => {
    const res = await post({ ...BASE_BODY, feed_type: 'text_box', title_chip_words: ['설악산'] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('「설악산」')
    expect(state.inserts).toHaveLength(0)
  })

  it('개편 칸이 없는 옛 본문은 검증·조회 없이 이전과 똑같이 저장한다', async () => {
    const res = await post({ ...BASE_BODY, image_source: 'upload' })
    expect(res.status).toBe(200)
    expect(state.inserts).toEqual([{ ...BASE_BODY, created_by: 'admin-1' }])
    expect(state.selects).toHaveLength(0)
    expect(state.usageFilters).toHaveLength(0)
    const json = await res.json()
    expect(json.warnings).toBeUndefined()
    expect(json.id).toBe('card-1')
  })
})

describe('POST /api/admin/today — 새 카드 자동 값 고정', () => {
  it('유형이 있으면 시드와 비어 있는 색 키를 채워 저장하고, 같은 시드·빈도는 같은 값이다', async () => {
    state.usageRows = [{ bg_color_key: 'red' }, { bg_color_key: 'red' }, { bg_color_key: 'blue' }, { bg_color_key: null }]
    const body = { ...BASE_BODY, feed_type: 'hero_box', bg_color_key: null, chip_color_key: null, box_color_key: null, feed_seed: null }
    const res = await post(body)
    expect(res.status).toBe(200)
    const saved = state.inserts[0]
    expect(saved.feed_seed).toBe(12345)
    const direct = assignFeedColors({ seed: 12345, bgUsage: { red: 2, blue: 1 } })
    expect([saved.bg_color_key, saved.chip_color_key, saved.box_color_key]).toEqual([direct.bg, direct.chip, direct.box])
    // 칩 자리·기울기·모션 위치는 저장하지 않는다
    expect(saved.chips).toBeUndefined()
    expect(saved.collection_burst).toBeUndefined()
    // 게시 기간이 겹치는 카드를 센다
    expect(state.usageFilters).toContain(`lte:starts_at:${BASE_BODY.ends_at}`)
    expect(state.usageFilters).toContain(`gte:ends_at:${BASE_BODY.starts_at}`)

    // 같은 입력으로 한 번 더 저장하면 같은 값이다
    await post(body)
    expect(state.inserts[1]).toEqual(saved)
  })

  it('사용자가 고른 색과 시드는 덮어쓰지 않는다', async () => {
    const res = await post({ ...BASE_BODY, feed_type: 'text_box', bg_color_key: 'ref-pink', chip_color_key: null, box_color_key: null, feed_seed: 777 })
    expect(res.status).toBe(200)
    const saved = state.inserts[0]
    expect(saved.feed_seed).toBe(777)
    expect(saved.bg_color_key).toBe('ref-pink')
    expect(typeof saved.chip_color_key).toBe('string')
    expect(typeof saved.box_color_key).toBe('string')
  })

  it('유형이 비어 있으면(옛 7모양) 시드·색을 정하지 않고, 새 칸이 있으면 경고만 응답에 싣는다', async () => {
    const res = await post({ ...BASE_BODY, feed_type: null, bg_color_key: 'red', feed_seed: null })
    expect(res.status).toBe(200)
    expect(state.inserts[0]).toMatchObject({ feed_type: null, bg_color_key: 'red', feed_seed: null })
    expect(state.inserts[0].chip_color_key).toBeUndefined()
    expect(state.usageFilters).toHaveLength(0)
    const json = await res.json()
    expect(json.warnings).toHaveLength(1)
    expect(json.warnings[0]).toContain('유형이 비어')
  })

  it('목록형인데 항목이 없으면 저장은 하고 경고를 응답에 싣는다', async () => {
    const res = await post({ ...BASE_BODY, feed_type: 'gallery_list', list_items: null })
    expect(res.status).toBe(200)
    expect((await res.json()).warnings.some((warning: string) => warning.includes('항목이 없어요'))).toBe(true)
    expect(state.inserts).toHaveLength(1)
  })
})

describe('PATCH /api/admin/today/[id]', () => {
  it('개편 칸이 없는 옛 본문은 조회·검증 없이 이전과 똑같이 저장한다', async () => {
    const res = await patch({ title: '새 제목', image_source: 'upload' })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ title: '새 제목' }])
    expect(state.usageFilters).toHaveLength(0)
    // 기존 카드를 조회하지 않는다
    expect(state.selects).toHaveLength(0)
    expect((await res.json()).warnings).toBeUndefined()
  })

  it('잘못된 개편 칸은 400이다. 본문에 유형이 없으면 저장된 유형으로 칩 자리를 검증한다', async () => {
    state.existing = { feed_type: 'hero_box', feed_seed: 5, title: '문경새재에서 걷는 주말', bg_color_key: 'red', chip_color_key: 'blue', box_color_key: 'green' }
    const res = await patch({ chips: [{ kind: 'label', slot: 'badge-top-left' }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('쓸 수 없는 자리')
    expect(state.updates).toHaveLength(0)
  })

  it('본문에 제목이 없으면 저장된 제목으로 제목 칩 낱말을 검증한다', async () => {
    state.existing = { feed_type: 'text_box', feed_seed: 5, title: '문경새재에서 걷는 주말' }
    expect((await patch({ title_chip_words: ['문경새재'] })).status).toBe(200)
    expect((await patch({ title_chip_words: ['설악산'] })).status).toBe(400)
  })

  it('없는 카드는 404이다', async () => {
    state.existing = null
    const res = await patch({ feed_type: 'hero_box' })
    expect(res.status).toBe(404)
    expect(state.updates).toHaveLength(0)
  })

  it('이미 저장된 시드와 색은 다시 정하지 않는다(다른 시드를 보내도 바꾸지 않는다)', async () => {
    state.existing = { feed_type: 'hero_box', feed_seed: 5, title: '제목', bg_color_key: 'red-soft', chip_color_key: 'red', box_color_key: 'ref-lime', starts_at: BASE_BODY.starts_at, ends_at: BASE_BODY.ends_at }
    const res = await patch({ feed_type: 'hero_box', feed_seed: 999, bg_color_key: 'red-soft', chip_color_key: 'red', box_color_key: 'ref-lime', show_description: false })
    expect(res.status).toBe(200)
    const saved = state.updates[0]
    expect('feed_seed' in saved).toBe(false)
    expect(saved).toMatchObject({ bg_color_key: 'red-soft', chip_color_key: 'red', box_color_key: 'ref-lime', show_description: false })
    // 다시 정하지 않으니 사용 빈도도 조회하지 않는다
    expect(state.usageFilters).toHaveLength(0)
  })

  it('사용자가 색을 직접 바꾸면 그 값을 저장한다', async () => {
    state.existing = { feed_type: 'hero_box', feed_seed: 5, title: '제목', bg_color_key: 'red-soft', chip_color_key: 'red', box_color_key: 'ref-lime' }
    await patch({ feed_type: 'hero_box', bg_color_key: 'blue-soft' })
    expect(state.updates[0].bg_color_key).toBe('blue-soft')
    expect(state.usageFilters).toHaveLength(0)
  })

  it('유형은 있는데 시드가 비어 있는 카드의 색을 자동으로 되돌리면 쓴 시드를 함께 저장한다', async () => {
    state.existing = { feed_type: 'hero_box', feed_seed: null, title: '제목', bg_color_key: 'red-soft', chip_color_key: 'red', box_color_key: 'ref-lime', starts_at: BASE_BODY.starts_at, ends_at: BASE_BODY.ends_at }
    const res = await patch({ feed_type: 'hero_box', bg_color_key: null })
    expect(res.status).toBe(200)
    const saved = state.updates[0]
    // 홈은 저장된 시드로 같은 값을 그리므로 색을 정하는 데 쓴 시드가 저장돼야 어긋나지 않는다
    expect(saved.feed_seed).toBe(12345)
    const direct = assignFeedColors({ seed: 12345, fixed: { chip: 'red', box: 'ref-lime' }, bgUsage: {} })
    expect(saved.bg_color_key).toBe(direct.bg)
  })

  it('기존 카드에 처음 유형을 지정하며 시드가 없으면 시드와 비어 있는 색을 한 번 정한다', async () => {
    state.existing = { feed_type: null, feed_seed: null, title: '제목', bg_color_key: null, chip_color_key: null, box_color_key: null, starts_at: BASE_BODY.starts_at, ends_at: BASE_BODY.ends_at }
    state.usageRows = [{ bg_color_key: 'red' }]
    const res = await patch({ feed_type: 'hero_box', bg_color_key: null, chip_color_key: 'blue', box_color_key: null, feed_seed: null })
    expect(res.status).toBe(200)
    const saved = state.updates[0]
    expect(saved.feed_seed).toBe(12345)
    expect(saved.chip_color_key).toBe('blue')
    const direct = assignFeedColors({ seed: 12345, fixed: { chip: 'blue' }, bgUsage: { red: 1 } })
    expect([saved.bg_color_key, saved.box_color_key]).toEqual([direct.bg, direct.box])
    // 자기 자신은 빈도에서 뺀다
    expect(state.usageFilters).toContain('neq:id:card-1')
  })

  it('색을 자동(NULL)으로 되돌려 보내면 저장된 시드로 그 색만 다시 정한다', async () => {
    state.existing = { feed_type: 'hero_box', feed_seed: 5, title: '제목', bg_color_key: 'red-soft', chip_color_key: 'red', box_color_key: 'ref-lime', starts_at: BASE_BODY.starts_at, ends_at: BASE_BODY.ends_at }
    const res = await patch({ feed_type: 'hero_box', feed_seed: 5, bg_color_key: null, chip_color_key: 'red', box_color_key: 'ref-lime' })
    expect(res.status).toBe(200)
    const saved = state.updates[0]
    const direct = assignFeedColors({ seed: 5, fixed: { chip: 'red', box: 'ref-lime' } })
    expect(saved.bg_color_key).toBe(direct.bg)
    expect('feed_seed' in saved).toBe(false)
    expect(saved.chip_color_key).toBe('red')
    expect(saved.box_color_key).toBe('ref-lime')
  })

  it('유형을 비우는 저장은 시드·색을 새로 정하지 않는다', async () => {
    state.existing = { feed_type: 'hero_box', feed_seed: 5, title: '제목', bg_color_key: 'red-soft', chip_color_key: null, box_color_key: null }
    await patch({ feed_type: null, bg_color_key: null, chip_color_key: null, box_color_key: null })
    const saved = state.updates[0]
    for (const key of COLOR_KEYS) expect(saved[key], key).toBeNull()
    expect(saved.feed_type).toBeNull()
  })
})

describe('커버 대표 색 저장 (티켓 20261121_1724)', () => {
  it('POST: 커버 이미지가 있으면 대표 색을 같은 insert에 담는다', async () => {
    extractMock.mockResolvedValue(['#ff8800', '#2244aa'])
    const res = await post({ ...BASE_BODY, cover_image_url: COVER_A })
    expect(res.status).toBe(200)
    expect(extractMock).toHaveBeenCalledWith(COVER_A)
    expect(state.inserts[0]).toMatchObject({ cover_image_url: COVER_A, cover_colors: ['#ff8800', '#2244aa'] })
  })

  it('POST: 추출이 실패해도 저장은 성공하고 cover_colors를 싣지 않는다', async () => {
    extractMock.mockResolvedValue(null)
    const res = await post({ ...BASE_BODY, cover_image_url: COVER_A })
    expect(res.status).toBe(200)
    expect('cover_colors' in state.inserts[0]).toBe(false)
  })

  it('POST: 커버 이미지가 없으면 추출하지 않는다', async () => {
    await post({ ...BASE_BODY })
    expect(extractMock).not.toHaveBeenCalled()
    expect('cover_colors' in state.inserts[0]).toBe(false)
  })

  it('PATCH: 커버 주소가 바뀌면 대표 색을 같은 update에 담는다', async () => {
    state.existing = { cover_image_url: COVER_A, title: '제목' }
    extractMock.mockResolvedValue(['#00aa55'])
    const res = await patch({ cover_image_url: COVER_B })
    expect(res.status).toBe(200)
    expect(extractMock).toHaveBeenCalledWith(COVER_B)
    expect(state.updates[0]).toMatchObject({ cover_image_url: COVER_B, cover_colors: ['#00aa55'], image_source: null })
  })

  it('PATCH: 커버 주소가 그대로면 추출하지 않고 cover_colors를 건드리지 않는다', async () => {
    state.existing = { cover_image_url: COVER_A, title: '제목' }
    await patch({ cover_image_url: COVER_A, title: '새 제목' })
    expect(extractMock).not.toHaveBeenCalled()
    expect('cover_colors' in state.updates[0]).toBe(false)
  })

  it('PATCH: 본문에 커버 주소가 없으면 추출하지 않는다', async () => {
    await patch({ title: '새 제목' })
    expect(extractMock).not.toHaveBeenCalled()
    expect('cover_colors' in state.updates[0]).toBe(false)
  })

  it('PATCH: 바뀐 주소의 추출이 실패해도 저장은 성공하고 cover_colors를 싣지 않는다(트리거가 NULL로 비운다)', async () => {
    state.existing = { cover_image_url: COVER_A, title: '제목' }
    extractMock.mockRejectedValue(new Error('boom'))
    const res = await patch({ cover_image_url: COVER_B })
    expect(res.status).toBe(200)
    expect('cover_colors' in state.updates[0]).toBe(false)
  })
})
