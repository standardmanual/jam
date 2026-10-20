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
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/badge-receive.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const logMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

import {
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
}

function fakeClient(options: FakeOptions = {}) {
  const rpc = vi.fn(async () => options.rpcResult ?? { data: [OK_ROW], error: null })
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
