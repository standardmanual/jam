/**
 * lib/chapter/badgeReceive — 챕터 점수 «배지 받기» 공용 함수 (티켓 20261019_1315 2a회)
 *
 * 고정하는 것:
 * - 새로 받은 액티비티·체크인 배지는 `badge_receive` 1점 단위로 센다. 원천 id는 (유저, 배지)로 만든 결정적 id라 같은 배지를 두 번 받아도
 *   (초기화·삭제 뒤 재획득 포함) 같은 (활동 종류, 원천 id)다. 날짜는 보내지 않는다(DB가 오늘로 센다).
 * - 세지 않는 것마다 DB(`chapter_add_score`)를 부르지 않는다: 아이템 배지, 숨김 배지, 팔로워·팔로잉·챕터 조건 배지, 이용 정지 유저,
 *   카탈로그 재평가 배치, 어드민 시뮬레이터(`admin_simulate`·`admin_test`), `dryRun`. 제외 키가 아닌 조건(잼·동기화 횟수)은 센다.
 * - 이용 정지 확인은 마지막 검사다(제외 규칙에 걸리면 조회하지 않는다). 확인이 실패하면 «정지 아님»으로 보지 않고 점수를 세지 않으며 기록을 남긴다.
 * - 어떤 실패도 던지지 않는다(RPC 오류·정지 확인 실패·잘못된 입력).
 * - (2b회, 티켓 20261019_1315) 반복형의 새 회차는 `occurrenceActivityId`를 주면 원천 id가 (유저, 배지, 활동 id)로 달라져 첫 획득의 (유저, 배지) id와 구분된다.
 *   제외 규칙은 회차에도 그대로 적용되고, 회차 활동 id가 비었거나 올바르지 않으면 세지 않고 기록한다. `awardBadgeReceiveOccurrenceScores`는 여러 회차를
 *   활동 id마다 한 번씩 센다(중복 id 한 번, 첫 회차가 제외면 나머지는 부르지 않음, 실패는 회차마다 기록하고 다른 회차를 막지 않음).
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/badge-receive.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const logMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

import {
  awardBadgeReceiveOccurrenceScores,
  awardBadgeReceiveScore,
  BADGE_RECEIVE_EXCLUDED_CONDITION_KEYS,
  BADGE_RECEIVE_EXCLUDED_TRIGGERS,
  type BadgeReceiveBadge,
  type BadgeReceiveOrigin,
} from '../badgeReceive'
import { deterministicSourceId } from '../source-id'
import { CATALOG_REEVALUATION_TRIGGER } from '@/lib/badge-engine/reevaluateCatalog'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER_USER = '33333333-3333-4333-8333-333333333333'
const NATURAL: BadgeReceiveOrigin = { triggeredBy: 'strava_sync' }
const OK_ROW = { score_added: 10, current_chapter: 1, reached_chapters: [] as number[] }

function activityBadge(overrides: Partial<BadgeReceiveBadge> = {}): BadgeReceiveBadge {
  return { id: 'badge-a', type: 'activity', is_hidden: false, condition_json: { total_count: 1 }, ...overrides }
}

interface FakeOptions {
  suspended?: boolean
  suspensionError?: string
  rpcResult?: { data: unknown; error: unknown }
  /** 호출 인자에 따라 결과를 바꾼다 (없으면 `rpcResult`) */
  rpcImpl?: (args: Record<string, unknown>) => { data: unknown; error: unknown }
}

function fakeClient(options: FakeOptions = {}) {
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => options.rpcImpl?.(args) ?? options.rpcResult ?? { data: [OK_ROW], error: null })
  const fromTables: string[] = []
  const from = vi.fn((table: string) => {
    fromTables.push(table)
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = () => builder
    builder.is = () => builder
    builder.maybeSingle = async () => ({
      data: options.suspended ? { id: 's-1', reason: '운영 정책 위반', suspended_at: '2026-10-01T00:00:00Z' } : null,
      error: options.suspensionError ? { message: options.suspensionError } : null,
    })
    return builder
  })
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from, fromTables }
}

function rpcArgsOf(rpc: ReturnType<typeof fakeClient>['rpc']): Record<string, unknown>[] {
  return (rpc.mock.calls as unknown as [string, Record<string, unknown>][]).map(([, args]) => args)
}

