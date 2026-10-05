/**
 * 요약창의 JAM! 배지 소급 미리 세기 (티켓 20261005_1607, 상위 20260930_1500 ⑨-b). ①~⑨는 티켓 「구현 계획」의 테스트 번호다.
 *
 * ① 예약할 `jam_badge`만 센다(기다리는 중·못 하는 항목·다른 종류 제외) ② JAM! 행동 지표 배지는 `candidateBadges`로 넘기고 `badgeIds`는 넘기지 않으며 이 묶음 배지만 골라 줄을 만든다
 * ③ 유저가 상한 이하면 전원을 센다 ④ 500명을 넘으면 500명에서 멈추고 환산한다 ⑤ 시간 예산(주입한 시계)이 지나면 멈추고 환산한다
 * ⑥ 컬렉션 완성 보상·미션 보상·사용량 지표만 가진 배지는 미리 세기 함수에 넘기지 않는다 ⑦ 형식 오류는 `formatInvalid` ⑧ 센 배지가 없으면 유저를 읽지 않는다
 * ⑨ 덩어리가 던지면 센 배지 줄이 `failed`이고 던지지 않으며, 유저 단위 오류는 `failedUsers`로 세고 환산 분모에서 뺀다
 * 그 밖에: 쓰기 없음, 유저 ID 읽기(페이징), 섞기.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { PreviewUpcomingJamBadgesResult } from '@/lib/badge-engine/reevaluateCatalog'
import type { BadgeRow } from '@/types/database'
import type { ExecuteServiceClient } from '../handlers'
import { BADGE_PREVIEW_CHUNK, BADGE_PREVIEW_MAX_USERS, previewBundleBadges, type BadgePreviewInput } from '../badgePreview'
import { precheckBundle } from '../precheck'
import { linkedIdsFor, pointedByOf } from '../run'
import { FakeDb } from './fakeDb'
import { LATER, NOW, makeItem, type ItemSpec } from './fixtures'

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const STARTS_AT = new Date(LATER).toISOString()

type PreviewCall = { userIds: string[]; candidateBadges: BadgeRow[] }
type PreviewFn = NonNullable<BadgePreviewInput['preview']>

function badgeSpec(n: number, key: string, resource: Record<string, unknown> = {}, extra: Partial<ItemSpec> = {}): ItemSpec {
  return {
    id: uid(n),
    key,
    kind: 'jam_badge',
    original: { copy: { name: `배지 ${key}`, description: `${key} 설명이에요.` } },
    resource: { condition_json: { combine_success_count: 1 }, rarity: 'common', point_reward: 10, ...resource },
    ...extra,
  }
}

const itemsOf = (specs: ItemSpec[]) => specs.map((spec) => makeItem(spec))

/** 서버가 하는 대로 사전 점검을 해서 `ready`를 얻는다(실제 레지스트리). */
function setup(specs: ItemSpec[]) {
  const items = itemsOf(specs)
  const precheck = precheckBundle(items, { now: NOW })
  return { items, precheck }
}

/** 센 유저마다 정해진 배지를 받는다고 하는 가짜 미리 세기. 한 덩어리마다 호출을 기록한다. */
function makePreview(options: { earns?: (userId: string, badge: BadgeRow) => boolean; errorsFor?: (userIds: string[]) => PreviewUpcomingJamBadgesResult['errors']; onCall?: () => void } = {}) {
  const calls: PreviewCall[] = []
  const earns = options.earns ?? (() => true)
  const preview = vi.fn<PreviewFn>(async (_service, call) => {
    calls.push(call)
    options.onCall?.()
    const errors = options.errorsFor?.(call.userIds) ?? []
    const failed = new Set(errors.map((error) => error.userId))
    const badges = call.candidateBadges
      .map((badge) => ({
        badgeId: badge.id,
        name: badge.name,
        validFrom: badge.valid_from,
        userCount: call.userIds.filter((userId) => !failed.has(userId) && earns(userId, badge)).length,
        points: 0,
      }))
      .filter((entry) => entry.userCount > 0)
    // 이 묶음 밖의 DB 배지도 함께 센다(결과에서 이 묶음 배지만 골라내는지 보려는 것이다).
    badges.push({ badgeId: 'db-badge', name: 'DB 배지', validFrom: null, userCount: 99, points: 0 })
    return { targetUserCount: call.userIds.length, affectedUserCount: 0, totalPoints: 0, badges, errors }
  })
  return { preview, calls }
}

