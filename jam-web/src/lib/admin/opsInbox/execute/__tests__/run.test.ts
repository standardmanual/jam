/**
 * 예약 등록 실행 (티켓 20261002_1123, 상위 20260930_1500 ③-b). 실행 흐름은 가짜 핸들러 레지스트리와 메모리 DB(`fakeDb.ts`)로 지킨다.
 * 가정 1~6은 티켓 「착수 전에 정한 것」 번호다. 맨 끝 「실제 레지스트리」는 ④-a(티켓 20261002_1255)가 붙인 홈피드 카드 핸들러와
 * ⑥(티켓 20261002_1944)이 붙인 미션 핸들러까지 통합해 본다.
 *
 * - 사전 점검 요청: 쓰기 없음
 * - 승인하고 예약(티켓 20261026_2022): `includeReviewing` 모드에서 검토중 → 승인됨 → 예약됨, 연결 그룹 실패 시 둘 다 되돌려져 `failed`, 이미 처리된 항목 건너뜀, 시험 묶음은 승인하지 않음, 모드가 꺼져 있으면 검토중을 건드리지 않음
 * - 배지 미리 세기 요청(⑨-b, 티켓 20261005_1607): 묶음 없음 404, 예약할 JAM! 배지만 넘김, 쓰기·슬랙 없음, 오류 비노출. 연결 도우미(`linkedIdsFor`·`pointedByOf`)는 `byId`만 받는다
 * - 선점: 조건부 update, 두 번째 실행·동시 실행 409, 그룹 일부만 차지했을 때(가정 3)
 * - 검증 단계 실패: 만든 것 없이 그룹 전체 실패, 다른 그룹은 계속
 * - 생성 중 실패: 이번에 만든 자원만 역순 undo, undo 실패, 던지는 핸들러
 * - 시험 묶음: 검증까지 하고 만들지 않는다
 * - 결정 기록(execute·fail, 같은 batch_id)과 가정 1(결정 기록 insert 실패)·가정 4·6(실패로 닫을 항목)·가정 5(원문 비노출)
 * - ④-a 가정 6: 실행할 그룹이 없어도 실패로 닫을 항목은 닫는다(200). 닫을 것도 예약할 것도 없을 때만 409
 * - 슬랙 두 갈래와 slack_result 나눠 채우기
 * - 실제 레지스트리: 승인된 카드 → today_cards 행, 시험 묶음은 쓰지 않음, 등록 전 검사 실패는 고정 사유
 * - 실제 레지스트리(⑥): 카드+미션 그룹이 함께 예약되고 하나가 실패하면 역순(카드 먼저)으로 되돌려진다, 사전 점검 두 규칙, 원문 비노출
 * - 실제 레지스트리(⑧-a, 티켓 20261002_2221): 레시피가 공개 전 행과 슬롯으로 예약되고 `created_resource.recipe_id`가 만들기 전에 적힌다, 안 열린 컬렉션 검사,
 *   연결된 카드가 실패하면 레시피도 되돌려진다, 원문 비노출
 * - 실제 레지스트리(⑧-b, 티켓 20261002_2306): 드랍이 `ambient_drop_schedules`의 `scheduled` 행으로 예약되고 `created_resource.ambient_drop_schedule_id`가 만들기 전에 적힌다,
 *   대상 문제·형식 오류는 그 드랍과 연결 그룹이 실패, 연결된 카드가 실패하면 드랍 예약도 되돌려진다, 원문 비노출. 예정 시각 기준 대상 판정(`loadScheduleTargets`)은 mock이다
 * - 실제 레지스트리(⑨-a, 티켓 20261004_1756): JAM! 배지가 공개 전 `badges` 행으로 예약되고 `created_resource.badge_id`가 만들기 전에 적힌다, 미션 보상 칸·카드 배지 칸이 만든 ID로 채워진다,
 *   배지 → 레시피 칸은 만든 레시피 ID로 덮인다, 배지가 실패하면 그룹이 되돌려지고 카드·미션이 실패하면 배지도 역순으로 되돌려진다, 사전 점검 두 규칙, 형식·등록 전 검사 실패, 원문 비노출
 * - 실제 레지스트리(⑩-a, 티켓 20261004_2039): 컬렉션이 공개 전 `item_books` 행으로 예약되고 `created_resource.item_book_id`가 만들기 전에 적힌다, 카드의 `item_book_id`·컬렉션의 `reward_badge_id`가 만든 ID로 채워진다,
 *   컬렉션 보상 배지는 발급 조건이 없어도 예약되고 연결이 없으면 형식 오류다, 컬렉션이나 카드가 실패하면 그룹이 역순(카드→컬렉션→배지)으로 되돌려진다, 사전 점검 두 규칙, 이름 중복·트라이브·보상 배지 검사 실패, 원문 비노출.
 * - ⑩-b(티켓 20261004_2242): 같은 실행에서 만들 컬렉션을 가리키는 드랍과 이전 실행이 만든 컬렉션을 가리키는 드랍이 대상 판정에 그 컬렉션 ID를 미룰 ID로 넘기고 함께 예약된다(드랍 판정 자체는 mock),
 *   드랍이 연결된 컬렉션보다 먼저 공개되면 사전 점검이 막는다
 */
import { vi, describe, it, expect, beforeEach, type MockInstance } from 'vitest'

const h = vi.hoisted(() => ({ postOpsSlack: vi.fn(), loadScheduleTargets: vi.fn() }))

vi.mock('@/lib/admin/opsInbox/slack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/slack')>()
  return { ...actual, postOpsSlack: h.postOpsSlack }
})

// 예약 대상 판정은 `or`·`not`·`range` 같은 질의를 써서 이 파일의 가짜 DB가 받지 않는다. 판정 자체는 `dropSchedule.test.ts`가 실제 함수로 본다.
vi.mock('@/lib/ambient-drop/scheduleTargets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ambient-drop/scheduleTargets')>()
  return { ...actual, loadScheduleTargets: h.loadScheduleTargets }
})

import {
  RESOURCE_KEY_BY_KIND,
  type ExecutableKind,
  type ExecuteFailure,
  type ExecuteHandler,
  type ExecuteHandlerRegistry,
  type ExecuteLinkedIds,
  type PointedByEntry,
} from '../handlers'
import type { ScheduleTargets } from '@/lib/ambient-drop/scheduleTargets'
import { PRECHECK_MESSAGES, precheckBundle } from '../precheck'
import { EXECUTE_HANDLERS } from '../registry'
import { badgePreviewExecution, dryRunExecution, executeBundle, linkedIdsFor, notifyExecution, pointedByOf, type ExecuteSuccess, type RunFailure } from '../run'
import type { BadgePreviewInput } from '../badgePreview'
import { DB_SECRET, FakeDb, type FakeCall, type Row } from './fakeDb'
import { ALL_KINDS, NOW, makeItem, type ItemSpec } from './fixtures'

const B = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ID = { card: uid(1), mission: uid(2), badge: uid(3), recipe: uid(4), solo: uid(5), other: uid(6), extra: uid(7) }
const ACTOR = 'admin-1'
const ISO_NOW = NOW.toISOString()

// ── 가짜 핸들러 ──────────────────────────────────────────────────────────────────────────────────

interface HandlerOptions {
  failPrepare?: ExecuteFailure
  failCheck?: ExecuteFailure
  failCreate?: ExecuteFailure
  failUndo?: ExecuteFailure
  /** 던지는 핸들러(계약 위반). */
  throwOn?: 'check' | 'create'
}

interface Recorder {
  events: string[]
  /** 항목 키 → prepare가 받은 linkedIds(부른 순서대로). */
  linked: Record<string, ExecuteLinkedIds[]>
  /** 항목 키 → prepare가 받은 pointedBy(이 항목을 연결 칸으로 가리키는 항목의 종류·칸, 부른 순서대로. 티켓 20261004_2039 가정 2). */
  pointed: Record<string, Array<readonly PointedByEntry[] | undefined>>
  /** 항목 키 → 만든 자원 ID. */
  created: Record<string, string>
  /** 핸들러가 받은 현재 시각(티켓 20261002_2221 가정 4). 부른 순서대로 단계 이름과 함께 쌓는다. */
  nows: Array<{ step: 'prepare' | 'check' | 'create'; now: Date }>
}

function makeHandler(kind: ExecutableKind, rec: Recorder, options: Record<string, HandlerOptions>): ExecuteHandler {
  const idFirst = kind !== 'recipe' && kind !== 'drop_schedule'
  const optionsOf = (key: string | null) => options[key ?? ''] ?? {}
  const keyOfResource = (resourceId: string) => Object.entries(rec.created).find(([, id]) => id === resourceId)?.[0] ?? resourceId
  return {
    kind,
    resourceKey: RESOURCE_KEY_BY_KIND[kind],
    idFirst,
    prepare: (item, { id, linkedIds, now, pointedBy }) => {
      const key = item.item_key as string
      rec.events.push(`prepare:${key}`)
      rec.nows.push({ step: 'prepare', now })
      ;(rec.linked[key] ??= []).push(linkedIds)
      ;(rec.pointed[key] ??= []).push(pointedBy)
      const failure = optionsOf(key).failPrepare
      if (failure) return { ok: false, failure }
      return { ok: true, value: { item, id, payload: {}, linkFields: [], linkedIds, warnings: [] } }
    },
    check: async (_client, prepared, { now }) => {
      const key = prepared.item.item_key as string
      rec.events.push(`check:${key}`)
      rec.nows.push({ step: 'check', now })
      if (optionsOf(key).throwOn === 'check') throw new Error(DB_SECRET)
      return optionsOf(key).failCheck ?? null
    },
    create: async (_service, prepared, { now }) => {
      const key = prepared.item.item_key as string
      rec.events.push(`create:${key}`)
      rec.nows.push({ step: 'create', now })
      if (optionsOf(key).throwOn === 'create') throw new Error(DB_SECRET)
      const failure = optionsOf(key).failCreate
      if (failure) return { ok: false, failure }
      const id = idFirst ? prepared.id : `server-${key}`
      rec.created[key] = id
      return { ok: true, value: { id } }
    },
    undo: async (_service, resourceId) => {
      const key = keyOfResource(resourceId)
      rec.events.push(`undo:${key}`)
      return optionsOf(key).failUndo ?? null
    },
    cancel: async () => ({ ok: true, missing: false }),
    observe: async () => ({ status: 'missing' }),
  }
}

// ── 준비 ─────────────────────────────────────────────────────────────────────────────────────────

/** 배지 ← 미션 ← 카드 연결(생성 순서: 배지, 미션, 카드). */
const chain = (): ItemSpec[] => [
  { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'] },
  { id: ID.mission, key: 'mission', kind: 'mission', links: ['badge'] },
  { id: ID.badge, key: 'badge', kind: 'jam_badge' },
]

function setup(specs: ItemSpec[], options: Record<string, HandlerOptions> = {}, bundle: Row = {}) {
  const db = new FakeDb()
  db.tables.ops_bundles = [{ id: B, is_sample: false, ...bundle }]
  db.tables.ops_bundle_items = specs.map((spec) => ({ ...makeItem(spec), bundle_id: B }))
  const rec: Recorder = { events: [], linked: {}, pointed: {}, created: {}, nows: [] }
  const handlers: ExecuteHandlerRegistry = Object.fromEntries(ALL_KINDS.map((kind) => [kind, makeHandler(kind, rec, options)]))
  const run = (itemIds: unknown) => executeBundle(db.service, { bundleId: B, itemIds, actor: ACTOR }, { handlers, now: () => NOW })
  return { db, rec, handlers, run }
}

const ok = (outcome: ExecuteSuccess | RunFailure) => {
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  return outcome as ExecuteSuccess
}
const bad = (outcome: unknown) => {
  expect((outcome as RunFailure).ok).toBe(false)
  return outcome as RunFailure
}

const nonSelect = (db: FakeDb) => db.calls.filter((call) => call.op !== 'select')
const statusOf = (db: FakeDb, id: string) => db.item(id).status

/** 놓을 대상이 모두 있는 예정 시각 기준 대상 판정 결과(드랍 핸들러의 `check`가 받는다). */
const targetsOk = (): ScheduleTargets => ({
  pois: [{ id: uid(41), activeSystemCount: 0 }],
  badgePool: [{ id: uid(43), rarity: 'common', itemBookId: uid(42) }],
  excluded: { pois: [], badges: [], collections: [] },
  effectiveCollectionIds: [uid(42)],
})

let errorSpy: MockInstance<typeof console.error>
beforeEach(() => {
  h.postOpsSlack.mockReset()
  h.postOpsSlack.mockResolvedValue({ ok: true })
  h.loadScheduleTargets.mockReset()
  h.loadScheduleTargets.mockResolvedValue(targetsOk())
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
const logged = () => errorSpy.mock.calls.map((args) => args.join(' ')).join('\n')

// ── 사전 점검 요청 ───────────────────────────────────────────────────────────────────────────────

describe('사전 점검 요청 dryRunExecution', () => {
  it('사전 점검 결과를 돌려주고 아무것도 쓰지 않는다', async () => {
    const { db, handlers } = setup([...chain(), { id: ID.solo, key: 'solo', kind: 'recipe', startsAt: null }])
    const outcome = await dryRunExecution(db.service, B, { handlers, now: () => NOW })
    const expected = precheckBundle(db.tables.ops_bundle_items as never, { now: NOW, handlers })
    expect(outcome).toEqual({ ok: true, body: { ok: true, dryRun: true, ...expected, approving: [] } })
    expect(expected.ready).toHaveLength(3)
    expect(expected.blocked.map((entry) => entry.id)).toEqual([ID.solo])
    expect(nonSelect(db)).toEqual([])
  })

  it('없는 묶음은 404, 조회가 실패하면 원문 없이 500이다', async () => {
    const { db } = setup([])
    expect(bad(await dryRunExecution(db.service, uid(99))).status).toBe(404)

    db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'select'
    const failure = bad(await dryRunExecution(db.service, B))
    expect(failure.status).toBe(500)
    expect(JSON.stringify(failure)).not.toContain(DB_SECRET)
  })

  it('빈 레지스트리면 승인 항목은 모두 「아직 연결하지 않은 종류」다', async () => {
    const { db } = setup(chain())
    const outcome = await dryRunExecution(db.service, B, { handlers: {}, now: () => NOW })
    expect(outcome.ok && outcome.body.ready).toEqual([])
    expect(outcome.ok && outcome.body.blocked.map((entry) => entry.reasons[0])).toEqual(Array(3).fill(PRECHECK_MESSAGES.noHandler))
  })
})

// ── 배지 미리 세기 요청 (⑨-b, 티켓 20261005_1607) ────────────────────────────────────────────────

describe('배지 미리 세기 요청 badgePreviewExecution', () => {
  const BADGE_READY = uid(61)
  const BADGE_BLOCKED = uid(62)
  const COLLECTION = uid(63)
  type PreviewFn = NonNullable<BadgePreviewInput['preview']>

  const badgeItem = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: BADGE_READY,
    key: 'badge',
    kind: 'jam_badge',
    original: { copy: { name: '첫 믹스', description: '믹스에 처음 성공했어요.' } },
    resource: { condition_json: { combine_success_count: 1 }, rarity: 'common', point_reward: 10 },
    ...over,
  })
  const earnsAll = (): PreviewFn =>
    vi.fn<PreviewFn>(async (_service, { userIds, candidateBadges }) => ({
      targetUserCount: userIds.length,
      affectedUserCount: userIds.length,
      totalPoints: 0,
      badges: candidateBadges.map((badge) => ({ badgeId: badge.id, name: badge.name, validFrom: badge.valid_from, userCount: userIds.length, points: 0 })),
      errors: [],
    }))

  it('없는 묶음은 404, 항목 조회가 실패하면 원문 없이 500이다', async () => {
    const { db } = setup([])
    expect(bad(await badgePreviewExecution(db.service, uid(99))).status).toBe(404)

    db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'select'
    const failure = bad(await badgePreviewExecution(db.service, B))
    expect(failure.status).toBe(500)
    expect(JSON.stringify(failure)).not.toContain(DB_SECRET)
  })

  it('예약할 JAM! 배지만 미리 세기 함수에 넘기고, 아무것도 쓰지 않으며 슬랙 글도 올리지 않는다', async () => {
    const { db, handlers } = setup([
      badgeItem(),
      badgeItem({ id: BADGE_BLOCKED, key: 'blocked', startsAt: null }), // 공개 시각이 없어 못 한다
      { id: ID.card, key: 'card', kind: 'home_feed_card' },
    ])
    const preview = earnsAll()
    const outcome = await badgePreviewExecution(db.service, B, { handlers, now: () => NOW, preview, loadUserIds: async () => ['u1', 'u2', 'u3'], random: () => 0 })

    expect(outcome).toEqual({
      ok: true,
      body: {
        ok: true,
        badgePreview: { totalUsers: 3, evaluatedUsers: 3, sampled: false, failedUsers: 0, lines: [{ itemId: BADGE_READY, status: 'counted', userCount: 3, points: 30 }] },
      },
    })
    expect(preview).toHaveBeenCalledTimes(1)
    const call = (preview as unknown as MockInstance<PreviewFn>).mock.calls[0][1]
    expect(call.candidateBadges.map((badge) => badge.id)).toEqual([BADGE_READY])
    expect(nonSelect(db)).toEqual([])
    expect(h.postOpsSlack).not.toHaveBeenCalled()
  })

  it('예약할 JAM! 배지가 없으면 유저를 읽지 않고 빈 줄이다', async () => {
    const { db, handlers } = setup([{ id: ID.card, key: 'card', kind: 'home_feed_card' }])
    const loadUserIds = vi.fn(async () => ['u1'])
    const outcome = await badgePreviewExecution(db.service, B, { handlers, now: () => NOW, loadUserIds })
    expect(outcome).toEqual({ ok: true, body: { ok: true, badgePreview: { totalUsers: 0, evaluatedUsers: 0, sampled: false, failedUsers: 0, lines: [] } } })
    expect(loadUserIds).not.toHaveBeenCalled()
  })

  it('컬렉션이 완성 보상으로 가리키는 배지는 실행과 같은 연결 규칙으로 읽어 컬렉션 보상 줄이 된다', async () => {
    const { db, handlers } = setup([badgeItem({ resource: { condition_json: {}, rarity: 'common' } }), { id: COLLECTION, key: 'collection', kind: 'collection_launch', links: ['badge'] }])
    const preview = earnsAll()
    const outcome = await badgePreviewExecution(db.service, B, { handlers, now: () => NOW, preview, loadUserIds: async () => ['u1'] })
    expect(outcome.ok && outcome.body.badgePreview.lines).toEqual([{ itemId: BADGE_READY, status: 'collectionReward' }])
    expect(preview).not.toHaveBeenCalled()
  })

  it('센 도중 던져도 응답은 200이고 줄이 failed다. 원문은 응답에 없고 서버 로그에만 남는다', async () => {
    const { db, handlers } = setup([badgeItem()])
    const preview = vi.fn<PreviewFn>(async () => {
      throw new Error(DB_SECRET)
    })
    const outcome = await badgePreviewExecution(db.service, B, { handlers, now: () => NOW, preview, loadUserIds: async () => ['u1'] })
    expect(outcome.ok && outcome.body.badgePreview.lines).toEqual([{ itemId: BADGE_READY, status: 'failed' }])
    expect(JSON.stringify(outcome)).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('연결 도우미는 묶음의 항목 표(byId)만 받는다: 이미 만든 대상은 created_resource, 가리키는 항목은 linkPlan에서 찾는다', () => {
    const items = [
      { ...makeItem({ id: ID.badge, key: 'badge', kind: 'jam_badge' }), bundle_id: B },
      { ...makeItem({ id: ID.recipe, key: 'recipe', kind: 'recipe', status: 'scheduled', createdResource: { recipe_id: ID.other } }), bundle_id: B },
      { ...makeItem({ id: COLLECTION, key: 'collection', kind: 'collection_launch' }), bundle_id: B },
    ]
    const byId = new Map(items.map((item) => [item.id, item]))
    const group = {
      itemIds: items.map((item) => item.id),
      executeIds: [ID.badge, COLLECTION],
      linkPlan: {
        [ID.badge]: [{ field: 'recipe_id' as const, mode: 'single' as const, targetItemIds: [ID.recipe] }],
        [COLLECTION]: [{ field: 'reward_badge_id' as const, mode: 'single' as const, targetItemIds: [ID.badge] }],
      },
    }
    const placeholders = new Map([[ID.badge, uid(70)]])
    expect(linkedIdsFor(byId, group, items[0], placeholders)).toEqual({ ok: true, value: { recipe_id: ID.other } })
    expect(linkedIdsFor(byId, group, items[2], placeholders)).toEqual({ ok: true, value: { reward_badge_id: uid(70) } })
    expect(linkedIdsFor(byId, group, items[2], new Map())).toMatchObject({ ok: false })
    expect(pointedByOf(byId, group, items[0])).toEqual([{ kind: 'collection_launch', field: 'reward_badge_id' }])
    expect(pointedByOf(byId, group, items[2])).toEqual([])
  })
})

// ── 입력 ─────────────────────────────────────────────────────────────────────────────────────────

describe('입력 확인', () => {
  it('항목이 없거나 UUID가 아니거나 60개를 넘으면 400이고 아무것도 쓰지 않는다', async () => {
    const { db, run } = setup(chain())
    for (const itemIds of [undefined, [], 'x', [5], ['abc'], [ID.card, 'abc']]) expect(bad(await run(itemIds)).status, String(itemIds)).toBe(400)
    const many = Array.from({ length: 61 }, (_, index) => uid(100 + index))
    expect(bad(await run(many)).status).toBe(400)
    expect(nonSelect(db)).toEqual([])
  })

  it('이 묶음의 항목이 아니면 400, 없는 묶음이면 404다', async () => {
    const { db, run } = setup(chain())
    expect(bad(await run([ID.card, uid(99)])).status).toBe(400)
    expect(bad(await executeBundle(db.service, { bundleId: uid(98), itemIds: [ID.card], actor: ACTOR })).status).toBe(404)
    expect(nonSelect(db)).toEqual([])
  })

  it('빈 레지스트리면 요청한 항목은 모두 건너뛰고 409다', async () => {
    const { db } = setup(chain())
    const failure = bad(await executeBundle(db.service, { bundleId: B, itemIds: [ID.card, ID.mission, ID.badge], actor: ACTOR }, { handlers: {}, now: () => NOW }))
    expect(failure.status).toBe(409)
    expect((failure.extra?.skipped as Array<{ reason: string }>).map((entry) => entry.reason)).toEqual(Array(3).fill(PRECHECK_MESSAGES.noHandler))
    expect(nonSelect(db)).toEqual([])
  })

  it('요청한 항목이 그사이 바뀌었으면 건너뛰고 이유를 알린다', async () => {
    const { db, run } = setup([
      { id: ID.solo, key: 'solo', kind: 'recipe' },
      { id: ID.other, key: 'other', kind: 'mission', startsAt: null },
      { id: ID.extra, key: 'extra', kind: 'mission', status: 'scheduled' },
    ])
    const result = ok(await run([ID.solo, ID.other, ID.extra]))
    expect(result.body.scheduled).toEqual([ID.solo])
    expect(result.body.skipped).toEqual([
      { id: ID.other, reason: PRECHECK_MESSAGES.startMissing },
      { id: ID.extra, reason: '이미 다른 곳에서 처리한 항목이에요' },
    ])
    expect(result.body.excludedCount).toBe(2)
    expect(statusOf(db, ID.other)).toBe('approved')
  })
})

// ── 선점 ─────────────────────────────────────────────────────────────────────────────────────────

describe('선점', () => {
  it('항목마다 「승인됨 → 준비중」을 조건부로 차지한 뒤 생성 순서대로 만들어 「예약됨」으로 옮긴다', async () => {
    const { db, rec, run } = setup(chain())
    const result = ok(await run([ID.card, ID.mission, ID.badge]))

    const claim = db.calls.find((call) => call.op === 'update')
    expect(claim).toMatchObject({ table: 'ops_bundle_items', payload: { status: 'preparing', updated_at: ISO_NOW } })
    expect(claim?.filters).toEqual(expect.arrayContaining([['bundle_id', B], ['status', 'approved']]))

    expect(result.body.scheduled).toEqual([ID.badge, ID.mission, ID.card])
    expect(rec.events).toEqual([
      // 검증 단계: 모든 항목을 변환·검사한다
      'prepare:badge', 'check:badge', 'prepare:mission', 'check:mission', 'prepare:card', 'check:card',
      // 생성 단계: 참조당하는 쪽부터, 앞에서 만든 ID를 쓰도록 변환을 다시 한다
      'prepare:badge', 'create:badge', 'prepare:mission', 'create:mission', 'prepare:card', 'create:card',
    ])
    for (const id of [ID.badge, ID.mission, ID.card]) {
      expect(statusOf(db, id)).toBe('scheduled')
      expect(db.item(id).updated_at).toBe(ISO_NOW)
    }
    // 카드 → 미션, 미션 → 배지: 만든 자원 ID가 칸에 들어간다. 만들 항목의 ID는 created_resource에 적힌다.
    expect(db.item(ID.badge).created_resource).toEqual({ badge_id: rec.created.badge })
    expect(db.item(ID.mission).created_resource).toEqual({ mission_id: rec.created.mission })
    expect(db.item(ID.card).created_resource).toEqual({ today_card_id: rec.created.card })
    expect(rec.linked.card.at(-1)).toEqual({ mission_id: rec.created.mission })
    expect(rec.linked.mission.at(-1)).toEqual({ reward_badge_ids: [rec.created.badge] })
  })

  it('prepare는 이 항목을 연결 칸으로 가리키는 항목의 종류·칸(pointedBy)을 그룹의 linkPlan에서 받는다. 검증 단계와 생성 단계가 같다(티켓 20261004_2039 가정 2)', async () => {
    const { rec, run } = setup(chain())
    ok(await run([ID.card, ID.mission, ID.badge]))

    // 카드 → 미션(mission_id), 미션 → 배지(reward_badge_ids). 카드는 아무도 가리키지 않는다.
    for (const entries of [rec.pointed.badge, rec.pointed.mission]) expect(entries).toHaveLength(2)
    for (const entries of rec.pointed.badge) expect(entries).toEqual([{ kind: 'mission', field: 'reward_badge_ids' }])
    for (const entries of rec.pointed.mission) expect(entries).toEqual([{ kind: 'home_feed_card', field: 'mission_id' }])
    for (const entries of rec.pointed.card) expect(entries).toEqual([])
  })

  it('pointedBy에는 가리키는 항목이 이번 실행의 예약할 항목일 때만 든다: 이미 예약된 항목이 가리키면 비어 있다', async () => {
    const { rec, run } = setup([
      { id: ID.mission, key: 'mission', kind: 'mission', status: 'scheduled', links: ['badge'], createdResource: { mission_id: 'mission-uuid-1' } },
      { id: ID.badge, key: 'badge', kind: 'jam_badge' },
    ])
    ok(await run([ID.badge]))

    expect(rec.pointed.badge).toEqual([[], []])
    expect(rec.events.some((event) => event.endsWith(':mission'))).toBe(false)
  })

  it('컬렉션이 보상 칸으로 가리키는 배지는 pointedBy에 컬렉션 종류와 reward_badge_id 칸을 받는다', async () => {
    const { rec, run } = setup([
      { id: ID.badge, key: 'badge', kind: 'jam_badge' },
      { id: ID.recipe, key: 'collection', kind: 'collection_launch', links: ['badge'] },
    ])
    ok(await run([ID.badge, ID.recipe]))

    for (const entries of rec.pointed.badge) expect(entries).toEqual([{ kind: 'collection_launch', field: 'reward_badge_id' }])
  })

  it('핸들러는 prepare·check·create 모두에서 이번 실행의 현재 시각을 받는다(티켓 20261002_2221 가정 4)', async () => {
    const { rec, run } = setup([{ id: ID.solo, key: 'solo', kind: 'mission' }])
    ok(await run([ID.solo]))
    // 검증 단계 prepare·check, 생성 단계 prepare·create
    expect(rec.nows.map((entry) => entry.step)).toEqual(['prepare', 'check', 'prepare', 'create'])
    for (const entry of rec.nows) expect(entry.now.toISOString()).toBe(ISO_NOW)
  })

  it('같은 묶음을 두 번 실행하면 두 번째는 409이고 자원을 다시 만들지 않는다', async () => {
    const { db, rec, run } = setup(chain())
    ok(await run([ID.card, ID.mission, ID.badge]))
    const second = bad(await run([ID.card, ID.mission, ID.badge]))
    expect(second.status).toBe(409)
    expect(rec.events.filter((event) => event.startsWith('create:'))).toHaveLength(3)
    expect(db.decisions('execute')).toHaveLength(3)
  })

  it('같은 묶음을 동시에 실행하면 한 요청만 차지하고 나머지는 409다', async () => {
    const { db, rec, run } = setup(chain())
    const ids = [ID.card, ID.mission, ID.badge]
    const results = await Promise.all([run(ids), run(ids)])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(bad(results.find((result) => !result.ok)).status).toBe(409)
    expect(rec.events.filter((event) => event.startsWith('create:'))).toHaveLength(3)
    expect(db.decisions('execute')).toHaveLength(3)
  })

  it('가정 3: 그룹 일부만 차지했으면 차지한 항목을 「승인됨」으로 되돌리고 그 그룹을 건너뛴다. 다른 그룹은 계속한다', async () => {
    const { db, rec, run } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'] },
      { id: ID.mission, key: 'mission', kind: 'mission' },
      { id: ID.solo, key: 'solo', kind: 'recipe' },
    ])
    // 다른 요청이 카드를 먼저 차지한 상황: 선점 직전에 카드 상태를 바꾼다.
    let flipped = false
    db.beforeRun = (call: FakeCall) => {
      if (!flipped && call.op === 'update' && (call.payload as Row).status === 'preparing') {
        flipped = true
        db.item(ID.card).status = 'preparing'
      }
    }
    const result = ok(await run([ID.card, ID.mission, ID.solo]))

    expect(result.body.scheduled).toEqual([ID.solo])
    expect(result.body.skipped).toEqual([
      { id: ID.mission, reason: '다른 곳에서 동시에 처리해서 건너뛰었어요' },
      { id: ID.card, reason: '다른 곳에서 동시에 처리해서 건너뛰었어요' },
    ])
    expect(result.body.excludedCount).toBe(2)
    expect(statusOf(db, ID.mission)).toBe('approved')
    expect(statusOf(db, ID.card)).toBe('preparing') // 다른 요청이 차지한 항목은 건드리지 않는다
    expect(rec.events.filter((event) => event.startsWith('create:'))).toEqual(['create:solo'])
  })

  it('차지한 항목이 하나도 남지 않으면 409다', async () => {
    const { db, run } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'] },
      { id: ID.mission, key: 'mission', kind: 'mission' },
    ])
    db.beforeRun = (call) => {
      if (call.op === 'update' && (call.payload as Row).status === 'preparing') db.item(ID.card).status = 'preparing'
    }
    expect(bad(await run([ID.card, ID.mission])).status).toBe(409)
    expect(statusOf(db, ID.mission)).toBe('approved')
  })

  it('연결 그룹의 예약할 항목이 요청에 다 있지 않으면 그 그룹은 건너뛴다(칸을 채울 대상이 없다). 요청에 없는 항목은 그대로다', async () => {
    const { db, rec, run } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'] },
      { id: ID.mission, key: 'mission', kind: 'mission' },
      { id: ID.solo, key: 'solo', kind: 'recipe' },
    ])
    const only = bad(await run([ID.mission]))
    expect(only.status).toBe(409)
    expect(only.extra?.skipped).toEqual([{ id: ID.mission, reason: '함께 예약할 연결 항목이 요청에 없어서 건너뛰었어요' }])
    expect(nonSelect(db)).toEqual([])

    const result = ok(await run([ID.solo]))
    expect(result.body.scheduled).toEqual([ID.solo])
    expect(result.body.skipped).toEqual([])
    expect(statusOf(db, ID.card)).toBe('approved')
    expect(statusOf(db, ID.mission)).toBe('approved')
    expect(rec.events.some((event) => event.endsWith(':card'))).toBe(false)
  })

  it('선점이 DB 오류로 실패하면 원문 없이 500이고 핸들러를 부르지 않는다', async () => {
    const { db, rec, run } = setup(chain())
    db.failIf = (call) => call.op === 'update' && (call.payload as Row).status === 'preparing'
    const failure = bad(await run([ID.card, ID.mission, ID.badge]))
    expect(failure.status).toBe(500)
    expect(JSON.stringify(failure)).not.toContain(DB_SECRET)
    expect(rec.events).toEqual([])
    expect(logged()).toContain(DB_SECRET)
  })
})