beforeEach(() => {
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('awardBadgeReceiveScore — 센다', () => {
  it('새로 받은 액티비티 배지는 badge_receive 1단위로 세고, 원천 id는 (유저, 배지) 결정적 id이며 날짜는 보내지 않는다', async () => {
    const { client, rpc } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('chapter_add_score', {
      p_user_id: USER,
      p_activity_kind: 'badge_receive',
      p_source_id: deterministicSourceId('badge_receive', USER, 'badge-a'),
      p_amount: 1,
    })
    expect(Object.keys(rpcArgsOf(rpc)[0])).not.toContain('p_occurred_on')
    expect(outcome).toEqual({
      status: 'scored',
      score: { ok: true, scoreAdded: 10, currentChapter: 1, reachedChapters: [] },
    })
  })

  it('체크인 배지도 센다 — 숨김·조건 값이 없어도(체크인은 숨김일 수 없다) 제외하지 않는다', async () => {
    const { client, rpc } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: { id: 'checkin-1', type: 'checkin' }, origin: NATURAL })

    expect(outcome.status).toBe('scored')
    expect(rpcArgsOf(rpc)[0].p_source_id).toBe(deterministicSourceId('badge_receive', USER, 'checkin-1'))
  })

  it('is_hidden가 null이거나 condition_json이 null이어도 센다', async () => {
    const { client, rpc } = fakeClient()

    await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge({ is_hidden: null, condition_json: null }), origin: NATURAL })

    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['잼 조건(jam_total_earned)', { jam_total_earned: 1000 }],
    ['동기화 횟수 조건(daily_sync_count)', { daily_sync_count: 3 }],
    ['체크인 배지 보유 조건(checkin_badge_count)', { checkin_badge_count: 5 }],
  ])('제외 키가 아닌 %s 배지는 센다', async (_label, condition) => {
    const { client, rpc } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge({ condition_json: condition }), origin: NATURAL })

    expect(outcome.status).toBe('scored')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('같은 배지를 두 번 받아도(초기화·삭제 뒤 재획득) 같은 (활동 종류, 원천 id)를 보낸다', async () => {
    const { client, rpc } = fakeClient()

    await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL })
    await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: { triggeredBy: 'mission_reward:m-1' } })

    const [first, second] = rpcArgsOf(rpc)
    expect(first.p_activity_kind).toBe(second.p_activity_kind)
    expect(first.p_source_id).toBe(second.p_source_id)
  })

  it('다른 배지·다른 유저는 다른 원천 id다', async () => {
    const { client, rpc } = fakeClient()

    await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge({ id: 'badge-a' }), origin: NATURAL })
    await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge({ id: 'badge-b' }), origin: NATURAL })
    await awardBadgeReceiveScore(client, { userId: OTHER_USER, badge: activityBadge({ id: 'badge-a' }), origin: NATURAL })

    const ids = rpcArgsOf(rpc).map((a) => a.p_source_id)
    expect(new Set(ids).size).toBe(3)
  })

  it('레벨형 여러 레벨은 레벨(=배지 행)마다 다른 원천 id로 각각 센다', async () => {
    const { client, rpc } = fakeClient()

    for (const level of [1, 2, 3]) {
      await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge({ id: `run:infinite-lv${level}` }), origin: NATURAL })
    }

    expect(rpc).toHaveBeenCalledTimes(3)
    expect(new Set(rpcArgsOf(rpc).map((a) => a.p_source_id)).size).toBe(3)
  })
})

