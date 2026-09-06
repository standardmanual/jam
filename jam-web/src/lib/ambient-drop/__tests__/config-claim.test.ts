/**
 * claimAmbientDropAutoRun — 예약 배포 하루 1회 선점 회귀 테스트 (티켓 20260906_1206 ②)
 *
 * cron이 매시 정각에 호출되므로, 설정 시각에 해당하는 그 1시간 동안 여러 번 호출되거나
 * (Vercel 재시도·중복 발사) 동시에 호출될 수 있다. 판정과 기록을 조건부 UPDATE 하나로
 * 처리해야 하며, 조회 후 갱신 방식이면 동시 호출에서 둘 다 통과한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/config-claim.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const stub = vi.hoisted(() => ({
  /** DB에 저장된 last_auto_run_on */
  lastAutoRunOn: null as string | null,
  updateError: null as { message: string } | null,
  orFilters: [] as string[],
  updatePayloads: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => {
    // from() 호출마다 새 빌더 — 동시 호출이 서로의 상태를 덮어쓰지 않게 한다
    const makeBuilder = () => {
      let payload: Record<string, unknown> = {}
      const builder = {
        update(next: Record<string, unknown>) {
          payload = next
          stub.updatePayloads.push(next)
          return builder
        },
        eq() {
          return builder
        },
        or(filter: string) {
          stub.orFilters.push(filter)
          return builder
        },
        /** UPDATE ... WHERE ... RETURNING id 를 원자 연산 한 번으로 모사한다 */
        async select() {
          if (stub.updateError) return { data: null, error: stub.updateError }
          const target = payload.last_auto_run_on as string
          const matched = stub.lastAutoRunOn === null || stub.lastAutoRunOn < target
          if (!matched) return { data: [], error: null }
          stub.lastAutoRunOn = target
          return { data: [{ id: 1 }], error: null }
        },
      }
      return builder
    }
    return { from: () => makeBuilder() } as unknown as SupabaseClient
  },
}))

import { claimAmbientDropAutoRun } from '../config'

beforeEach(() => {
  stub.lastAutoRunOn = null
  stub.updateError = null
  stub.orFilters = []
  stub.updatePayloads = []
})

describe('claimAmbientDropAutoRun', () => {
  it('오늘 처음 호출이면 선점에 성공하고 last_auto_run_on을 기록한다', async () => {
    await expect(claimAmbientDropAutoRun('2026-09-06')).resolves.toBe(true)
    expect(stub.lastAutoRunOn).toBe('2026-09-06')
    expect(stub.updatePayloads).toEqual([{ last_auto_run_on: '2026-09-06' }])
  })

  it('같은 날 두 번째 호출은 선점에 실패한다 — 하루 두 번 배포되지 않는다', async () => {
    expect(await claimAmbientDropAutoRun('2026-09-06')).toBe(true)
    expect(await claimAmbientDropAutoRun('2026-09-06')).toBe(false)
  })

  it('동시 호출 5건 중 정확히 1건만 선점한다', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => claimAmbientDropAutoRun('2026-09-06'))
    )
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('날짜가 넘어가면 다시 선점할 수 있다', async () => {
    expect(await claimAmbientDropAutoRun('2026-09-06')).toBe(true)
    expect(await claimAmbientDropAutoRun('2026-09-07')).toBe(true)
    expect(stub.lastAutoRunOn).toBe('2026-09-07')
  })

  it('조건부 UPDATE로 처리한다 — null 또는 과거 날짜 필터를 항상 건다', async () => {
    await claimAmbientDropAutoRun('2026-09-06')
    expect(stub.orFilters).toEqual(['last_auto_run_on.is.null,last_auto_run_on.lt.2026-09-06'])
  })

  it('DB 오류면 false를 반환해 배치로 진행하지 않는다', async () => {
    stub.updateError = { message: 'connection reset' }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(claimAmbientDropAutoRun('2026-09-06')).resolves.toBe(false)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