// ── 검증 단계 ────────────────────────────────────────────────────────────────────────────────────

describe('등록 전 검증 단계', () => {
  it.each([
    ['검사', { failCheck: { reason: '미션 제목이 비었어요', detail: 'check detail' } }],
    ['변환', { failPrepare: { reason: '미션 제목이 비었어요', detail: 'prepare detail' } }],
  ] as const)('%s가 하나라도 실패하면 아무것도 만들지 않고 그룹 전체가 실패한다. 다른 그룹은 계속한다', async (_label, options) => {
    const { db, rec, run } = setup([...chain(), { id: ID.solo, key: 'solo', kind: 'recipe' }], { mission: options })
    const result = ok(await run([ID.card, ID.mission, ID.badge, ID.solo]))

    expect(result.body.scheduled).toEqual([ID.solo])
    expect(result.body.failed).toEqual([
      { id: ID.badge, reason: '연결된 항목을 만들지 못해 함께 실패했어요' },
      { id: ID.mission, reason: '미션 제목이 비었어요' },
      { id: ID.card, reason: '연결된 항목을 만들지 못해 함께 실패했어요' },
    ])
    // 그룹에서는 만든 것이 없고, 되돌릴 것도 없다
    expect(rec.events.filter((event) => event.startsWith('create:') || event.startsWith('undo:'))).toEqual(['create:solo'])
    for (const id of [ID.card, ID.mission, ID.badge]) {
      expect(statusOf(db, id)).toBe('failed')
      expect(db.item(id).created_resource).toBeNull()
    }
    expect(statusOf(db, ID.solo)).toBe('scheduled')
    expect(db.decisions('fail').map((row) => row.item_id)).toEqual([ID.badge, ID.mission, ID.card])
    expect(logged()).toMatch(/check detail|prepare detail/)
  })

  it('시험 묶음은 검증까지 하고 자원은 만들지 않는다. created_resource는 { sample: true }다', async () => {
    const { db, rec, run } = setup(chain(), {}, { is_sample: true })
    const result = ok(await run([ID.card, ID.mission, ID.badge]))
    expect(result.body.scheduled).toEqual([ID.badge, ID.mission, ID.card])
    expect(rec.events).toEqual(['prepare:badge', 'check:badge', 'prepare:mission', 'check:mission', 'prepare:card', 'check:card'])
    for (const id of [ID.card, ID.mission, ID.badge]) {
      expect(statusOf(db, id)).toBe('scheduled')
      expect(db.item(id).created_resource).toEqual({ sample: true })
    }
    expect(db.decisions('execute')).toHaveLength(3)
  })

  it('시험 묶음도 검증에서 걸리면 실패한다', async () => {
    const { db, run } = setup(chain(), { badge: { failCheck: { reason: '배지 이름이 비었어요' } } }, { is_sample: true })
    const result = ok(await run([ID.card, ID.mission, ID.badge]))
    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.map((entry) => entry.id)).toEqual([ID.badge, ID.mission, ID.card])
    expect(statusOf(db, ID.badge)).toBe('failed')
  })
})

// ── 생성 단계 ────────────────────────────────────────────────────────────────────────────────────

