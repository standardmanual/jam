/**
 * GET /api/drops/poi/[poiId] — 장소의 픽업 가능 드랍 목록 (티켓 20261018_1812)
 *
 * 고정하는 것:
 * - 꺼진 장소(`poi.is_active = false`)는 드랍이 남아 있어도 빈 목록이고 드랍을 조회하지 않는다. 다시 켜면 목록에 돌아온다.
 * - 잠긴 개체는 서버에서 이름·그림·일련번호·배지 id를 비우고 «잠김 표시 + 등급»만 싣는다. 직렬화한 응답 어디에도 원래 값이 없다(7.3절).
 * - 열린 개체는 이전과 같은 모양이다.
 * - 드랍한 유저 이름(티켓 20261021_1249 2회, 운영 로직 17.2절): 유저 드랍인데 드랍한 유저가 지워졌으면 탈퇴 표기, 시스템 드랍은 «익명», 살아 있는 유저는 이름.
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/drops/poi/[poiId]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { d } from '@/lib/i18n'

const USER_ID = 'user-1'

const SECRET_BADGE_ID = 'badge-secret-id'
const SECRET_NAME = '비밀배지이름'
const SECRET_IMAGE = 'https://img.example/secret.png'
const SECRET_PREFIX = 'ZQX'
const SECRET_SERIAL = 424242

type Row = {
  id: string
  badge_id: string
  dropped_at: string
  dropper_user_id: string | null
  source: 'user' | 'system'
  badges: { name: string; rarity: string; image_url: string | null }
  inventory_items: {
    serial_prefix: string | null
    serial_number: number
    expires_at: string | null
    locked: boolean | null
    unlock_required: number | null
  } | null
}

const state = vi.hoisted(() => ({
  authenticated: true,
  poi: { is_active: true } as { is_active: boolean } | null,
  poiError: null as unknown,
  rows: [] as unknown[],
  dropReads: 0,
  dropSelect: '',
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      builder.select = (columns: string) => {
        if (table === 'poi_drops') state.dropSelect = columns
        return builder
      }
      builder.eq = () => builder
      builder.in = () => builder
      builder.order = () => builder
      if (table === 'poi') {
        builder.maybeSingle = async () => ({ data: state.poi, error: state.poiError })
        return builder
      }
      if (table === 'poi_drops') {
        state.dropReads += 1
        builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: state.rows, error: null })
        return builder
      }
      if (table === 'users') {
        builder.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: [{ id: 'dropper-1', username: 'runner', display_name: '러너' }], error: null })
        return builder
      }
      throw new Error(`예상하지 못한 테이블: ${table}`)
    },
  }),
}))

import { GET } from '../route'

const get = () =>
  GET(new NextRequest('http://localhost/api/drops/poi/poi-1'), { params: Promise.resolve({ poiId: 'poi-1' }) })

function row(overrides: Partial<Row> & { locked: boolean }): Row {
  const { locked, ...rest } = overrides
  return {
    id: 'drop-1',
    badge_id: SECRET_BADGE_ID,
    dropped_at: '2026-10-18T00:00:00Z',
    dropper_user_id: 'dropper-1',
    source: 'user',
    badges: { name: SECRET_NAME, rarity: 'epic', image_url: SECRET_IMAGE },
    inventory_items: {
      serial_prefix: SECRET_PREFIX,
      serial_number: SECRET_SERIAL,
      expires_at: null,
      locked,
      unlock_required: locked ? 110 : null,
    },
    ...rest,
  }
}

beforeEach(() => {
  state.authenticated = true
  state.poi = { is_active: true }
  state.poiError = null
  state.rows = []
  state.dropReads = 0
  state.dropSelect = ''
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/drops/poi/[poiId] — 기본', () => {
  it('비로그인은 401이다', async () => {
    state.authenticated = false
    const res = await get()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.drops.sessionExpired })
  })

  it('장소 조회가 실패하면 500이고 원문 오류를 싣지 않는다', async () => {
    state.poiError = { message: 'secret db detail' }
    const res = await get()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.drops.loadDropsFailed })
  })
})

describe('꺼진 장소', () => {
  it('드랍이 남아 있어도 빈 목록이고 드랍을 조회하지 않는다', async () => {
    state.poi = { is_active: false }
    state.rows = [row({ locked: false })]

    const res = await get()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ drops: [] })
    expect(state.dropReads).toBe(0)
  })

  it('다시 켜면 같은 드랍이 목록에 돌아온다', async () => {
    state.rows = [row({ locked: false })]
    state.poi = { is_active: false }
    expect(await (await get()).json()).toEqual({ drops: [] })

    state.poi = { is_active: true }
    const body = await (await get()).json()
    expect(body.drops).toHaveLength(1)
    expect(body.drops[0].id).toBe('drop-1')
  })

  it('장소가 없으면 빈 목록이다(이전 동작 그대로)', async () => {
    state.poi = null
    const res = await get()
    expect(await res.json()).toEqual({ drops: [] })
    expect(state.dropReads).toBe(0)
  })
})

describe('잠긴 개체 가림 (운영 로직 7.3절)', () => {
  it('이름·그림·일련번호·배지 id를 비우고 잠김 표시와 등급만 싣는다', async () => {
    state.rows = [row({ locked: true })]

    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    const [drop] = body.drops

    expect(drop).toMatchObject({
      id: 'drop-1',
      badge_id: 'locked:epic',
      badge_name: d.lockedItem.card.name,
      badge_rarity: 'epic',
      badge_image_url: null,
      serial: null,
      serial_prefix: null,
      serial_number: null,
      locked: true,
      unlock_required: 110,
    })
  })

  it('직렬화한 응답 어디에도 원래 이름·그림·배지 id·일련번호가 없다', async () => {
    state.rows = [row({ locked: true })]

    const raw = JSON.stringify(await (await get()).json())

    for (const secret of [SECRET_NAME, SECRET_IMAGE, SECRET_BADGE_ID, SECRET_PREFIX, String(SECRET_SERIAL), '424242']) {
      expect(raw, `응답에 ${secret}가 있다`).not.toContain(secret)
    }
  })

  it('등급이 다른 잠긴 개체는 같은 묶음 키로 섞이지 않는다', async () => {
    state.rows = [
      row({ locked: true, id: 'a' }),
      row({ locked: true, id: 'b', badges: { name: 'x', rarity: 'common', image_url: null } }),
    ]

    const { drops } = await (await get()).json()

    expect(drops.map((x: { badge_id: string }) => x.badge_id)).toEqual(['locked:epic', 'locked:common'])
  })

  it('열린 개체는 이름·그림·일련번호를 그대로 싣는다', async () => {
    state.rows = [row({ locked: false })]

    const { drops } = await (await get()).json()

    expect(drops[0]).toMatchObject({
      badge_id: SECRET_BADGE_ID,
      badge_name: SECRET_NAME,
      badge_image_url: SECRET_IMAGE,
      serial: `${SECRET_PREFIX}${String(SECRET_SERIAL).padStart(6, '0')}`,
      serial_prefix: SECRET_PREFIX,
      serial_number: SECRET_SERIAL,
    })
    expect(drops[0]).not.toHaveProperty('locked')
  })
})

describe('드랍한 유저 이름 (운영 로직 17.2절)', () => {
  it('살아 있는 유저의 드랍은 그 이름이다', async () => {
    state.rows = [row({ locked: false })]

    const { drops } = await (await get()).json()

    expect(drops[0].dropper_name).toBe('러너')
  })

  it('유저 드랍인데 드랍한 유저가 지워졌으면 탈퇴 표기다', async () => {
    state.rows = [row({ locked: false, dropper_user_id: null, source: 'user' })]

    const { drops } = await (await get()).json()

    expect(drops[0].dropper_name).toBe(d.withdrawnUser.name)
  })

  it('시스템 드랍은 원래 드랍한 유저가 없으므로 «익명»이다', async () => {
    state.rows = [row({ locked: false, dropper_user_id: null, source: 'system' })]

    const { drops } = await (await get()).json()

    expect(drops[0].dropper_name).toBe(d.drops.anonymous)
  })

  it('잠긴 개체의 응답에서도 같다', async () => {
    state.rows = [
      row({ locked: true, id: 'a', dropper_user_id: null, source: 'user' }),
      row({ locked: true, id: 'b', dropper_user_id: null, source: 'system' }),
    ]

    const { drops } = await (await get()).json()

    expect(drops.map((x: { dropper_name: string }) => x.dropper_name)).toEqual([d.withdrawnUser.name, d.drops.anonymous])
  })

  it('드랍 목록에서 source 칸을 함께 읽는다', async () => {
    // select가 source를 빠뜨리면 모든 탈퇴 드랍이 «익명»으로 보인다 — 시스템 드랍과 구분하는 근거 칸이다
    state.rows = [row({ locked: false })]

    await get()

    expect(state.dropSelect).toContain('source')
  })
})