const noService = {} as ExecuteServiceClient
const userIdsOf = (count: number) => Array.from({ length: count }, (_, i) => `user-${String(i).padStart(5, '0')}`)

function deps(overrides: Partial<BadgePreviewInput> = {}): BadgePreviewInput {
  return { linkedIdsFor, pointedByOf, now: () => NOW, loadUserIds: async () => userIdsOf(10), random: () => 0, clock: () => 0, ...overrides }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('① 예약할 jam_badge만 센다', () => {
  it('기다리는 중·못 하는 항목·다른 종류는 줄도 정의도 만들지 않는다', async () => {
    const { items, precheck } = setup([
      badgeSpec(1, 'ready'),
      badgeSpec(2, 'blocked', {}, { startsAt: null }), // 공개 시각이 없어 못 한다
      badgeSpec(3, 'waiting'), // 결정 전인 미션과 연결돼 기다린다
      { id: uid(4), key: 'undecided', kind: 'mission', status: 'arrived', links: ['waiting'] },
      { id: uid(5), key: 'card', kind: 'home_feed_card' },
    ])
    expect([...precheck.ready].sort()).toEqual([uid(1), uid(5)])
    expect(precheck.waiting).toContain(uid(3))
    expect(precheck.blocked.map((entry) => entry.id)).toEqual([uid(2)])

    const { preview, calls } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview }))
    expect(result.lines.map((line) => line.itemId)).toEqual([uid(1)])
    expect(calls).toHaveLength(1)
    expect(calls[0].candidateBadges.map((badge) => badge.id)).toEqual([uid(1)])
  })

  it('예약할 배지가 없으면 줄이 없다', async () => {
    const { items, precheck } = setup([{ id: uid(5), key: 'card', kind: 'home_feed_card' }])
    const { preview } = makePreview()
    const loadUserIds = vi.fn(async () => userIdsOf(3))
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds }))
    expect(result).toEqual({ totalUsers: 0, evaluatedUsers: 0, sampled: false, failedUsers: 0, lines: [] })
    expect(loadUserIds).not.toHaveBeenCalled()
  })
})

describe('② 정의를 candidateBadges로 넘기고 이 묶음 배지만 골라 줄을 만든다', () => {
  it('실행과 같은 변환으로 만든 정의를 넘기고 badgeIds는 넘기지 않으며, DB 배지는 줄이 되지 않는다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a', { point_reward: 30, rarity: undefined, level: 2, family_key: '믹스:성공' }), badgeSpec(2, 'b', { condition_json: { drop_item_count: 5 } })])
    const { preview, calls } = makePreview({ earns: (_user, badge) => badge.id === uid(1) })
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds: async () => userIdsOf(4) }))

    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0]).sort()).toEqual(['candidateBadges', 'userIds'])
    expect(calls[0].candidateBadges).toHaveLength(2)
    expect(calls[0].candidateBadges[0]).toMatchObject({
      id: uid(1),
      name: '배지 a',
      type: 'activity',
      admin_category: 'jam',
      rarity: null,
      level: 2,
      family_key: '믹스:성공',
      condition_json: { combine_success_count: 1 },
      point_reward: 30,
      valid_from: STARTS_AT,
      valid_until: null,
      deleted_at: null,
    })
    expect(result.lines).toEqual([
      { itemId: uid(1), status: 'counted', userCount: 4, points: 120 },
      { itemId: uid(2), status: 'counted', userCount: 0, points: 0 },
    ])
    expect(JSON.stringify(result)).not.toContain('db-badge')
  })

  it('배지 포인트가 0이면 포인트 합계도 0이다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a', { point_reward: 0 })])
    const { preview } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds: async () => userIdsOf(3) }))
    expect(result.lines).toEqual([{ itemId: uid(1), status: 'counted', userCount: 3, points: 0 }])
  })

  it('같은 그룹의 레시피 연결은 자리표시 UUID로 채워 형식 검사를 통과한다', async () => {
    const { items, precheck } = setup([
      badgeSpec(1, 'first', { condition_json: { recipe_first_success: {} } }, { links: ['recipe'] }),
      { id: uid(2), key: 'recipe', kind: 'recipe' },
    ])
    expect(precheck.ready).toEqual(expect.arrayContaining([uid(1), uid(2)]))
    const { preview, calls } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview }))
    expect(result.lines.map((line) => line.status)).toEqual(['counted'])
    const recipeId = (calls[0].candidateBadges[0].condition_json as { recipe_first_success: { recipe_id: string } }).recipe_first_success.recipe_id
    expect(recipeId).toMatch(/^[0-9a-f-]{36}$/)
    expect(recipeId).not.toBe(uid(2))
  })
})

