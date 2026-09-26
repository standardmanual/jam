/**
 * POST /api/admin/badges/export — 배지 조회 DB 오류는 500과 한국어 안내로 알린다(티켓 20260924_1405).
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/export/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const dbError = vi.hoisted(() => ({ message: 'connection reset' }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: null, error: dbError }) }) }),
  }),
}))
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: async () => null }))

const { POST } = await import('../route')

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/admin/badges/export', () => {
  it('DB 오류면 500과 한국어 안내를 돌려주고 DB 원문은 노출하지 않는다', async () => {
    const res = await POST(
      new NextRequest('https://j-a-m.app/api/admin/badges/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['a'] }),
      })
    )
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/^배지를 내보내지 못했어요\./)
    expect(body.error).not.toContain('connection reset')
  })
})
