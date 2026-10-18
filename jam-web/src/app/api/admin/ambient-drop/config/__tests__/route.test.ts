/**
 * 어드민 정기 배포 설정 저장 라우트 — `all_random`을 새로 쓰지 않는다 (티켓 20261018_1813)
 *
 * 엔진이 «전체 무작위»를 더는 보지 않는다. 옛 프로덕션 코드가 읽는 칸이라 DB 값은 그대로 두고, 본문에 들어와도 받지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/ambient-drop/config/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  admin: { id: 'admin-1', email: 'admin@example.com' } as { id: string; email: string } | null,
  current: {} as Record<string, unknown>,
  update: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => state.admin }))
vi.mock('@/lib/ambient-drop/config', () => ({
  getAmbientDropConfig: async () => state.current,
  updateAmbientDropConfig: (...args: unknown[]) => state.update(...args),
}))

import { PUT } from '../route'

function put(body: unknown): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/ambient-drop/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  state.admin = { id: 'admin-1', email: 'admin@example.com' }
  state.current = {
    auto_enabled: false,
    all_random: true,
    schedule_hour_kst: 3,
    exclusion_window_minutes: 15,
    category_mode: 'random',
    category_slug: null,
    rarity_mode: 'explicit',
    rarity_common: 1,
    rarity_rare: 0,
    rarity_epic: 0,
    rarity_mystic: 0,
    collection_mode: 'explicit',
    collection_ids: [],
    batch_size: 30,
    max_active_per_poi: 1,
  }
})

describe('PUT /api/admin/ambient-drop/config', () => {
  it('본문의 all_random은 받지 않고 DB의 현재 값을 그대로 둔다', async () => {
    const res = await PUT(put({ ...state.current, all_random: false, batch_size: 10 }))

    expect(res.status).toBe(200)
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(state.update.mock.calls[0][0]).toMatchObject({ all_random: true, batch_size: 10 })
  })

  it('본문에 all_random이 없어도 저장된다', async () => {
    const { all_random: _omit, ...body } = state.current
    void _omit
    const res = await PUT(put(body))

    expect(res.status).toBe(200)
    expect(state.update.mock.calls[0][0]).toMatchObject({ all_random: true })
  })

  it('비관리자는 403이고 저장하지 않는다', async () => {
    state.admin = null
    const res = await PUT(put({}))

    expect(res.status).toBe(403)
    expect(state.update).not.toHaveBeenCalled()
  })
})
