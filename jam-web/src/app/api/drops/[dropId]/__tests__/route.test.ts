/**
 * GET /api/drops/[dropId] — 단일 드랍 정보 (티켓 20261018_1812)
 *
 * 고정하는 것: 잠긴 개체는 이름·그림·일련번호를 싣지 않고 «잠김 표시 + 등급»만 싣는다(7.3절). 열린 개체는 이전과 같다.
 * 드랍한 유저 이름(티켓 20261021_1249 2회, 운영 로직 17.2절): 유저 드랍인데 드랍한 유저가 지워졌으면 탈퇴 표기, 시스템 드랍은 «익명», 살아 있는 유저는 이름.
 * 잠긴 개체의 응답에서도 같다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/drops/[dropId]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { d } from '@/lib/i18n'

const USER_ID = 'user-1'
const SECRET_NAME = '비밀배지이름'
const SECRET_IMAGE = 'https://img.example/secret.png'
const SECRET_PREFIX = 'ZQX'

const state = vi.hoisted(() => ({
  authenticated: true,
  locked: false,
  dropperUserId: 'dropper-1' as string | null,
  source: 'user' as 'user' | 'system',
  users: { username: 'runner', display_name: '러너' } as { username: string; display_name: string | null } | null,
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
    from: () => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.single = async () => ({
        data: {
          id: 'drop-1',
          poi_id: 'poi-1',
          dropped_at: '2026-10-18T00:00:00Z',
          is_available: true,
          dropper_user_id: state.dropperUserId,
          source: state.source,
          badges: { name: SECRET_NAME, rarity: 'epic', image_url: SECRET_IMAGE },
          users: state.users,
          inventory_items: { serial_prefix: SECRET_PREFIX, serial_number: 424242, locked: state.locked },
        },
        error: null,
      })
      return builder
    },
  }),
}))

import { GET } from '../route'

const get = () =>
  GET(new NextRequest('http://localhost/api/drops/drop-1'), { params: Promise.resolve({ dropId: 'drop-1' }) })

beforeEach(() => {
  state.authenticated = true
  state.locked = false
  state.dropperUserId = 'dropper-1'
  state.source = 'user'
  state.users = { username: 'runner', display_name: '러너' }
})

describe('GET /api/drops/[dropId]', () => {
  it('비로그인은 401이다', async () => {
    state.authenticated = false
    const res = await get()
    expect(res.status).toBe(401)
  })

  it('열린 개체는 이름·그림·일련번호를 싣는다', async () => {
    const body = await (await get()).json()
    expect(body).toMatchObject({
      badge_name: SECRET_NAME,
      badge_image_url: SECRET_IMAGE,
      serial: `${SECRET_PREFIX}424242`,
    })
    expect(body).not.toHaveProperty('locked')
  })

  it('잠긴 개체는 잠김 표시와 등급만 싣고 직렬화한 응답 어디에도 원래 값이 없다', async () => {
    state.locked = true

    const body = await (await get()).json()

    expect(body).toMatchObject({
      badge_name: d.lockedItem.card.name,
      badge_rarity: 'epic',
      badge_image_url: null,
      serial: null,
      locked: true,
    })
    const raw = JSON.stringify(body)
    for (const secret of [SECRET_NAME, SECRET_IMAGE, SECRET_PREFIX, '424242']) {
      expect(raw, `응답에 ${secret}가 있다`).not.toContain(secret)
    }
  })
})

describe('GET /api/drops/[dropId] — 드랍한 유저 이름', () => {
  it('살아 있는 유저의 드랍은 그 이름이다', async () => {
    const body = await (await get()).json()
    expect(body.dropper_name).toBe('러너')
  })

  it('유저 드랍인데 드랍한 유저가 지워졌으면 탈퇴 표기다', async () => {
    state.dropperUserId = null
    state.users = null
    const body = await (await get()).json()
    expect(body.dropper_name).toBe(d.withdrawnUser.name)
  })

  it('시스템 드랍은 원래 드랍한 유저가 없으므로 «익명»이다', async () => {
    state.dropperUserId = null
    state.users = null
    state.source = 'system'
    const body = await (await get()).json()
    expect(body.dropper_name).toBe(d.drops.anonymous)
  })

  it('잠긴 개체의 응답에서도 같다', async () => {
    state.locked = true
    state.dropperUserId = null
    state.users = null
    const body = await (await get()).json()
    expect(body.locked).toBe(true)
    expect(body.dropper_name).toBe(d.withdrawnUser.name)
  })
})