describe('③ 유저가 상한 이하면 전원을 센다', () => {
  it('20명씩 센다. 유저마다 한 번씩만 세고 환산하지 않는다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    const users = userIdsOf(45)
    const { preview, calls } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds: async () => users }))

    expect(calls.map((call) => call.userIds.length)).toEqual([BADGE_PREVIEW_CHUNK, BADGE_PREVIEW_CHUNK, 5])
    expect(calls.flatMap((call) => call.userIds).sort()).toEqual(users)
    expect(result).toEqual({
      totalUsers: 45,
      evaluatedUsers: 45,
      sampled: false,
      failedUsers: 0,
      lines: [{ itemId: uid(1), status: 'counted', userCount: 45, points: 450 }],
    })
  })

  it('정확히 상한(500명)이면 다 세고 환산하지 않는다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    const { preview, calls } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds: async () => userIdsOf(BADGE_PREVIEW_MAX_USERS) }))
    expect(calls).toHaveLength(BADGE_PREVIEW_MAX_USERS / BADGE_PREVIEW_CHUNK)
    expect(result).toMatchObject({ totalUsers: 500, evaluatedUsers: 500, sampled: false })
    expect(result.lines[0]).toMatchObject({ userCount: 500 })
  })

  it('유저가 없으면 0명이고 환산하지 않는다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    const { preview } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds: async () => [] }))
    expect(preview).not.toHaveBeenCalled()
    expect(result).toEqual({ totalUsers: 0, evaluatedUsers: 0, sampled: false, failedUsers: 0, lines: [{ itemId: uid(1), status: 'counted', userCount: 0, points: 0 }] })
  })

  it('같은 유저 ID가 겹쳐 와도 한 번만 센다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    const { preview, calls } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds: async () => ['u1', 'u2', 'u1'] }))
    expect(calls.flatMap((call) => call.userIds).sort()).toEqual(['u1', 'u2'])
    expect(result.totalUsers).toBe(2)
  })
})

describe('④ 500명을 넘으면 500명에서 멈추고 환산한다', () => {
  it('무작위로 섞은 500명만 세고 배지별 유저 수를 전체 유저 수로 환산한다(반올림)', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a', { point_reward: 5 })])
    const users = userIdsOf(1201)
    const winners = (userId: string) => Number(userId.slice(-2)) % 3 === 0
    const { preview, calls } = makePreview({ earns: (userId) => winners(userId) })
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds: async () => users }))

    const seen = calls.flatMap((call) => call.userIds)
    expect(calls).toHaveLength(BADGE_PREVIEW_MAX_USERS / BADGE_PREVIEW_CHUNK)
    expect(seen).toHaveLength(BADGE_PREVIEW_MAX_USERS)
    expect(new Set(seen).size).toBe(BADGE_PREVIEW_MAX_USERS)
    // 앞에서부터 자른 것이 아니라 섞은 순서다.
    expect(seen).not.toEqual(users.slice(0, BADGE_PREVIEW_MAX_USERS))

    const raw = seen.filter(winners).length
    const userCount = Math.round((raw * 1201) / 500)
    expect(result).toEqual({
      totalUsers: 1201,
      evaluatedUsers: 500,
      sampled: true,
      failedUsers: 0,
      lines: [{ itemId: uid(1), status: 'counted', userCount, points: userCount * 5 }],
    })
  })

  it('섞기는 주입한 난수로 정해진다(같은 난수면 같은 표본)', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    const users = userIdsOf(900)
    const sampleWith = async (random: () => number) => {
      const { preview, calls } = makePreview()
      await previewBundleBadges(noService, items, precheck, deps({ preview, random, loadUserIds: async () => users }))
      return calls.flatMap((call) => call.userIds)
    }
    const first = await sampleWith(() => 0)
    expect(await sampleWith(() => 0)).toEqual(first)
    let seed = 7
    const lcg = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    expect(await sampleWith(lcg)).not.toEqual(first)
  })
})

