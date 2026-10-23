import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const authState = vi.hoisted(() => ({
  isAdmin: true,
}))

vi.mock('@/lib/admin/auth', () => ({
  getAdminUser: async () => (authState.isAdmin ? { id: 'admin-1', email: 'admin@jam.test' } : null),
}))

vi.mock('@/lib/abusing/policy', () => ({
  getAbusingPolicy: async () => ({ vehicle_speed_filter_kmh: 60 }),
}))

vi.mock('@/lib/jam/policy', () => ({
  getJamPolicy: async () => ({ intensity_light: 1, intensity_normal: 2, intensity_hard: 3 }),
}))

vi.mock('@/lib/combine/policy', () => ({
  getCombinePolicy: async () => ({ fail_reward_points: 10 }),
}))

vi.mock('@/lib/inventory/policy', () => ({
  getInventoryPolicy: async () => ({ max_slots: 50 }),
}))

vi.mock('@/lib/ambient-drop/config', () => ({
  getAmbientDropConfig: async () => ({ schedule_hour_kst: 9, max_active_per_poi: 3 }),
}))

vi.mock('@/lib/capsule/policy', () => ({
  getCapsulePolicy: async () => ({ guaranteed_count: 1 }),
}))

const routeModule = await import('../route')
const { GET } = routeModule

describe('/api/admin/policy-dashboard API 라우트 검증', () => {
  beforeEach(() => {
    authState.isAdmin = true
    vi.clearAllMocks()
  })

  it('비인가 사용자의 GET 요청은 403 Forbidden을 반환한다', async () => {
    authState.isAdmin = false
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('관리자의 GET 요청은 200과 정책 목록 및 실시간 값을 반환한다', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.policies.length).toBeGreaterThan(10)
    expect(data.liveValues.vehicle_speed_filter_kmh).toBe(60)
    expect(data.liveValues.max_slots).toBe(50)
  })
})

// 정책 값을 바꾸는 일은 설정 화면(밸런스 설정 등)만 한다. 대시보드에는 저장 경로가 없다(티켓 20261022_1717).
describe('정책 대시보드에는 값을 저장하는 경로가 없다', () => {
  it('저장 라우트 파일(field/route.ts)이 없다', () => {
    const fieldRoute = fileURLToPath(new URL('../field/route.ts', import.meta.url))
    expect(existsSync(fieldRoute)).toBe(false)
  })

  it('정책 대시보드 라우트는 읽기(GET)만 내보낸다', () => {
    const methods = Object.keys(routeModule).filter((name) =>
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(name),
    )
    expect(methods).toEqual([])
  })

  it('대시보드 화면 코드가 저장 경로를 부르지 않는다', () => {
    const clientPath = fileURLToPath(
      new URL('../../../../../components/admin/policyDashboard/PolicyDashboardClient.tsx', import.meta.url),
    )
    const source = readFileSync(clientPath, 'utf-8')
    expect(source).not.toContain('/api/admin/policy-dashboard/field')
    expect(source).not.toContain("method: 'PUT'")
  })
})
