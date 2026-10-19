/**
 * 미션 보상 배지 검증과 숨김 배지 사용처 조회 (티켓 20261019_1313 2회, 티켓 20261019_0012)
 *
 * 고정하는 것
 *  - 보상 배지: 형식(UUID)·중복 제거·존재(삭제 제외)·유형(액티비티·아이템만, 체크인 거절)·숨김 거절. 오류는 현상·원인·해결책 문구다.
 *  - 게이트 배지(`gated_badge_id`)가 숨김이면 거절한다.
 *  - 사용처 조회: 미션 보상·게이트 미션의 본 배지·다른 배지의 선행 배지·교차 게이트. 자기 자신은 사용처가 아니다.
 *  - 읽기에 실패하면 통과시키지 않고 500이며, DB 오류 원문은 응답에 싣지 않는다.
 *  - 노출 가림: 화면용 미션 행에서 숨김 보상 배지 id를 뺀다(원본은 바꾸지 않는다).
 * 실제 DB를 부르지 않는다: Supabase 클라이언트는 기록형 가짜다.
 * 실행: cd jam-web && npx vitest run src/lib/missions/reward-badges.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  checkHiddenBadgeUsage,
  describeBadgeUsages,
  findBadgeUsages,
  hiddenBlockedByUsageMessage,
  judgeRewardBadgeRows,
  parseRewardBadgeIds,
  validateGatedBadge,
  validateMissionRewardBadges,
  withoutHiddenRewardBadgeIds,
} from './reward-badges'

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

type Call = { method: string; args: unknown[] }
type Result = { data?: unknown; error?: { message: string } | null }
type Read = { table: string; calls: Call[] }

/** 어떤 필터 체인이든 받는다. 끝(await·`maybeSingle()`)에서 `resolve`가 정한 결과를 돌려주고, 읽은 질의를 `reads`에 남긴다. */
function makeClient(resolve: (read: Read) => Result) {
  const reads: Read[] = []
  const builder = (table: string, calls: Call[]): unknown =>
    new Proxy(
      {},
      {
        get(_target, method) {
          if (typeof method !== 'string') return undefined
          if (method === 'then') {
            return (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
              const read = { table, calls }
              reads.push(read)
              return Promise.resolve(resolve(read)).then(onFulfilled, onRejected)
            }
          }
          return (...args: unknown[]) => builder(table, [...calls, { method, args }])
        },
      }
    )
  const client = { from: (table: string) => builder(table, []) } as unknown as SupabaseClient
  return { client, reads }
}

const has = (read: Read, method: string, ...args: unknown[]) =>
  read.calls.some((call) => call.method === method && args.every((arg, i) => JSON.stringify(call.args[i]) === JSON.stringify(arg)))

describe('parseRewardBadgeIds — 요청의 보상 배지 목록을 저장할 모양으로', () => {
  it('보내지 않았으면(undefined·null) 저장 값을 건드리지 않는다', () => {
    expect(parseRewardBadgeIds(undefined)).toEqual({ ok: true, ids: null })
    expect(parseRewardBadgeIds(null)).toEqual({ ok: true, ids: null })
  })

  it('중복을 없애고 소문자로 맞추며, 처음 나온 순서를 지킨다', () => {
    expect(parseRewardBadgeIds([ID_B, ID_A.toUpperCase(), ID_B, ID_A])).toEqual({ ok: true, ids: [ID_B, ID_A] })
  })

  it('빈 배열은 통과한다(보상 배지 없음)', () => {
    expect(parseRewardBadgeIds([])).toEqual({ ok: true, ids: [] })
  })

  it('배열이 아니면 거절한다', () => {
    const result = parseRewardBadgeIds(ID_A)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('형식이 올바르지 않아요')
  })

  it('UUID가 아닌 값이 섞여 있으면 그 값을 알리며 거절한다', () => {
    const result = parseRewardBadgeIds([ID_A, 'not-a-uuid', 7])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('not-a-uuid')
      expect(result.error).toContain('다시 골라 주세요')
    }
  })
})