describe('생성 단계', () => {
  it('생성 중 실패하면 이번에 만든 자원을 역순으로 되돌리고 그룹 전체를 실패로 둔다', async () => {
    const { db, rec, run } = setup([...chain(), { id: ID.solo, key: 'solo', kind: 'recipe' }], { card: { failCreate: { reason: '카드를 만들지 못했어요' } } })
    const result = ok(await run([ID.card, ID.mission, ID.badge, ID.solo]))

    expect(rec.events.filter((event) => /^(create|undo):/.test(event))).toEqual(['create:badge', 'create:mission', 'create:card', 'undo:mission', 'undo:badge', 'create:solo'])
    expect(result.body.failed).toEqual([
      { id: ID.badge, reason: '연결된 항목을 만들지 못해 함께 실패했어요' },
      { id: ID.mission, reason: '연결된 항목을 만들지 못해 함께 실패했어요' },
      { id: ID.card, reason: '카드를 만들지 못했어요' },
    ])
    expect(result.body.scheduled).toEqual([ID.solo])
    for (const id of [ID.card, ID.mission, ID.badge]) expect(statusOf(db, id)).toBe('failed')
    // 무엇을 만들었다가 지웠는지 남도록 created_resource의 키는 그대로 둔다(§8.5)
    expect(db.item(ID.badge).created_resource).toEqual({ badge_id: rec.created.badge })
  })

  it('되돌리지 못한 자원이 있으면 그 항목의 사유에 알리고 나머지 되돌림은 계속한다', async () => {
    const { db, rec, run } = setup(chain(), {
      card: { failCreate: { reason: '카드를 만들지 못했어요' } },
      mission: { failUndo: { reason: '미션을 지우지 못했어요', detail: 'undo detail' } },
    })
    const result = ok(await run([ID.card, ID.mission, ID.badge]))
    expect(rec.events.filter((event) => event.startsWith('undo:'))).toEqual(['undo:mission', 'undo:badge'])
    expect(result.body.failed.find((entry) => entry.id === ID.mission)?.reason).toBe('연결된 항목을 만들지 못해 함께 실패했어요. 되돌리지 못한 자원이 있어요')
    expect(result.body.failed.find((entry) => entry.id === ID.badge)?.reason).toBe('연결된 항목을 만들지 못해 함께 실패했어요')
    expect(JSON.stringify(result)).not.toContain('undo detail')
    expect(logged()).toContain('undo detail')
    // 되돌린 배지의 이미지 파일만 정리한다. 되돌리지 못한 미션의 파일은 자원이 남아 있어 그대로 둔다(티켓 20261006_1801).
    expect(db.removedFiles.map((entry) => entry.paths[0])).toEqual([`ops-inbox/badges/${ID.badge}.png`])
  })

  it('서버가 ID를 정하는 종류(레시피)는 만든 ID를 대상 칸에 넣고 만든 직후 created_resource에 적는다', async () => {
    const { db, rec, run } = setup([
      { id: ID.badge, key: 'badge', kind: 'jam_badge', links: ['recipe'] },
      { id: ID.recipe, key: 'recipe', kind: 'recipe' },
    ])
    ok(await run([ID.badge, ID.recipe]))
    expect(rec.created.recipe).toBe('server-recipe')
    expect(db.item(ID.recipe).created_resource).toEqual({ recipe_id: 'server-recipe' })
    // 검증 때는 미리 정한 ID, 생성 때는 만들어진 ID가 들어간다
    const [verification, creation] = rec.linked.badge
    expect(verification.recipe_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(verification.recipe_id).not.toBe('server-recipe')
    expect(creation.recipe_id).toBe('server-recipe')
  })

  it('이미 예약된 연결 대상은 created_resource의 ID를 쓰고 건드리지 않는다. 실패해도 되돌리지 않는다', async () => {
    const { db, rec, run } = setup(
      [
        { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'] },
        { id: ID.mission, key: 'mission', kind: 'mission', status: 'scheduled', createdResource: { mission_id: 'mission-uuid-1' } },
      ],
      { card: { failCreate: { reason: '카드를 만들지 못했어요' } } }
    )
    const result = ok(await run([ID.card]))
    expect(rec.linked.card.at(-1)).toEqual({ mission_id: 'mission-uuid-1' })
    expect(rec.events.some((event) => event.endsWith(':mission'))).toBe(false)
    expect(result.body.failed).toEqual([{ id: ID.card, reason: '카드를 만들지 못했어요' }])
    expect(statusOf(db, ID.mission)).toBe('scheduled')
    expect(db.item(ID.mission).created_resource).toEqual({ mission_id: 'mission-uuid-1' })
  })

  it('created_resource를 적지 못하면 방금 만든 자원까지 되돌리고 그룹이 실패한다', async () => {
    const { db, rec, run } = setup(chain())
    db.failIf = (call) => call.op === 'update' && call.filters.some(([col, val]) => col === 'id' && val === ID.mission)
    const result = ok(await run([ID.card, ID.mission, ID.badge]))
    expect(rec.events.filter((event) => /^(create|undo):/.test(event))).toEqual(['create:badge', 'undo:badge'])
    expect(result.body.failed.map((entry) => entry.reason)).toEqual([
      '연결된 항목을 만들지 못해 함께 실패했어요',
      '예약 등록 중 저장하지 못했어요',
      '연결된 항목을 만들지 못해 함께 실패했어요',
    ])
    expect(JSON.stringify(result)).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('예약됨으로 옮기지 못하면 만든 자원을 되돌리고 그룹이 실패한다', async () => {
    const { db, rec, run } = setup(chain())
    db.failIf = (call) => call.op === 'update' && (call.payload as Row).status === 'scheduled'
    const result = ok(await run([ID.card, ID.mission, ID.badge]))
    expect(rec.events.filter((event) => event.startsWith('undo:'))).toEqual(['undo:card', 'undo:mission', 'undo:badge'])
    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.map((entry) => entry.reason)).toEqual(Array(3).fill('예약 등록을 마무리하지 못했어요'))
    for (const id of [ID.card, ID.mission, ID.badge]) expect(statusOf(db, id)).toBe('failed')
  })

  it.each(['check', 'create'] as const)('핸들러가 %s에서 던져도 그룹 실패로 바꾸고 원문은 응답에 싣지 않는다', async (throwOn) => {
    const { db, run } = setup(chain(), { mission: { throwOn } })
    const result = ok(await run([ID.card, ID.mission, ID.badge]))
    expect(result.body.failed.find((entry) => entry.id === ID.mission)?.reason).toBe('예약 등록 중 오류가 났어요')
    expect(JSON.stringify(result)).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
    for (const id of [ID.card, ID.mission, ID.badge]) expect(statusOf(db, id)).toBe('failed')
  })
})

// ── 결정 기록과 상태 ─────────────────────────────────────────────────────────────────────────────

describe('결정 기록', () => {
  it('예약된 항목마다 execute, 실패한 항목마다 fail(사유 필수)을 같은 batch_id로 남긴다', async () => {
    const { db, run } = setup([...chain(), { id: ID.solo, key: 'solo', kind: 'recipe' }], { solo: { failCheck: { reason: '레시피 슬롯이 비었어요' } } })
    const result = ok(await run([ID.card, ID.mission, ID.badge, ID.solo]))

    expect(result.body.scheduled).toEqual([ID.badge, ID.mission, ID.card])
    expect(result.body.failed).toEqual([{ id: ID.solo, reason: '레시피 슬롯이 비었어요' }])
    const rows = db.decisions()
    expect(rows).toHaveLength(4)
    expect(new Set(rows.map((row) => row.batch_id))).toEqual(new Set([result.batchId]))
    expect(rows.every((row) => row.bundle_id === B && row.actor === ACTOR)).toBe(true)
    expect(db.decisions('execute').map((row) => [row.item_id, row.reason])).toEqual([
      [ID.badge, null],
      [ID.mission, null],
      [ID.card, null],
    ])
    expect(db.decisions('fail').map((row) => [row.item_id, row.reason])).toEqual([[ID.solo, '레시피 슬롯이 비었어요']])
    expect(statusOf(db, ID.solo)).toBe('failed')
    expect(db.item(ID.solo).updated_at).toBe(ISO_NOW)
  })

  it('가정 1: 결정 기록을 남기지 못해도 자원과 상태는 그대로 두고 경고하며, #jam-alert에 알린다', async () => {
    const { db, rec, run } = setup(chain())
    db.failIf = (call) => call.table === 'ops_decisions' && call.op === 'insert'
    const result = ok(await run([ID.card, ID.mission, ID.badge]))

    expect(result.body.decisionLogFailed).toBe(true)
    expect(result.body.scheduled).toHaveLength(3)
    expect(rec.events.some((event) => event.startsWith('undo:'))).toBe(false)
    expect(db.calls.some((call) => call.op === 'delete')).toBe(false)
    for (const id of [ID.card, ID.mission, ID.badge]) expect(statusOf(db, id)).toBe('scheduled')
    expect(JSON.stringify(result.body)).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)

    await notifyExecution(db.service, result)
    expect(h.postOpsSlack.mock.calls.map(([channel]) => channel)).toEqual(['report', 'alert'])
    expect(h.postOpsSlack.mock.calls[1][1]).toBe('결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요')
    // 결정 기록이 없으니 slack_result도 채우지 않는다
    expect(db.calls.some((call) => call.table === 'ops_decisions' && call.op === 'update')).toBe(false)
  })

  it('가정 4·6: 실패로 닫을 항목은 요청에 없어도 함께 「실패」로 닫고 fail 기록을 남긴다', async () => {
    const { db, run } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'], startsAt: null },
      { id: ID.mission, key: 'mission', kind: 'mission', status: 'rejected' },
      { id: ID.solo, key: 'solo', kind: 'recipe' },
    ])
    const result = ok(await run([ID.solo]))
    expect(result.body.scheduled).toEqual([ID.solo])
    expect(result.body.failed).toEqual([{ id: ID.card, reason: '연결된 미션이 반려됐어요' }])
    expect(statusOf(db, ID.card)).toBe('failed')
    expect(db.item(ID.card).updated_at).toBe(ISO_NOW)
    expect(statusOf(db, ID.mission)).toBe('rejected')
    expect(db.decisions('fail').map((row) => [row.item_id, row.reason, row.batch_id])).toEqual([[ID.card, '연결된 미션이 반려됐어요', result.batchId]])
  })

  it('실패로 닫을 항목을 직접 요청해도 건너뛴 항목이 아니라 실패로 닫는다', async () => {
    const { run } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'] },
      { id: ID.mission, key: 'mission', kind: 'mission', status: 'cancelled' },
      { id: ID.solo, key: 'solo', kind: 'recipe' },
    ])
    const result = ok(await run([ID.card, ID.solo]))
    expect(result.body.failed.map((entry) => entry.id)).toEqual([ID.card])
    expect(result.body.skipped).toEqual([])
  })

  it('가정 6: 실행할 그룹이 없어도 실패로 닫을 항목은 닫는다 — 200, scheduled는 비고 fail 기록과 #jam-alert 글이 남는다', async () => {
    const { db, rec, run } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'] },
      { id: ID.mission, key: 'mission', kind: 'mission', status: 'rejected' },
    ])
    const result = ok(await run([ID.card]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed).toEqual([{ id: ID.card, reason: '연결된 미션이 반려됐어요' }])
    expect(result.body.skipped).toEqual([])
    expect(statusOf(db, ID.card)).toBe('failed')
    expect(db.item(ID.card).updated_at).toBe(ISO_NOW)
    expect(statusOf(db, ID.mission)).toBe('rejected')
    expect(rec.events).toEqual([]) // 선점도 핸들러 호출도 없다
    expect(nonSelect(db).filter((call) => (call.payload as Row | undefined)?.status === 'preparing')).toEqual([])
    expect(db.decisions('execute')).toEqual([])
    expect(db.decisions('fail').map((row) => [row.item_id, row.reason, row.batch_id])).toEqual([[ID.card, '연결된 미션이 반려됐어요', result.batchId]])

    await notifyExecution(db.service, result)
    expect(h.postOpsSlack.mock.calls.map(([channel]) => channel)).toEqual(['report', 'alert'])
    expect(h.postOpsSlack.mock.calls[1][1]).toContain('연결된 미션이 반려됐어요')
  })

  it('가정 6: 요청한 항목이 모두 건너뛰어져도 요청에 없는 실패로 닫을 항목은 닫는다', async () => {
    const { db, run } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'] },
      { id: ID.mission, key: 'mission', kind: 'mission', status: 'rejected' },
      { id: ID.solo, key: 'solo', kind: 'recipe', startsAt: null },
    ])
    const result = ok(await run([ID.solo]))
    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed).toEqual([{ id: ID.card, reason: '연결된 미션이 반려됐어요' }])
    expect(result.body.skipped).toEqual([{ id: ID.solo, reason: PRECHECK_MESSAGES.startMissing }])
    expect(statusOf(db, ID.card)).toBe('failed')
    expect(statusOf(db, ID.solo)).toBe('approved')
  })

  it('가정 6: 동시 실행으로 요청한 그룹을 다 건너뛰어도 실패로 닫을 항목은 닫는다', async () => {
    const { db, run } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'] },
      { id: ID.mission, key: 'mission', kind: 'mission', status: 'rejected' },
      { id: ID.solo, key: 'solo', kind: 'recipe' },
    ])
    db.beforeRun = (call) => {
      if (call.op === 'update' && (call.payload as Row).status === 'preparing') db.item(ID.solo).status = 'preparing' // 다른 요청이 먼저 차지했다
    }
    const result = ok(await run([ID.solo]))
    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed).toEqual([{ id: ID.card, reason: '연결된 미션이 반려됐어요' }])
    expect(result.body.skipped).toEqual([{ id: ID.solo, reason: '다른 곳에서 동시에 처리해서 건너뛰었어요' }])
    expect(statusOf(db, ID.solo)).toBe('preparing') // 다른 요청이 차지한 항목은 건드리지 않는다
    expect(statusOf(db, ID.card)).toBe('failed')
  })

  it('가정 6: 실행할 그룹도 실패로 닫을 항목도 없으면 409이고 아무것도 쓰지 않는다', async () => {
    const { db, run } = setup([
      { id: ID.solo, key: 'solo', kind: 'recipe', startsAt: null },
      { id: ID.other, key: 'other', kind: 'mission', status: 'reviewing' },
    ])
    const failure = bad(await run([ID.solo]))
    expect(failure.status).toBe(409)
    expect(failure.extra?.skipped).toEqual([{ id: ID.solo, reason: PRECHECK_MESSAGES.startMissing }])
    expect(failure.extra?.excludedCount).toBe(1)
    expect(nonSelect(db)).toEqual([])
  })

  it('가정 6: 직접 요청한 실패로 닫을 항목을 그사이 닫지 못해도 응답에 나온다(409의 skipped)', async () => {
    const { db, run } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'] },
      { id: ID.mission, key: 'mission', kind: 'mission', status: 'rejected' },
    ])
    db.beforeRun = (call) => {
      if (call.op === 'update' && (call.payload as Row).status === 'failed') db.item(ID.card).status = 'scheduled' // 닫기 직전에 다른 곳에서 바꿨다
    }
    const failure = bad(await run([ID.card]))
    expect(failure.status).toBe(409)
    expect(failure.extra?.skipped).toEqual([{ id: ID.card, reason: '이미 다른 곳에서 처리한 항목이에요' }])
    expect(statusOf(db, ID.card)).toBe('scheduled')
    expect(db.decisions()).toEqual([])
  })

  it('실패로 닫는 중 DB 오류가 나면 그 항목은 건너뛴 항목으로 알리고 원문은 싣지 않는다', async () => {
    const { db, run } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'] },
      { id: ID.mission, key: 'mission', kind: 'mission', status: 'rejected' },
      { id: ID.solo, key: 'solo', kind: 'recipe' },
    ])
    db.failIf = (call) => call.op === 'update' && (call.payload as Row).status === 'failed'
    const result = ok(await run([ID.solo]))
    expect(result.body.failed).toEqual([])
    expect(result.body.skipped).toEqual([{ id: ID.card, reason: '실패로 닫지 못해 건너뛰었어요. 다시 눌러 주세요' }])
    expect(statusOf(db, ID.card)).toBe('approved')
    expect(JSON.stringify(result)).not.toContain(DB_SECRET)
  })

  it('가정 5: 응답·결정 기록·슬랙에는 핸들러의 reason만 싣고 detail과 DB 오류 원문은 서버 로그에만 남는다', async () => {
    const detail = `DB: ${DB_SECRET} / 서비스 키(.env.local)가 필요해요`
    const { db, run } = setup(chain(), { mission: { failCreate: { reason: '미션을 만들지 못했어요', detail } } })
    const result = ok(await run([ID.card, ID.mission, ID.badge]))
    await notifyExecution(db.service, result)

    const outputs = [JSON.stringify(result), JSON.stringify(db.tables.ops_decisions), h.postOpsSlack.mock.calls.map((call) => call[1]).join('\n')]
    for (const output of outputs) {
      expect(output).not.toContain(DB_SECRET)
      expect(output).not.toContain('.env.local')
    }
    expect(outputs[0]).toContain('미션을 만들지 못했어요')
    expect(logged()).toContain(detail)
  })

  it('결정 기록에는 insert와 slack_result update만 하고 제출 원본은 건드리지 않는다', async () => {
    const { db, run } = setup([...chain(), { id: ID.solo, key: 'solo', kind: 'recipe' }], { solo: { failCheck: { reason: '레시피 슬롯이 비었어요' } } })
    const before = JSON.stringify(db.tables.ops_bundle_items.map((row) => row.original))
    const result = ok(await run([ID.card, ID.mission, ID.badge, ID.solo]))
    await notifyExecution(db.service, result)

    const writes = nonSelect(db).filter((call) => call.table === 'ops_decisions')
    expect(writes.map((call) => call.op).sort()).toEqual(['insert', 'update', 'update'])
    for (const call of writes.filter((entry) => entry.op === 'update')) {
      expect(Object.keys(call.payload as Row)).toEqual(['slack_result'])
      expect(call.filters.map(([col]) => col)).toEqual(['batch_id', 'action'])
    }
    expect(JSON.stringify(db.tables.ops_bundle_items.map((row) => row.original))).toBe(before)
  })
})

// ── 슬랙 ─────────────────────────────────────────────────────────────────────────────────────────

describe('슬랙 알림 notifyExecution', () => {
  it('요약은 #jam-report, 실패는 #jam-alert에 한 건씩 올리고 slack_result는 batch_id와 action으로 나눠 채운다', async () => {
    const { db, run } = setup([...chain(), { id: ID.solo, key: 'solo', kind: 'recipe' }], { solo: { failCheck: { reason: '레시피 슬롯이 비었어요' } } })
    h.postOpsSlack.mockImplementation(async (channel: string) => (channel === 'report' ? { ok: true } : { ok: false, error: 'channel_not_found' }))
    const result = ok(await run([ID.card, ID.mission, ID.badge, ID.solo]))
    await notifyExecution(db.service, result)

    expect(h.postOpsSlack).toHaveBeenCalledTimes(2)
    expect(h.postOpsSlack).toHaveBeenNthCalledWith(1, 'report', '3개 예약 등록, 0개 제외, 1개 실패')
    expect(h.postOpsSlack).toHaveBeenNthCalledWith(2, 'alert', '예약 등록에 실패했어요 · 1건\n• 믹스 레시피 · 10/10(토) 09:00 — 레시피 슬롯이 비었어요')
    expect(db.decisions('execute').map((row) => row.slack_result)).toEqual(Array(3).fill({ channel: 'report', ok: true }))
    expect(db.decisions('fail').map((row) => row.slack_result)).toEqual([{ channel: 'alert', ok: false, error: 'channel_not_found' }])
  })

  it('실패가 없으면 #jam-report 한 건만 올린다', async () => {
    const { db, run } = setup(chain())
    const result = ok(await run([ID.card, ID.mission, ID.badge]))
    await notifyExecution(db.service, result)
    expect(h.postOpsSlack.mock.calls).toEqual([['report', '3개 예약 등록, 0개 제외']])
  })

  it('제외는 기다리는 중·못 하는 항목과 그사이 바뀌어 건너뛴 항목의 합이다', async () => {
    const { db, run } = setup([
      { id: ID.solo, key: 'solo', kind: 'recipe' },
      { id: ID.other, key: 'other', kind: 'mission' },
      // 기다리는 중: 같은 그룹에 결정 전 항목이 있다
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['badge'] },
      { id: ID.badge, key: 'badge', kind: 'jam_badge', status: 'reviewing' },
      // 못 하는 항목: 공개 시각이 없다
      { id: ID.mission, key: 'mission', kind: 'mission', startsAt: null },
      // 그사이 바뀌어 건너뛴 항목
      { id: ID.extra, key: 'extra', kind: 'mission', status: 'scheduled' },
    ])
    const result = ok(await run([ID.solo, ID.other, ID.extra]))
    expect(result.body.excludedCount).toBe(3)
    await notifyExecution(db.service, result)
    expect(h.postOpsSlack).toHaveBeenCalledWith('report', '2개 예약 등록, 3개 제외')
  })

  it('시험 묶음이면 글 앞에 「[시험]」이 붙는다', async () => {
    const { db, run } = setup([...chain(), { id: ID.solo, key: 'solo', kind: 'recipe' }], { solo: { failCheck: { reason: '슬롯이 비었어요' } } }, { is_sample: true })
    const result = ok(await run([ID.card, ID.mission, ID.badge, ID.solo]))
    await notifyExecution(db.service, result)
    expect(h.postOpsSlack.mock.calls.map((call) => String(call[1]).startsWith('[시험] '))).toEqual([true, true])
  })

  it('슬랙이 실패하거나 던져도 던지지 않고, 실패 결과를 slack_result에 남긴다', async () => {
    const { db, run } = setup(chain())
    const result = ok(await run([ID.card, ID.mission, ID.badge]))

    h.postOpsSlack.mockResolvedValue({ ok: false, error: 'not_configured' })
    await expect(notifyExecution(db.service, result)).resolves.toBeUndefined()
    expect(db.decisions('execute').map((row) => row.slack_result)).toEqual(Array(3).fill({ channel: 'report', ok: false, error: 'not_configured' }))

    h.postOpsSlack.mockRejectedValue(new TypeError('network down'))
    await expect(notifyExecution(db.service, result)).resolves.toBeUndefined()
  })

  it('알림 결과를 기록하지 못해도 던지지 않는다', async () => {
    const { db, run } = setup(chain())
    const result = ok(await run([ID.card, ID.mission, ID.badge]))
    db.failIf = (call) => call.table === 'ops_decisions' && call.op === 'update'
    await expect(notifyExecution(db.service, result)).resolves.toBeUndefined()
    expect(logged()).toContain(DB_SECRET)
  })
})

// ── 실제 레지스트리(홈피드 카드·미션 핸들러) ─────────────────────────────────────────────────────

function setupReal(specs: ItemSpec[], bundle: Row = {}, handlers: ExecuteHandlerRegistry = EXECUTE_HANDLERS) {
  const db = new FakeDb()
  db.tables.ops_bundles = [{ id: B, is_sample: false, ...bundle }]
  db.tables.ops_bundle_items = specs.map((spec) => ({ ...makeItem(spec), bundle_id: B }))
  const run = (itemIds: unknown) => executeBundle(db.service, { bundleId: B, itemIds, actor: ACTOR }, { handlers, now: () => NOW })
  return { db, run }
}

/** 응답·결정 기록·슬랙에 나간 모든 글. */
async function outputsOf(db: FakeDb, result: ExecuteSuccess) {
  await notifyExecution(db.service, result)
  return [JSON.stringify(result.body), JSON.stringify(db.tables.ops_decisions), h.postOpsSlack.mock.calls.map((call) => call[1]).join('\n')]
}