describe('⑤ 시간 예산이 지나면 멈추고 환산한다', () => {
  it('덩어리를 세기 전에 40초가 지났는지 보고, 지났으면 거기서 멈춘다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    let now = 0
    const clock = () => now
    // 덩어리 하나마다 15초가 걸린다: 0초 → 15초 → 30초 → 45초(여기서 멈춤). 첫 덩어리의 첫 유저만 받는다.
    let winner: string | null = null
    const { preview, calls } = makePreview({
      earns: (userId) => {
        winner ??= userId
        return userId === winner
      },
      onCall: () => void (now += 15_000),
    })
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, clock, loadUserIds: async () => userIdsOf(100) }))

    expect(calls).toHaveLength(3)
    expect(result.evaluatedUsers).toBe(60)
    expect(result.sampled).toBe(true)
    expect(result.totalUsers).toBe(100)
    // 센 유저 60명 가운데 1명(첫 유저만 true): 1 × 100 / 60 = 1.67 → 2
    expect(result.lines[0]).toMatchObject({ status: 'counted', userCount: 2, points: 20 })
  })

  it('첫 덩어리는 시간과 상관없이 센다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    let now = 0
    const clock = () => {
      const value = now
      now += 100_000
      return value
    }
    const { preview, calls } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, clock, loadUserIds: async () => userIdsOf(100) }))
    expect(calls).toHaveLength(1)
    expect(result).toMatchObject({ totalUsers: 100, evaluatedUsers: 20, sampled: true })
    expect(result.lines[0]).toMatchObject({ userCount: 100 })
  })

  it('예산 안에 다 세면 환산하지 않는다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    let now = 0
    const { preview } = makePreview({ onCall: () => void (now += 1_000) })
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, clock: () => now, loadUserIds: async () => userIdsOf(100) }))
    expect(result).toMatchObject({ evaluatedUsers: 100, sampled: false })
  })
})

describe('⑥ 컬렉션 완성 보상·미션 보상·사용량 지표만 가진 배지는 세지 않는다', () => {
  it('각각 collectionReward·missionReward·notCountable이고 정의는 센 배지만 넘긴다', async () => {
    const { items, precheck } = setup([
      badgeSpec(1, 'counted'),
      badgeSpec(2, 'collectionReward', { condition_json: {} }),
      { id: uid(3), key: 'collection', kind: 'collection_launch', links: ['collectionReward'] },
      badgeSpec(4, 'missionFlag', { condition_json: { mission_reward: true } }),
      badgeSpec(5, 'missionLinked', { condition_json: { follower_count: 3 } }),
      { id: uid(6), key: 'mission', kind: 'mission', links: ['missionLinked'] },
      badgeSpec(7, 'usageOnly', { condition_json: { follower_count: 10 } }),
    ])
    expect(precheck.ready).toEqual(expect.arrayContaining([uid(1), uid(2), uid(4), uid(5), uid(7)]))
    const { preview, calls } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview }))

    expect(Object.fromEntries(result.lines.map((line) => [line.itemId, line.status]))).toEqual({
      [uid(1)]: 'counted',
      [uid(2)]: 'collectionReward',
      [uid(4)]: 'missionReward',
      [uid(5)]: 'missionReward',
      [uid(7)]: 'notCountable',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].candidateBadges.map((badge) => badge.id)).toEqual([uid(1)])
    for (const line of result.lines.filter((entry) => entry.status !== 'counted')) {
      expect(line).not.toHaveProperty('userCount')
      expect(line).not.toHaveProperty('points')
    }
  })

  it('JAM! 행동 지표가 하나라도 있으면 컬렉션이 가리켜도 센다', async () => {
    const { items, precheck } = setup([
      badgeSpec(1, 'both', { condition_json: { combine_success_count: 1 } }),
      { id: uid(2), key: 'collection', kind: 'collection_launch', links: ['both'] },
    ])
    const { preview } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview }))
    expect(result.lines.map((line) => line.status)).toEqual(['counted'])
  })

  it('센 배지가 하나도 없으면 미리 세기 함수를 부르지 않는다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'usageOnly', { condition_json: { follower_count: 10 } }), badgeSpec(2, 'missionFlag', { condition_json: { mission_reward: true } })])
    const { preview } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview }))
    expect(preview).not.toHaveBeenCalled()
    expect(result.lines.map((line) => line.status)).toEqual(['notCountable', 'missionReward'])
  })
})

