/**
 * 예약 등록 실행 (티켓 20261002_1123, 상위 20260930_1500 ③-b). 실행 흐름은 가짜 핸들러 레지스트리와 메모리 DB(`fakeDb.ts`)로 지킨다.
 * 가정 1~6은 티켓 「착수 전에 정한 것」 번호다. 맨 끝 「실제 레지스트리」는 ④-a(티켓 20261002_1255)가 붙인 홈피드 카드 핸들러까지 통합해 본다.
 *
 * - 사전 점검 요청: 쓰기 없음
 * - 선점: 조건부 update, 두 번째 실행·동시 실행 409, 그룹 일부만 차지했을 때(가정 3)
 * - 검증 단계 실패: 만든 것 없이 그룹 전체 실패, 다른 그룹은 계속
 * - 생성 중 실패: 이번에 만든 자원만 역순 undo, undo 실패, 던지는 핸들러
 * - 시험 묶음: 검증까지 하고 만들지 않는다
 * - 결정 기록(execute·fail, 같은 batch_id)과 가정 1(결정 기록 insert 실패)·가정 4·6(실패로 닫을 항목)·가정 5(원문 비노출)
 * - ④-a 가정 6: 실행할 그룹이 없어도 실패로 닫을 항목은 닫는다(200). 닫을 것도 예약할 것도 없을 때만 409
 * - 슬랙 두 갈래와 slack_result 나눠 채우기
 * - 실제 레지스트리: 승인된 카드 → today_cards 행, 시험 묶음은 쓰지 않음, 등록 전 검사 실패는 고정 사유
 */
import { vi, describe, it, expect, beforeEach, type MockInstance } from 'vitest'

const h = vi.hoisted(() => ({ postOpsSlack: vi.fn() }))

vi.mock('@/lib/admin/opsInbox/slack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/slack')>()
  return { ...actual, postOpsSlack: h.postOpsSlack }
})

import {
  RESOURCE_KEY_BY_KIND,
  type ExecutableKind,
  type ExecuteFailure,
  type ExecuteHandler,
  type ExecuteHandlerRegistry,
  type ExecuteLinkedIds,
} from '../handlers'
import { PRECHECK_MESSAGES, precheckBundle } from '../precheck'
import { EXECUTE_HANDLERS } from '../registry'
import { dryRunExecution, executeBundle, notifyExecution, type ExecuteSuccess, type RunFailure } from '../run'
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
  /** 항목 키 → 만든 자원 ID. */
  created: Record<string, string>
}

function makeHandler(kind: ExecutableKind, rec: Recorder, options: Record<string, HandlerOptions>): ExecuteHandler {
  const idFirst = kind !== 'recipe' && kind !== 'drop_schedule'
  const optionsOf = (key: string | null) => options[key ?? ''] ?? {}
  const keyOfResource = (resourceId: string) => Object.entries(rec.created).find(([, id]) => id === resourceId)?.[0] ?? resourceId
  return {
    kind,
    resourceKey: RESOURCE_KEY_BY_KIND[kind],
    idFirst,
    prepare: (item, { id, linkedIds }) => {
      const key = item.item_key as string
      rec.events.push(`prepare:${key}`)
      ;(rec.linked[key] ??= []).push(linkedIds)
      const failure = optionsOf(key).failPrepare
      if (failure) return { ok: false, failure }
      return { ok: true, value: { item, id, payload: {}, linkFields: [], linkedIds, warnings: [] } }
    },
    check: async (_client, prepared) => {
      const key = prepared.item.item_key as string
      rec.events.push(`check:${key}`)
      if (optionsOf(key).throwOn === 'check') throw new Error(DB_SECRET)
      return optionsOf(key).failCheck ?? null
    },
    create: async (_service, prepared) => {
      const key = prepared.item.item_key as string
      rec.events.push(`create:${key}`)
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
  const rec: Recorder = { events: [], linked: {}, created: {} }
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

let errorSpy: MockInstance<typeof console.error>
beforeEach(() => {
  h.postOpsSlack.mockReset()
  h.postOpsSlack.mockResolvedValue({ ok: true })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
const logged = () => errorSpy.mock.calls.map((args) => args.join(' ')).join('\n')

// ── 사전 점검 요청 ───────────────────────────────────────────────────────────────────────────────

describe('사전 점검 요청 dryRunExecution', () => {
  it('사전 점검 결과를 돌려주고 아무것도 쓰지 않는다', async () => {
    const { db, handlers } = setup([...chain(), { id: ID.solo, key: 'solo', kind: 'recipe', startsAt: null }])
    const outcome = await dryRunExecution(db.service, B, { handlers, now: () => NOW })
    const expected = precheckBundle(db.tables.ops_bundle_items as never, { now: NOW, handlers })
    expect(outcome).toEqual({ ok: true, body: { ok: true, dryRun: true, ...expected } })
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
    const { rec, run } = setup(chain(), {
      card: { failCreate: { reason: '카드를 만들지 못했어요' } },
      mission: { failUndo: { reason: '미션을 지우지 못했어요', detail: 'undo detail' } },
    })
    const result = ok(await run([ID.card, ID.mission, ID.badge]))
    expect(rec.events.filter((event) => event.startsWith('undo:'))).toEqual(['undo:mission', 'undo:badge'])
    expect(result.body.failed.find((entry) => entry.id === ID.mission)?.reason).toBe('연결된 항목을 만들지 못해 함께 실패했어요. 되돌리지 못한 자원이 있어요')
    expect(result.body.failed.find((entry) => entry.id === ID.badge)?.reason).toBe('연결된 항목을 만들지 못해 함께 실패했어요')
    expect(JSON.stringify(result)).not.toContain('undo detail')
    expect(logged()).toContain('undo detail')
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

// ── 실제 레지스트리(홈피드 카드 핸들러) ──────────────────────────────────────────────────────────

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

  function setupReal(specs: ItemSpec[], bundle: Row = {}) {
    const db = new FakeDb()
    db.tables.ops_bundles = [{ id: B, is_sample: false, ...bundle }]
    db.tables.ops_bundle_items = specs.map((spec) => ({ ...makeItem(spec), bundle_id: B }))
    const run = (itemIds: unknown) => executeBundle(db.service, { bundleId: B, itemIds, actor: ACTOR }, { handlers: EXECUTE_HANDLERS, now: () => NOW })
    return { db, run }
  }

  /** 응답·결정 기록·슬랙에 나간 모든 글. */
  async function outputsOf(db: FakeDb, result: ExecuteSuccess) {
    await notifyExecution(db.service, result)
    return [JSON.stringify(result.body), JSON.stringify(db.tables.ops_decisions), h.postOpsSlack.mock.calls.map((call) => call[1]).join('\n')]
  }

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

  it('미션 등 다른 종류는 아직 연결하지 않은 종류로 막힌다', async () => {
    const { db, run } = setupReal([{ id: ID.mission, key: 'mission', kind: 'mission' }])
    const failure = bad(await run([ID.mission]))
    expect(failure.status).toBe(409)
    expect(failure.extra?.skipped).toEqual([{ id: ID.mission, reason: PRECHECK_MESSAGES.noHandler }])
    expect(nonSelect(db)).toEqual([])
  })
})