describe('judgeRewardBadgeRows — 읽어 온 배지 행으로 판정', () => {
  const activity = { id: ID_A, name: '주말 러너', type: 'activity', is_hidden: false }
  const item = { id: ID_B, name: '러닝화', type: 'item', is_hidden: false }

  it('숨김이 아닌 액티비티·아이템 배지는 통과한다', () => {
    expect(judgeRewardBadgeRows([ID_A, ID_B], [activity, item])).toBeNull()
  })

  it('id는 대소문자를 가리지 않고 찾는다', () => {
    expect(judgeRewardBadgeRows([ID_A.toUpperCase()], [activity])).toBeNull()
  })

  it('목록에 없는 id는 «없거나 삭제된 배지»다(삭제된 배지는 읽지 않은 것과 같다)', () => {
    const message = judgeRewardBadgeRows([ID_A, ID_C], [activity])
    expect(message).toContain(ID_C)
    expect(message).toContain('없거나 삭제된 배지')
    expect(message).not.toContain(ID_A)
  })

  it('체크인 배지는 거절하고, 이름과 해결책을 알린다', () => {
    const message = judgeRewardBadgeRows([ID_A], [{ ...activity, name: '카페 체크인', type: 'checkin' }])
    expect(message).toContain('체크인 배지: 「카페 체크인」')
    expect(message).toContain('액티비티 배지나 아이템 배지만')
    expect(message).toContain('바꿔 주세요')
  })

  it('유형을 읽지 못한 배지도 통과시키지 않는다', () => {
    const message = judgeRewardBadgeRows([ID_A], [{ id: ID_A, name: '이름' }])
    expect(message).toContain('유형을 알 수 없는 배지')
  })

  it('숨김 배지는 거절하고, 현상·원인·해결책을 문장으로 알린다', () => {
    const message = judgeRewardBadgeRows([ID_A], [{ ...activity, name: '비밀 배지', is_hidden: true }])
    expect(message).toContain('저장할 수 없습니다.')
    expect(message).toContain('숨김 배지가 있어요(「비밀 배지」)')
    expect(message).toContain('받기 전에 이름이 보이면 안 되는데')
    expect(message).toContain('숨김이 아닌 배지로 바꿔 주세요')
  })

  it('한 번에 하나씩 알린다: 없음 → 유형 → 숨김 순서', () => {
    const hiddenItem = { ...item, is_hidden: true }
    const checkin = { id: ID_C, name: '체크인', type: 'checkin', is_hidden: false }
    expect(judgeRewardBadgeRows([ID_A, ID_B, ID_C], [activity, hiddenItem, checkin])).toContain('체크인 배지')
    expect(judgeRewardBadgeRows([ID_A, ID_B], [activity, hiddenItem])).toContain('숨김 배지')
  })

  it('이름이 많으면 3개까지만 보이고 «외 N개»로 줄인다', () => {
    const ids = ['1', '2', '3', '4', '5'].map((n) => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`)
    const rows = ids.map((id, i) => ({ id, name: `숨김 ${i + 1}`, type: 'activity', is_hidden: true }))
    const message = judgeRewardBadgeRows(ids, rows)!
    expect(message).toContain('「숨김 1」, 「숨김 2」, 「숨김 3」 외 2개')
    expect(message).not.toContain('숨김 4')
  })
})

describe('validateMissionRewardBadges — 어드민 미션 저장용', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('보내지 않았거나 비어 있으면 DB를 읽지 않고 통과한다', async () => {
    const { client, reads } = makeClient(() => ({ data: [] }))
    expect(await validateMissionRewardBadges(client, undefined)).toEqual({ ok: true, ids: null })
    expect(await validateMissionRewardBadges(client, [])).toEqual({ ok: true, ids: [] })
    expect(reads).toEqual([])
  })

  it('통과하면 중복을 없앤 id를 돌려주고, 삭제되지 않은 배지만 읽는다', async () => {
    const { client, reads } = makeClient(() => ({
      data: [
        { id: ID_A, name: '주말 러너', type: 'activity', is_hidden: false },
        { id: ID_B, name: '러닝화', type: 'item', is_hidden: false },
      ],
    }))
    const result = await validateMissionRewardBadges(client, [ID_A, ID_B, ID_A])
    expect(result).toEqual({ ok: true, ids: [ID_A, ID_B] })
    expect(reads).toHaveLength(1)
    expect(has(reads[0], 'in', 'id', [ID_A, ID_B])).toBe(true)
    expect(has(reads[0], 'is', 'deleted_at', null)).toBe(true)
  })

  it('숨김 배지가 들어 있으면 400이다', async () => {
    const { client } = makeClient(() => ({ data: [{ id: ID_A, name: '비밀 배지', type: 'activity', is_hidden: true }] }))
    const result = await validateMissionRewardBadges(client, [ID_A])
    expect(result).toMatchObject({ ok: false, status: 400 })
    if (!result.ok) expect(result.error).toContain('숨김 배지')
  })

  it('체크인 배지가 들어 있으면 400이다', async () => {
    const { client } = makeClient(() => ({ data: [{ id: ID_A, name: '카페', type: 'checkin', is_hidden: false }] }))
    const result = await validateMissionRewardBadges(client, [ID_A])
    expect(result).toMatchObject({ ok: false, status: 400 })
    if (!result.ok) expect(result.error).toContain('체크인 배지')
  })

  it('삭제됐거나 없는 배지는 400이다', async () => {
    const { client } = makeClient(() => ({ data: [] }))
    const result = await validateMissionRewardBadges(client, [ID_A])
    expect(result).toMatchObject({ ok: false, status: 400 })
    if (!result.ok) expect(result.error).toContain('없거나 삭제된 배지')
  })

  it('형식이 올바르지 않으면 DB를 읽기 전에 400이다', async () => {
    const { client, reads } = makeClient(() => ({ data: [] }))
    const result = await validateMissionRewardBadges(client, ['x'])
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(reads).toEqual([])
  })

  it('읽기에 실패하면 통과시키지 않고 500이다. DB 오류 원문은 응답에 없다', async () => {
    const { client } = makeClient(() => ({ data: null, error: { message: 'db-internal-host timeout' } }))
    const result = await validateMissionRewardBadges(client, [ID_A])
    expect(result).toMatchObject({ ok: false, status: 500 })
    if (!result.ok) expect(result.error).not.toContain('db-internal-host')
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('validateGatedBadge — 게이트 미션의 본 배지', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('비어 있으면(보내지 않음·null·빈 문자열) DB를 읽지 않고 통과한다', async () => {
    const { client, reads } = makeClient(() => ({ data: null }))
    for (const raw of [undefined, null, '']) expect(await validateGatedBadge(client, raw)).toEqual({ ok: true })
    expect(reads).toEqual([])
  })

  it('UUID가 아니면 400이다', async () => {
    const { client } = makeClient(() => ({ data: null }))
    expect(await validateGatedBadge(client, 'x')).toMatchObject({ ok: false, status: 400 })
  })

  it('숨김 배지면 400이고 이름을 알린다', async () => {
    const { client } = makeClient(() => ({ data: { id: ID_A, name: '비밀 배지', is_hidden: true } }))
    const result = await validateGatedBadge(client, ID_A)
    expect(result).toMatchObject({ ok: false, status: 400 })
    if (!result.ok) expect(result.error).toContain('게이트 배지로 쓸 수 없는 숨김 배지예요(「비밀 배지」)')
  })

  it('숨김이 아니면 통과하고, 없는 배지는 여기서 막지 않는다(FK가 지킨다)', async () => {
    expect(await validateGatedBadge(makeClient(() => ({ data: { id: ID_A, name: '배지', is_hidden: false } })).client, ID_A)).toEqual({ ok: true })
    expect(await validateGatedBadge(makeClient(() => ({ data: null })).client, ID_A)).toEqual({ ok: true })
  })

  it('읽기에 실패하면 500이다', async () => {
    const { client } = makeClient(() => ({ data: null, error: { message: 'boom' } }))
    expect(await validateGatedBadge(client, ID_A)).toMatchObject({ ok: false, status: 500 })
  })
})

describe('findBadgeUsages — 이미 쓰이는 곳', () => {
  /** 미션 보상·게이트와 배지 조건을 표 이름·필터로 가려 답한다 */
  const answer = (rows: { reward?: unknown[]; gated?: unknown[]; badges?: unknown[] }) => (read: Read): Result => {
    if (read.table === 'missions') return { data: has(read, 'contains') ? (rows.reward ?? []) : (rows.gated ?? []) }
    return { data: rows.badges ?? [] }
  }

  it('미션 보상·게이트 미션의 본 배지·선행 배지·교차 게이트를 모두 찾는다', async () => {
    const { client, reads } = makeClient(
      answer({
        reward: [{ id: 'm1', title: '주말 러닝' }],
        gated: [{ id: 'm2', title: '레벨업 미션' }],
        badges: [
          { id: 'x1', name: '다음 단계', condition_json: { prerequisite_badge_names: ['대상 배지'] } },
          { id: 'x2', name: '교차 배지', condition_json: { cross_in_axis: { family_keys: ['running:oath', 'running:other'] } } },
          { id: 'x3', name: '미션 게이트 배지', condition_json: { gate_mission_badge: { family_keys: ['running:oath'] } } },
          { id: 'x4', name: '무관한 배지', condition_json: { prerequisite_badge_names: ['다른 배지'], cross_between_axis: { family_keys: ['walking:x'] } } },
        ],
      })
    )

    const usages = await findBadgeUsages(client, { id: 'self', name: '대상 배지', familyKey: 'running:oath' })

    expect(usages).toEqual([
      { kind: 'mission_reward', owner: '주말 러닝' },
      { kind: 'mission_gate_badge', owner: '레벨업 미션' },
      { kind: 'prerequisite', owner: '다음 단계' },
      { kind: 'cross_gate', owner: '교차 배지' },
      { kind: 'cross_gate', owner: '미션 게이트 배지' },
    ])
    const rewardRead = reads.find((read) => read.table === 'missions' && has(read, 'contains'))!
    expect(has(rewardRead, 'contains', 'reward_badge_ids', ['self'])).toBe(true)
    const gatedRead = reads.find((read) => read.table === 'missions' && has(read, 'eq'))!
    expect(has(gatedRead, 'eq', 'gated_badge_id', 'self')).toBe(true)
  })

  it('자기 자신이 가진 조건은 사용처가 아니다', async () => {
    const { client } = makeClient(
      answer({ badges: [{ id: 'self', name: '대상 배지', condition_json: { prerequisite_badge_names: ['대상 배지'] } }] })
    )
    expect(await findBadgeUsages(client, { id: 'self', name: '대상 배지', familyKey: null })).toEqual([])
  })

  it('새로 만드는 배지(id 없음)는 미션을 읽지 않고, 이름·계열만 본다', async () => {
    const { client, reads } = makeClient(
      answer({ badges: [{ id: 'x1', name: '다음 단계', condition_json: { prerequisite_badge_names: ['새 배지'] } }] })
    )
    const usages = await findBadgeUsages(client, { name: '새 배지', familyKey: null })
    expect(usages).toEqual([{ kind: 'prerequisite', owner: '다음 단계' }])
    expect(reads.every((read) => read.table === 'badges')).toBe(true)
  })

  it('계열 키가 없는 배지는 교차 게이트 계열과 맞지 않는다', async () => {
    const { client } = makeClient(answer({ badges: [{ id: 'x1', name: '교차 배지', condition_json: { cross_in_axis: { family_keys: ['running:oath'] } } }] }))
    expect(await findBadgeUsages(client, { id: 'self', name: '이름', familyKey: null })).toEqual([])
  })

  it('삭제되지 않은 배지 중 조건이 있는 것만 읽고, 1000건이 차면 다음 쪽을 읽는다', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}`, name: `배지 ${i}`, condition_json: {} }))
    const { client, reads } = makeClient((read) => {
      if (read.table === 'missions') return { data: [] }
      const range = read.calls.find((call) => call.method === 'range')!.args
      return { data: range[0] === 0 ? full : [{ id: 'last', name: '마지막', condition_json: { prerequisite_badge_names: ['대상 배지'] } }] }
    })

    const usages = await findBadgeUsages(client, { id: 'self', name: '대상 배지', familyKey: null })

    expect(usages).toEqual([{ kind: 'prerequisite', owner: '마지막' }])
    const pages = reads.filter((read) => read.table === 'badges')
    expect(pages).toHaveLength(2)
    expect(has(pages[0], 'is', 'deleted_at', null)).toBe(true)
    expect(has(pages[0], 'not', 'condition_json', 'is', null)).toBe(true)
    expect(pages[1].calls.find((call) => call.method === 'range')!.args).toEqual([1000, 1999])
  })

  it('읽기에 실패하면 던진다(사용처를 모른 채 통과시키지 않는다)', async () => {
    const { client } = makeClient(() => ({ data: null, error: { message: 'boom' } }))
    await expect(findBadgeUsages(client, { id: 'self', name: '대상 배지' })).rejects.toThrow('미션 보상 사용처 조회 실패')
  })
})