describe('awardBadgeReceiveScore — 세지 않는다', () => {
  it('아이템 배지는 점수를 부르지 않고 정지 조회도 하지 않는다', async () => {
    const { client, rpc, from } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge({ type: 'item' }), origin: NATURAL })

    expect(outcome).toEqual({ status: 'skipped', reason: 'badge_type' })
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('숨김 배지는 점수를 부르지 않는다', async () => {
    const { client, rpc } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge({ is_hidden: true }), origin: NATURAL })

    expect(outcome).toEqual({ status: 'skipped', reason: 'hidden' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['follower_count', 'following_count', 'chapter_reached'])('조건 키 %s가 있는 배지는 점수를 부르지 않는다', async (key) => {
    const { client, rpc, from } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, {
      userId: USER,
      badge: activityBadge({ condition_json: { [key]: 10 } }),
      origin: NATURAL,
    })

    expect(outcome).toEqual({ status: 'skipped', reason: 'excluded_condition' })
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('제외 키가 다른 조건과 섞여 있어도 제외한다', async () => {
    const { client, rpc } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, {
      userId: USER,
      badge: activityBadge({ condition_json: { total_count: 3, follower_count: 10 } }),
      origin: NATURAL,
    })

    expect(outcome).toEqual({ status: 'skipped', reason: 'excluded_condition' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('이용 정지 중인 유저는 점수를 부르지 않는다', async () => {
    const { client, rpc, fromTables } = fakeClient({ suspended: true })

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL })

    expect(outcome).toEqual({ status: 'skipped', reason: 'suspended' })
    expect(fromTables).toEqual(['user_suspensions'])
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['카탈로그 재평가 배치', { triggeredBy: 'catalog_reevaluation' }],
    ['카탈로그 재평가 배치(접두 형태)', { triggeredBy: 'catalog_reevaluation:usage_metric:daily_sync_count' }],
    ['어드민 시뮬레이터', { triggeredBy: 'admin_simulate' }],
    ['어드민 시험 발급', { triggeredBy: 'admin_test' }],
    ['dryRun', { triggeredBy: 'strava_sync', dryRun: true }],
  ] satisfies [string, BadgeReceiveOrigin][])('%s에서 받은 배지는 점수를 부르지 않는다', async (_label, origin) => {
    const { client, rpc, from } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin })

    expect(outcome).toEqual({ status: 'skipped', reason: 'origin' })
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('dryRun이 false이면 자연 발급과 같다', async () => {
    const { client, rpc } = fakeClient()

    await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: { triggeredBy: 'strava_sync', dryRun: false } })

    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('제외 상수', () => {
  it('제외 키는 팔로워·팔로잉·챕터 도달이다(포인트를 가리키는 조건 키는 지금 0개)', () => {
    expect([...BADGE_RECEIVE_EXCLUDED_CONDITION_KEYS].sort()).toEqual(['chapter_reached', 'follower_count', 'following_count'])
  })

  it('제외 트리거에 카탈로그 재평가 모듈의 트리거 값이 들어 있다', () => {
    expect(BADGE_RECEIVE_EXCLUDED_TRIGGERS.has(CATALOG_REEVALUATION_TRIGGER)).toBe(true)
    expect([...BADGE_RECEIVE_EXCLUDED_TRIGGERS].sort()).toEqual(['admin_simulate', 'admin_test', 'catalog_reevaluation'])
  })
})

describe('awardBadgeReceiveScore — 실패는 던지지 않는다', () => {
  it('점수 RPC가 오류여도 던지지 않고 failed다(기록은 점수 함수가 남긴다)', async () => {
    const { client } = fakeClient({ rpcResult: { data: null, error: { message: 'boom' } } })

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL })

    expect(outcome).toEqual({ status: 'failed' })
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ kind: 'badge_receive' }))
  })

  it('이용 정지 확인이 실패하면 «정지 아님»으로 보지 않고 점수를 세지 않으며 기록을 남긴다', async () => {
    const { client, rpc } = fakeClient({ suspensionError: 'connection reset' })

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL })

    expect(outcome).toEqual({ status: 'failed' })
    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_score_failed',
      USER,
      expect.objectContaining({
        kind: 'badge_receive',
        sourceId: deterministicSourceId('badge_receive', USER, 'badge-a'),
        error: expect.stringContaining('이용 정지 확인 실패'),
      })
    )
  })

  it('클라이언트가 던져도(정지 조회·RPC 모두) 던지지 않는다', async () => {
    const client = {
      from: () => {
        throw new Error('from 폭발')
      },
      rpc: () => {
        throw new Error('rpc 폭발')
      },
    } as unknown as SupabaseClient

    await expect(awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL })).resolves.toEqual({ status: 'failed' })
  })

  it('배지 id가 비어 원천 id를 만들 수 없어도 던지지 않고 점수를 부르지 않는다', async () => {
    const { client, rpc } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge({ id: '' }), origin: NATURAL })

    expect(outcome).toEqual({ status: 'failed' })
    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ kind: 'badge_receive', sourceId: null }))
  })

  it('기록 함수까지 던져도 던지지 않는다', async () => {
    logMock.mockRejectedValue(new Error('로그 폭발'))
    const { client } = fakeClient({ suspensionError: 'connection reset' })

    await expect(awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL })).resolves.toEqual({ status: 'failed' })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2b회 — 반복형의 새 회차

function occurrenceKey(badgeId: string, activityId: number | string): string {
  return deterministicSourceId('badge_receive', USER, badgeId, String(activityId))
}