describe('실제 레지스트리: 홈피드 카드 핸들러 (티켓 20261002_1255)', () => {
  const MISSING_MISSION = uid(8)
  const TEST_CARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

  /** 검사를 통과하는 카드. 공개 시각은 행의 `LATER`(10/10 09:00 KST)다. */
  const card = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.card,
    key: 'card',
    kind: 'home_feed_card',
    original: { shape: 'hero', exposure_tags: ['all'], pattern_no: 'P07', copy: { title: '가을 아침 러닝' } },
    resource: { template_type: 'drop_alert', cover_image_url: 'https://cdn.example.com/card.webp' },
    ...over,
  })

  it('승인된 카드 하나를 실행하면 today_cards에 공개 전 행이 생기고 created_resource.today_card_id와 ID가 같다', async () => {
    const { db, run } = setupReal([card()])
    const result = ok(await run([ID.card]))

    expect(result.body.scheduled).toEqual([ID.card])
    expect(result.body.failed).toEqual([])
    expect(db.tables.today_cards).toHaveLength(1)
    const row = db.tables.today_cards[0]
    const created = db.item(ID.card).created_resource as { today_card_id: string }
    expect(created.today_card_id).toMatch(TEST_CARD_ID)
    expect(row.id).toBe(created.today_card_id)
    expect(row).toMatchObject({
      title: '가을 아침 러닝',
      template_type: 'drop_alert',
      shape: 'hero',
      starts_at: '2026-10-10T00:00:00.000Z',
      ends_at: '2026-10-10T14:59:59.999Z',
      pattern_no: 'P07',
      cover_image_url: 'https://cdn.example.com/card.webp',
      image_source: null,
      created_by: ACTOR,
    })
    expect(statusOf(db, ID.card)).toBe('scheduled')
    expect(db.decisions('execute').map((entry) => entry.item_id)).toEqual([ID.card])
    // 정한 ID와 돌려준 ID가 같아 created_resource는 만들기 전에 한 번만 적는다
    const resourceWrites = db.itemWrites().filter((call) => call.op === 'update' && 'created_resource' in (call.payload as Row))
    expect(resourceWrites).toHaveLength(1)
  })

  it('시험 묶음은 등록 전 검사까지 하고 today_cards에 쓰지 않는다. created_resource는 { sample: true }다', async () => {
    const { db, run } = setupReal([card()], { is_sample: true })
    const result = ok(await run([ID.card]))

    expect(result.body.scheduled).toEqual([ID.card])
    expect(db.tables.today_cards).toEqual([])
    expect(db.calls.some((call) => call.table === 'today_cards' && call.op === 'select')).toBe(true) // 중복 검사를 했다
    expect(db.calls.filter((call) => call.table === 'today_cards' && call.op !== 'select')).toEqual([])
    expect(db.item(ID.card).created_resource).toEqual({ sample: true })
  })

  it('시험 묶음도 등록 전 검사에서 걸리면 실패한다', async () => {
    const { db, run } = setupReal([card({ resource: { template_type: 'mission_spotlight', mission_id: MISSING_MISSION } })], { is_sample: true })
    const result = ok(await run([ID.card]))
    expect(result.body.failed).toEqual([{ id: ID.card, reason: '연결한 미션을 찾을 수 없어요' }])
    expect(db.tables.today_cards).toEqual([])
  })

  it('연결한 미션이 없으면 고정 사유로 실패하고 만든 행이 없다. 칼럼 이름·ID는 어디에도 나오지 않는다', async () => {
    const { db, run } = setupReal([card({ resource: { template_type: 'mission_spotlight', mission_id: MISSING_MISSION } })])
    const result = ok(await run([ID.card]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed).toEqual([{ id: ID.card, reason: '연결한 미션을 찾을 수 없어요' }])
    expect(statusOf(db, ID.card)).toBe('failed')
    expect(db.tables.today_cards).toEqual([])
    expect(db.calls.filter((call) => call.table === 'today_cards' && call.op !== 'select')).toEqual([])
    expect(db.decisions('fail').map((row) => [row.item_id, row.reason])).toEqual([[ID.card, '연결한 미션을 찾을 수 없어요']])
    for (const output of await outputsOf(db, result)) {
      expect(output).not.toContain(MISSING_MISSION)
      expect(output).not.toContain('mission_id')
    }
    expect(logged()).toContain(MISSING_MISSION) // 서버 로그에는 남는다
  })

  it('같은 제목·같은 공개 시각의 카드가 이미 있으면 실패하고 기존 카드 ID는 응답·기록·슬랙에 없다', async () => {
    const { db, run } = setupReal([card()])
    const EXISTING = uid(9)
    db.tables.today_cards = [{ id: EXISTING, title: '가을 아침 러닝', starts_at: '2026-10-10T00:00:00.000Z' }]
    const result = ok(await run([ID.card]))

    expect(result.body.failed).toEqual([{ id: ID.card, reason: '같은 제목·같은 공개 시각의 카드가 이미 있어요' }])
    expect(db.tables.today_cards).toHaveLength(1)
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(EXISTING)
    expect(logged()).toContain(EXISTING)
  })

  it('등록 전 검사에서 DB를 읽지 못하면 고정 사유로 실패하고 DB 오류 원문은 로그에만 남는다', async () => {
    const { db, run } = setupReal([card()])
    db.failIf = (call) => call.table === 'today_cards' && call.op === 'select'
    const result = ok(await run([ID.card]))

    expect(result.body.failed).toEqual([{ id: ID.card, reason: '등록 전 확인 중 DB를 읽지 못했어요' }])
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('형식 오류는 변환 오류의 첫 문장으로 실패하고 만든 행이 없다', async () => {
    const { db, run } = setupReal([card({ original: { exposure_tags: ['all'], copy: { title: '가을 아침 러닝' } } })]) // shape 없음
    const result = ok(await run([ID.card]))

    expect(result.body.failed).toHaveLength(1)
    expect(result.body.failed[0].reason).toMatch(/^카드 형식이 맞지 않아요: card\.shape: /)
    expect(db.tables.today_cards).toEqual([])
    expect(statusOf(db, ID.card)).toBe('failed')
  })

  it('insert가 실패하면 고정 사유로 실패하고 행이 없다. DB 오류 원문과 만들려던 카드 ID는 어디에도 없다', async () => {
    const { db, run } = setupReal([card()])
    db.failIf = (call) => call.table === 'today_cards' && call.op === 'insert'
    const result = ok(await run([ID.card]))

    expect(result.body.failed).toEqual([{ id: ID.card, reason: '카드를 만들지 못했어요' }])
    expect(db.tables.today_cards).toEqual([])
    expect(statusOf(db, ID.card)).toBe('failed')
    const plannedId = (db.item(ID.card).created_resource as { today_card_id: string }).today_card_id
    for (const output of await outputsOf(db, result)) {
      expect(output).not.toContain(DB_SECRET)
      expect(output).not.toContain(plannedId)
    }
    expect(logged()).toContain(DB_SECRET)
  })

  it('예약됨으로 옮기지 못하면 방금 만든 카드를 참조 확인 뒤 지운다', async () => {
    const { db, run } = setupReal([card()])
    db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'update' && (call.payload as Row).status === 'scheduled'
    const result = ok(await run([ID.card]))

    expect(result.body.failed).toEqual([{ id: ID.card, reason: '예약 등록을 마무리하지 못했어요' }])
    expect(db.tables.today_cards).toEqual([])
    const order = db.calls.map((call) => `${call.table}:${call.op}`)
    expect(order.indexOf('today_card_events:select')).toBeLessThan(order.lastIndexOf('today_cards:delete'))
  })

  it('핸들러가 없는 종류는 막힌다(실제 레지스트리는 여섯 종류가 모두 연결돼 컬렉션 핸들러만 뺀 레지스트리로 본다)', async () => {
    const { db, run } = setupReal([{ id: ID.solo, key: 'solo', kind: 'collection_launch' }], {}, { ...EXECUTE_HANDLERS, collection_launch: undefined })
    const failure = bad(await run([ID.solo]))
    expect(failure.status).toBe(409)
    expect(failure.extra?.skipped).toEqual([{ id: ID.solo, reason: PRECHECK_MESSAGES.noHandler }])
    expect(nonSelect(db)).toEqual([])
  })
})

// ── 실제 레지스트리(미션 핸들러와 카드↔미션 연결, 티켓 20261002_1944) ────────────────────────────

describe('실제 레지스트리: 미션 핸들러와 카드↔미션 연결 (티켓 20261002_1944)', () => {
  const MISSING_BADGE = uid(8)
  const GROUP_FAILED = '연결된 항목을 만들지 못해 함께 실패했어요'
  /** 공개 시각은 행의 `LATER`(10/10 09:00 KST)다. 카드는 연결로 미션 ID를 받는다(`mission_spotlight`는 `mission_id`가 있어야 한다). */
  const card = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.card,
    key: 'card',
    kind: 'home_feed_card',
    links: ['mission'],
    original: { shape: 'hero', exposure_tags: ['all'], copy: { title: '주말 러닝 카드' } },
    resource: { template_type: 'mission_spotlight' },
    ...over,
  })
  const mission = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.mission,
    key: 'mission',
    kind: 'mission',
    original: { copy: { title: '주말 러닝', description: '주말에 30km를 달려요.' } },
    resource: { mission_type: 'distance', condition_json: { activity_type: 'running', distance_km: 30 } },
    ...over,
  })
  const writes = (db: FakeDb, table: string, op: FakeCall['op']) => db.calls.filter((call) => call.table === table && call.op === op)

  it('승인된 카드+미션 그룹이 함께 예약된다: 미션이 먼저 만들어지고 카드가 그 ID를 mission_id로 갖는다', async () => {
    const { db, run } = setupReal([card(), mission()])
    const result = ok(await run([ID.card, ID.mission]))

    expect([...result.body.scheduled].sort()).toEqual([ID.card, ID.mission].sort())
    expect(result.body.failed).toEqual([])
    expect(db.tables.missions).toHaveLength(1)
    expect(db.tables.today_cards).toHaveLength(1)
    const missionRow = db.tables.missions[0]
    expect(missionRow).toMatchObject({
      title: '주말 러닝',
      starts_at: '2026-10-10T00:00:00.000Z',
      ends_at: null,
      exposure_mode: 'start_date',
      exposure_at: null,
      image_source: null,
    })
    expect(db.tables.today_cards[0].mission_id).toBe(missionRow.id)
    expect(db.item(ID.mission).created_resource).toEqual({ mission_id: missionRow.id })
    expect(statusOf(db, ID.card)).toBe('scheduled')
    expect(statusOf(db, ID.mission)).toBe('scheduled')
    expect(db.decisions('execute').map((entry) => entry.item_id).sort()).toEqual([ID.card, ID.mission].sort())
    // 미션을 먼저 만든다
    const inserts = db.calls.filter((call) => call.op === 'insert' && (call.table === 'missions' || call.table === 'today_cards')).map((call) => call.table)
    expect(inserts).toEqual(['missions', 'today_cards'])
    // 정한 ID와 돌려준 ID가 같아 created_resource는 미션도 만들기 전에 한 번만 적는다
    const missionResourceWrites = db.itemWrites().filter((call) => call.op === 'update' && JSON.stringify(call.payload).includes('"mission_id"'))
    expect(missionResourceWrites).toHaveLength(1)
  })

  it('미션 하나만 있어도 예약된다. 보상 배지는 resource가 정한 것을 존재 확인한 뒤 담는다', async () => {
    const { db, run } = setupReal([mission({ resource: { mission_type: 'distance', condition_json: { distance_km: 30 }, reward_badge_ids: [ID.badge] } })])
    db.tables.badges = [{ id: ID.badge, deleted_at: null, type: 'activity', is_hidden: false }]
    const result = ok(await run([ID.mission]))

    expect(result.body.scheduled).toEqual([ID.mission])
    expect(db.tables.missions[0]).toMatchObject({ reward_badge_ids: [ID.badge] })
  })

  it('카드 insert가 실패하면 먼저 만든 미션을 되돌리고 그룹 전체가 실패한다. 카드 사유가 원인이고 미션은 함께 실패다', async () => {
    const { db, run } = setupReal([card(), mission()])
    db.failIf = (call) => call.table === 'today_cards' && call.op === 'insert'
    const result = ok(await run([ID.card, ID.mission]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe('카드를 만들지 못했어요')
    expect(result.body.failed.find((entry) => entry.id === ID.mission)?.reason).toBe(GROUP_FAILED)
    expect(db.tables.missions).toEqual([])
    expect(db.tables.today_cards).toEqual([])
    expect(writes(db, 'missions', 'insert')).toHaveLength(1)
    expect(writes(db, 'missions', 'delete')).toHaveLength(1)
    expect(statusOf(db, ID.card)).toBe('failed')
    expect(statusOf(db, ID.mission)).toBe('failed')
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('미션 insert가 실패하면 카드는 만들기 전이라 아무것도 만들지 않는다. 미션 사유가 원인이다', async () => {
    const { db, run } = setupReal([card(), mission()])
    db.failIf = (call) => call.table === 'missions' && call.op === 'insert'
    const result = ok(await run([ID.card, ID.mission]))

    expect(result.body.failed.find((entry) => entry.id === ID.mission)?.reason).toBe('미션을 만들지 못했어요')
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe(GROUP_FAILED)
    expect(db.tables.missions).toEqual([])
    expect(db.tables.today_cards).toEqual([])
    expect(writes(db, 'today_cards', 'insert')).toEqual([])
  })

  it('예약됨으로 옮기지 못하면 카드를 먼저, 미션을 나중에 지운다(미션을 먼저 지우면 카드의 mission_id 참조에 걸린다)', async () => {
    const { db, run } = setupReal([card(), mission()])
    db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'update' && (call.payload as Row).status === 'scheduled'
    const result = ok(await run([ID.card, ID.mission]))

    expect(result.body.failed.map((entry) => entry.reason)).toEqual(Array(2).fill('예약 등록을 마무리하지 못했어요'))
    expect(db.tables.today_cards).toEqual([])
    expect(db.tables.missions).toEqual([])
    const order = db.calls.map((call) => `${call.table}:${call.op}`)
    expect(order.lastIndexOf('today_cards:delete')).toBeLessThan(order.lastIndexOf('missions:delete'))
  })

  it('미션 등록 전 검사가 실패하면 카드도 함께 실패하고 아무것도 만들지 않는다', async () => {
    const { db, run } = setupReal([card(), mission({ resource: { mission_type: 'distance', condition_json: { distance_km: 30 }, reward_badge_ids: [MISSING_BADGE] } })])
    const result = ok(await run([ID.card, ID.mission]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.find((entry) => entry.id === ID.mission)?.reason).toBe('보상으로 정한 배지가 없거나 삭제됐어요')
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe(GROUP_FAILED)
    expect(db.tables.missions).toEqual([])
    expect(db.tables.today_cards).toEqual([])
    expect(db.calls.filter((call) => (call.table === 'missions' || call.table === 'today_cards') && call.op !== 'select')).toEqual([])
    for (const output of await outputsOf(db, result)) {
      expect(output).not.toContain(MISSING_BADGE)
      expect(output).not.toContain('reward_badge_ids')
    }
    expect(logged()).toContain(MISSING_BADGE)
  })

  it('미션 형식 오류는 변환 오류의 첫 문장으로 실패하고 카드도 함께 실패한다', async () => {
    const { db, run } = setupReal([card(), mission({ original: { copy: { title: '주말 러닝' } } })]) // description 없음
    const result = ok(await run([ID.card, ID.mission]))

    expect(result.body.failed.find((entry) => entry.id === ID.mission)?.reason).toMatch(/^미션 형식이 맞지 않아요: mission\.description: /)
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe(GROUP_FAILED)
    expect(db.tables.missions).toEqual([])
    expect(db.tables.today_cards).toEqual([])
  })

  it('같은 제목의 기존 미션과 기간이 겹치면 고정 사유로 실패한다. 기존 미션 ID는 응답·기록·슬랙에 없다', async () => {
    const { db, run } = setupReal([mission()])
    const EXISTING = uid(9)
    db.tables.missions = [{ id: EXISTING, title: '주말 러닝', starts_at: '2026-10-01T00:00:00.000Z', ends_at: null }]
    const result = ok(await run([ID.mission]))

    expect(result.body.failed).toEqual([{ id: ID.mission, reason: '같은 제목의 미션이 이미 있고 기간이 겹쳐요' }])
    expect(db.tables.missions).toHaveLength(1)
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(EXISTING)
    expect(logged()).toContain(EXISTING)
  })

  it('같은 제목의 기존 미션이 있어도 기간이 겹치지 않으면 예약된다(기존 미션의 종료와 새 미션의 공개가 같은 시각)', async () => {
    const { db, run } = setupReal([mission()])
    db.tables.missions = [{ id: uid(9), title: '주말 러닝', starts_at: '2026-10-03T00:00:00.000Z', ends_at: '2026-10-10T00:00:00.000Z' }]
    const result = ok(await run([ID.mission]))

    expect(result.body.scheduled).toEqual([ID.mission])
    expect(db.tables.missions).toHaveLength(2)
  })

  it('등록 전 검사에서 DB를 읽지 못하면 고정 사유로 실패하고 DB 오류 원문은 로그에만 남는다', async () => {
    const { db, run } = setupReal([mission()])
    db.failIf = (call) => call.table === 'missions' && call.op === 'select'
    const result = ok(await run([ID.mission]))

    expect(result.body.failed).toEqual([{ id: ID.mission, reason: '등록 전 확인 중 DB를 읽지 못했어요' }])
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('시험 묶음은 등록 전 검사까지 하고 missions에 쓰지 않는다. created_resource는 { sample: true }다', async () => {
    const { db, run } = setupReal([card(), mission()], { is_sample: true })
    const result = ok(await run([ID.card, ID.mission]))

    expect([...result.body.scheduled].sort()).toEqual([ID.card, ID.mission].sort())
    expect(db.tables.missions).toEqual([])
    expect(db.tables.today_cards).toEqual([])
    expect(db.calls.some((call) => call.table === 'missions' && call.op === 'select')).toBe(true) // 제목 중복 검사를 했다
    expect(db.item(ID.mission).created_resource).toEqual({ sample: true })
  })

  it('카드가 여는 미션보다 먼저 공개되면 실행되지 않는다: 카드는 못 하는 항목, 미션은 연결된 항목을 예약할 수 없다', async () => {
    const { db, run } = setupReal([card({ startsAt: '2026-10-09T00:00:00.000Z' }), mission()])
    const failure = bad(await run([ID.card, ID.mission]))

    expect(failure.status).toBe(409)
    expect(failure.extra?.skipped).toEqual([
      { id: ID.card, reason: PRECHECK_MESSAGES.cardBeforeMission },
      { id: ID.mission, reason: PRECHECK_MESSAGES.groupBlocked },
    ])
    expect(nonSelect(db)).toEqual([])
    expect(db.tables.missions).toEqual([])
  })

  it('같은 기획 안에서 기간이 겹치는 같은 제목의 미션은 뒤 항목이 실행되지 않고, 앞 항목만 예약된다', async () => {
    const second = uid(10)
    const { db, run } = setupReal([mission(), mission({ id: second, key: 'second' })])
    const result = ok(await run([ID.mission, second]))

    expect(result.body.scheduled).toEqual([ID.mission])
    expect(result.body.skipped).toEqual([{ id: second, reason: PRECHECK_MESSAGES.missionTitleOverlap }])
    expect(db.tables.missions).toHaveLength(1)
    expect(statusOf(db, second)).toBe('approved')
  })

  it('이미 예약된 미션을 가리키는 카드는 그 미션의 ID를 created_resource에서 읽어 채운다', async () => {
    const existing = uid(11)
    const { db, run } = setupReal([card(), mission({ status: 'scheduled', createdResource: { mission_id: existing } })])
    const result = ok(await run([ID.card]))

    expect(result.body.scheduled).toEqual([ID.card])
    expect(db.tables.today_cards[0].mission_id).toBe(existing)
    // 이미 예약된 미션은 건드리지 않는다
    expect(db.tables.missions).toEqual([])
    expect(writes(db, 'missions', 'insert')).toEqual([])
  })
})

// ── 실제 레지스트리(레시피 핸들러, 티켓 20261002_2221) ────────────────────────────────────────────

describe('실제 레지스트리: 레시피 핸들러 (티켓 20261002_2221)', () => {
  const ITEM_BADGE = uid(20)
  const ACTIVITY_BADGE = uid(21)
  const REWARD_BADGE = uid(22)
  const BOOK = uid(23)
  const FIRST_SUCCESS_BADGE = uid(24)
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  const GROUP_FAILED = '연결된 항목을 만들지 못해 함께 실패했어요'
  const SLOTS = [
    { badge_type: 'item', allowed_badge_ids: [ITEM_BADGE] },
    { badge_type: 'activity', allowed_badge_ids: [ACTIVITY_BADGE] },
  ]

  /** 검사를 통과하는 레시피. 공개 시각은 행의 `LATER`(10/10 09:00 KST), 종료 시각은 없다(상시). */
  const recipe = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.recipe,
    key: 'recipe',
    kind: 'recipe',
    original: { copy: { name: '가을 믹스' } },
    resource: { slots: SLOTS, reward_points: 10 },
    ...over,
  })
  /** 레시피를 여는 카드(레시피 공개 카드). 카드는 연결로 레시피 ID를 `recipe_id`로 받는다(PRD §8.3, 티켓 20261006_1218). 레시피 칸은 비어 있어도 되지만 연결이 채운다. */
  const card = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.card,
    key: 'card',
    kind: 'home_feed_card',
    links: ['recipe'],
    original: { shape: 'hero', exposure_tags: ['all'], copy: { title: '가을 믹스 카드' } },
    resource: { template_type: 'recipe_reveal' },
    ...over,
  })
  /** 슬롯 후보 두 개(`item` 배지에 컬렉션을 붙일 수 있다)와 보상 배지가 있는 DB를 만든다. */
  const setup = (specs: ItemSpec[], itemBookId: string | null = null, bundle: Row = {}) => {
    const real = setupReal(specs, bundle)
    real.db.tables.badges = [
      { id: ITEM_BADGE, type: 'item', deleted_at: null, item_book_id: itemBookId },
      { id: ACTIVITY_BADGE, type: 'activity', deleted_at: null, item_book_id: null },
      { id: REWARD_BADGE, type: 'item', deleted_at: null, item_book_id: null },
    ]
    return real
  }
  const writes = (db: FakeDb, table: string, op: FakeCall['op']) => db.calls.filter((call) => call.table === table && call.op === op)
  const NOT_LAUNCHED = '아직 열리지 않은 컬렉션의 배지가 들어 있어요'

  it('승인된 레시피 하나를 실행하면 공개 전 행과 슬롯이 생기고 created_resource.recipe_id와 ID가 같다. 상시 레시피라 종료 시각 칸이 없다', async () => {
    const { db, run } = setup([recipe()])
    const result = ok(await run([ID.recipe]))

    expect(result.body.scheduled).toEqual([ID.recipe])
    expect(result.body.failed).toEqual([])
    expect(db.tables.combination_recipes).toHaveLength(1)
    const row = db.tables.combination_recipes[0]
    const created = db.item(ID.recipe).created_resource as { recipe_id: string }
    expect(created.recipe_id).toMatch(UUID_PATTERN)
    expect(row.id).toBe(created.recipe_id)
    // 공개 시각 = 항목 공개 시각. 종료 시각 칸은 없다(상시).
    expect(row).toMatchObject({ name: '가을 믹스', reward_points: 10, reward_badge_ids: [], valid_from: '2026-10-10T00:00:00.000Z' })
    expect('valid_until' in row).toBe(false)
    expect(db.tables.combination_recipe_slots).toMatchObject([
      { recipe_id: created.recipe_id, slot_order: 0, badge_type: 'item', allowed_badge_ids: [ITEM_BADGE] },
      { recipe_id: created.recipe_id, slot_order: 1, badge_type: 'activity', allowed_badge_ids: [ACTIVITY_BADGE] },
    ])
    expect(statusOf(db, ID.recipe)).toBe('scheduled')
    expect(db.decisions('execute').map((entry) => entry.item_id)).toEqual([ID.recipe])
    // 정한 ID와 돌려준 ID가 같아 created_resource는 한 번만 적는다
    const resourceWrites = db.itemWrites().filter((call) => call.op === 'update' && 'created_resource' in (call.payload as Row))
    expect(resourceWrites).toHaveLength(1)
  })

  it('created_resource.recipe_id는 레시피를 만들기 전에 적힌다(만드는 도중 끊겨도 상태 맞추기가 자원을 찾는다)', async () => {
    const { db, run } = setup([recipe()])
    let writtenBeforeInsert: unknown = null
    db.beforeRun = (call) => {
      if (call.table === 'combination_recipes' && call.op === 'insert') {
        writtenBeforeInsert = (db.item(ID.recipe).created_resource as { recipe_id?: string } | null)?.recipe_id ?? null
      }
    }
    ok(await run([ID.recipe]))

    expect(writtenBeforeInsert).toMatch(UUID_PATTERN)
    expect(writtenBeforeInsert).toBe(db.tables.combination_recipes[0].id)
  })

  it('항목에 종료 시각이 있으면 valid_until로 저장한다', async () => {
    const { db, run } = setup([recipe({ endsAt: '2026-10-17T00:00:00.000Z' })])
    ok(await run([ID.recipe]))

    expect(db.tables.combination_recipes[0]).toMatchObject({ valid_from: '2026-10-10T00:00:00.000Z', valid_until: '2026-10-17T00:00:00.000Z' })
  })

  it('resource가 정한 보상 배지(아이템 배지)가 저장된다', async () => {
    const { db, run } = setup([recipe({ resource: { slots: SLOTS, reward_badge_ids: [REWARD_BADGE] } })])
    ok(await run([ID.recipe]))

    expect(db.tables.combination_recipes[0]).toMatchObject({ reward_points: 0, reward_badge_ids: [REWARD_BADGE] })
  })

  it('레시피 공개 시각에 이미 열리는 컬렉션의 배지가 들어 있으면 예약된다', async () => {
    const { db, run } = setup([recipe()], BOOK)
    db.tables.item_books = [{ id: BOOK, is_active: true, valid_from: '2026-10-08T00:00:00.000Z', valid_until: null }]
    const result = ok(await run([ID.recipe]))

    expect(result.body.scheduled).toEqual([ID.recipe])
    expect(db.tables.combination_recipes).toHaveLength(1)
  })

  it('안 열린 컬렉션의 배지가 들어 있으면 고정 사유로 실패하고 아무것도 만들지 않는다. 배지·컬렉션 ID는 응답·기록·슬랙에 없다', async () => {
    const { db, run } = setup([recipe()], BOOK)
    db.tables.item_books = [{ id: BOOK, is_active: true, valid_from: '2026-10-12T00:00:00.000Z', valid_until: null }] // 레시피(10/10)보다 늦다
    const result = ok(await run([ID.recipe]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed).toEqual([{ id: ID.recipe, reason: NOT_LAUNCHED }])
    expect(db.tables.combination_recipes).toEqual([])
    expect(db.tables.combination_recipe_slots).toEqual([])
    expect(db.calls.filter((call) => call.table.startsWith('combination_recipe') && call.op !== 'select')).toEqual([])
    expect(statusOf(db, ID.recipe)).toBe('failed')
    expect(db.decisions('fail').map((entry) => entry.reason)).toEqual([NOT_LAUNCHED])
    for (const output of await outputsOf(db, result)) {
      expect(output).not.toContain(ITEM_BADGE)
      expect(output).not.toContain(BOOK)
    }
    // 서버 로그에는 원인이 남는다
    expect(logged()).toContain(ITEM_BADGE)
    expect(logged()).toContain(BOOK)
  })

  it('안 열린 컬렉션 검사에 걸리면 연결된 카드도 함께 실패하고 카드도 만들지 않는다', async () => {
    const { db, run } = setup([card(), recipe()], BOOK)
    db.tables.item_books = [{ id: BOOK, is_active: false, valid_from: null, valid_until: null }]
    const result = ok(await run([ID.card, ID.recipe]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.find((entry) => entry.id === ID.recipe)?.reason).toBe(NOT_LAUNCHED)
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe(GROUP_FAILED)
    expect(db.tables.combination_recipes).toEqual([])
    expect(db.tables.today_cards).toEqual([])
    expect(db.calls.filter((call) => (call.table === 'today_cards' || call.table.startsWith('combination_recipe')) && call.op !== 'select')).toEqual([])
  })

  it('컬렉션을 읽지 못하면 통과시키지 않고 고정 사유로 실패한다. DB 오류 원문은 로그에만 남는다', async () => {
    const { db, run } = setup([recipe()], BOOK)
    db.failIf = (call) => call.table === 'item_books'
    const result = ok(await run([ID.recipe]))

    expect(result.body.failed).toEqual([{ id: ID.recipe, reason: '등록 전 확인 중 DB를 읽지 못했어요' }])
    expect(db.tables.combination_recipes).toEqual([])
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('슬롯 후보 배지가 없으면 서버 함수의 쉬운 문장으로 실패한다. 배지 ID는 응답·기록·슬랙에 없다', async () => {
    const { db, run } = setup([recipe({ resource: { slots: [SLOTS[0], { badge_type: 'activity', allowed_badge_ids: [uid(99)] }], reward_points: 10 } })])
    const result = ok(await run([ID.recipe]))

    expect(result.body.failed).toEqual([
      { id: ID.recipe, reason: '슬롯에 지정한 후보 중 삭제되었거나 존재하지 않는 배지가 있어요. 다시 선택해 주세요.' },
    ])
    expect(db.tables.combination_recipes).toEqual([])
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(uid(99))
  })

  it('형식 오류는 첫 문장으로 실패한다: 슬롯이 하나뿐이면 normalizeRecipePayload의 문장이다', async () => {
    const { db, run } = setup([recipe({ resource: { slots: [SLOTS[0]], reward_points: 10 } })])
    const result = ok(await run([ID.recipe]))

    expect(result.body.failed).toEqual([{ id: ID.recipe, reason: '레시피 형식이 맞지 않아요: 슬롯을 2개 이상 만들어 주세요.' }])
    expect(db.tables.combination_recipes).toEqual([])
  })

  it('변환 오류는 첫 문장으로 실패한다: 이름이 없으면 「레시피 형식이 맞지 않아요: recipe.name: …」이다', async () => {
    const { db, run } = setup([recipe({ original: { copy: {} } })])
    const result = ok(await run([ID.recipe]))

    expect(result.body.failed).toEqual([{ id: ID.recipe, reason: '레시피 형식이 맞지 않아요: recipe.name: 필수 항목이 없어요.' }])
    expect(db.tables.combination_recipes).toEqual([])
  })

  it('종료 시각이 공개 시각보다 늦지 않으면 서버 함수의 쉬운 문장으로 실패한다', async () => {
    const { db, run } = setup([recipe({ endsAt: '2026-10-09T00:00:00.000Z' })]) // 공개(10/10)보다 이르다
    const result = ok(await run([ID.recipe]))

    expect(result.body.failed).toEqual([
      { id: ID.recipe, reason: '종료 시각은 공개 시각보다 늦어야 해요. 종료 시각을 공개 시각 이후로 다시 선택해 주세요.' },
    ])
    expect(db.tables.combination_recipes).toEqual([])
  })

  it('레시피와 카드가 함께 예약된다: 레시피가 먼저 만들어지고 카드가 그다음이다', async () => {
    const { db, run } = setup([card(), recipe()])
    const result = ok(await run([ID.card, ID.recipe]))

    expect([...result.body.scheduled].sort()).toEqual([ID.card, ID.recipe].sort())
    expect(db.tables.combination_recipes).toHaveLength(1)
    expect(db.tables.today_cards).toHaveLength(1)
    const inserts = db.calls.filter((call) => call.op === 'insert' && (call.table === 'combination_recipes' || call.table === 'today_cards')).map((call) => call.table)
    expect(inserts).toEqual(['combination_recipes', 'today_cards'])
    expect(db.item(ID.recipe).created_resource).toEqual({ recipe_id: db.tables.combination_recipes[0].id })
    // 카드의 recipe_id는 방금 만든 레시피의 ID다(티켓 20261006_1218)
    expect(db.tables.today_cards[0]).toMatchObject({ template_type: 'recipe_reveal', recipe_id: db.tables.combination_recipes[0].id })
  })

  it('카드의 공개 시각이 레시피보다 이르거나 늦어도 함께 예약된다(카드 → 레시피에는 공개 순서 검사가 없다, 07 §4.5 예외)', async () => {
    const { db, run } = setup([card({ startsAt: '2026-10-09T00:00:00.000Z' }), recipe()]) // 카드가 레시피(10/10)보다 하루 먼저 공개된다
    const result = ok(await run([ID.card, ID.recipe]))

    expect([...result.body.scheduled].sort()).toEqual([ID.card, ID.recipe].sort())
    expect(db.tables.today_cards[0].recipe_id).toBe(db.tables.combination_recipes[0].id)
  })

  it('이미 예약된 레시피를 가리키는 카드는 그 레시피의 ID를 created_resource에서 읽어 채운다', async () => {
    const existing = uid(11)
    const { db, run } = setup([card(), recipe({ status: 'scheduled', createdResource: { recipe_id: existing } })])
    const result = ok(await run([ID.card]))

    expect(result.body.scheduled).toEqual([ID.card])
    expect(db.tables.today_cards[0].recipe_id).toBe(existing)
    expect(writes(db, 'combination_recipes', 'insert')).toEqual([])
  })

  it('카드가 이미 있는 레시피를 resource.recipe_id로 직접 가리키고 연결이 없으면 그 ID로 저장한다. 존재하지 않으면 고정 사유로 실패한다', async () => {
    const EXISTING_RECIPE = uid(30)
    const direct = setup([card({ links: [], resource: { template_type: 'recipe_reveal', recipe_id: EXISTING_RECIPE } })])
    direct.db.tables.combination_recipes = [{ id: EXISTING_RECIPE, valid_from: '2026-10-10T00:00:00.000Z', valid_until: null }]
    ok(await direct.run([ID.card]))
    expect(direct.db.tables.today_cards[0].recipe_id).toBe(EXISTING_RECIPE)

    const missing = setup([card({ links: [], resource: { template_type: 'recipe_reveal', recipe_id: EXISTING_RECIPE } })])
    const result = ok(await missing.run([ID.card]))
    expect(result.body.failed).toEqual([{ id: ID.card, reason: '연결한 레시피를 찾을 수 없어요' }])
    expect(missing.db.tables.today_cards).toEqual([])
  })

  it('연결과 resource.recipe_id가 둘 다 있으면 못 하는 항목이라 아무것도 만들지 않는다', async () => {
    const { db, run } = setup([card({ resource: { template_type: 'recipe_reveal', recipe_id: uid(30) } }), recipe()])
    const failure = bad(await run([ID.card, ID.recipe]))

    expect(failure.status).toBe(409)
    expect((failure.extra?.skipped as Array<{ id: string; reason: string }>).find((entry) => entry.id === ID.card)?.reason).toContain('이미 값이 들어 있는 칸')
    expect(db.tables.today_cards).toEqual([])
    expect(db.tables.combination_recipes).toEqual([])
    expect(db.calls.filter((call) => (call.table === 'today_cards' || call.table.startsWith('combination_recipe')) && call.op !== 'select')).toEqual([])
  })

  it('연결된 카드를 만들지 못하면 먼저 만든 레시피와 슬롯을 되돌리고 그룹 전체가 실패한다. 원문은 로그에만 남는다', async () => {
    const { db, run } = setup([card(), recipe()])
    db.failIf = (call) => call.table === 'today_cards' && call.op === 'insert'
    const result = ok(await run([ID.card, ID.recipe]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe('카드를 만들지 못했어요')
    expect(result.body.failed.find((entry) => entry.id === ID.recipe)?.reason).toBe(GROUP_FAILED)
    expect(writes(db, 'combination_recipes', 'insert')).toHaveLength(1)
    expect(writes(db, 'combination_recipes', 'delete')).toHaveLength(1)
    expect(db.tables.combination_recipes).toEqual([])
    expect(db.tables.combination_recipe_slots).toEqual([])
    expect(db.tables.today_cards).toEqual([])
    expect(statusOf(db, ID.card)).toBe('failed')
    expect(statusOf(db, ID.recipe)).toBe('failed')
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('레시피 insert가 실패하면 카드는 만들기 전이라 아무것도 만들지 않는다. 레시피 사유가 원인이다', async () => {
    const { db, run } = setup([card(), recipe()])
    db.failIf = (call) => call.table === 'combination_recipes' && call.op === 'insert'
    const result = ok(await run([ID.card, ID.recipe]))

    expect(result.body.failed.find((entry) => entry.id === ID.recipe)?.reason).toBe('레시피를 만들지 못했어요')
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe(GROUP_FAILED)
    expect(db.tables.combination_recipes).toEqual([])
    expect(writes(db, 'today_cards', 'insert')).toEqual([])
    // 만들기 전에 적은 레시피 ID는 실패해도 항목에 남지만(PRD §8.5) 응답·기록·슬랙에는 나가지 않는다.
    const recipeResourceId = (db.item(ID.recipe).created_resource as { recipe_id: string }).recipe_id
    expect(recipeResourceId).toMatch(UUID_PATTERN)
    for (const output of await outputsOf(db, result)) {
      expect(output).not.toContain(DB_SECRET)
      expect(output).not.toContain(recipeResourceId)
    }
    expect(logged()).toContain(DB_SECRET)
  })

  it('되돌리는 사이 가장 먼저 성공 배지가 레시피를 가리키면 레시피를 지우지 않고 「되돌리지 못한 자원이 있어요」를 덧붙인다. 레시피 ID는 사유에 없다', async () => {
    const { db, run } = setup([card(), recipe()])
    db.failIf = (call) => call.table === 'today_cards' && call.op === 'insert'
    // 카드를 만들기 직전, 다른 곳에서 이 레시피를 가리키는 배지가 생긴 경우를 흉내 낸다.
    db.beforeRun = (call) => {
      if (call.table === 'today_cards' && call.op === 'insert') {
        const recipeId = db.tables.combination_recipes[0].id as string
        db.tables.badges = [
          ...db.tables.badges,
          { id: FIRST_SUCCESS_BADGE, type: 'activity', deleted_at: null, item_book_id: null, condition_json: { recipe_first_success: { recipe_id: recipeId } } },
        ]
      }
    }
    const result = ok(await run([ID.card, ID.recipe]))

    expect(result.body.failed.find((entry) => entry.id === ID.recipe)?.reason).toBe(`${GROUP_FAILED}. 되돌리지 못한 자원이 있어요`)
    expect(db.tables.combination_recipes).toHaveLength(1)
    for (const output of await outputsOf(db, result)) {
      expect(output).not.toContain(db.tables.combination_recipes[0].id as string)
      expect(output).not.toContain(FIRST_SUCCESS_BADGE)
    }
    expect(logged()).toContain('이 레시피를 가리키는 배지')
  })

  it('시험 묶음은 등록 전 검사까지 하고 레시피 표에 쓰지 않는다. created_resource는 { sample: true }다', async () => {
    const { db, run } = setup([recipe()], null, { is_sample: true })
    const result = ok(await run([ID.recipe]))

    expect(result.body.scheduled).toEqual([ID.recipe])
    expect(db.tables.combination_recipes).toEqual([])
    expect(db.calls.some((call) => call.table === 'badges' && call.op === 'select')).toBe(true) // 슬롯 후보 배지 확인을 했다
    expect(db.calls.filter((call) => call.table.startsWith('combination_recipe'))).toEqual([])
    expect(db.item(ID.recipe).created_resource).toEqual({ sample: true })
  })

  it('시험 묶음도 안 열린 컬렉션 검사에서 걸리면 실패한다', async () => {
    const { db, run } = setup([recipe()], BOOK, { is_sample: true })
    db.tables.item_books = [{ id: BOOK, is_active: false, valid_from: null, valid_until: null }]
    const result = ok(await run([ID.recipe]))

    expect(result.body.failed).toEqual([{ id: ID.recipe, reason: NOT_LAUNCHED }])
  })

  it('같은 묶음을 두 번 실행해도 레시피는 한 번만 만든다', async () => {
    const { db, run } = setup([recipe()])
    ok(await run([ID.recipe]))
    const second = bad(await run([ID.recipe]))

    expect(second.status).toBe(409)
    expect(writes(db, 'combination_recipes', 'insert')).toHaveLength(1)
  })
})

// ── 실제 레지스트리(드랍 예약 핸들러, 티켓 20261002_2306) ──────────────────────────────────────────

describe('실제 레지스트리: 드랍 예약 핸들러 (티켓 20261002_2306)', () => {
  const DROP = uid(40)
  const 장소 = uid(41)
  const BOOK = uid(42)
  const COLLECTION_ITEM = uid(44)
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  const GROUP_FAILED = '연결된 항목을 만들지 못해 함께 실패했어요'
  const PROBLEM = '예정 시각에 놓을 수 없는 대상이 있어요(노출 중이 아닌 컬렉션 1건). 예약은 예정 시각의 상태로 확인해요. 해당 대상을 빼거나 시각을 바꿔서 다시 시도해 주세요.'
  const NOT_EXPOSED: ScheduleTargets = { ...targetsOk(), excluded: { pois: [], badges: [], collections: [{ id: BOOK, reason: 'collection_not_exposed' }] } }

  /** 검사를 통과하는 드랍(지점 직접 × 컬렉션). 예정 시각은 행의 `LATER`(10/10 09:00 KST), 종료 시각은 없다. */
  const drop = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: DROP,
    key: 'drop',
    kind: 'drop_schedule',
    original: { copy: { title: '가을 아침 드랍' } },
    resource: { poi_ids: [장소], per_poi_count: 2, collection_ids: [BOOK] },
    ...over,
  })
  /** 드랍과 같은 그룹인 카드. 카드 → 드랍 쌍은 칸을 채우지 않아 그룹으로만 묶인다(PRD §8.3). 드랍이 카드보다 먼저 만들어진다. */
  const card = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.card,
    key: 'card',
    kind: 'home_feed_card',
    links: ['drop'],
    original: { shape: 'hero', exposure_tags: ['all'], copy: { title: '가을 드랍 카드' } },
    resource: { template_type: 'drop_alert' },
    ...over,
  })
  const writes = (db: FakeDb, table: string, op: FakeCall['op']) => db.calls.filter((call) => call.table === table && call.op === op)
  const scheduleWrites = (db: FakeDb) => db.calls.filter((call) => call.table === 'ambient_drop_schedules' && call.op !== 'select')

  it('승인된 드랍 하나를 실행하면 공개 전(scheduled) 예약 행이 생기고 created_resource.ambient_drop_schedule_id와 ID가 같다', async () => {
    const { db, run } = setupReal([drop()])
    const result = ok(await run([DROP]))

    expect(result.body.scheduled).toEqual([DROP])
    expect(result.body.failed).toEqual([])
    expect(db.tables.ambient_drop_schedules).toHaveLength(1)
    const row = db.tables.ambient_drop_schedules[0]
    const created = db.item(DROP).created_resource as { ambient_drop_schedule_id: string }
    expect(created.ambient_drop_schedule_id).toMatch(UUID_PATTERN)
    expect(row.id).toBe(created.ambient_drop_schedule_id)
    // 예정 시각 = 항목 공개 시각. created_by는 실행한 관리자 ID다. 상태는 만들 때 넘기지 않는 DB 기본값(scheduled)이다.
    expect(row).toMatchObject({
      status: 'scheduled',
      title: '가을 아침 드랍',
      scheduled_at: '2026-10-10T00:00:00.000Z',
      poi_mode: 'list',
      poi_ids: [장소],
      per_poi_count: 2,
      item_mode: 'collections',
      collection_ids: [BOOK],
      created_by: ACTOR,
    })
    expect((db.calls.find((call) => call.table === 'ambient_drop_schedules' && call.op === 'insert')?.payload as Row)).not.toHaveProperty('status')
    expect(statusOf(db, DROP)).toBe('scheduled')
    expect(db.decisions('execute').map((entry) => entry.item_id)).toEqual([DROP])
    // 정한 ID와 돌려준 ID가 같아 created_resource는 만들기 전에 한 번만 적는다
    const resourceWrites = db.itemWrites().filter((call) => call.op === 'update' && 'created_resource' in (call.payload as Row))
    expect(resourceWrites).toHaveLength(1)
    expect(scheduleWrites(db)).toHaveLength(1)
  })

  it('created_resource.ambient_drop_schedule_id는 예약을 만들기 전에 적힌다(만드는 도중 끊겨도 상태 맞추기가 예약을 찾는다)', async () => {
    const { db, run } = setupReal([drop()])
    let writtenBeforeInsert: unknown = null
    db.beforeRun = (call) => {
      if (call.table === 'ambient_drop_schedules' && call.op === 'insert') {
        writtenBeforeInsert = (db.item(DROP).created_resource as { ambient_drop_schedule_id?: string } | null)?.ambient_drop_schedule_id ?? null
      }
    }
    ok(await run([DROP]))

    expect(writtenBeforeInsert).toMatch(UUID_PATTERN)
    expect(writtenBeforeInsert).toBe(db.tables.ambient_drop_schedules[0].id)
  })

  it('예정 시각 기준 대상 판정은 항목의 공개 시각으로 부른다', async () => {
    const { run } = setupReal([drop()])
    ok(await run([DROP]))

    expect(h.loadScheduleTargets).toHaveBeenCalled()
    for (const call of h.loadScheduleTargets.mock.calls) expect(call[2]).toBe('2026-10-10T00:00:00.000Z')
  })

  it('종류+개수 × 컬렉션도 예약된다. 장소 종류는 확인한다', async () => {
    const { db, run } = setupReal([drop({ resource: { poi_category: 'cafe', total_count: 3, collection_ids: [BOOK] } })])
    db.tables.poi_categories = [{ slug: 'cafe' }]
    const result = ok(await run([DROP]))

    expect(result.body.scheduled).toEqual([DROP])
    expect(db.tables.ambient_drop_schedules[0]).toMatchObject({ poi_mode: 'category', poi_category: 'cafe', total_count: 3, per_poi_count: null })
  })

  it('없는 장소 종류는 고정 사유로 실패하고 아무것도 만들지 않는다', async () => {
    const { db, run } = setupReal([drop({ resource: { poi_category: 'nowhere', total_count: 3, collection_ids: [BOOK] } })])
    const result = ok(await run([DROP]))

    expect(result.body.failed).toEqual([{ id: DROP, reason: '장소 종류를 찾을 수 없어요' }])
    expect(statusOf(db, DROP)).toBe('failed')
    expect(scheduleWrites(db)).toEqual([])
    expect(db.decisions('fail').map((entry) => entry.reason)).toEqual(['장소 종류를 찾을 수 없어요'])
  })

  it('예정 시각에 놓을 대상이 걸리면 쉬운 문장으로 실패하고 아무것도 만들지 않는다. 컬렉션 ID는 응답·기록·슬랙에 없다', async () => {
    h.loadScheduleTargets.mockResolvedValue(NOT_EXPOSED)
    const { db, run } = setupReal([drop()])
    const result = ok(await run([DROP]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed).toEqual([{ id: DROP, reason: PROBLEM }])
    expect(statusOf(db, DROP)).toBe('failed')
    expect(db.tables.ambient_drop_schedules).toEqual([])
    expect(scheduleWrites(db)).toEqual([])
    expect(db.decisions('fail').map((entry) => entry.reason)).toEqual([PROBLEM])
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(BOOK)
  })

  it('놓을 대상이 하나도 없어도(대상 없음) 같다: 「예정 시각에 노출 중인 컬렉션이 없어요」', async () => {
    h.loadScheduleTargets.mockResolvedValue({ ...targetsOk(), badgePool: [], effectiveCollectionIds: [], reason: 'no_eligible_collection' })
    const { db, run } = setupReal([drop()])
    const result = ok(await run([DROP]))

    expect(result.body.failed).toHaveLength(1)
    expect(result.body.failed[0].reason).toContain('예정 시각에 노출 중인 컬렉션이 없어요')
    expect(db.tables.ambient_drop_schedules).toEqual([])
  })

  it('대상 판정에 걸리면 연결된 카드도 함께 실패하고 카드도 만들지 않는다', async () => {
    h.loadScheduleTargets.mockResolvedValue(NOT_EXPOSED)
    const { db, run } = setupReal([card(), drop()])
    const result = ok(await run([ID.card, DROP]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.find((entry) => entry.id === DROP)?.reason).toBe(PROBLEM)
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe(GROUP_FAILED)
    expect(db.tables.ambient_drop_schedules).toEqual([])
    expect(db.tables.today_cards).toEqual([])
    expect(db.calls.filter((call) => (call.table === 'today_cards' || call.table === 'ambient_drop_schedules') && call.op !== 'select')).toEqual([])
  })

  it('대상을 읽지 못하면 고정 사유로 실패한다. DB 오류 원문은 로그에만 남는다', async () => {
    h.loadScheduleTargets.mockRejectedValue(new Error(DB_SECRET))
    const { db, run } = setupReal([drop()])
    const result = ok(await run([DROP]))

    expect(result.body.failed).toEqual([{ id: DROP, reason: '드랍 대상을 확인하지 못했어요' }])
    expect(db.tables.ambient_drop_schedules).toEqual([])
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('형식 오류는 첫 문장으로 실패하고 만든 행이 없다: 종료 시각이 있으면 「드랍 예약 형식이 맞지 않아요: drop_schedule.ends_at: …」', async () => {
    const { db, run } = setupReal([drop({ endsAt: '2026-10-17T00:00:00.000Z' })])
    const result = ok(await run([DROP]))

    expect(result.body.failed).toHaveLength(1)
    expect(result.body.failed[0].reason).toMatch(/^드랍 예약 형식이 맞지 않아요: drop_schedule\.ends_at: /)
    expect(db.tables.ambient_drop_schedules).toEqual([])
    expect(statusOf(db, DROP)).toBe('failed')
  })

  it('공개 시각이 정시가 아니면 드랍 파서의 쉬운 문장으로 실패한다', async () => {
    const { db, run } = setupReal([drop({ startsAt: '2026-10-10T00:30:00.000Z' })])
    const result = ok(await run([DROP]))

    expect(result.body.failed).toHaveLength(1)
    expect(result.body.failed[0].reason).toMatch(/^드랍 예약 형식이 맞지 않아요: 놓을 시각이 정시가 아니에요/)
    expect(db.tables.ambient_drop_schedules).toEqual([])
  })

  it('장소와 아이템을 정하는 방식이 섞이면 형식 오류로 실패한다', async () => {
    const { db, run } = setupReal([drop({ resource: { poi_ids: [장소], per_poi_count: 2, collection_ids: [BOOK], badge_ids: [uid(43)] } })])
    const result = ok(await run([DROP]))

    expect(result.body.failed).toHaveLength(1)
    expect(result.body.failed[0].reason).toContain('놓을 것을 정하는 방식이 섞여 있어요')
    expect(db.tables.ambient_drop_schedules).toEqual([])
  })

  it('예약 insert가 실패하면 고정 사유로 실패하고 같은 ID로 status 조건의 정리 delete를 한 번 시도한다. 원문과 예약 ID는 어디에도 없다', async () => {
    const { db, run } = setupReal([drop()])
    db.failIf = (call) => call.table === 'ambient_drop_schedules' && call.op === 'insert'
    const result = ok(await run([DROP]))

    expect(result.body.failed).toEqual([{ id: DROP, reason: '드랍 예약을 만들지 못했어요' }])
    expect(db.tables.ambient_drop_schedules).toEqual([])
    expect(statusOf(db, DROP)).toBe('failed')
    const plannedId = (db.item(DROP).created_resource as { ambient_drop_schedule_id: string }).ambient_drop_schedule_id
    const cleanup = writes(db, 'ambient_drop_schedules', 'delete')
    expect(cleanup).toHaveLength(1)
    expect(cleanup[0].filters).toEqual([
      ['id', plannedId],
      ['status', 'scheduled'],
    ])
    for (const output of await outputsOf(db, result)) {
      expect(output).not.toContain(DB_SECRET)
      expect(output).not.toContain(plannedId)
    }
  })

  it('드랍과 카드가 함께 예약된다: 드랍이 먼저 만들어지고 카드가 그다음이다', async () => {
    const { db, run } = setupReal([card(), drop()])
    const result = ok(await run([ID.card, DROP]))

    expect([...result.body.scheduled].sort()).toEqual([ID.card, DROP].sort())
    expect(db.tables.ambient_drop_schedules).toHaveLength(1)
    expect(db.tables.today_cards).toHaveLength(1)
    const inserts = db.calls.filter((call) => call.op === 'insert' && (call.table === 'ambient_drop_schedules' || call.table === 'today_cards')).map((call) => call.table)
    expect(inserts).toEqual(['ambient_drop_schedules', 'today_cards'])
    expect(db.item(DROP).created_resource).toEqual({ ambient_drop_schedule_id: db.tables.ambient_drop_schedules[0].id })
  })

  it('연결된 카드를 만들지 못하면 먼저 만든 드랍 예약을 지우고 그룹 전체가 실패한다. 원문은 로그에만 남는다', async () => {
    const { db, run } = setupReal([card(), drop()])
    db.failIf = (call) => call.table === 'today_cards' && call.op === 'insert'
    const result = ok(await run([ID.card, DROP]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe('카드를 만들지 못했어요')
    expect(result.body.failed.find((entry) => entry.id === DROP)?.reason).toBe(GROUP_FAILED)
    expect(writes(db, 'ambient_drop_schedules', 'insert')).toHaveLength(1)
    expect(writes(db, 'ambient_drop_schedules', 'delete')).toHaveLength(1)
    expect(db.tables.ambient_drop_schedules).toEqual([])
    expect(db.tables.today_cards).toEqual([])
    expect(statusOf(db, ID.card)).toBe('failed')
    expect(statusOf(db, DROP)).toBe('failed')
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('드랍 예약 insert가 실패하면 카드는 만들기 전이라 아무것도 만들지 않는다. 드랍 사유가 원인이다', async () => {
    const { db, run } = setupReal([card(), drop()])
    db.failIf = (call) => call.table === 'ambient_drop_schedules' && call.op === 'insert'
    const result = ok(await run([ID.card, DROP]))

    expect(result.body.failed.find((entry) => entry.id === DROP)?.reason).toBe('드랍 예약을 만들지 못했어요')
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe(GROUP_FAILED)
    expect(db.tables.ambient_drop_schedules).toEqual([])
    expect(writes(db, 'today_cards', 'insert')).toEqual([])
  })

  it('되돌리는 사이 드랍 실행이 시작되면 예약을 지우지 않고 「되돌리지 못한 자원이 있어요」를 덧붙인다. 예약 ID는 사유에 없다', async () => {
    const { db, run } = setupReal([card(), drop()])
    db.failIf = (call) => call.table === 'today_cards' && call.op === 'insert'
    // 카드를 만들기 직전, 드랍 실행기가 이 예약을 선점한 경우를 흉내 낸다.
    db.beforeRun = (call) => {
      if (call.table === 'today_cards' && call.op === 'insert') db.tables.ambient_drop_schedules[0].status = 'running'
    }
    const result = ok(await run([ID.card, DROP]))

    expect(result.body.failed.find((entry) => entry.id === DROP)?.reason).toBe(`${GROUP_FAILED}. 되돌리지 못한 자원이 있어요`)
    expect(db.tables.ambient_drop_schedules).toHaveLength(1)
    expect(db.tables.ambient_drop_schedules[0].status).toBe('running')
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(db.tables.ambient_drop_schedules[0].id as string)
  })

  it('시험 묶음은 등록 전 검사까지 하고 예약 표에 쓰지 않는다. created_resource는 { sample: true }다', async () => {
    const { db, run } = setupReal([drop()], { is_sample: true })
    const result = ok(await run([DROP]))

    expect(result.body.scheduled).toEqual([DROP])
    expect(db.tables.ambient_drop_schedules).toEqual([])
    expect(h.loadScheduleTargets).toHaveBeenCalled() // 대상 판정은 했다
    expect(db.calls.filter((call) => call.table === 'ambient_drop_schedules')).toEqual([])
    expect(db.item(DROP).created_resource).toEqual({ sample: true })
  })

  it('시험 묶음도 대상 판정에 걸리면 실패한다', async () => {
    h.loadScheduleTargets.mockResolvedValue(NOT_EXPOSED)
    const { run } = setupReal([drop()], { is_sample: true })
    const result = ok(await run([DROP]))

    expect(result.body.failed).toEqual([{ id: DROP, reason: PROBLEM }])
  })

  it('같은 묶음을 두 번 실행해도 예약은 한 번만 만든다', async () => {
    const { db, run } = setupReal([drop()])
    ok(await run([DROP]))
    const second = bad(await run([DROP]))

    expect(second.status).toBe(409)
    expect(writes(db, 'ambient_drop_schedules', 'insert')).toHaveLength(1)
  })

  describe('연결 컬렉션을 가리키는 드랍 (티켓 20261004_2242 ⑩-b)', () => {
    const collectionItem = (over: Partial<ItemSpec> = {}): ItemSpec => ({
      id: COLLECTION_ITEM,
      key: 'collection',
      kind: 'collection_launch',
      original: { copy: { name: '가을 컬렉션', description: '가을 길에서 모아요.' } },
      ...over,
    })
    const linkedDrop = (over: Partial<ItemSpec> = {}) => drop({ links: ['collection'], resource: { poi_ids: [장소], per_poi_count: 2 }, ...over })
    /** `loadScheduleTargets` mock이 받은 마지막 인자의 미룰 ID 목록. 판정은 mock이라 넘긴 값만 본다. */
    const deferredArgs = () => h.loadScheduleTargets.mock.calls.map((args) => (args[3] as { deferredCollectionIds?: string[] } | undefined)?.deferredCollectionIds)

    it('같은 묶음의 컬렉션 항목과 연결된 드랍은 컬렉션과 함께 예약된다: 만들 컬렉션 ID를 미룰 ID로 넘기고, 저장된 collection_ids에 그 ID가 들어 있다', async () => {
      const { db, run } = setupReal([linkedDrop(), collectionItem()])
      const result = ok(await run([DROP, COLLECTION_ITEM]))

      expect(result.body.failed).toEqual([])
      expect([...result.body.scheduled].sort()).toEqual([DROP, COLLECTION_ITEM].sort())
      expect(db.tables.item_books).toHaveLength(1)
      expect(db.tables.ambient_drop_schedules).toHaveLength(1)
      const bookId = (db.item(COLLECTION_ITEM).created_resource as { item_book_id: string }).item_book_id
      expect(db.tables.item_books[0].id).toBe(bookId)
      expect(db.tables.ambient_drop_schedules[0]).toMatchObject({ status: 'scheduled', item_mode: 'collections', collection_ids: [bookId] })
      // 컬렉션이 드랍보다 먼저 만들어진다(그룹 생성 순서).
      const inserts = db.calls.filter((call) => call.op === 'insert' && (call.table === 'item_books' || call.table === 'ambient_drop_schedules')).map((call) => call.table)
      expect(inserts).toEqual(['item_books', 'ambient_drop_schedules'])
      // 등록 전 검사(`check`)와 만들기(`create`)가 모두 만들 컬렉션 ID를 미룰 ID로 넘겼다.
      expect(h.loadScheduleTargets).toHaveBeenCalled()
      for (const deferred of deferredArgs()) expect(deferred).toEqual([bookId])
      expect(statusOf(db, DROP)).toBe('scheduled')
      expect(statusOf(db, COLLECTION_ITEM)).toBe('scheduled')
    })

    it('이전 실행이 만든 컬렉션을 가리키는 드랍도 그 컬렉션 ID(created_resource)를 미룰 ID로 넘기고 예약된다', async () => {
      const previousBook = uid(60)
      const { db, run } = setupReal([
        linkedDrop(),
        collectionItem({ status: 'scheduled', createdResource: { item_book_id: previousBook } }),
      ])
      const result = ok(await run([DROP]))

      expect(result.body.failed).toEqual([])
      expect(result.body.scheduled).toEqual([DROP])
      expect(db.tables.ambient_drop_schedules).toHaveLength(1)
      expect(db.tables.ambient_drop_schedules[0]).toMatchObject({ collection_ids: [previousBook] })
      for (const deferred of deferredArgs()) expect(deferred).toEqual([previousBook])
      // 이미 예약된 컬렉션은 건드리지 않는다.
      expect(db.calls.filter((call) => call.table === 'item_books' && call.op !== 'select')).toEqual([])
    })

    it('직접 적은 컬렉션은 미룰 ID에 들지 않고, 연결로 채운 컬렉션만 넘어간다', async () => {
      const { db, run } = setupReal([drop({ links: ['collection'] }), collectionItem()])
      const result = ok(await run([DROP, COLLECTION_ITEM]))

      expect(result.body.failed).toEqual([])
      const bookId = (db.item(COLLECTION_ITEM).created_resource as { item_book_id: string }).item_book_id
      expect(db.tables.ambient_drop_schedules[0].collection_ids).toEqual([BOOK, bookId])
      for (const deferred of deferredArgs()) expect(deferred).toEqual([bookId])
    })

    it('연결 컬렉션이 없는 드랍은 미룰 ID 없이 판정한다', async () => {
      const { run } = setupReal([drop()])
      ok(await run([DROP]))
      for (const deferred of deferredArgs()) expect(deferred ?? []).toEqual([])
    })

    it('드랍 판정이 직접 적은 컬렉션 때문에 실패하면 컬렉션도 함께 실패하고 아무것도 만들지 않는다', async () => {
      h.loadScheduleTargets.mockResolvedValue(NOT_EXPOSED)
      const { db, run } = setupReal([drop({ links: ['collection'] }), collectionItem()])
      const result = ok(await run([DROP, COLLECTION_ITEM]))

      expect(result.body.scheduled).toEqual([])
      expect(result.body.failed.find((entry) => entry.id === DROP)?.reason).toBe(PROBLEM)
      expect(result.body.failed.find((entry) => entry.id === COLLECTION_ITEM)?.reason).toBe(GROUP_FAILED)
      expect(db.tables.item_books).toEqual([])
      expect(db.tables.ambient_drop_schedules).toEqual([])
      expect(db.calls.filter((call) => ['item_books', 'ambient_drop_schedules'].includes(call.table) && call.op !== 'select')).toEqual([])
    })

    it('드랍이 연결된 컬렉션보다 먼저 공개되면 사전 점검이 막고 아무것도 만들지 않는다', async () => {
      const { db, run } = setupReal([linkedDrop({ startsAt: '2026-10-09T00:00:00.000Z' }), collectionItem()])
      const result = bad(await run([DROP, COLLECTION_ITEM]))

      expect(result.status).toBe(409)
      expect(db.calls.filter((call) => call.op !== 'select' && ['item_books', 'ambient_drop_schedules'].includes(call.table))).toEqual([])
      const items = [DROP, COLLECTION_ITEM].map((id) => db.item(id))
      const precheck = precheckBundle(items as never, { now: NOW, handlers: EXECUTE_HANDLERS })
      expect(precheck.blocked.find((entry) => entry.id === DROP)?.reasons).toContain(PRECHECK_MESSAGES.beforeLinkedCollection)
    })
  })
})

// ── 실제 레지스트리(컬렉션 핸들러, 티켓 20261004_2039) ───────────────────────────────────────────

describe('실제 레지스트리: 컬렉션 핸들러 (티켓 20261004_2039)', () => {
  const BOOK_ITEM = uid(50)
  const TRIBE = uid(51)
  const ACTIVITY_BADGE = uid(52)
  const ITEM_BADGE = uid(53)
  const EXISTING_BOOK = uid(54)
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  const GROUP_FAILED = '연결된 항목을 만들지 못해 함께 실패했어요'

  /** 검사를 통과하는 컬렉션(틀만). 공개 시각은 행의 `LATER`(10/10 09:00 KST)다. */
  const book = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: BOOK_ITEM,
    key: 'collection',
    kind: 'collection_launch',
    original: { copy: { name: '가을 컬렉션', description: '가을 길에서 모아요.', story_text: '낙엽이 쌓인 길을 따라가요.' } },
    resource: { image_url: 'https://cdn.example.com/book.webp', reward_points: 50 },
    ...over,
  })
  /** 컬렉션을 여는 카드. `itembook_milestone`은 `item_book_id`가 있어야 하고 연결로 채운다. */
  const card = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.card,
    key: 'card',
    kind: 'home_feed_card',
    links: ['collection'],
    original: { shape: 'hero', exposure_tags: ['all'], copy: { title: '가을 컬렉션 카드' } },
    resource: { template_type: 'itembook_milestone' },
    ...over,
  })
  /** 컬렉션의 완성 보상으로 가리키는 JAM! 배지. 발급 조건은 비어 있다(컬렉션 완성이 발급 경로다). */
  const rewardBadge = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.badge,
    key: 'badge',
    kind: 'jam_badge',
    original: { copy: { name: '가을 컬렉터', description: '가을 컬렉션을 완성했어요.' } },
    resource: { condition_json: {}, rarity: 'rare', point_reward: 20 },
    ...over,
  })
  /** 보상 배지를 컬렉션이 가리키는 쪽(`collection → badge`)으로 연결한 컬렉션. */
  const bookWithReward = (over: Partial<ItemSpec> = {}): ItemSpec => book({ links: ['badge'], ...over })

  const setup = (specs: ItemSpec[], bundle: Row = {}) => {
    const real = setupReal(specs, bundle)
    real.db.tables.tribes = [{ id: TRIBE }]
    real.db.tables.badges = [
      { id: ACTIVITY_BADGE, name: '활동 배지', type: 'activity', deleted_at: null, item_book_id: null },
      { id: ITEM_BADGE, name: '아이템 배지', type: 'item', deleted_at: null, item_book_id: null },
    ]
    return real
  }
  const created = (db: FakeDb) => db.tables.item_books.filter((row) => row.name === '가을 컬렉션')
  const inserted = (db: FakeDb, table: string) => db.calls.filter((call) => call.table === table && call.op === 'insert')
  const order = (db: FakeDb) => db.calls.map((call) => `${call.table}:${call.op}`)
  const writes = (db: FakeDb, table: string, op: FakeCall['op']) => db.calls.filter((call) => call.table === table && call.op === op)

  it('승인된 컬렉션 하나를 실행하면 공개 전 item_books 행이 생기고 created_resource.item_book_id가 만들기 전에 적힌다', async () => {
    const { db, run } = setup([book()])
    const result = ok(await run([BOOK_ITEM]))

    expect(result.body.scheduled).toEqual([BOOK_ITEM])
    expect(result.body.failed).toEqual([])
    expect(created(db)).toHaveLength(1)
    const row = created(db)[0]
    const resource = db.item(BOOK_ITEM).created_resource as { item_book_id: string }
    expect(resource.item_book_id).toMatch(UUID_PATTERN)
    expect(row.id).toBe(resource.item_book_id)
    // 틀 칸만 채운다: 공개 시각 = 항목 공개 시각, 활성, 종료 시각 없음(상시), 보상 배지·트라이브 없음
    expect(row).toMatchObject({
      name: '가을 컬렉션',
      description: '가을 길에서 모아요.',
      story_text: '낙엽이 쌓인 길을 따라가요.',
      image_url: 'https://cdn.example.com/book.webp',
      reward_points: 50,
      reward_badge_id: null,
      tribe_id: null,
      is_active: true,
      valid_from: '2026-10-10T00:00:00.000Z',
      valid_until: null,
    })
    expect(Object.keys(row)).not.toContain('required_activity_badge_id')
    expect(Object.keys(row)).not.toContain('image_source')
    expect(statusOf(db, BOOK_ITEM)).toBe('scheduled')
    expect(db.decisions('execute').map((entry) => entry.item_id)).toEqual([BOOK_ITEM])
    // 만들기 전에 created_resource를 먼저 적는다(정한 ID와 돌려준 ID가 같아 한 번만 적는다)
    const written = db.itemWrites().filter((call) => call.op === 'update' && JSON.stringify(call.payload).includes('"item_book_id"'))
    expect(written).toHaveLength(1)
    expect(db.calls.indexOf(written[0])).toBeLessThan(order(db).indexOf('item_books:insert'))
  })

  it('종료 시각·트라이브·직접 적은 활동 배지 보상이 들어간다', async () => {
    const { db, run } = setup([book({ endsAt: '2026-10-17T00:00:00.000Z', original: { tribe_id: TRIBE, copy: { name: '가을 컬렉션', description: '설명' } }, resource: { reward_badge_id: ACTIVITY_BADGE } })])
    const result = ok(await run([BOOK_ITEM]))

    expect(result.body.failed).toEqual([])
    expect(created(db)[0]).toMatchObject({ valid_from: '2026-10-10T00:00:00.000Z', valid_until: '2026-10-17T00:00:00.000Z', tribe_id: TRIBE, reward_badge_id: ACTIVITY_BADGE })
  })

  it('카드 → 컬렉션: 컬렉션이 먼저 만들어지고 카드의 컬렉션 칸(item_book_id)이 그 ID로 채워진다', async () => {
    const { db, run } = setup([card(), book()])
    const result = ok(await run([ID.card, BOOK_ITEM]))

    expect([...result.body.scheduled].sort()).toEqual([ID.card, BOOK_ITEM].sort())
    expect(result.body.failed).toEqual([])
    expect(db.tables.today_cards).toHaveLength(1)
    expect(db.tables.today_cards[0].item_book_id).toBe(created(db)[0].id)
    expect(db.item(BOOK_ITEM).created_resource).toEqual({ item_book_id: created(db)[0].id })
    expect(db.item(ID.card).created_resource).toEqual({ today_card_id: db.tables.today_cards[0].id })
    expect(order(db).indexOf('item_books:insert')).toBeLessThan(order(db).indexOf('today_cards:insert'))
  })

  it('컬렉션 → 보상 배지: 배지가 먼저 만들어지고 컬렉션의 보상 배지 칸(reward_badge_id)이 그 ID로 채워진다', async () => {
    const { db, run } = setup([bookWithReward(), rewardBadge()])
    const result = ok(await run([BOOK_ITEM, ID.badge]))

    expect([...result.body.scheduled].sort()).toEqual([BOOK_ITEM, ID.badge].sort())
    expect(result.body.failed).toEqual([])
    const badgeRow = db.tables.badges.find((row) => row.name === '가을 컬렉터') as Row
    expect(badgeRow).toMatchObject({ type: 'activity', admin_category: 'jam', condition_json: {}, valid_from: '2026-10-10T00:00:00.000Z' })
    expect(created(db)[0].reward_badge_id).toBe(badgeRow.id)
    expect(db.item(ID.badge).created_resource).toEqual({ badge_id: badgeRow.id })
    expect(order(db).indexOf('badges:insert')).toBeLessThan(order(db).indexOf('item_books:insert'))
    // 연결로 채운 보상 배지는 아직 없을 수 있어 DB의 배지를 id로 미리 읽어 견주지 않는다(컬렉션 쪽 읽기)
    expect(db.calls.filter((call) => call.table === 'badges' && call.op === 'select' && call.filters.some(([column]) => column === 'id'))).toEqual([])
  })

  it('카드·컬렉션·보상 배지가 한 그룹이면 배지 → 컬렉션 → 카드 순으로 만들고 두 칸 모두 만든 ID로 채운다', async () => {
    const { db, run } = setup([card(), bookWithReward(), rewardBadge()])
    const result = ok(await run([ID.card, BOOK_ITEM, ID.badge]))

    expect(result.body.scheduled).toHaveLength(3)
    const badgeId = (db.tables.badges.find((row) => row.name === '가을 컬렉터') as Row).id
    expect(created(db)[0].reward_badge_id).toBe(badgeId)
    expect(db.tables.today_cards[0].item_book_id).toBe(created(db)[0].id)
    const inserts = db.calls.filter((call) => call.op === 'insert' && ['badges', 'item_books', 'today_cards'].includes(call.table)).map((call) => call.table)
    expect(inserts).toEqual(['badges', 'item_books', 'today_cards'])
  })

  describe('컬렉션 완성 보상으로 연결된 JAM! 배지는 발급 조건이 없어도 예약된다 (사용자 결정 2026-10-04)', () => {
    it('연결이 없는 같은 배지는 지금처럼 형식 오류다', async () => {
      const { db, run } = setup([rewardBadge()])
      const result = ok(await run([ID.badge]))

      expect(result.body.scheduled).toEqual([])
      expect(result.body.failed).toHaveLength(1)
      expect(result.body.failed[0].reason).toMatch(/^배지 형식이 맞지 않아요: badge\.condition_json: 발급 조건이 없는 배지예요\./)
      expect(db.tables.badges.filter((row) => row.name === '가을 컬렉터')).toEqual([])
    })

    it('가리키던 컬렉션이 반려되면 연결이 없어져 배지는 형식 오류로 실패한다(컬렉션은 만들지 않는다)', async () => {
      const { db, run } = setup([bookWithReward({ status: 'rejected' }), rewardBadge()])
      const result = ok(await run([ID.badge]))

      expect(result.body.scheduled).toEqual([])
      expect(result.body.failed[0].reason).toMatch(/발급 조건이 없는 배지예요/)
      expect(created(db)).toEqual([])
    })

    it('같은 그룹의 컬렉션이 이번 실행에서 막혀 예약할 항목이 아니면(기다림) 연결 계획에 없어 배지도 실행되지 않는다', async () => {
      const { db, run } = setup([bookWithReward({ status: 'reviewing' }), rewardBadge()])
      const failure = bad(await run([ID.badge]))

      expect(failure.status).toBe(409)
      expect(nonSelect(db)).toEqual([])
    })

    it('미션이 가리키는 발급 조건 없는 배지는 여전히 형식 오류다(예외는 컬렉션 보상 칸뿐이다)', async () => {
      const { run } = setup([
        { id: ID.mission, key: 'mission', kind: 'mission', links: ['badge'], original: { copy: { title: '주말 러닝', description: '30km' } }, resource: { mission_type: 'distance', condition_json: { distance_km: 30 } } },
        rewardBadge(),
      ])
      const result = ok(await run([ID.mission, ID.badge]))

      expect(result.body.scheduled).toEqual([])
      expect(result.body.failed.find((entry) => entry.id === ID.badge)?.reason).toMatch(/발급 조건이 없는 배지예요/)
    })
  })

  it('컬렉션이 연결된 보상 배지보다 먼저 공개되면 실행되지 않는다: 컬렉션은 못 하는 항목, 배지는 연결된 항목을 예약할 수 없다', async () => {
    const { db, run } = setup([bookWithReward({ startsAt: '2026-10-09T00:00:00.000Z' }), rewardBadge()])
    const failure = bad(await run([BOOK_ITEM, ID.badge]))

    expect(failure.status).toBe(409)
    expect(failure.extra?.skipped).toEqual([
      { id: BOOK_ITEM, reason: PRECHECK_MESSAGES.beforeLinkedBadge },
      { id: ID.badge, reason: PRECHECK_MESSAGES.groupBlocked },
    ])
    expect(nonSelect(db)).toEqual([])
  })

  it('카드가 연결된 컬렉션보다 먼저 공개되면 실행되지 않는다: 카드는 못 하는 항목, 컬렉션은 연결된 항목을 예약할 수 없다', async () => {
    const { db, run } = setup([card({ startsAt: '2026-10-09T00:00:00.000Z' }), book()])
    const failure = bad(await run([ID.card, BOOK_ITEM]))

    expect(failure.status).toBe(409)
    expect(failure.extra?.skipped).toEqual([
      { id: ID.card, reason: PRECHECK_MESSAGES.beforeLinkedCollection },
      { id: BOOK_ITEM, reason: PRECHECK_MESSAGES.groupBlocked },
    ])
    expect(nonSelect(db)).toEqual([])
  })

  it('이미 예약된 컬렉션을 가리키는 카드는 그 컬렉션의 ID를 created_resource에서 읽어 채운다. 컬렉션은 건드리지 않는다', async () => {
    const existing = uid(60)
    const { db, run } = setup([card(), book({ status: 'scheduled', createdResource: { item_book_id: existing } })])
    const result = ok(await run([ID.card]))

    expect(result.body.scheduled).toEqual([ID.card])
    expect(db.tables.today_cards[0].item_book_id).toBe(existing)
    expect(inserted(db, 'item_books')).toEqual([])
  })

  it('컬렉션 insert가 실패하면 그룹 전체가 실패하고 먼저 만든 보상 배지도 되돌려진다. 컬렉션 사유가 원인이다', async () => {
    const { db, run } = setup([card(), bookWithReward(), rewardBadge()])
    db.failIf = (call) => call.table === 'item_books' && call.op === 'insert'
    const result = ok(await run([ID.card, BOOK_ITEM, ID.badge]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.find((entry) => entry.id === BOOK_ITEM)?.reason).toBe('컬렉션을 만들지 못했어요')
    expect(result.body.failed.filter((entry) => entry.reason === GROUP_FAILED)).toHaveLength(2)
    expect(db.tables.badges.filter((row) => row.name === '가을 컬렉터')).toEqual([])
    expect(created(db)).toEqual([])
    expect(db.tables.today_cards).toEqual([])
    for (const id of [ID.card, BOOK_ITEM, ID.badge]) expect(statusOf(db, id)).toBe('failed')
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('카드 insert가 실패하면 먼저 만든 컬렉션·보상 배지가 역순(컬렉션 먼저)으로 되돌려진다', async () => {
    const { db, run } = setup([card(), bookWithReward(), rewardBadge()])
    db.failIf = (call) => call.table === 'today_cards' && call.op === 'insert'
    const result = ok(await run([ID.card, BOOK_ITEM, ID.badge]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe('카드를 만들지 못했어요')
    expect(result.body.failed.filter((entry) => entry.reason === GROUP_FAILED)).toHaveLength(2)
    expect(created(db)).toEqual([])
    expect(db.tables.badges.filter((row) => row.name === '가을 컬렉터')).toEqual([])
    expect(db.tables.today_cards).toEqual([])
    // 컬렉션이 배지를 가리키는 동안은 배지가 지워지지 않으므로 컬렉션을 먼저 지운다
    expect(order(db).lastIndexOf('item_books:delete')).toBeLessThan(order(db).lastIndexOf('badges:delete'))
  })

  it('예약됨으로 옮기지 못하면 만든 컬렉션을 참조 확인 뒤 지운다', async () => {
    const { db, run } = setup([book()])
    db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'update' && (call.payload as Row).status === 'scheduled'
    const result = ok(await run([BOOK_ITEM]))

    expect(result.body.failed).toEqual([{ id: BOOK_ITEM, reason: '예약 등록을 마무리하지 못했어요' }])
    expect(created(db)).toEqual([])
    const names = order(db)
    expect(names.indexOf('user_item_book_slots:select')).toBeLessThan(names.lastIndexOf('item_books:delete'))
  })

  it('같은 이름의 기존 컬렉션이 있으면 고정 사유로 실패한다. 기존 컬렉션 ID는 응답·기록·슬랙에 없다', async () => {
    const { db, run } = setup([book()])
    db.tables.item_books.push({ id: EXISTING_BOOK, name: '가을 컬렉션' })
    const result = ok(await run([BOOK_ITEM]))

    expect(result.body.failed).toEqual([{ id: BOOK_ITEM, reason: '같은 이름의 컬렉션이 이미 있어요' }])
    expect(db.tables.item_books).toHaveLength(1) // 기존 컬렉션 하나뿐이다
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(EXISTING_BOOK)
    expect(logged()).toContain(EXISTING_BOOK)
  })

  it('트라이브가 없으면 고정 사유로 실패한다. 트라이브 ID는 어디에도 없다', async () => {
    const { db, run } = setup([book({ original: { tribe_id: uid(70), copy: { name: '가을 컬렉션', description: '설명' } } })])
    const result = ok(await run([BOOK_ITEM]))

    expect(result.body.failed).toEqual([{ id: BOOK_ITEM, reason: '트라이브를 찾을 수 없어요' }])
    expect(created(db)).toEqual([])
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(uid(70))
  })

  it('직접 적은 보상 배지가 없거나 활동 배지가 아니면 고정 사유로 실패한다', async () => {
    const missing = setup([book({ resource: { reward_badge_id: uid(71) } })])
    expect(ok(await missing.run([BOOK_ITEM])).body.failed).toEqual([{ id: BOOK_ITEM, reason: '보상으로 정한 배지가 없거나 삭제됐어요' }])

    const wrongKind = setup([book({ resource: { reward_badge_id: ITEM_BADGE } })])
    const result = ok(await wrongKind.run([BOOK_ITEM]))
    expect(result.body.failed).toEqual([{ id: BOOK_ITEM, reason: '완성 보상 배지는 활동 배지여야 해요' }])
    for (const output of await outputsOf(wrongKind.db, result)) expect(output).not.toContain(ITEM_BADGE)
    expect(created(wrongKind.db)).toEqual([])
  })

  it('등록 전 검사에서 DB를 읽지 못하면 고정 사유로 실패하고 DB 오류 원문은 로그에만 남는다', async () => {
    const { db, run } = setup([book()])
    db.failIf = (call) => call.table === 'item_books' && call.op === 'select'
    const result = ok(await run([BOOK_ITEM]))

    expect(result.body.failed).toEqual([{ id: BOOK_ITEM, reason: '등록 전 확인 중 DB를 읽지 못했어요' }])
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('형식 오류는 변환 오류의 첫 문장으로 실패하고 만든 행이 없다: 설명이 없으면 「컬렉션 형식이 맞지 않아요: collection.description: …」', async () => {
    const { db, run } = setup([book({ original: { copy: { name: '가을 컬렉션' } } })])
    const result = ok(await run([BOOK_ITEM]))

    expect(result.body.failed).toEqual([{ id: BOOK_ITEM, reason: '컬렉션 형식이 맞지 않아요: collection.description: 필수 항목이 없어요.' }])
    expect(created(db)).toEqual([])
    expect(statusOf(db, BOOK_ITEM)).toBe('failed')
  })

  it('보상 포인트 형식·종료 시각 순서도 형식 오류다', async () => {
    const points = setup([book({ resource: { reward_points: -5 } })])
    expect(ok(await points.run([BOOK_ITEM])).body.failed[0].reason).toMatch(/^컬렉션 형식이 맞지 않아요: collection\.reward_points: 0 이상의 정수여야 해요/)
    const period = setup([book({ endsAt: '2026-10-09T00:00:00.000Z' })])
    expect(ok(await period.run([BOOK_ITEM])).body.failed[0].reason).toMatch(/^컬렉션 형식이 맞지 않아요: collection\.valid_until: 종료 시각은 공개 시각보다 늦어야 해요/)
  })

  it('insert가 실패하면 고정 사유로 실패하고 같은 ID로 정리 delete를 한 번 시도한다. 원문과 컬렉션 ID는 어디에도 없다', async () => {
    const { db, run } = setup([book()])
    db.failIf = (call) => call.table === 'item_books' && call.op === 'insert'
    const result = ok(await run([BOOK_ITEM]))

    expect(result.body.failed).toEqual([{ id: BOOK_ITEM, reason: '컬렉션을 만들지 못했어요' }])
    expect(created(db)).toEqual([])
    expect(statusOf(db, BOOK_ITEM)).toBe('failed')
    const plannedId = (db.item(BOOK_ITEM).created_resource as { item_book_id: string }).item_book_id
    expect(writes(db, 'item_books', 'delete')).toHaveLength(1)
    expect(writes(db, 'item_books', 'delete')[0].filters).toEqual([['id', plannedId]])
    for (const output of await outputsOf(db, result)) {
      expect(output).not.toContain(DB_SECRET)
      expect(output).not.toContain(plannedId)
    }
    expect(logged()).toContain(DB_SECRET)
  })

  it('시험 묶음은 검사까지 하고 item_books에 쓰지 않는다. created_resource는 { sample: true }다', async () => {
    const { db, run } = setup([card(), bookWithReward(), rewardBadge()], { is_sample: true })
    const result = ok(await run([ID.card, BOOK_ITEM, ID.badge]))

    expect(result.body.scheduled).toHaveLength(3)
    expect(db.tables.item_books).toEqual([])
    expect(db.calls.filter((call) => call.table === 'item_books' && call.op !== 'select')).toEqual([])
    expect(db.calls.some((call) => call.table === 'item_books' && call.op === 'select')).toBe(true) // 이름 중복 검사를 했다
    expect(db.item(BOOK_ITEM).created_resource).toEqual({ sample: true })
  })

  it('같은 묶음을 두 번 실행해도 컬렉션은 한 번만 만든다', async () => {
    const { db, run } = setup([book()])
    ok(await run([BOOK_ITEM]))
    const second = bad(await run([BOOK_ITEM]))

    expect(second.status).toBe(409)
    expect(inserted(db, 'item_books')).toHaveLength(1)
  })

  it('요약창의 사전 점검(dryRun)이 컬렉션을 예약할 항목으로 센다. 쓰기는 없다', async () => {
    const { db } = setup([book()])
    const result = await dryRunExecution(db.service, B, { now: () => NOW, handlers: EXECUTE_HANDLERS })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('성공이어야 해요')
    expect(result.body.ready).toEqual([BOOK_ITEM])
    expect(result.body.blocked).toEqual([])
    expect(nonSelect(db)).toEqual([])
  })
})

// ── 실제 레지스트리(JAM! 배지 핸들러, 티켓 20261004_1756) ────────────────────────────────────────

describe('실제 레지스트리: JAM! 배지 핸들러 (티켓 20261004_1756)', () => {
  const ITEM_BADGE = uid(30)
  const ACTIVITY_BADGE = uid(31)
  const OTHER_RECIPE = uid(32)
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  const GROUP_FAILED = '연결된 항목을 만들지 못해 함께 실패했어요'
  const SLOTS = [
    { badge_type: 'item', allowed_badge_ids: [ITEM_BADGE] },
    { badge_type: 'activity', allowed_badge_ids: [ACTIVITY_BADGE] },
  ]

  /** 검사를 통과하는 JAM! 배지(믹스 성공 1회, 등급형). 공개 시각은 행의 `LATER`(10/10 09:00 KST)다. */
  const badge = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.badge,
    key: 'badge',
    kind: 'jam_badge',
    original: { copy: { name: '첫 믹스', description: '믹스에 처음 성공했어요.' } },
    resource: { condition_json: { combine_success_count: 1 }, rarity: 'common', point_reward: 10 },
    ...over,
  })
  /** 배지를 보상으로 가리키는 미션. `reward_badge_ids`는 연결로 채운다. */
  const mission = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.mission,
    key: 'mission',
    kind: 'mission',
    links: ['badge'],
    original: { copy: { title: '주말 러닝', description: '주말에 30km를 달려요.' } },
    resource: { mission_type: 'distance', condition_json: { activity_type: 'running', distance_km: 30 } },
    ...over,
  })
  /** 배지를 가리키는 카드. `badge_spotlight`는 `badge_ids`가 있어야 하고 연결로 채운다. */
  const card = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.card,
    key: 'card',
    kind: 'home_feed_card',
    links: ['badge'],
    original: { shape: 'hero', exposure_tags: ['all'], copy: { title: '첫 믹스 배지 카드' } },
    resource: { template_type: 'badge_spotlight' },
    ...over,
  })
  /** 「가장 먼저 성공」 배지가 가리키는 레시피. 공개 시각은 행의 `LATER`다. */
  const recipe = (over: Partial<ItemSpec> = {}): ItemSpec => ({
    id: ID.recipe,
    key: 'recipe',
    kind: 'recipe',
    original: { copy: { name: '가을 믹스' } },
    resource: { slots: SLOTS, reward_points: 10 },
    ...over,
  })
  /** 레시피 슬롯 후보 두 개가 있는 DB를 만든다. */
  const setup = (specs: ItemSpec[], bundle: Row = {}) => {
    const real = setupReal(specs, bundle)
    real.db.tables.badges = [
      { id: ITEM_BADGE, name: '아이템 배지', type: 'item', deleted_at: null, item_book_id: null },
      { id: ACTIVITY_BADGE, name: '활동 배지', type: 'activity', deleted_at: null, item_book_id: null },
    ]
    return real
  }
  const created = (db: FakeDb) => db.tables.badges.filter((row) => row.name === '첫 믹스')
  const inserted = (db: FakeDb, table: string) => db.calls.filter((call) => call.table === table && call.op === 'insert')
  const order = (db: FakeDb) => db.calls.map((call) => `${call.table}:${call.op}`)

  it('승인된 배지 하나를 실행하면 공개 전 badges 행이 생기고 created_resource.badge_id가 만들기 전에 적힌다', async () => {
    const { db, run } = setup([badge()])
    const result = ok(await run([ID.badge]))

    expect(result.body.scheduled).toEqual([ID.badge])
    expect(result.body.failed).toEqual([])
    expect(created(db)).toHaveLength(1)
    const row = created(db)[0]
    const resource = db.item(ID.badge).created_resource as { badge_id: string }
    expect(resource.badge_id).toMatch(UUID_PATTERN)
    expect(row.id).toBe(resource.badge_id)
    // 공개 시각 = 항목 공개 시각, 종은 activity·JAM!, 종목은 비운다
    expect(row).toMatchObject({
      name: '첫 믹스',
      description: '믹스에 처음 성공했어요.',
      type: 'activity',
      admin_category: 'jam',
      activity_types: [],
      rarity: 'common',
      point_reward: 10,
      condition_json: { combine_success_count: 1 },
      valid_from: '2026-10-10T00:00:00.000Z',
      valid_until: null,
      image_url: null,
    })
    expect(statusOf(db, ID.badge)).toBe('scheduled')
    expect(db.decisions('execute').map((entry) => entry.item_id)).toEqual([ID.badge])
    // 만들기 전에 created_resource를 먼저 적는다(정한 ID와 돌려준 ID가 같아 한 번만 적는다)
    const names = order(db)
    const written = db.itemWrites().filter((call) => call.op === 'update' && JSON.stringify(call.payload).includes('"badge_id"'))
    expect(written).toHaveLength(1)
    expect(db.calls.indexOf(written[0])).toBeLessThan(names.indexOf('badges:insert'))
  })

  it('종료 시각이 있으면 valid_until로 들어간다', async () => {
    const { db, run } = setup([badge({ endsAt: '2026-10-17T00:00:00.000Z' })])
    ok(await run([ID.badge]))
    expect(created(db)[0]).toMatchObject({ valid_from: '2026-10-10T00:00:00.000Z', valid_until: '2026-10-17T00:00:00.000Z' })
  })

  it('미션 → 배지: 배지가 먼저 만들어지고 미션의 보상 배지 칸이 그 ID로 채워진다', async () => {
    const { db, run } = setup([mission(), badge()])
    const result = ok(await run([ID.mission, ID.badge]))

    expect([...result.body.scheduled].sort()).toEqual([ID.mission, ID.badge].sort())
    expect(result.body.failed).toEqual([])
    const badgeRow = created(db)[0]
    expect(db.tables.missions).toHaveLength(1)
    expect(db.tables.missions[0].reward_badge_ids).toEqual([badgeRow.id])
    expect(db.item(ID.mission).created_resource).toEqual({ mission_id: db.tables.missions[0].id })
    expect(db.item(ID.badge).created_resource).toEqual({ badge_id: badgeRow.id })
    expect(inserted(db, 'badges').length + inserted(db, 'missions').length).toBe(2)
    expect(order(db).indexOf('badges:insert')).toBeLessThan(order(db).indexOf('missions:insert'))
  })

  it('카드 → 배지: 카드의 배지 칸(badge_ids)이 만든 배지 ID로 채워진다', async () => {
    const { db, run } = setup([card(), badge()])
    const result = ok(await run([ID.card, ID.badge]))

    expect([...result.body.scheduled].sort()).toEqual([ID.card, ID.badge].sort())
    expect(db.tables.today_cards).toHaveLength(1)
    expect(db.tables.today_cards[0].badge_ids).toEqual([created(db)[0].id])
    expect(order(db).indexOf('badges:insert')).toBeLessThan(order(db).indexOf('today_cards:insert'))
  })

  it('카드·미션·배지가 한 그룹이면 배지 → 미션 → 카드 순으로 만들고 두 칸 모두 같은 배지 ID로 채운다', async () => {
    const { db, run } = setup([card(), mission(), badge()])
    const result = ok(await run([ID.card, ID.mission, ID.badge]))

    expect(result.body.scheduled).toHaveLength(3)
    const badgeId = created(db)[0].id
    expect(db.tables.missions[0].reward_badge_ids).toEqual([badgeId])
    expect(db.tables.today_cards[0].badge_ids).toEqual([badgeId])
    const inserts = db.calls.filter((call) => call.op === 'insert' && ['badges', 'missions', 'today_cards'].includes(call.table)).map((call) => call.table)
    expect(inserts).toEqual(['badges', 'missions', 'today_cards'])
  })

  it('배지 → 레시피: 레시피가 먼저 만들어지고 배지의 「가장 먼저 성공」 칸이 항목에 적은 값 대신 만든 레시피 ID로 덮인다', async () => {
    const { db, run } = setup([
      badge({
        links: ['recipe'],
        resource: { condition_json: { recipe_first_success: { recipe_id: OTHER_RECIPE } }, rarity: 'common', point_reward: 10 },
      }),
      recipe(),
    ])
    const result = ok(await run([ID.badge, ID.recipe]))

    expect([...result.body.scheduled].sort()).toEqual([ID.badge, ID.recipe].sort())
    expect(result.body.failed).toEqual([])
    expect(db.tables.combination_recipes).toHaveLength(1)
    const recipeId = db.tables.combination_recipes[0].id
    expect(created(db)[0].condition_json).toEqual({ recipe_first_success: { recipe_id: recipeId } })
    expect(JSON.stringify(created(db)[0])).not.toContain(OTHER_RECIPE)
    expect(db.item(ID.recipe).created_resource).toEqual({ recipe_id: recipeId })
    expect(order(db).indexOf('combination_recipes:insert')).toBeLessThan(order(db).indexOf('badges:insert'))
    // 연결로 채운 레시피는 아직 있지 않을 수 있어 DB의 레시피를 미리 읽어 견주지 않는다(배지 쪽 읽기)
    expect(db.calls.filter((call) => call.table === 'combination_recipes' && call.op === 'select' && call.filters.some(([column]) => column === 'id'))).toEqual([])
  })

  it('항목에 recipe_first_success가 없어도 레시피를 연결하면 칸이 만들어진다', async () => {
    const { db, run } = setup([badge({ links: ['recipe'], resource: { condition_json: { mission_reward: true }, rarity: 'common' } }), recipe()])
    ok(await run([ID.badge, ID.recipe]))
    expect(created(db)[0].condition_json).toEqual({ mission_reward: true, recipe_first_success: { recipe_id: db.tables.combination_recipes[0].id } })
  })

  it('레시피를 연결한 배지에 다른 사용량 지표가 이미 있으면(지표 둘) 형식 오류로 실패하고 레시피도 만들지 않는다', async () => {
    const { db, run } = setup([badge({ links: ['recipe'] }), recipe()]) // 기본 조건이 믹스 성공 횟수라 「가장 먼저 성공」과 겹친다
    const result = ok(await run([ID.badge, ID.recipe]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.find((entry) => entry.id === ID.badge)?.reason).toContain('서비스 사용량 지표는 한 배지에 하나만 쓸 수 있습니다')
    expect(db.tables.combination_recipes).toEqual([])
    expect(created(db)).toEqual([])
  })

  it('배지 insert가 실패하면 그룹 전체가 실패하고 먼저 만든 레시피도 되돌려진다. 배지 사유가 원인이다', async () => {
    const { db, run } = setup([badge({ links: ['recipe'], resource: { condition_json: { recipe_first_success: { recipe_id: OTHER_RECIPE } }, rarity: 'common' } }), recipe()])
    db.failIf = (call) => call.table === 'badges' && call.op === 'insert'
    const result = ok(await run([ID.badge, ID.recipe]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.find((entry) => entry.id === ID.badge)?.reason).toBe('배지를 만들지 못했어요')
    expect(result.body.failed.find((entry) => entry.id === ID.recipe)?.reason).toBe(GROUP_FAILED)
    expect(db.tables.combination_recipes).toEqual([])
    expect(db.tables.combination_recipe_slots).toEqual([])
    expect(created(db)).toEqual([])
    expect(statusOf(db, ID.badge)).toBe('failed')
    expect(statusOf(db, ID.recipe)).toBe('failed')
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('카드 insert가 실패하면 먼저 만든 배지·미션이 역순(미션 먼저)으로 되돌려진다', async () => {
    const { db, run } = setup([card(), mission(), badge()])
    db.failIf = (call) => call.table === 'today_cards' && call.op === 'insert'
    const result = ok(await run([ID.card, ID.mission, ID.badge]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.find((entry) => entry.id === ID.card)?.reason).toBe('카드를 만들지 못했어요')
    expect(result.body.failed.filter((entry) => entry.reason === GROUP_FAILED)).toHaveLength(2)
    expect(created(db)).toEqual([])
    expect(db.tables.missions).toEqual([])
    expect(db.tables.today_cards).toEqual([])
    // 미션이 배지를 가리키는 동안은 배지가 지워지지 않으므로 미션을 먼저 지운다
    expect(order(db).lastIndexOf('missions:delete')).toBeLessThan(order(db).lastIndexOf('badges:delete'))
  })

  it('예약됨으로 옮기지 못하면 만든 배지를 참조 확인 뒤 지운다', async () => {
    const { db, run } = setup([badge()])
    db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'update' && (call.payload as Row).status === 'scheduled'
    const result = ok(await run([ID.badge]))

    expect(result.body.failed).toEqual([{ id: ID.badge, reason: '예약 등록을 마무리하지 못했어요' }])
    expect(created(db)).toEqual([])
    const names = order(db)
    expect(names.indexOf('user_activity_badges:select')).toBeLessThan(names.lastIndexOf('badges:delete'))
  })

  it('이미 예약된 배지를 가리키는 미션은 그 배지의 ID를 created_resource에서 읽어 채운다. 배지는 건드리지 않는다', async () => {
    const existing = uid(40)
    const { db, run } = setup([mission(), badge({ status: 'scheduled', createdResource: { badge_id: existing } })])
    const result = ok(await run([ID.mission]))

    expect(result.body.scheduled).toEqual([ID.mission])
    expect(db.tables.missions[0].reward_badge_ids).toEqual([existing])
    expect(inserted(db, 'badges')).toEqual([])
  })

  it('미션·카드가 연결된 배지보다 먼저 공개되면 실행되지 않는다: 미션은 못 하는 항목, 배지는 연결된 항목을 예약할 수 없다', async () => {
    const { db, run } = setup([mission({ startsAt: '2026-10-09T00:00:00.000Z' }), badge()])
    const failure = bad(await run([ID.mission, ID.badge]))

    expect(failure.status).toBe(409)
    expect(failure.extra?.skipped).toEqual([
      { id: ID.mission, reason: PRECHECK_MESSAGES.beforeLinkedBadge },
      { id: ID.badge, reason: PRECHECK_MESSAGES.groupBlocked },
    ])
    expect(nonSelect(db)).toEqual([])
    expect(created(db)).toEqual([])
  })

  it('「가장 먼저 성공」 배지와 레시피의 공개 시각이 다르면 실행되지 않는다', async () => {
    const { db, run } = setup([badge({ links: ['recipe'], startsAt: '2026-10-11T00:00:00.000Z' }), recipe()])
    const failure = bad(await run([ID.badge, ID.recipe]))

    expect(failure.status).toBe(409)
    expect(failure.extra?.skipped).toEqual([
      { id: ID.badge, reason: PRECHECK_MESSAGES.firstSuccessStartsDiffer },
      { id: ID.recipe, reason: PRECHECK_MESSAGES.groupBlocked },
    ])
    expect(nonSelect(db)).toEqual([])
  })

  it('발급 조건이 없는 배지는 형식 오류로 실패한다. 만든 것은 없다', async () => {
    const { db, run } = setup([badge({ resource: { condition_json: { distance_km: 10 }, rarity: 'common' } })])
    const result = ok(await run([ID.badge]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed).toHaveLength(1)
    expect(result.body.failed[0].reason).toMatch(/^배지 형식이 맞지 않아요: badge\.condition_json: 발급 조건이 없는 배지예요\./)
    expect(created(db)).toEqual([])
  })

  it('희귀도와 레벨을 함께 적으면 형식 오류로 실패한다', async () => {
    const { db, run } = setup([badge({ resource: { condition_json: { combine_success_count: 1 }, rarity: 'common', level: 1 } })])
    const result = ok(await run([ID.badge]))

    expect(result.body.failed[0].reason).toMatch(/^배지 형식이 맞지 않아요: badge\.rarity: 등급형과 레벨형은 함께 지정할 수 없습니다\./)
    expect(created(db)).toEqual([])
  })

  it('같은 이름의 기존 배지가 있으면 고정 사유로 실패한다. 기존 배지 ID는 응답·기록·슬랙에 없다', async () => {
    const { db, run } = setup([badge()])
    const EXISTING = uid(41)
    db.tables.badges.push({ id: EXISTING, name: '첫 믹스', type: 'activity', deleted_at: null })
    const result = ok(await run([ID.badge]))

    expect(result.body.failed).toEqual([{ id: ID.badge, reason: '같은 이름의 배지가 이미 있어요' }])
    expect(created(db)).toHaveLength(1) // 기존 배지 하나뿐이다
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(EXISTING)
    expect(logged()).toContain(EXISTING)
  })

  it('연결 없이 직접 적은 레시피는 DB의 레시피와 공개 시각이 같아야 한다', async () => {
    const direct = (recipeFrom: string) => {
      const real = setup([badge({ resource: { condition_json: { recipe_first_success: { recipe_id: OTHER_RECIPE } }, rarity: 'common' } })])
      real.db.tables.combination_recipes = [{ id: OTHER_RECIPE, valid_from: recipeFrom }]
      return real
    }
    const same = direct('2026-10-10T00:00:00.000Z')
    expect(ok(await same.run([ID.badge])).body.scheduled).toEqual([ID.badge])

    const differs = direct('2026-10-11T00:00:00.000Z')
    const result = ok(await differs.run([ID.badge]))
    expect(result.body.failed).toEqual([{ id: ID.badge, reason: '가장 먼저 성공 배지는 레시피와 같은 시각에 공개돼야 해요' }])
    expect(created(differs.db)).toEqual([])
    for (const output of await outputsOf(differs.db, result)) expect(output).not.toContain(OTHER_RECIPE)
  })

  it('등록 전 검사에서 DB를 읽지 못하면 고정 사유로 실패하고 DB 오류 원문은 로그에만 남는다', async () => {
    const { db, run } = setup([badge()])
    db.failIf = (call) => call.table === 'badges' && call.op === 'select'
    const result = ok(await run([ID.badge]))

    expect(result.body.failed).toEqual([{ id: ID.badge, reason: '등록 전 확인 중 DB를 읽지 못했어요' }])
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('시험 묶음은 검사까지 하고 badges에 쓰지 않는다. created_resource는 { sample: true }다', async () => {
    const { db, run } = setup([mission(), badge()], { is_sample: true })
    const result = ok(await run([ID.mission, ID.badge]))

    expect([...result.body.scheduled].sort()).toEqual([ID.mission, ID.badge].sort())
    expect(created(db)).toEqual([])
    expect(inserted(db, 'badges')).toEqual([])
    expect(db.calls.some((call) => call.table === 'badges' && call.op === 'select')).toBe(true) // 이름 중복 검사를 했다
    expect(db.item(ID.badge).created_resource).toEqual({ sample: true })
  })

  it('실패 응답·결정 기록·슬랙에는 DB 오류 원문과 배지 ID가 없다', async () => {
    const { db, run } = setup([badge()])
    db.failIf = (call) => call.table === 'badges' && call.op === 'insert'
    const result = ok(await run([ID.badge]))

    expect(result.body.failed).toEqual([{ id: ID.badge, reason: '배지를 만들지 못했어요' }])
    const plannedId = (db.item(ID.badge).created_resource as { badge_id: string }).badge_id
    for (const output of await outputsOf(db, result)) {
      expect(output).not.toContain(DB_SECRET)
      expect(output).not.toContain(plannedId)
    }
    expect(logged()).toContain(DB_SECRET)
  })
})


// ── 승인하고 예약 (티켓 20261026_2022) ───────────────────────────────────────────────────────────

describe('승인하고 예약 includeReviewing', () => {
  const reviewingChain = (): ItemSpec[] => chain().map((spec) => ({ ...spec, status: 'reviewing' }))
  const approveRun = (db: FakeDb, handlers: ExecuteHandlerRegistry, itemIds: unknown) =>
    executeBundle(db.service, { bundleId: B, itemIds, actor: ACTOR, includeReviewing: true }, { handlers, now: () => NOW })

  it('사전 점검: 검토중 항목을 예약할 항목에 넣고 approving에 싣되 아무것도 쓰지 않는다. 모드가 꺼져 있으면 넣지 않는다', async () => {
    const { db, handlers } = setup([...reviewingChain(), { id: ID.solo, key: 'solo', kind: 'recipe', status: 'rejected' }])
    const on = await dryRunExecution(db.service, B, { handlers, now: () => NOW, includeReviewing: true })
    expect(on.ok).toBe(true)
    if (!on.ok) return
    expect([...on.body.ready].sort()).toEqual([ID.badge, ID.card, ID.mission].sort())
    expect([...on.body.approving].sort()).toEqual([ID.badge, ID.card, ID.mission].sort())
    expect(nonSelect(db)).toEqual([])
    for (const id of [ID.card, ID.mission, ID.badge]) expect(statusOf(db, id)).toBe('reviewing')

    const off = await dryRunExecution(db.service, B, { handlers, now: () => NOW })
    expect(off.ok && off.body.ready).toEqual([])
    expect(off.ok && off.body.approving).toEqual([])
  })

  it('사전 점검: 패턴 제안은 승인 대상이 아니다', async () => {
    const { db, handlers } = setup([{ id: ID.other, key: 'p', kind: 'pattern_proposal', status: 'reviewing' }, ...reviewingChain()])
    const on = await dryRunExecution(db.service, B, { handlers, now: () => NOW, includeReviewing: true })
    expect(on.ok && on.body.approving).not.toContain(ID.other)
    expect(on.ok && on.body.ready).not.toContain(ID.other)
  })

  it('배지 미리 세기: 모드가 켜져 있으면 검토중 JAM! 배지도 센다. 쓰기는 없다', async () => {
    const { db, handlers } = setup([{ id: ID.badge, key: 'badge', kind: 'jam_badge', status: 'reviewing' }])
    const off = await badgePreviewExecution(db.service, B, { handlers, now: () => NOW })
    expect(off.ok && off.body.badgePreview.lines).toEqual([])
    const on = await badgePreviewExecution(db.service, B, { handlers, now: () => NOW, includeReviewing: true })
    expect(on.ok && on.body.badgePreview.lines.map((line) => line.itemId)).toEqual([ID.badge])
    expect(nonSelect(db)).toEqual([])
  })

  it('① 검토중 → 승인됨 → 예약됨: 연결 그룹이 함께 승인되고 생성되며 승인 기록 3건·execute 기록 3건이 서로 다른 batch_id로 남는다', async () => {
    const { db, rec, handlers } = setup(reviewingChain())
    const result = ok(await approveRun(db, handlers, [ID.card, ID.mission, ID.badge]))

    expect(result.body.scheduled).toEqual([ID.badge, ID.mission, ID.card])
    expect([...(result.body.approved ?? [])].sort()).toEqual([ID.badge, ID.card, ID.mission].sort())
    for (const id of [ID.card, ID.mission, ID.badge]) expect(statusOf(db, id)).toBe('scheduled')
    expect(rec.events.filter((event) => event.startsWith('create:'))).toEqual(['create:badge', 'create:mission', 'create:card'])

    const approves = db.decisions('approve')
    const executes = db.decisions('execute')
    expect(approves).toHaveLength(3)
    expect(executes).toHaveLength(3)
    expect(approves.every((row) => row.actor === ACTOR && row.batch_id === result.approval?.batchId)).toBe(true)
    expect(result.approval?.batchId).not.toBe(result.batchId)
    expect(executes.every((row) => row.batch_id === result.batchId)).toBe(true)
    expect(result.approval?.decisionIds).toHaveLength(3)
    expect(result.approval?.slack).toEqual({ action: 'bulk_approve', isSample: false, approved: 3, excluded: 0, skipped: 0 })
  })

  it('② 연결 그룹 중 하나의 생성이 실패하면 만든 자원을 되돌리고 둘 다 failed다. 승인 기록은 남는다', async () => {
    const { db, rec, handlers } = setup(
      [
        { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'], status: 'reviewing' },
        { id: ID.mission, key: 'mission', kind: 'mission', status: 'reviewing' },
      ],
      { card: { failCreate: { reason: '카드를 만들지 못했어요' } } }
    )
    const result = ok(await approveRun(db, handlers, [ID.card, ID.mission]))

    expect(result.body.scheduled).toEqual([])
    expect(result.body.failed.map((entry) => entry.id).sort()).toEqual([ID.card, ID.mission].sort())
    expect(statusOf(db, ID.card)).toBe('failed')
    expect(statusOf(db, ID.mission)).toBe('failed')
    expect(rec.events).toContain('undo:mission')
    expect(db.decisions('approve')).toHaveLength(2)
    expect(db.decisions('fail')).toHaveLength(2)
    expect(db.decisions('execute')).toHaveLength(0)
  })

  it('③ 승인 직전에 다른 곳에서 처리한 항목은 건너뛴다. 같은 연결 그룹은 함께 건너뛰고 다른 그룹은 계속한다', async () => {
    const { db, handlers } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'], status: 'reviewing' },
      { id: ID.mission, key: 'mission', kind: 'mission', status: 'reviewing' },
      { id: ID.solo, key: 'solo', kind: 'recipe', status: 'reviewing' },
    ])
    let flipped = false
    db.beforeRun = (call: FakeCall) => {
      if (!flipped && call.op === 'update' && (call.payload as Row).status === 'approved') {
        flipped = true
        db.item(ID.mission).status = 'rejected'
      }
    }
    const result = ok(await approveRun(db, handlers, [ID.card, ID.mission, ID.solo]))

    expect(result.body.scheduled).toEqual([ID.solo])
    expect(result.body.skipped.map((entry) => entry.id).sort()).toEqual([ID.card, ID.mission].sort())
    expect(statusOf(db, ID.mission)).toBe('rejected') // 다른 사람의 결정은 건드리지 않는다
    expect(statusOf(db, ID.card)).toBe('approved') // 우리가 승인한 항목은 「승인됨」으로 남는다(다음 예약 등록이 이어 간다)
    expect(result.approval?.slack).toMatchObject({ approved: 2, skipped: 1 })
  })

  it('④ 시험 묶음은 승인하지 않는다: 검토중 항목은 그대로이고 승인 기록이 없다. 이미 승인된 항목은 지금처럼 검증만 한다', async () => {
    const { db, handlers } = setup(
      [
        { id: ID.solo, key: 'solo', kind: 'recipe', status: 'reviewing' },
        { id: ID.other, key: 'other', kind: 'recipe', status: 'approved' },
      ],
      {},
      { is_sample: true }
    )
    const dry = await dryRunExecution(db.service, B, { handlers, now: () => NOW, includeReviewing: true })
    expect(dry.ok && dry.body.approving).toEqual([])
    expect(dry.ok && dry.body.ready).toEqual([ID.other])

    const result = ok(await approveRun(db, handlers, [ID.solo, ID.other]))
    expect(result.body.scheduled).toEqual([ID.other])
    expect(result.body.skipped.map((entry) => entry.id)).toEqual([ID.solo])
    expect(result.approval).toBeUndefined()
    expect(statusOf(db, ID.solo)).toBe('reviewing')
    expect(db.decisions('approve')).toHaveLength(0)
    expect(db.item(ID.other).created_resource).toEqual({ sample: true })
  })

  it('⑤ 모드 없이 호출하면 검토중 항목은 건드리지 않고 승인 기록도 없다', async () => {
    const { db, run } = setup([
      { id: ID.solo, key: 'solo', kind: 'recipe', status: 'reviewing' },
      { id: ID.other, key: 'other', kind: 'recipe', status: 'approved' },
    ])
    const result = ok(await run([ID.solo, ID.other]))
    expect(result.body.scheduled).toEqual([ID.other])
    expect(result.body.skipped.map((entry) => entry.id)).toEqual([ID.solo])
    expect(result.body.approved).toBeUndefined()
    expect(result.approval).toBeUndefined()
    expect(statusOf(db, ID.solo)).toBe('reviewing')
    expect(db.decisions('approve')).toHaveLength(0)
  })

  it('승인 단계에서 DB 오류가 나면 원문 없이 500이고 핸들러를 부르지 않는다', async () => {
    const { db, rec, handlers } = setup(reviewingChain())
    db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'update'
    const failure = bad(await approveRun(db, handlers, [ID.card, ID.mission, ID.badge]))
    expect(failure.status).toBe(500)
    expect(JSON.stringify(failure)).not.toContain(DB_SECRET)
    expect(rec.events).toEqual([])
  })

  it('승인 기록을 남기지 못하면 승인을 되돌리고 500이다(항목은 검토중으로 돌아간다)', async () => {
    const { db, rec, handlers } = setup(reviewingChain())
    db.failIf = (call) => call.table === 'ops_decisions' && call.op === 'insert'
    const failure = bad(await approveRun(db, handlers, [ID.card, ID.mission, ID.badge]))
    expect(failure.status).toBe(500)
    for (const id of [ID.card, ID.mission, ID.badge]) expect(statusOf(db, id)).toBe('reviewing')
    expect(rec.events).toEqual([])
  })

  it('실패로 닫을 검토중 항목도 승인된 뒤 닫힌다(점검에 보인 대로)', async () => {
    const { db, handlers } = setup([
      { id: ID.card, key: 'card', kind: 'home_feed_card', links: ['mission'], status: 'reviewing' },
      { id: ID.mission, key: 'mission', kind: 'mission', status: 'rejected' },
    ])
    const dry = await dryRunExecution(db.service, B, { handlers, now: () => NOW, includeReviewing: true })
    expect(dry.ok && dry.body.failClose.map((entry) => entry.id)).toEqual([ID.card])
    expect(dry.ok && dry.body.approving).toEqual([ID.card])

    const result = ok(await approveRun(db, handlers, [ID.card]))
    expect(result.body.failed.map((entry) => entry.id)).toEqual([ID.card])
    expect(statusOf(db, ID.card)).toBe('failed')
    expect(db.decisions('approve')).toHaveLength(1)
  })
})
