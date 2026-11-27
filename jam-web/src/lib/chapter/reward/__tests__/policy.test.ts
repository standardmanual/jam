/**
 * lib/chapter/reward/policy — 챕터 오름 보상 설정 읽기 (티켓 20261127_1731 C3a)
 *
 * 고정하는 것:
 * - `chapter_reward_policy` id=1 한 행을 읽어 추첨 칸(다른 트라이브 확률·등급 확률 네 칸·에픽 보정 임계값)을 돌려준다. NUMERIC이 문자열이어도 숫자로 읽는다.
 * - 행이 없거나 읽기 오류거나 값이 비정상이면 **기본값으로 대체하지 않고 던진다**.
 * - `chapter_definitions.reward_count`: 값이 있으면 그 개수, NULL이면 «보상 없음»인 `null`(0이 아니다), 행이 없거나 읽기 오류거나 1 미만이면 던진다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/reward/__tests__/policy.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getChapterRewardCount, getChapterRewardPolicy } from '../policy'

type Result = { data: unknown; error: unknown }

/** 테이블별 결과를 돌려주고 `eq()` 인자를 기록하는 가짜 클라이언트 */
function fakeClient(tables: Record<string, Result>) {
  const eqs: Array<[string, string, unknown]> = []
  const client = {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (column: string, value: unknown) => {
        eqs.push([table, column, value])
        return q
      }
      q.maybeSingle = async () => tables[table] ?? { data: null, error: { message: `예상하지 못한 테이블 ${table}` } }
      return q
    },
  } as unknown as SupabaseClient
  return { client, eqs }
}

const POLICY_ROW = {
  other_tribe_probability: 0.2,
  rarity_common: 30,
  rarity_rare: 40,
  rarity_epic: 22,
  rarity_mystic: 8,
  pity_epic_threshold: 15,
}

describe('getChapterRewardPolicy', () => {
  it('id=1 행을 읽어 추첨 칸을 돌려준다', async () => {
    const { client, eqs } = fakeClient({ chapter_reward_policy: { data: POLICY_ROW, error: null } })
    await expect(getChapterRewardPolicy(client)).resolves.toEqual(POLICY_ROW)
    expect(eqs).toEqual([['chapter_reward_policy', 'id', 1]])
  })

  it('NUMERIC이 문자열로 내려와도 숫자로 읽는다', async () => {
    const { client } = fakeClient({
      chapter_reward_policy: { data: { ...POLICY_ROW, other_tribe_probability: '0.20', rarity_epic: '22.0' }, error: null },
    })
    const policy = await getChapterRewardPolicy(client)
    expect(policy.other_tribe_probability).toBe(0.2)
    expect(policy.rarity_epic).toBe(22)
  })

  it('행이 없으면 던진다', async () => {
    const { client } = fakeClient({ chapter_reward_policy: { data: null, error: null } })
    await expect(getChapterRewardPolicy(client)).rejects.toThrow('id=1 행이 없다')
  })

  it('읽기 오류면 던진다(기본값으로 대체하지 않는다)', async () => {
    const { client } = fakeClient({ chapter_reward_policy: { data: null, error: { message: 'boom' } } })
    await expect(getChapterRewardPolicy(client)).rejects.toThrow('chapter_reward_policy 조회 실패: boom')
  })

  it('값이 비어 있으면 던진다', async () => {
    const { client } = fakeClient({ chapter_reward_policy: { data: { ...POLICY_ROW, rarity_rare: null }, error: null } })
    await expect(getChapterRewardPolicy(client)).rejects.toThrow('rarity_rare')
  })

  it.each([
    ['다른 트라이브 확률이 1 초과', { other_tribe_probability: 1.5 }],
    ['다른 트라이브 확률이 음수', { other_tribe_probability: -0.1 }],
    ['등급 확률이 음수', { rarity_common: -1 }],
    ['등급 확률 합계가 0', { rarity_common: 0, rarity_rare: 0, rarity_epic: 0, rarity_mystic: 0 }],
    ['에픽 보정 임계값이 0', { pity_epic_threshold: 0 }],
    ['에픽 보정 임계값이 정수가 아님', { pity_epic_threshold: 2.5 }],
  ])('비정상 값이면 던진다: %s', async (_name, over) => {
    const { client } = fakeClient({ chapter_reward_policy: { data: { ...POLICY_ROW, ...over }, error: null } })
    await expect(getChapterRewardPolicy(client)).rejects.toThrow('chapter_reward_policy')
  })
})

describe('getChapterRewardCount', () => {
  it.each([3, 4, 5])('마친 챕터의 reward_count(%i)를 그대로 돌려준다', async (n) => {
    const { client, eqs } = fakeClient({ chapter_definitions: { data: { reward_count: n }, error: null } })
    await expect(getChapterRewardCount(client, 2)).resolves.toBe(n)
    expect(eqs).toEqual([['chapter_definitions', 'chapter_no', 2]])
  })

  it('reward_count가 NULL이면 0이 아니라 null(보상 없음)이다', async () => {
    const { client } = fakeClient({ chapter_definitions: { data: { reward_count: null }, error: null } })
    await expect(getChapterRewardCount(client, 10)).resolves.toBeNull()
  })

  it('챕터 행이 없으면 던진다', async () => {
    const { client } = fakeClient({ chapter_definitions: { data: null, error: null } })
    await expect(getChapterRewardCount(client, 99)).rejects.toThrow('챕터 99 행이 없다')
  })

  it('읽기 오류면 던진다', async () => {
    const { client } = fakeClient({ chapter_definitions: { data: null, error: { message: 'boom' } } })
    await expect(getChapterRewardCount(client, 1)).rejects.toThrow('chapter_definitions 조회 실패: boom')
  })

  it.each([0, -1, 2.5])('reward_count가 %s이면 던진다', async (bad) => {
    const { client } = fakeClient({ chapter_definitions: { data: { reward_count: bad }, error: null } })
    await expect(getChapterRewardCount(client, 1)).rejects.toThrow('reward_count')
  })
})
