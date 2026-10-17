/**
 * GET /api/inventory/items — 드랍 후보 목록의 잠긴 개체 가림 (티켓 20261018_0051 2회, 운영 로직 7.3절)
 *
 * 고정하는 것:
 *  - 잠긴 개체는 배지 id·이름·그림·일련번호 접두사를 내리지 않고 «잠김 표시 + 등급 + 필요한 양»만 싣는다.
 *    이름 자리에는 서버가 `d.lockedItem.card.name`을 넣어 목록 행이 빈 줄이 되지 않는다.
 *  - 열린 개체는 기존 응답과 같다(`locked` 키가 없다).
 *  - 실제 DB를 부르지 않는다: Supabase 클라이언트는 가짜다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/inventory/items/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
  createServiceClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.is = () => builder
      builder.order = async () => ({ data: state.rows, error: null })
      return builder
    },
  }),
}))
vi.mock('@/lib/inventory/get-or-create', () => ({ getOrCreateInventoryId: async () => 'inv-1' }))

import { GET } from '../route'

const openRow = {
  id: 'item-open',
  badge_id: 'badge-open',
  dropped_at: null,
  serial_prefix: 'WND',
  serial_number: 7,
  expires_at: null,
  locked: false,
  unlock_required: null,
  badges: { name: '바람의 깃', rarity: 'rare', image_url: 'https://img/open.png', deleted_at: null },
}

const lockedRow = {
  id: 'item-locked',
  badge_id: 'badge-secret',
  dropped_at: null,
  serial_prefix: 'SCR',
  serial_number: 3,
  expires_at: null,
  locked: true,
  unlock_required: 60,
  badges: { name: '비밀 배지', rarity: 'rare', image_url: 'https://img/secret.png', deleted_at: null },
}

beforeEach(() => {
  state.rows = []
})

describe('GET /api/inventory/items', () => {
  it('잠긴 개체의 응답에는 배지 id·이름·그림·접두사가 없고 잠김 표시와 등급만 있다', async () => {
    state.rows = [lockedRow]

    const body = (await (await GET()).json()) as { items: Record<string, unknown>[] }

    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toEqual({
      id: 'item-locked',
      badge_id: 'locked:rare',
      badge_name: d.lockedItem.card.name,
      badge_rarity: 'rare',
      badge_image_url: null,
      serial_prefix: null,
      serial_number: 3,
      expires_at: null,
      locked: true,
      unlock_required: 60,
    })
    const raw = JSON.stringify(body)
    for (const secret of ['비밀 배지', 'badge-secret', 'secret.png', 'SCR']) expect(raw).not.toContain(secret)
  })

  it('열린 개체는 기존 응답 그대로다', async () => {
    state.rows = [openRow]

    const body = (await (await GET()).json()) as { items: Record<string, unknown>[] }

    expect(body.items[0]).toEqual({
      id: 'item-open',
      badge_id: 'badge-open',
      badge_name: '바람의 깃',
      badge_rarity: 'rare',
      badge_image_url: 'https://img/open.png',
      serial_prefix: 'WND',
      serial_number: 7,
      expires_at: null,
    })
  })

  it('등급이 다른 잠긴 개체는 묶음 키가 다르다(드랍 목록이 badge_id로 묶는다)', async () => {
    state.rows = [
      lockedRow,
      { ...lockedRow, id: 'item-locked-2', badges: { ...lockedRow.badges, rarity: 'epic' } },
    ]

    const body = (await (await GET()).json()) as { items: { badge_id: string }[] }

    expect(body.items.map((i) => i.badge_id)).toEqual(['locked:rare', 'locked:epic'])
  })
})
