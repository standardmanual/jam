/**
 * lib/capsule/policy — `capsule_policy` 로더 (티켓 20261018_0052 1회)
 *
 * 고정하는 것: 기본값이 마이그레이션 232의 DEFAULT와 같다(SQL 파일을 읽어 대조) · 정상 행은 그대로 읽는다(NUMERIC 문자열 포함) ·
 * 조회 실패·행 없음·예외는 기본값과 로그 · 비정상 칸은 그 칸만 기본값으로 대체하고 나머지는 DB 값을 쓴다 ·
 * 등급 확률 네 칸은 묶음 단위다(칸이 비정상이거나 합계가 100이 아니면 네 칸 전체가 기본값).
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/policy.test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))

import { DEFAULT_CAPSULE_POLICY, getCapsulePolicy } from '../policy'

function fakeClient(result: { data: unknown; error: unknown } | 'throw'): SupabaseClient {
  return {
    from: (table: string) => {
      expect(table).toBe('capsule_policy')
      return {
        select: () => ({
          eq: () => ({
            single: async () => {
              if (result === 'throw') throw new Error('network')
              return result
            },
          }),
        }),
      }
    },
  } as unknown as SupabaseClient
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.restoreAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DEFAULT_CAPSULE_POLICY', () => {
  it('마이그레이션 232의 capsule_policy 기본값과 같다', () => {
    const sqlPath = join(fileURLToPath(new URL('../../../../', import.meta.url)), 'supabase/migrations/232_capsule_storage_and_fill.sql')
    const sql = readFileSync(sqlPath, 'utf8')
    const block = sql.match(/CREATE TABLE IF NOT EXISTS public\.capsule_policy \(([\s\S]*?)\n\);/)?.[1]
    expect(block, 'capsule_policy 표 정의를 찾지 못했다').toBeTruthy()

    const fromSql: Record<string, number> = {}
    for (const m of (block as string).matchAll(/^\s+([a-z_]+) (?:INTEGER|NUMERIC\(\d+, \d+\)) NOT NULL DEFAULT ([0-9.]+)/gm)) {
      fromSql[m[1]] = Number(m[2])
    }
    expect(fromSql).toEqual(DEFAULT_CAPSULE_POLICY)
  })

  it('운영 로직 5.2·5.4절의 값이다', () => {
    expect(DEFAULT_CAPSULE_POLICY).toEqual({
      guaranteed_count: 1,
      bonus_count: 1,
      bonus_probability: 0.2,
      other_tribe_probability: 0.2,
      rarity_common: 70,
      rarity_rare: 22,
      rarity_epic: 6,
      rarity_mystic: 2,
      pity_epic_threshold: 15,
      pre_quest_fill_amount: 5,
      pre_quest_unlock_required: 5,
    })
  })
})

describe('getCapsulePolicy', () => {
  it('정상 행은 그대로 읽는다(NUMERIC 문자열도 숫자로)', async () => {
    const row = {
      id: 1,
      guaranteed_count: 2,
      bonus_count: 0,
      bonus_probability: '0.300',
      other_tribe_probability: '0.100',
      rarity_common: '60.000',
      rarity_rare: '25.000',
      rarity_epic: '10.000',
      rarity_mystic: '5.000',
      pity_epic_threshold: 20,
      pre_quest_fill_amount: 7,
      pre_quest_unlock_required: 8,
      updated_at: '2026-10-18T00:00:00Z',
    }
    const policy = await getCapsulePolicy(fakeClient({ data: row, error: null }))

    expect(policy).toEqual({
      guaranteed_count: 2,
      bonus_count: 0,
      bonus_probability: 0.3,
      other_tribe_probability: 0.1,
      rarity_common: 60,
      rarity_rare: 25,
      rarity_epic: 10,
      rarity_mystic: 5,
      pity_epic_threshold: 20,
      pre_quest_fill_amount: 7,
      pre_quest_unlock_required: 8,
    })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('조회 오류·행 없음·예외는 기본값과 로그를 남긴다', async () => {
    expect(await getCapsulePolicy(fakeClient({ data: null, error: { message: 'boom' } }))).toEqual(DEFAULT_CAPSULE_POLICY)
    expect(await getCapsulePolicy(fakeClient({ data: null, error: null }))).toEqual(DEFAULT_CAPSULE_POLICY)
    expect(await getCapsulePolicy(fakeClient('throw'))).toEqual(DEFAULT_CAPSULE_POLICY)
    expect(errorSpy).toHaveBeenCalledTimes(3)
  })

  it('비정상 칸은 그 칸만 기본값으로 대체하고 나머지는 DB 값을 쓴다', async () => {
    const row = {
      ...DEFAULT_CAPSULE_POLICY,
      guaranteed_count: 3,
      bonus_probability: 1.5, // 범위 밖
      pity_epic_threshold: 0, // 1 미만
      pre_quest_fill_amount: null, // 읽지 못함
      pre_quest_unlock_required: 9,
    }
    const policy = await getCapsulePolicy(fakeClient({ data: row, error: null }))

    expect(policy.guaranteed_count).toBe(3)
    expect(policy.pre_quest_unlock_required).toBe(9)
    expect(policy.bonus_probability).toBe(DEFAULT_CAPSULE_POLICY.bonus_probability)
    expect(policy.pity_epic_threshold).toBe(DEFAULT_CAPSULE_POLICY.pity_epic_threshold)
    expect(policy.pre_quest_fill_amount).toBe(DEFAULT_CAPSULE_POLICY.pre_quest_fill_amount)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('등급 확률 칸 하나가 비정상이면 네 칸 전체가 기본값이다(다른 칸은 DB 값)', async () => {
    const row = { ...DEFAULT_CAPSULE_POLICY, rarity_common: 50, rarity_rare: -1, rarity_epic: 40, rarity_mystic: 10, guaranteed_count: 2 }
    const policy = await getCapsulePolicy(fakeClient({ data: row, error: null }))

    expect(policy.rarity_common).toBe(70)
    expect(policy.rarity_rare).toBe(22)
    expect(policy.rarity_epic).toBe(6)
    expect(policy.rarity_mystic).toBe(2)
    expect(policy.guaranteed_count).toBe(2)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('등급 확률 합계가 100이 아니면 네 칸 전체가 기본값이다', async () => {
    const row = { ...DEFAULT_CAPSULE_POLICY, rarity_common: 60, rarity_rare: 22, rarity_epic: 6, rarity_mystic: 2 }
    const policy = await getCapsulePolicy(fakeClient({ data: row, error: null }))

    expect([policy.rarity_common, policy.rarity_rare, policy.rarity_epic, policy.rarity_mystic]).toEqual([70, 22, 6, 2])
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})
