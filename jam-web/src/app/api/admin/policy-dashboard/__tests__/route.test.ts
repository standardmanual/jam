import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const authState = vi.hoisted(() => ({
  isAdmin: true,
}))

vi.mock('@/lib/admin/auth', () => ({
  getAdminUser: async () => (authState.isAdmin ? { id: 'admin-1', email: 'admin@jam.test' } : null),
}))

const updateSpies = vi.hoisted(() => ({
  updateAbusingPolicy: vi.fn().mockResolvedValue(undefined),
  updateInventoryMaxSlots: vi.fn().mockResolvedValue(1),
  updateCombinePolicy: vi.fn().mockResolvedValue(undefined),
  updateAmbientDropConfig: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/abusing/policy', () => ({
  getAbusingPolicy: async () => ({ vehicle_speed_filter_kmh: 60 }),
  updateAbusingPolicy: updateSpies.updateAbusingPolicy,
  MIN_VEHICLE_SPEED_FILTER_KMH: 20,
}))

vi.mock('@/lib/jam/policy', () => ({
  getJamPolicy: async () => ({ intensity_light: 1, intensity_normal: 2, intensity_hard: 3 }),
  VALIDATORS: {
    intensity_light: (n: number) => n >= 0,
    intensity_normal: (n: number) => n >= 0,
    intensity_hard: (n: number) => n >= 0,
  },
}))

vi.mock('@/lib/combine/policy', () => ({
  getCombinePolicy: async () => ({ fail_reward_points: 10 }),
  updateCombinePolicy: updateSpies.updateCombinePolicy,
}))

vi.mock('@/lib/inventory/policy', () => ({
  getInventoryPolicy: async () => ({ max_slots: 50 }),
  updateInventoryMaxSlots: updateSpies.updateInventoryMaxSlots,
}))

vi.mock('@/lib/ambient-drop/config', () => ({
  getAmbientDropConfig: async () => ({ schedule_hour_kst: 9, max_active_per_poi: 3 }),
  updateAmbientDropConfig: updateSpies.updateAmbientDropConfig,
}))

vi.mock('@/lib/capsule/policy', () => ({
  getCapsulePolicy: async () => ({ guaranteed_count: 1 }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  }),
}))

const { GET } = await import('../route')
const { PUT } = await import('../field/route')

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

  it('차량 속도 필터를 20km/h 미만으로 수정하려 하면 400 오류를 반환한다', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/policy-dashboard/field', {
      method: 'PUT',
      body: JSON.stringify({
        target: 'abusing_policy',
        field: 'vehicle_speed_filter_kmh',
        value: 15,
      }),
    })

    const res = await PUT(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('20km/h 이상')
    expect(updateSpies.updateAbusingPolicy).not.toHaveBeenCalled()
  })

  it('유효한 차량 속도 필터(30km/h) 수정 요청은 성공한다', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/policy-dashboard/field', {
      method: 'PUT',
      body: JSON.stringify({
        target: 'abusing_policy',
        field: 'vehicle_speed_filter_kmh',
        value: 30,
      }),
    })

    const res = await PUT(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(updateSpies.updateAbusingPolicy).toHaveBeenCalledWith({
      vehicle_speed_filter_kmh: 30,
    })
  })

  it('인벤토리 슬롯을 0 이하로 설정하려 하면 400 오류를 반환한다', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/policy-dashboard/field', {
      method: 'PUT',
      body: JSON.stringify({
        target: 'inventory_policy',
        field: 'max_slots',
        value: 0,
      }),
    })

    const res = await PUT(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('1 이상의 정수')
  })

  it('유효한 인벤토리 슬롯(60) 수정 요청은 성공한다', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/policy-dashboard/field', {
      method: 'PUT',
      body: JSON.stringify({
        target: 'inventory_policy',
        field: 'max_slots',
        value: 60,
      }),
    })

    const res = await PUT(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(updateSpies.updateInventoryMaxSlots).toHaveBeenCalledWith(60)
  })
})