describe('사용처 문구와 숨김 저장 판정', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('종류별로 묶어 쓴다. 많으면 «외 N개»로 줄인다', () => {
    const text = describeBadgeUsages([
      { kind: 'mission_reward', owner: 'A' },
      { kind: 'mission_reward', owner: 'B' },
      { kind: 'mission_reward', owner: 'C' },
      { kind: 'mission_reward', owner: 'D' },
      { kind: 'prerequisite', owner: 'E' },
    ])
    expect(text).toBe('미션 보상(「A」, 「B」, 「C」 외 1개), 다른 배지의 선행 배지(「E」)')
  })

  it('거절 문구는 사용처를 알리고, 먼저 빼라고 안내한다', () => {
    const message = hiddenBlockedByUsageMessage([{ kind: 'mission_reward', owner: '주말 러닝' }])
    expect(message).toContain('숨김 배지로 저장할 수 없습니다.')
    expect(message).toContain('이미 미션 보상(「주말 러닝」)에 쓰이고 있어요')
    expect(message).toContain('쓰는 곳에서 이 배지를 먼저 빼고 다시 저장해 주세요')
  })

  it('쓰이는 곳이 없으면 통과하고, 있으면 400이다', async () => {
    const free = makeClient(() => ({ data: [] }))
    expect(await checkHiddenBadgeUsage(free.client, { id: 'self', name: '이름' })).toEqual({ ok: true })

    const used = makeClient((read) => (read.table === 'missions' ? { data: [{ id: 'm1', title: '주말 러닝' }] } : { data: [] }))
    const result = await checkHiddenBadgeUsage(used.client, { id: 'self', name: '이름' })
    expect(result).toMatchObject({ ok: false, status: 400 })
    if (!result.ok) expect(result.error).toContain('주말 러닝')
  })

  it('사용처를 읽지 못하면 통과시키지 않고 500이다. DB 오류 원문은 응답에 없다', async () => {
    const { client } = makeClient(() => ({ data: null, error: { message: 'db-internal-host timeout' } }))
    const result = await checkHiddenBadgeUsage(client, { id: 'self', name: '이름' })
    expect(result).toMatchObject({ ok: false, status: 500 })
    if (!result.ok) expect(result.error).not.toContain('db-internal-host')
  })
})

describe('withoutHiddenRewardBadgeIds — 노출 가림', () => {
  const mission = { id: 'm1', title: '미션', reward_badge_ids: [ID_A, ID_B] as string[] | null }

  it('숨김 id를 빼고 나머지 칸은 그대로 둔다. 원본은 바꾸지 않는다', () => {
    const result = withoutHiddenRewardBadgeIds(mission, new Set([ID_A]))
    expect(result).toEqual({ id: 'm1', title: '미션', reward_badge_ids: [ID_B] })
    expect(mission.reward_badge_ids).toEqual([ID_A, ID_B])
  })

  it('숨김이 없거나 보상 배지가 없으면 같은 객체를 돌려준다', () => {
    expect(withoutHiddenRewardBadgeIds(mission, new Set())).toBe(mission)
    const none = { id: 'm2', reward_badge_ids: null }
    expect(withoutHiddenRewardBadgeIds(none, new Set([ID_A]))).toBe(none)
  })

  it('보상 배지가 모두 숨김이면 빈 배열이 된다(개수를 알리지 않는다)', () => {
    expect(withoutHiddenRewardBadgeIds(mission, new Set([ID_A, ID_B])).reward_badge_ids).toEqual([])
  })
})