describe('awardBadgeReceiveScore — 반복형 회차(occurrenceActivityId)', () => {
  it('회차 원천 id는 (유저, 배지, 활동 id)이고 수량 1, 날짜는 보내지 않는다 — 첫 획득의 (유저, 배지) id와 다르다', async () => {
    const { client, rpc } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL, occurrenceActivityId: 123456789012 })
    await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL })

    const [occurrence, receipt] = rpcArgsOf(rpc)
    expect(outcome.status).toBe('scored')
    expect(occurrence).toEqual({
      p_user_id: USER,
      p_activity_kind: 'badge_receive',
      p_source_id: occurrenceKey('badge-a', 123456789012),
      p_amount: 1,
    })
    expect(Object.keys(occurrence)).not.toContain('p_occurred_on')
    expect(occurrence.p_source_id).not.toBe(receipt.p_source_id)
    expect(receipt.p_source_id).toBe(deterministicSourceId('badge_receive', USER, 'badge-a'))
  })

  it('같은 회차는 같은 키, 다른 회차·다른 배지·다른 유저는 다른 키다 (숫자 id와 같은 값의 문자열 id는 같은 회차)', async () => {
    const { client, rpc } = fakeClient()

    await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL, occurrenceActivityId: 101 })
    await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL, occurrenceActivityId: '101' })
    await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL, occurrenceActivityId: 102 })
    await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge({ id: 'badge-b' }), origin: NATURAL, occurrenceActivityId: 101 })
    await awardBadgeReceiveScore(client, { userId: OTHER_USER, badge: activityBadge(), origin: NATURAL, occurrenceActivityId: 101 })

    const ids = rpcArgsOf(rpc).map((a) => a.p_source_id)
    expect(ids[0]).toBe(ids[1])
    expect(new Set(ids).size).toBe(4)
  })

  it.each([
    ['아이템 배지', activityBadge({ type: 'item' }), NATURAL],
    ['숨김 배지', activityBadge({ is_hidden: true }), NATURAL],
    ['제외 조건 키(follower_count) 배지', activityBadge({ condition_json: { follower_count: 10 } }), NATURAL],
    ['카탈로그 재평가 배치', activityBadge(), { triggeredBy: 'catalog_reevaluation' }],
    ['어드민 시뮬레이터', activityBadge(), { triggeredBy: 'admin_simulate' }],
    ['dryRun', activityBadge(), { triggeredBy: 'strava_sync', dryRun: true }],
  ] satisfies [string, BadgeReceiveBadge, BadgeReceiveOrigin][])('제외 규칙은 회차에도 적용된다: %s', async (_label, badge, origin) => {
    const { client, rpc } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge, origin, occurrenceActivityId: 101 })

    expect(outcome.status).toBe('skipped')
    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('이용 정지 중인 유저의 회차는 점수를 부르지 않는다', async () => {
    const { client, rpc } = fakeClient({ suspended: true })

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL, occurrenceActivityId: 101 })

    expect(outcome).toEqual({ status: 'skipped', reason: 'suspended' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['null', null],
    ['빈 문자열', ''],
    ['공백 문자열', '  '],
    ['0', 0],
    ['음수', -5],
    ['정수가 아닌 수', 1.5],
    ['NaN', Number.NaN],
    ['안전 정수 범위 밖', Number.MAX_SAFE_INTEGER + 2],
  ] as const)('회차 활동 id가 비었거나 올바르지 않으면(%s) 세지 않고 기록한다 — 던지지 않는다', async (_label, activityId) => {
    const { client, rpc, from } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL, occurrenceActivityId: activityId })

    expect(outcome).toEqual({ status: 'failed' })
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_score_failed',
      USER,
      expect.objectContaining({ kind: 'badge_receive', sourceId: null, error: expect.stringContaining('회차 활동 id') })
    )
  })

  it('생략하면(undefined) 첫 획득이다 — 회차 활동 id 검사에 걸리지 않는다', async () => {
    const { client, rpc } = fakeClient()

    const outcome = await awardBadgeReceiveScore(client, { userId: USER, badge: activityBadge(), origin: NATURAL, occurrenceActivityId: undefined })

    expect(outcome.status).toBe('scored')
    expect(rpcArgsOf(rpc)[0].p_source_id).toBe(deterministicSourceId('badge_receive', USER, 'badge-a'))
  })
})