describe('⑦ 형식 오류는 formatInvalid', () => {
  it('변환이나 조건 검사를 통과하지 못하면 세지 않는다', async () => {
    const { items, precheck } = setup([
      badgeSpec(1, 'ok'),
      badgeSpec(2, 'noCondition', { condition_json: undefined }),
      badgeSpec(3, 'noIssuing', { condition_json: {} }), // 발급 조건이 없다
      badgeSpec(4, 'badPoint', { point_reward: -3 }),
    ])
    const { preview, calls } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview }))
    expect(result.lines.map((line) => [line.itemId, line.status])).toEqual([
      [uid(1), 'counted'],
      [uid(2), 'formatInvalid'],
      [uid(3), 'formatInvalid'],
      [uid(4), 'formatInvalid'],
    ])
    expect(calls[0].candidateBadges.map((badge) => badge.id)).toEqual([uid(1)])
  })

  it('형식 오류 사유 원문은 결과에 싣지 않는다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'noCondition', { condition_json: undefined })])
    const { preview } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview }))
    expect(JSON.stringify(result)).not.toContain('condition_json')
    expect(result.lines).toEqual([{ itemId: uid(1), status: 'formatInvalid' }])
  })
})

describe('⑧ 센 배지가 없으면 유저를 읽지 않는다', () => {
  it('형식 오류만 있어도 유저 ID를 읽지 않는다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'noCondition', { condition_json: undefined })])
    const loadUserIds = vi.fn(async () => userIdsOf(3))
    const { preview } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds }))
    expect(loadUserIds).not.toHaveBeenCalled()
    expect(preview).not.toHaveBeenCalled()
    expect(result).toMatchObject({ totalUsers: 0, evaluatedUsers: 0, sampled: false, failedUsers: 0 })
  })
})

