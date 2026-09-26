/**
 * POST /api/admin/missions — condition_text 통과(티켓 20260927_0026).
 * 저장 라우트가 새 칸을 떨어뜨리지 않고 insert 값에 그대로 싣는지 고정한다. DB는 기록형 스텁이다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/missions/route.condition-text.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
}))

const fakeClient = {
  from: () => ({
    insert: (row: Record<string, unknown>) => {
      state.inserts.push(row)
      return { select: () => ({ single: () => Promise.resolve({ data: { id: 'new', ...row }, error: null }) }) }
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
}))

const { POST } = await import('./route')

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

const base = {
  title: '테스트 미션',
  mission_type: 'distance',
  condition_json: { distance_km: 10, activity_type: 'running' },
  reward_badge_ids: [],
  starts_at: '2026-09-27T00:00:00.000Z',
}

beforeEach(() => {
  state.inserts = []
})

describe('POST /api/admin/missions — condition_text 통과', () => {
  it('condition_text를 insert 값에 그대로 싣는다', async () => {
    const res = await post({ ...base, condition_text: '2주 안에 80km 달리기' })
    expect(res.status).toBe(200)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].condition_text).toBe('2주 안에 80km 달리기')
  })

  it('condition_text를 null로 보내면 null로 저장한다', async () => {
    const res = await post({ ...base, condition_text: null })
    expect(res.status).toBe(200)
    expect(state.inserts[0].condition_text).toBeNull()
  })
})
