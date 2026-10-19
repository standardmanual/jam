/**
 * visibility-server.ts `loadMissionTribeAccess` 테스트 (티켓 20261019_1311)
 *
 * 검증 대상:
 *  - 유저 트라이브와 미션별 허용 트라이브를 한 값으로 모아 돌려준다(행이 없는 미션은 맵에 없다 = 공통 미션)
 *  - 미션 수가 많으면 나누어 묻는다(`in()` URL·응답 행 상한)
 *  - 유저 조회·허용 목록 조회 중 하나라도 실패하면 «제한 없음»으로 넘기지 않고 던진다(fail-closed)
 *
 * 위치: `__tests__/`는 vitest에서 제외돼 있어(node assert 시험 전용) 이 파일은 옆에 둔다.
 * 실행: cd jam-web && npx vitest run src/lib/missions/visibility-server.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  user: { data: { tribe_id: 't-a' } as { tribe_id: string | null } | null, error: null as { message: string } | null },
  allowed: { data: [] as { mission_id: string; tribe_id: string }[], error: null as { message: string } | null },
  allowedCalls: [] as string[][],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.maybeSingle = async () => state.user
      builder.in = (_column: string, ids: string[]) => {
        if (table === 'mission_allowed_tribes') state.allowedCalls.push(ids)
        return builder
      }
      builder.then = (resolve: (v: unknown) => unknown) => resolve(table === 'mission_allowed_tribes' ? state.allowed : { data: [], error: null })
      return builder
    },
  }),
}))

import { loadMissionTribeAccess } from '@/lib/missions/visibility-server'

beforeEach(() => {
  state.user = { data: { tribe_id: 't-a' }, error: null }
  state.allowed = { data: [], error: null }
  state.allowedCalls = []
})

describe('loadMissionTribeAccess', () => {
  it('유저 트라이브와 미션별 허용 목록을 모은다. 행이 없는 미션은 맵에 없다', async () => {
    state.allowed = {
      data: [
        { mission_id: 'm1', tribe_id: 't-a' },
        { mission_id: 'm1', tribe_id: 't-b' },
        { mission_id: 'm2', tribe_id: 't-b' },
      ],
      error: null,
    }
    const access = await loadMissionTribeAccess('u1', ['m1', 'm2', 'm3'])
    expect(access.userTribeId).toBe('t-a')
    expect(access.allowedTribeIdsByMission.get('m1')).toEqual(['t-a', 't-b'])
    expect(access.allowedTribeIdsByMission.get('m2')).toEqual(['t-b'])
    expect(access.allowedTribeIdsByMission.has('m3')).toBe(false)
  })

  it('트라이브가 없는 유저·유저 행이 없는 경우는 userTribeId가 null이다', async () => {
    state.user = { data: { tribe_id: null }, error: null }
    expect((await loadMissionTribeAccess('u1', ['m1'])).userTribeId).toBeNull()
    state.user = { data: null, error: null }
    expect((await loadMissionTribeAccess('u1', ['m1'])).userTribeId).toBeNull()
  })

  it('미션이 없으면 허용 목록을 묻지 않는다', async () => {
    const access = await loadMissionTribeAccess('u1', [])
    expect(state.allowedCalls).toHaveLength(0)
    expect(access.allowedTribeIdsByMission.size).toBe(0)
  })

  it('미션이 많으면 50개씩 나누어 묻고 중복 id는 한 번만 묻는다', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`)
    await loadMissionTribeAccess('u1', [...ids, 'm0'])
    expect(state.allowedCalls.map((c) => c.length)).toEqual([50, 50, 20])
  })

  it('유저 트라이브 조회가 실패하면 던진다', async () => {
    state.user = { data: null, error: { message: 'boom' } }
    await expect(loadMissionTribeAccess('u1', ['m1'])).rejects.toThrow('users.tribe_id 조회 실패')
  })

  it('허용 목록 조회가 실패하면 «제한 없음»으로 넘기지 않고 던진다', async () => {
    state.allowed = { data: [], error: { message: 'boom' } }
    await expect(loadMissionTribeAccess('u1', ['m1'])).rejects.toThrow('mission_allowed_tribes 조회 실패')
  })
})
