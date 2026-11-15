/**
 * GET /api/badge-images/warmup — 곧 열 화면의 배지 그림 원본 주소 목록 (티켓 20261115_1344)
 *
 * 고정하는 것: 비로그인 401 · 잠긴 개체·드랍/슬롯 개체·삭제된 배지·null·중복 제외 · 배지함은 앞 12칸 · 합쳐서 42개 상한.
 * 실제 DB를 부르지 않는다: Supabase 클라이언트는 가짜다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/badge-images/warmup/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  inventoryItems: [] as Record<string, unknown>[],
  earned: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.maybeSingle = async () => ({ data: { id: 'inv-1', inventory_items: state.inventoryItems }, error: null })
      builder.order = async () => ({ data: table === 'user_activity_badges' ? state.earned : [], error: null })
      return builder
    },
  }),
}))

import { GET } from '../route'

const item = (n: string, over: Record<string, unknown> = {}) => ({
  id: `item-${n}`,
  dropped_at: null,
  slotted_in: null,
  locked: false,
  badge: { image_url: `https://img/${n}.png`, deleted_at: null },
  ...over,
})

const earned = (n: number, over: Record<string, unknown> = {}) => ({
  id: `earn-${n}`,
  earned_at: `2026-11-${String(n).padStart(2, '0')}`,
  badge: { id: `b${n}`, type: 'activity', rarity: 'common', deleted_at: null, image_url: `https://img/act-${n}.png`, level: null, family_key: null },
  ...over,
})

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.inventoryItems = []
  state.earned = []
})

describe('GET /api/badge-images/warmup', () => {
  it('로그인하지 않았으면 401과 { error }', async () => {
    state.user = null
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
  })

  it('잠긴 개체·드랍·슬롯 개체·삭제된 배지·주소 없는 배지는 뺀다', async () => {
    state.inventoryItems = [
      item('ok'),
      item('locked', { locked: true }),
      item('dropped', { dropped_at: '2026-11-01' }),
      item('slotted', { slotted_in: 'slot-1' }),
      item('deleted', { badge: { image_url: 'https://img/deleted.png', deleted_at: '2026-11-01' } }),
      item('null', { badge: { image_url: null, deleted_at: null } }),
    ]
    const body = (await (await GET()).json()) as { urls: string[] }
    expect(body.urls).toEqual(['https://img/ok.png'])
  })

  it('같은 그림은 한 번만 담는다', async () => {
    state.inventoryItems = [item('a'), item('a', { id: 'item-a2' })]
    const body = (await (await GET()).json()) as { urls: string[] }
    expect(body.urls).toEqual(['https://img/a.png'])
  })

  it('배지함은 activity 타입만, 앞 12칸까지', async () => {
    state.earned = [
      ...Array.from({ length: 20 }, (_, i) => earned(i + 1)),
      earned(99, { badge: { id: 'c', type: 'checkin', deleted_at: null, image_url: 'https://img/checkin.png' } }),
    ]
    const body = (await (await GET()).json()) as { urls: string[] }
    expect(body.urls).toHaveLength(12)
    expect(body.urls[0]).toBe('https://img/act-1.png')
    expect(body.urls).not.toContain('https://img/checkin.png')
  })

  it('레벨형은 계열당 가장 높은 레벨 한 장만 남긴다(화면과 같은 접기)', async () => {
    const lv = (n: number, level: number) =>
      earned(n, { badge: { id: `l${n}`, type: 'activity', rarity: null, name: '달리기', family_key: 'run', level, deleted_at: null, image_url: `https://img/lv-${level}.png` } })
    state.earned = [lv(3, 1), lv(2, 3), lv(1, 2)]
    const body = (await (await GET()).json()) as { urls: string[] }
    expect(body.urls).toEqual(['https://img/lv-3.png'])
  })

  it('합쳐서 42개를 넘기지 않는다', async () => {
    state.inventoryItems = Array.from({ length: 60 }, (_, i) => item(`i${i}`))
    state.earned = Array.from({ length: 20 }, (_, i) => earned(i + 1))
    const body = (await (await GET()).json()) as { urls: string[] }
    expect(body.urls).toHaveLength(42)
  })
})
