/**
 * abusing/policy — 차량 속도 필터에 실제로 적용할 상한 해석 (티켓 20261001_0633)
 *
 * 동기화(`sync.ts`)와 JAM! 행동 지표의 「활동한 날」 판정(`jamActionDayMetrics.ts`)이 같은 규칙을 쓰도록
 * 비정상 값 폴백을 `effectiveVehicleSpeedFilterKmh` 한 곳에 모았다. 동기화 쪽 동작·로그는
 * `strava/__tests__/sync-vehicle-speed-filter.test.ts`가 그대로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/effective-vehicle-speed-filter.test.ts
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn() }))

import { DEFAULT_POLICY, effectiveVehicleSpeedFilterKmh } from '../policy'

describe('effectiveVehicleSpeedFilterKmh', () => {
  it('유한하고 0보다 크면 정책 값 그대로다', () => {
    expect(effectiveVehicleSpeedFilterKmh({ vehicle_speed_filter_kmh: 45 })).toBe(45)
    expect(effectiveVehicleSpeedFilterKmh({ vehicle_speed_filter_kmh: 80.5 })).toBe(80.5)
    expect(effectiveVehicleSpeedFilterKmh({ vehicle_speed_filter_kmh: 0.1 })).toBe(0.1)
  })

  it('0 · 음수 · NaN · 무한대면 기본값으로 폴백한다', () => {
    const fallback = DEFAULT_POLICY.vehicle_speed_filter_kmh
    expect(fallback).toBe(60)
    for (const broken of [0, -1, -60, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(effectiveVehicleSpeedFilterKmh({ vehicle_speed_filter_kmh: broken }), `값 ${broken}`).toBe(fallback)
    }
  })

  it('정책 전체 객체를 넘겨도 차량 속도 값만 읽는다', () => {
    expect(effectiveVehicleSpeedFilterKmh({ ...DEFAULT_POLICY, vehicle_speed_filter_kmh: 0 })).toBe(60)
    expect(effectiveVehicleSpeedFilterKmh(DEFAULT_POLICY)).toBe(60)
  })
})
