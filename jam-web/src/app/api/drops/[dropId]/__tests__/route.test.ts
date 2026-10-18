/**
 * GET /api/drops/[dropId] — 단일 드랍 정보 (티켓 20261018_1812)
 *
 * 고정하는 것: 잠긴 개체는 이름·그림·일련번호를 싣지 않고 «잠김 표시 + 등급»만 싣는다(7.3절). 열린 개체는 이전과 같다.
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

const state = vi.hoisted(() => ({ authenticated: true, locked: false }))

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
          dropper_user_id: 'dropper-1',
          badges: { name: SECRET_NAME, rarity: 'epic', image_url: SECRET_IMAGE },
          users: { username: 'runner', display_name: '러너' },
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
