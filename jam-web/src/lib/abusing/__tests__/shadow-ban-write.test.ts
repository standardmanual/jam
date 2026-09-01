/**
 * abusing/shadow-ban — 쓰기 경로(applyBan/removeBan/logAbusingEvent) 에러 삼킴 +
 * getUserBanLevel() 무검증 캐스팅 방어 회귀 테스트
 *
 * 배경 (티켓 20260901_1843): 티켓 20260831_1149·1259의 "미분리(기록만)" 항목을 여기서
 * 처리한다.
 * 1. `applyBan`/`removeBan`이 upsert/delete 반환 `error`를 확인하지 않아 밴 부여·해제
 *    실패가 "성공"으로 처리됐다.
 * 2. `logAbusingEvent`는 `catch {}`로 로그 실패를 완전히 무음 처리했다.
 * 3. `getUserBanLevel()`이 DB `ban_level`을 검증 없이 `as BanLevel`로 캐스팅했다. 마이그레이션
 *    010의 CHECK 제약이 막고 있어 오늘 시점엔 도달 불가하지만, 제약이 완화되면
 *    `BAN_RATE_KEY[banLevel]`가 undefined가 되어 `shouldAllowDrop`에서 TypeError가 드랍
 *    경로로 전파된다.
 *
 * `shadow-ban.test.ts`(순수 함수 `shouldAllowDrop` 전용)와 분리한 이유: 이 파일은
 * `createServiceClient`를 모킹해야 하는데, 기존 파일은 모킹 없이 순수 함수만 검증한다 —
 * 한 파일에 섞으면 다른 테스트의 전제(실제 supabase 모듈 미개입)가 깨진다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/shadow-ban-write.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const stub = vi.hoisted(() => ({
  banRow: null as Record<string, unknown> | null,
  selectError: null as { code: string; message: string } | null,
  upsertError: null as { code: string; message: string } | null,
  deleteError: null as { code: string; message: string } | null,
  insertError: null as { code: string; message: string } | null,
  upsertPayloads: [] as Record<string, unknown>[],
  insertPayloads: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => {
    // delete().eq(...)가 최종적으로 { error }를 반환하도록 eq를 분기 처리한다
    // (select().eq()는 이어서 .maybeSingle()로 끝나므로 builder를 그대로 돌려준다).
    let deleteMode = false
    const builder = {
      select: () => builder,
      eq: () => (deleteMode ? Promise.resolve({ error: stub.deleteError }) : builder),
      maybeSingle: async () => ({ data: stub.banRow, error: stub.selectError }),
      upsert: async (payload: Record<string, unknown>) => {
        stub.upsertPayloads.push(payload)
        return { error: stub.upsertError }
      },
      delete: () => {
        deleteMode = true
        return builder
      },
      insert: async (payload: Record<string, unknown>) => {
        stub.insertPayloads.push(payload)
        return { error: stub.insertError }
      },
    }
    return { from: () => builder } as unknown as SupabaseClient
  },
}))

import { applyBan, removeBan, logAbusingEvent, getUserBanLevel } from '../shadow-ban'

beforeEach(() => {
  stub.banRow = null
  stub.selectError = null
  stub.upsertError = null
  stub.deleteError = null
  stub.insertError = null
  stub.upsertPayloads = []
  stub.insertPayloads = []
})

describe('applyBan — upsert 실패 전파', () => {
  it('upsert error를 받으면 예외를 던진다 (이전에는 삼켰다)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.upsertError = { code: 'PGRST204', message: 'column not found' }
    await expect(applyBan('user-1', 'soft', '테스트 사유')).rejects.toThrow('PGRST204')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('정상이면 { user_id, ban_level, ... } 페이로드로 저장하고 로그도 남긴다', async () => {
    await applyBan('user-1', 'hard', '테스트 사유', 'admin@jam.test')
    expect(stub.upsertPayloads).toHaveLength(1)
    expect(stub.upsertPayloads[0].user_id).toBe('user-1')
    expect(stub.upsertPayloads[0].ban_level).toBe('hard')
    expect(stub.insertPayloads).toHaveLength(1)
    expect(stub.insertPayloads[0].event_type).toBe('hard_ban_applied')
  })

  it("level이 'none'이면 아무 것도 하지 않는다", async () => {
    await applyBan('user-1', 'none', '해제 유지')
    expect(stub.upsertPayloads).toHaveLength(0)
  })
})

describe('removeBan — delete 실패 전파', () => {
  it('delete error를 받으면 예외를 던진다 (이전에는 삼켰다)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.deleteError = { code: '42501', message: 'permission denied' }
    await expect(removeBan('user-1')).rejects.toThrow('42501')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('정상이면 예외 없이 완료된다', async () => {
    await expect(removeBan('user-1')).resolves.toBeUndefined()
  })
})

describe('logAbusingEvent — insert 실패는 삼키되 반드시 로그를 남긴다', () => {
  it('insert error가 있어도 예외를 던지지 않지만 console.error를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.insertError = { code: '23503', message: 'foreign key violation' }
    await expect(logAbusingEvent('user-1', 'gps_spoof_detected')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    expect(String(spy.mock.calls[0][0])).toContain('gps_spoof_detected')
    spy.mockRestore()
  })

  it('정상이면 로그를 남기지 않는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await logAbusingEvent('user-1', 'gps_spoof_detected')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('getUserBanLevel — ban_level 무검증 캐스팅 방어', () => {
  it("정상 값('soft'/'hard')은 그대로 돌려준다", async () => {
    stub.banRow = { ban_level: 'soft', expires_at: null }
    expect(await getUserBanLevel('user-1')).toBe('soft')
    stub.banRow = { ban_level: 'hard', expires_at: null }
    expect(await getUserBanLevel('user-1')).toBe('hard')
  })

  it('레코드가 없으면 none이다', async () => {
    stub.banRow = null
    expect(await getUserBanLevel('user-1')).toBe('none')
  })

  it('만료된 밴은 none이다', async () => {
    stub.banRow = { ban_level: 'hard', expires_at: '2000-01-01T00:00:00.000Z' }
    expect(await getUserBanLevel('user-1')).toBe('none')
  })

  it(
    "알 수 없는 ban_level 값(마이그레이션 010 CHECK 제약 완화 가정)은 hard로 fail-closed하고 " +
      '로그를 남긴다 — BAN_RATE_KEY[banLevel]가 undefined가 되는 것을 방지',
    async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      stub.banRow = { ban_level: 'unknown_level', expires_at: null }
      expect(await getUserBanLevel('user-1')).toBe('hard')
      expect(spy).toHaveBeenCalled()
      expect(String(spy.mock.calls[0][0])).toContain('unknown_level')
      spy.mockRestore()
    }
  )

  it('조회 자체가 실패하면(DB 전체 장애) none으로 폴백한다 — 기존 fail-open 동작 유지', async () => {
    stub.selectError = { code: 'PGRST500', message: 'internal error' }
    expect(await getUserBanLevel('user-1')).toBe('none')
  })
})