describe('⑨ 오류', () => {
  it('덩어리가 던지면 센 배지 줄이 모두 failed이고 함수는 던지지 않으며, 센 배지가 아닌 줄은 그대로다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a'), badgeSpec(2, 'usageOnly', { condition_json: { follower_count: 10 } }), badgeSpec(3, 'b')])
    let call = 0
    const preview = vi.fn<PreviewFn>(async () => {
      call += 1
      if (call === 2) throw new Error('배지 목록 조회 실패: relation "badges" secret')
      return { targetUserCount: 20, affectedUserCount: 20, totalPoints: 0, badges: [{ badgeId: uid(1), name: 'a', validFrom: null, userCount: 20, points: 0 }], errors: [] }
    })
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds: async () => userIdsOf(60) }))

    expect(Object.fromEntries(result.lines.map((line) => [line.itemId, line.status]))).toEqual({ [uid(1)]: 'failed', [uid(2)]: 'notCountable', [uid(3)]: 'failed' })
    expect(result.lines.every((line) => !('userCount' in line) && !('points' in line))).toBe(true)
    expect(JSON.stringify(result)).not.toContain('secret')
    // 더 세지 않는다
    expect(preview).toHaveBeenCalledTimes(2)
  })

  it('유저 ID를 읽지 못하면 센 배지 줄이 failed이고 던지지 않는다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    const { preview } = makePreview()
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds: async () => Promise.reject(new Error('users secret')) }))
    expect(result.lines).toEqual([{ itemId: uid(1), status: 'failed' }])
    expect(preview).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('유저 단위 오류는 failedUsers로 세고 센 유저 수에서 뺀다. 다 셌으면 환산하지 않는다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    const users = userIdsOf(30)
    const { preview } = makePreview({ errorsFor: (ids) => (ids.length === 20 ? ids.slice(0, 2).map((userId) => ({ userId, message: 'boom' })) : []) })
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds: async () => users }))
    expect(result).toEqual({
      totalUsers: 30,
      evaluatedUsers: 28,
      sampled: false,
      failedUsers: 2,
      lines: [{ itemId: uid(1), status: 'counted', userCount: 28, points: 280 }],
    })
  })

  it('표본이면 오류가 난 유저를 뺀 센 유저 수로 환산한다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    let now = 0
    const { preview } = makePreview({
      onCall: () => void (now += 15_000),
      earns: () => true,
      errorsFor: (ids) => ids.slice(0, 2).map((userId) => ({ userId, message: 'boom' })),
    })
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, clock: () => now, loadUserIds: async () => userIdsOf(100) }))
    // 3덩어리(60명) 가운데 6명 오류 → 센 유저 54명, 54명 모두 받았다 → 54 × 100 / 54 = 100
    expect(result).toMatchObject({ totalUsers: 100, evaluatedUsers: 54, failedUsers: 6, sampled: true })
    expect(result.lines[0]).toMatchObject({ userCount: 100 })
  })

  it('센 유저가 한 명도 없으면(모두 오류) 0명으로 보이지 않고 failed다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    const { preview } = makePreview({ errorsFor: (ids) => ids.map((userId) => ({ userId, message: 'boom' })) })
    const result = await previewBundleBadges(noService, items, precheck, deps({ preview, loadUserIds: async () => userIdsOf(10) }))
    expect(result.lines).toEqual([{ itemId: uid(1), status: 'failed' }])
    expect(result).toMatchObject({ totalUsers: 10, evaluatedUsers: 0, failedUsers: 10 })
  })
})

describe('읽기 전용과 기본 유저 읽기', () => {
  it('기본 유저 읽기는 users의 id를 정렬해 페이지로 읽고 그 밖의 테이블·쓰기는 부르지 않는다', async () => {
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    const ids = userIdsOf(2500)
    const seen: string[] = []
    const service = {
      from: (table: string) => {
        seen.push(`from:${table}`)
        return {
          select: (columns: string) => {
            seen.push(`select:${columns}`)
            const query = {
              order: (column: string) => {
                seen.push(`order:${column}`)
                return query
              },
              range: async (from: number, to: number) => ({ data: ids.slice(from, to + 1).map((id) => ({ id })), error: null }),
            }
            return query
          },
        }
      },
    } as unknown as ExecuteServiceClient
    const { preview, calls } = makePreview()
    const result = await previewBundleBadges(service, items, precheck, { linkedIdsFor, pointedByOf, now: () => NOW, preview, random: () => 0, clock: () => 0 })

    expect(new Set(seen)).toEqual(new Set(['from:users', 'select:id', 'order:id']))
    expect(result).toMatchObject({ totalUsers: 2500, evaluatedUsers: 500, sampled: true })
    expect(new Set(calls.flatMap((call) => call.userIds)).size).toBe(500)
  })

  it('DB에 쓰지 않는다(가짜 DB의 호출이 없다)', async () => {
    const db = new FakeDb()
    const { items, precheck } = setup([badgeSpec(1, 'a')])
    const { preview } = makePreview()
    await previewBundleBadges(db.service, items, precheck, deps({ preview }))
    expect(db.calls).toEqual([])
  })
})