describe('awardBadgeReceiveOccurrenceScores — 여러 회차', () => {
  const input = (activityIds: (number | string | null | undefined)[], overrides: Partial<Parameters<typeof awardBadgeReceiveOccurrenceScores>[1]> = {}) => ({
    userId: USER,
    badge: activityBadge(),
    origin: NATURAL,
    activityIds,
    ...overrides,
  })

  it('회차마다 한 번씩 세고 키가 모두 다르다', async () => {
    const { client, rpc } = fakeClient()

    const result = await awardBadgeReceiveOccurrenceScores(client, input([101, 102, 103]))

    expect(result).toEqual({ scored: 3, failed: 0 })
    expect(rpc).toHaveBeenCalledTimes(3)
    expect(new Set(rpcArgsOf(rpc).map((a) => a.p_source_id))).toEqual(new Set([101, 102, 103].map((id) => occurrenceKey('badge-a', id))))
  })

  it('같은 활동 id는(숫자·문자열이 섞여도) 한 번만 센다', async () => {
    const { client, rpc } = fakeClient()

    const result = await awardBadgeReceiveOccurrenceScores(client, input([101, '101', 102, 101]))

    expect(result.scored).toBe(2)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('회차가 많아도 모두 센다 (동시 상한 단위로 나눠 보낸다)', async () => {
    const { client, rpc } = fakeClient()
    const ids = Array.from({ length: 23 }, (_, i) => 1000 + i)

    const result = await awardBadgeReceiveOccurrenceScores(client, input(ids))

    expect(result).toEqual({ scored: 23, failed: 0 })
    expect(new Set(rpcArgsOf(rpc).map((a) => a.p_source_id)).size).toBe(23)
  })

  it('회차가 없으면 아무것도 부르지 않는다', async () => {
    const { client, rpc, from } = fakeClient()

    const result = await awardBadgeReceiveOccurrenceScores(client, input([]))

    expect(result).toEqual({ scored: 0, failed: 0 })
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('첫 회차가 제외 대상이면 나머지 회차도 같은 이유로 제외라 부르지 않는다 (이용 정지는 정지 조회 한 번뿐)', async () => {
    const { client, rpc, fromTables } = fakeClient({ suspended: true })

    const result = await awardBadgeReceiveOccurrenceScores(client, input([101, 102, 103]))

    expect(result).toEqual({ scored: 0, failed: 0 })
    expect(fromTables).toEqual(['user_suspensions'])
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['숨김 배지', { badge: activityBadge({ is_hidden: true }) }],
    ['재평가 배치', { origin: { triggeredBy: 'catalog_reevaluation' } }],
    ['dryRun', { origin: { triggeredBy: 'strava_sync', dryRun: true } }],
  ])('제외 규칙(%s)은 모든 회차에 적용된다', async (_label, overrides) => {
    const { client, rpc, from } = fakeClient()

    const result = await awardBadgeReceiveOccurrenceScores(client, input([101, 102], overrides))

    expect(result).toEqual({ scored: 0, failed: 0 })
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('비었거나 올바르지 않은 활동 id는 세지 않고 회차마다 기록하며, 나머지 회차는 센다', async () => {
    const { client, rpc } = fakeClient()

    const result = await awardBadgeReceiveOccurrenceScores(client, input([101, null, 0, undefined, 102]))

    expect(result).toEqual({ scored: 2, failed: 3 })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(logMock).toHaveBeenCalledTimes(3)
  })

  it('한 회차의 점수 실패는 다른 회차를 막지 않고, 실패마다 기록한다', async () => {
    const failing = occurrenceKey('badge-a', 102)
    const { client, rpc } = fakeClient({
      rpcImpl: (args) => (args.p_source_id === failing ? { data: null, error: { message: 'boom' } } : { data: [OK_ROW], error: null }),
    })

    const result = await awardBadgeReceiveOccurrenceScores(client, input([101, 102, 103]))

    expect(result).toEqual({ scored: 2, failed: 1 })
    expect(rpc).toHaveBeenCalledTimes(3)
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ kind: 'badge_receive', sourceId: failing }))
  })

  it('클라이언트가 던져도 던지지 않는다', async () => {
    const client = {
      from: () => {
        throw new Error('from 폭발')
      },
      rpc: () => {
        throw new Error('rpc 폭발')
      },
    } as unknown as SupabaseClient

    await expect(awardBadgeReceiveOccurrenceScores(client, input([101, 102]))).resolves.toEqual({ scored: 0, failed: 2 })
  })
})
