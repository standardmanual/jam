/**
 * 상태 맞추기 엔진 (티켓 20261002_1813, 상위 20260930_1500 ⑦-a). 가정 1~6은 티켓 「착수 전에 정한 것」 번호다.
 * 카드는 실제 핸들러와 메모리 DB(`fakeDb.ts`)로, 오류·경합·카드가 아닌 종류는 가짜 핸들러로 지킨다(레지스트리에는 카드만 있다).
 *
 * - 판정(`planReconcile`, 가정 2·3·4): §8.6 표의 행마다, 시험 묶음(§8.8), 같은 차이는 한 번, 이미 `fail`, 읽기 결과가 없는 항목
 * - 실행(`reconcileOpsItems`, 가정 5): 조건부 상태 변경·결정 기록(행위자·`batch_id`)·멈춘 준비중 `undo`·동시 두 회차·오류 건너뜀
 * - 슬랙(`notifyReconcile`, 가정 6): 요약·알림·시험 묶음 따로·바뀐 것이 없으면 안 보냄·`slack_result`
 */
import { vi, describe, it, expect, beforeEach, type MockInstance } from 'vitest'

const h = vi.hoisted(() => ({ postOpsSlack: vi.fn() }))

vi.mock('@/lib/admin/opsInbox/slack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/slack')>()
  return { ...actual, postOpsSlack: h.postOpsSlack }
})

import type { ExecuteHandlerRegistry, ResourceObservation } from '../handlers'
import { EXECUTE_HANDLERS } from '../registry'
import { notifyReconcile, planReconcile, reconcileOpsItems, type ReconcileItem, type ReconcileSuccess } from '../reconcile'
import type { RunFailure } from '../run'
import { DB_SECRET, FakeDb, type FakeCall, type Row } from './fakeDb'
import { LATER, NOW, fakeHandler, makeItem, type ItemSpec } from './fixtures'

const SB_ID = '5db8e2be-54c3-42b2-8ee5-04cd84714fff'
const B = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ID = { card: uid(1), card2: uid(2), card3: uid(3), mission: uid(4), drop: uid(5) }
const CARD_RES = uid(11)
const CARD_RES2 = uid(12)
const CARD_RES3 = uid(13)
const MISSION_RES = uid(14)

/** NOW(10/5 12:00 KST = 03:00Z)보다 앞인 공개 시각(10/5 09:00 KST)과, 그날의 끝(23:59:59.999 KST)인 종료 시각. */
const STARTS = '2026-10-05T00:00:00.000Z'
const ENDS = '2026-10-05T14:59:59.999Z'
/** 아직 먼 공개 시각(10/10 09:00 KST)과 그날의 끝. */
const FUTURE_ENDS = '2026-10-10T14:59:59.999Z'
const MINUTE = 60_000
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString()

const OUTSIDE = '운영툴 밖에서 지워졌어요'
const STALLED = '예약 등록이 끝나지 않았어요'
const REMAINS = '만든 자원이 남아 있어요'
const ACTOR = 'system:reconcile'
const CARD_LABEL = '홈피드 카드 · 10/5(월) 09:00'

/** `sample: true`인 항목은 시험 묶음에 들어간다(`setup`). */
type SpecInBundle = ItemSpec & { sample?: boolean }

const cardItem = (extra: SpecInBundle = {}): SpecInBundle => ({
  id: ID.card,
  key: 'card',
  kind: 'home_feed_card',
  status: 'scheduled',
  startsAt: STARTS,
  endsAt: ENDS,
  createdResource: { today_card_id: CARD_RES },
  ...extra,
})

const cardRow = (extra: Row = {}): Row => ({ id: CARD_RES, is_active: true, starts_at: STARTS, ends_at: ENDS, ...extra })

// ── 판정(순수) ───────────────────────────────────────────────────────────────────────────────────

const entry = (spec: ItemSpec, extra: Partial<Omit<ReconcileItem, 'item'>> = {}): ReconcileItem => ({
  item: makeItem(spec),
  isSample: false,
  lastAction: null,
  lastExternalDiff: null,
  ...extra,
})

type Present = Extract<ResourceObservation, { status: 'present' }>
const present = (extra: Partial<Present> = {}): ResourceObservation => ({ status: 'present', published: false, ended: false, startsAt: STARTS, endsAt: ENDS, inactive: false, ...extra })

const planOne = (target: ReconcileItem, observation?: ResourceObservation, now: Date = NOW) =>
  planReconcile([target], new Map(observation ? [[target.item.id, observation]] : []), now)

/** 전이 하나를 [지금, 바뀔 상태, 결정 기록 action, 사유]로 줄인다. 전이가 없으면 null. */
const shape = (plan: ReturnType<typeof planReconcile>) => {
  expect(plan.transitions.length).toBeLessThanOrEqual(1)
  const t = plan.transitions[0]
  return t ? [t.from, t.to, t.action, t.reason] : null
}

describe('판정 — 예약됨·게재중과 읽은 자원 (가정 3, §8.6 표)', () => {
  it('예약됨 + 공개 판정 참 → 게재중, 결정 기록 없음', () => {
    expect(shape(planOne(entry(cardItem()), present({ published: true })))).toEqual(['scheduled', 'live', null, null])
  })

  it('예약됨 + 아직 공개 전 → 그대로', () => {
    expect(shape(planOne(entry(cardItem()), present()))).toBeNull()
  })

  it('예약됨 + 종료 시각까지 지남(늦은 회차) → 곧바로 종료, 결정 기록 없음', () => {
    expect(shape(planOne(entry(cardItem()), present({ ended: true })))).toEqual(['scheduled', 'ended', null, null])
  })

  it('종료가 공개보다 먼저 가려진다 — 공개 판정이 같이 참이어도 종료다', () => {
    expect(shape(planOne(entry(cardItem()), present({ published: true, ended: true })))).toEqual(['scheduled', 'ended', null, null])
  })

  it('게재중 + 종료 시각이 지남 → 종료, 결정 기록 없음', () => {
    expect(shape(planOne(entry(cardItem({ status: 'live' })), present({ ended: true })))).toEqual(['live', 'ended', null, null])
  })

  it('게재중 + 아직 안 끝남 → 그대로. 게재중이 공개 판정 거짓이어도 바꾸지 않는다', () => {
    expect(shape(planOne(entry(cardItem({ status: 'live' })), present({ published: true })))).toBeNull()
    expect(shape(planOne(entry(cardItem({ status: 'live' })), present({ published: false })))).toBeNull()
  })

  it('예약됨 + 자원 없음 → 취소, cancel, 사유 「운영툴 밖에서 지워졌어요」', () => {
    expect(shape(planOne(entry(cardItem()), { status: 'missing' }))).toEqual(['scheduled', 'cancelled', 'cancel', OUTSIDE])
  })

  it('게재중 + 자원 없음 → 종료, end, 같은 사유', () => {
    expect(shape(planOne(entry(cardItem({ status: 'live' })), { status: 'missing' }))).toEqual(['live', 'ended', 'end', OUTSIDE])
  })

  it('자원 ID가 없는 예약됨 항목은 읽지 않고 자원이 없는 것으로 보고 취소한다. 게재중이면 종료다', () => {
    expect(shape(planOne(entry(cardItem({ createdResource: null }))))).toEqual(['scheduled', 'cancelled', 'cancel', OUTSIDE])
    expect(shape(planOne(entry(cardItem({ createdResource: { mission_id: MISSION_RES } }))))).toEqual(['scheduled', 'cancelled', 'cancel', OUTSIDE])
    expect(shape(planOne(entry(cardItem({ status: 'live', createdResource: {} }))))).toEqual(['live', 'ended', 'end', OUTSIDE])
  })

  it('예약됨 + 공개되지 못하고 끝남(failed) → 실패, fail, 읽기 쪽 사유 그대로', () => {
    expect(shape(planOne(entry(cardItem()), { status: 'failed', reason: '드랍을 놓지 못했어요(놓침)' }))).toEqual(['scheduled', 'failed', 'fail', '드랍을 놓지 못했어요(놓침)'])
  })

  it('failed의 사유가 비면 고정 문장을, 500자를 넘으면 자른다. 게재중의 failed는 바꾸지 않는다', () => {
    expect(shape(planOne(entry(cardItem()), { status: 'failed', reason: '   ' }))?.[3]).toBe('자원이 공개되지 못했어요')
    expect(String(shape(planOne(entry(cardItem()), { status: 'failed', reason: '가'.repeat(600) }))?.[3])).toHaveLength(500)
    expect(shape(planOne(entry(cardItem({ status: 'live' })), { status: 'failed', reason: '사유' }))).toBeNull()
  })

  it('읽기 결과가 없는(읽지 못한) 실제 묶음 항목은 건너뛴다. 자원 ID가 없으면 읽을 것이 없다', () => {
    expect(planOne(entry(cardItem())).transitions).toEqual([])
    expect(planOne(entry(cardItem({ status: 'live' }))).transitions).toEqual([])
  })

  it('error 읽기 결과는 바꾸지 않는다', () => {
    const plan = planOne(entry(cardItem()), { status: 'error', detail: DB_SECRET })
    expect(plan).toEqual({ transitions: [], externalChanges: [] })
  })

  it('준비중·예약됨·게재중이 아닌 상태는 건드리지 않는다', () => {
    for (const status of ['arrived', 'reviewing', 'approved', 'ended', 'rejected', 'cancelled', 'failed']) {
      expect(planOne(entry(cardItem({ status, updatedAt: at(-60 * MINUTE) })), { status: 'missing' })).toEqual({ transitions: [], externalChanges: [] })
    }
  })
})

describe('판정 — 밖에서 바뀜 external_change (가정 1·3)', () => {
  const diffOf = (target: ReconcileItem, observation: ResourceObservation) => planOne(target, observation).externalChanges.map((change) => change.diff)

  it('공개 시각이 다르면 시각 전후를 ISO로 담는다. 상태는 규칙대로(여기서는 그대로)다', () => {
    const plan = planOne(entry(cardItem()), present({ startsAt: '2026-10-05T01:00:00.000Z' }))
    expect(plan.externalChanges.map((change) => change.diff)).toEqual([{ starts_at: { item: STARTS, resource: '2026-10-05T01:00:00.000Z' } }])
    expect(plan.transitions).toEqual([])
  })

  it('종료 시각이 다르면 종료 칸만 담는다', () => {
    expect(diffOf(entry(cardItem()), present({ endsAt: '2026-10-06T14:59:59.999Z' }))).toEqual([{ ends_at: { item: ENDS, resource: '2026-10-06T14:59:59.999Z' } }])
  })

  it('비활성이면 is_active 전후(true → false)를 담는다. 공개 판정이 거짓이라 상태는 예약됨에 남는다', () => {
    const plan = planOne(entry(cardItem()), present({ inactive: true, published: false }))
    expect(plan.externalChanges.map((change) => change.diff)).toEqual([{ is_active: { item: true, resource: false } }])
    expect(plan.transitions).toEqual([])
  })

  it('다른 칸만 한 건에 담는다', () => {
    expect(diffOf(entry(cardItem()), present({ startsAt: at(-2 * 60 * MINUTE), endsAt: '2026-10-06T14:59:59.999Z', inactive: true }))).toEqual([
      {
        starts_at: { item: STARTS, resource: at(-2 * 60 * MINUTE) },
        ends_at: { item: ENDS, resource: '2026-10-06T14:59:59.999Z' },
        is_active: { item: true, resource: false },
      },
    ])
  })

  it('같은 시각을 다른 표기로 적어도 밀리초가 같으면 다른 것이 아니다', () => {
    expect(diffOf(entry(cardItem()), present({ startsAt: '2026-10-05T09:00:00.000+09:00', endsAt: '2026-10-05T23:59:59.999+09:00' }))).toEqual([])
  })

  it('카드에 종료 시각이 없으면 공개한 날의 끝(KST)으로 등록되므로 그 값과 같으면 다르지 않다', () => {
    expect(diffOf(entry(cardItem({ endsAt: null })), present())).toEqual([])
    expect(diffOf(entry(cardItem({ endsAt: null })), present({ endsAt: '2026-10-07T14:59:59.999Z' }))).toEqual([
      { ends_at: { item: ENDS, resource: '2026-10-07T14:59:59.999Z' } },
    ])
  })

  it('카드가 아닌 종류는 종료 시각이 없으면 상시다 — 자원에 종료가 생기면 다른 것, 둘 다 없으면 같다', () => {
    const mission = (endsAt: string | null) => entry({ id: ID.mission, kind: 'mission', status: 'live', startsAt: STARTS, endsAt, createdResource: { mission_id: MISSION_RES } })
    expect(diffOf(mission(null), present({ endsAt: null }))).toEqual([])
    expect(diffOf(mission(null), present({ endsAt: ENDS }))).toEqual([{ ends_at: { item: null, resource: ENDS } }])
    expect(diffOf(mission(ENDS), present({ endsAt: null }))).toEqual([{ ends_at: { item: ENDS, resource: null } }])
  })

  it('항목에 공개 시각이 없으면 견줄 값이 없어 시각 차이를 남기지 않는다', () => {
    expect(diffOf(entry(cardItem({ startsAt: null, endsAt: ENDS })), present({ startsAt: LATER }))).toEqual([])
  })

  it('가장 최근 external_change의 diff와 같으면 다시 남기지 않는다(저장된 JSONB는 키 순서가 바뀔 수 있다)', () => {
    const observation = present({ inactive: true, startsAt: '2026-10-05T01:00:00.000Z' })
    const same = { is_active: { resource: false, item: true }, starts_at: { resource: '2026-10-05T01:00:00.000Z', item: STARTS } }
    expect(planOne(entry(cardItem(), { lastExternalDiff: same }), observation).externalChanges).toEqual([])
  })

  it('가장 최근 diff와 다르면 새로 남긴다', () => {
    const before = { is_active: { item: true, resource: false } }
    const plan = planOne(entry(cardItem(), { lastExternalDiff: before }), present({ inactive: true, startsAt: '2026-10-05T01:00:00.000Z' }))
    expect(plan.externalChanges).toHaveLength(1)
  })

  it('상태가 바뀌는 항목에도 따로 남긴다', () => {
    const plan = planOne(entry(cardItem()), present({ published: true, startsAt: '2026-10-05T01:00:00.000Z' }))
    expect(shape(plan)).toEqual(['scheduled', 'live', null, null])
    expect(plan.externalChanges).toHaveLength(1)
  })

  it('자원이 없거나 failed인 항목은 시각을 견주지 않는다', () => {
    expect(planOne(entry(cardItem()), { status: 'missing' }).externalChanges).toEqual([])
    expect(planOne(entry(cardItem()), { status: 'failed', reason: '사유' }).externalChanges).toEqual([])
  })
})

describe('판정 — 멈춘 준비중 (가정 3)', () => {
  const preparing = (extra: ItemSpec = {}) => cardItem({ status: 'preparing', ...extra })

  it('준비중으로 10분이 되기 전이면 그대로, 정확히 10분이면 실패로 닫는다', () => {
    expect(planOne(entry(preparing({ updatedAt: at(-10 * MINUTE + 1) }))).transitions).toEqual([])
    expect(shape(planOne(entry(preparing({ updatedAt: at(-10 * MINUTE) }))))).toEqual(['preparing', 'failed', 'fail', STALLED])
    expect(shape(planOne(entry(preparing({ updatedAt: at(-3 * 60 * MINUTE) }))))).toEqual(['preparing', 'failed', 'fail', STALLED])
  })

  it('읽을 수 없는 updated_at은 건너뛴다', () => {
    expect(planOne(entry(preparing({ updatedAt: 'not-a-date' }))).transitions).toEqual([])
  })

  it('실제 묶음이고 자원 ID가 있으면 지울 자원으로 싣는다. 자원 ID가 없으면 지울 것이 없다', () => {
    const old = at(-20 * MINUTE)
    expect(planOne(entry(preparing({ updatedAt: old }))).transitions[0].undoResourceId).toBe(CARD_RES)
    expect(planOne(entry(preparing({ updatedAt: old, createdResource: null }))).transitions[0].undoResourceId).toBeNull()
  })

  it('가장 최근 결정 기록이 이미 fail이면 상태는 닫되 새 기록은 남기지 않는다. 그 밖이면 남긴다', () => {
    const old = at(-20 * MINUTE)
    expect(shape(planOne(entry(preparing({ updatedAt: old }), { lastAction: 'fail' })))).toEqual(['preparing', 'failed', null, STALLED])
    expect(shape(planOne(entry(preparing({ updatedAt: old }), { lastAction: 'approve' })))).toEqual(['preparing', 'failed', 'fail', STALLED])
    expect(shape(planOne(entry(preparing({ updatedAt: old }), { lastAction: 'execute' })))).toEqual(['preparing', 'failed', 'fail', STALLED])
  })

  it('준비중은 자원을 읽지 않는다 — 읽기 결과가 있어도 쓰지 않는다', () => {
    const old = at(-20 * MINUTE)
    expect(shape(planOne(entry(preparing({ updatedAt: old })), { status: 'missing' }))).toEqual(['preparing', 'failed', 'fail', STALLED])
    expect(planOne(entry(preparing({ updatedAt: old })), present({ inactive: true })).externalChanges).toEqual([])
  })
})

describe('판정 — 시험 묶음은 자원 대신 항목의 시각만 본다 (가정 4, §8.8)', () => {
  const sample = (spec: ItemSpec, extra: Partial<Omit<ReconcileItem, 'item'>> = {}) =>
    entry({ createdResource: { sample: true }, ...spec }, { isSample: true, ...extra })

  it('예약됨 + 공개 시각이 지나면 게재중, 정확히 지금이어도 게재중이다', () => {
    expect(shape(planOne(sample(cardItem({ endsAt: null }))))).toEqual(['scheduled', 'live', null, null])
    expect(shape(planOne(sample(cardItem({ startsAt: NOW.toISOString(), endsAt: null }))))).toEqual(['scheduled', 'live', null, null])
  })

  it('예약됨 + 공개 시각 전이면 그대로다. 공개 시각이 없으면 판정하지 않는다', () => {
    expect(planOne(sample(cardItem({ startsAt: LATER, endsAt: FUTURE_ENDS }))).transitions).toEqual([])
    expect(planOne(sample(cardItem({ startsAt: null }))).transitions).toEqual([])
  })

  it('예약됨인데 두 시각이 다 지났으면 곧바로 종료한다', () => {
    expect(shape(planOne(sample(cardItem({ endsAt: at(-MINUTE) }))))).toEqual(['scheduled', 'ended', null, null])
  })

  it('드랍 항목은 공개 시각에 곧바로 종료한다', () => {
    expect(shape(planOne(sample(cardItem({ id: ID.drop, kind: 'drop_schedule', endsAt: null }))))).toEqual(['scheduled', 'ended', null, null])
    expect(planOne(sample(cardItem({ id: ID.drop, kind: 'drop_schedule', startsAt: LATER, endsAt: null }))).transitions).toEqual([])
  })

  it('게재중 + 종료 시각이 지나면 종료, 정확히 지금이면 아직이다. 종료 시각이 없으면 계속 게재중이다', () => {
    expect(shape(planOne(sample(cardItem({ status: 'live', endsAt: at(-1) }))))).toEqual(['live', 'ended', null, null])
    expect(planOne(sample(cardItem({ status: 'live', endsAt: NOW.toISOString() }))).transitions).toEqual([])
    expect(planOne(sample(cardItem({ status: 'live', endsAt: null }))).transitions).toEqual([])
  })

  it('자원을 읽지 않으니 external_change도 missing도 없다 — 읽기 결과가 있어도 쓰지 않는다', () => {
    const plan = planOne(sample(cardItem({ createdResource: null })), { status: 'missing' })
    expect(shape(plan)).toEqual(['scheduled', 'live', null, null])
    expect(plan.externalChanges).toEqual([])
  })

  it('멈춘 준비중은 undo 없이 실패로 닫는다', () => {
    const plan = planOne(sample(cardItem({ status: 'preparing', updatedAt: at(-20 * MINUTE) })))
    expect(shape(plan)).toEqual(['preparing', 'failed', 'fail', STALLED])
    expect(plan.transitions[0].undoResourceId).toBeNull()
  })
})

// ── 실행 ─────────────────────────────────────────────────────────────────────────────────────────

interface SetupOptions {
  cards?: Row[]
  decisions?: Row[]
  handlers?: ExecuteHandlerRegistry
}

function setup(specs: SpecInBundle[], options: SetupOptions = {}) {
  const db = new FakeDb()
  db.tables.ops_bundles = [
    { id: B, is_sample: false },
    { id: SB_ID, is_sample: true },
  ]
  db.tables.ops_bundle_items = specs.map(({ sample, ...spec }) => ({ ...makeItem(spec), bundle_id: sample ? SB_ID : B }))
  db.tables.today_cards = options.cards ?? []
  db.tables.ops_decisions = options.decisions ?? []
  const handlers = options.handlers ?? EXECUTE_HANDLERS
  const run = () => reconcileOpsItems(db.service, { handlers, now: () => NOW })
  return { db, handlers, run }
}

const ok = (outcome: ReconcileSuccess | RunFailure) => {
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  return outcome as ReconcileSuccess
}

const statusOf = (db: FakeDb, id: string) => db.item(id).status
const nonSelect = (db: FakeDb) => db.calls.filter((call) => call.op !== 'select')
const idsOf = (changes: ReadonlyArray<{ itemId: string }>) => changes.map((change) => change.itemId)

let errorSpy: MockInstance<typeof console.error>
beforeEach(() => {
  h.postOpsSlack.mockReset()
  h.postOpsSlack.mockResolvedValue({ ok: true })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
const logged = () => errorSpy.mock.calls.map((args) => args.join(' ')).join('\n')

/** 이 회차의 결과를 한 줄로: 공개·종료·취소·실패·밖에서 바뀜 항목 수와 오류 수. */
const countsOf = (result: ReconcileSuccess) => [result.published, result.ended, result.cancelled, result.failed, result.externalChanged].map((list) => list.length).concat(result.errors)

describe('실행 — 카드의 상태 전이 (가정 5, 실제 카드 핸들러)', () => {
  it('예약됨 카드가 공개 중이면 게재중으로 옮기고 결정 기록도 쓰기도 더 없다', async () => {
    const { db, run } = setup([cardItem()], { cards: [cardRow()] })
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('live')
    expect(db.item(ID.card).updated_at).toBe(NOW.toISOString())
    expect(db.decisions()).toEqual([])
    expect(idsOf(result.published)).toEqual([ID.card])
    expect(result.published[0]).toMatchObject({ bundleId: B, itemLabel: CARD_LABEL, isSample: false, action: null, reason: null, resourceId: null })
    expect(countsOf(result)).toEqual([1, 0, 0, 0, 0, 0])
    expect(db.calls.filter((call) => call.table === 'today_cards' && call.op !== 'select')).toEqual([])
    expect(h.postOpsSlack).not.toHaveBeenCalled()
  })

  it('공개 시각 전이면 아무것도 바꾸지 않는다', async () => {
    const { db, run } = setup([cardItem({ startsAt: LATER, endsAt: FUTURE_ENDS })], { cards: [cardRow({ starts_at: LATER, ends_at: FUTURE_ENDS })] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(nonSelect(db)).toEqual([])
  })

  it('게재중 카드의 종료 시각이 지났으면 종료한다. 결정 기록은 없다', async () => {
    const { db, run } = setup([cardItem({ status: 'live', endsAt: at(-1) })], { cards: [cardRow({ ends_at: at(-1) })] })
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('ended')
    expect(db.decisions()).toEqual([])
    expect(result.ended).toHaveLength(1)
    expect(result.ended[0].action).toBeNull()
  })

  it('예약됨인데 공개·종료 시각이 다 지난 늦은 회차는 곧바로 종료한다', async () => {
    const { db, run } = setup([cardItem({ endsAt: at(-MINUTE) })], { cards: [cardRow({ ends_at: at(-MINUTE) })] })
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('ended')
    expect(countsOf(result)).toEqual([0, 1, 0, 0, 0, 0])
    expect(db.decisions()).toEqual([])
  })

  it('예약됨 카드가 밖에서 지워졌으면 취소하고 cancel을 남긴다 — 행위자·사유·batch_id', async () => {
    const { db, run } = setup([cardItem()])
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(db.decisions()).toHaveLength(1)
    expect(db.decisions()[0]).toMatchObject({ bundle_id: B, item_id: ID.card, action: 'cancel', actor: ACTOR, reason: OUTSIDE, batch_id: result.batchId })
    expect(result.cancelled[0]).toMatchObject({ itemId: ID.card, action: 'cancel', reason: OUTSIDE })
  })

  it('게재중 카드가 밖에서 지워졌으면 종료하고 end를 남긴다', async () => {
    const { db, run } = setup([cardItem({ status: 'live' })])
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('ended')
    expect(db.decisions()[0]).toMatchObject({ item_id: ID.card, action: 'end', actor: ACTOR, reason: OUTSIDE, batch_id: result.batchId })
    expect(result.ended[0]).toMatchObject({ action: 'end', reason: OUTSIDE })
  })

  it('자원 ID가 없는 예약됨 항목은 카드를 읽지 않고 취소한다', async () => {
    const { db, run } = setup([cardItem({ createdResource: null })], { cards: [cardRow()] })
    ok(await run())

    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(db.calls.some((call) => call.table === 'today_cards')).toBe(false)
    expect(db.decisions()[0]).toMatchObject({ action: 'cancel', reason: OUTSIDE })
  })

  it('여러 항목은 항목마다 따로 판정하고, 결정 기록은 바뀐 항목에만 같은 batch_id로 남는다', async () => {
    const { db, run } = setup(
      [
        cardItem(),
        cardItem({ id: ID.card2, key: 'card2', createdResource: { today_card_id: CARD_RES2 } }),
        cardItem({ id: ID.card3, key: 'card3', status: 'live', createdResource: { today_card_id: CARD_RES3 } }),
      ],
      { cards: [cardRow(), cardRow({ id: CARD_RES2, starts_at: LATER, ends_at: FUTURE_ENDS })] }
    )
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('live')
    // 카드2는 항목 시각(STARTS)과 자원 시각(LATER)이 다르다 — 상태는 그대로이고 밖에서 바뀜만 남는다.
    expect(statusOf(db, ID.card2)).toBe('scheduled')
    expect(statusOf(db, ID.card3)).toBe('ended')
    expect(db.decisions().map((row) => [row.item_id, row.action])).toEqual([
      [ID.card3, 'end'],
      [ID.card2, 'external_change'],
    ])
    expect(new Set(db.decisions().map((row) => row.batch_id))).toEqual(new Set([result.batchId]))
    expect(countsOf(result)).toEqual([1, 1, 0, 0, 1, 0])
  })

  it('대상이 아닌 상태의 항목과 읽은 자원은 건드리지 않는다', async () => {
    const { db, run } = setup(
      [cardItem({ status: 'approved' }), cardItem({ id: ID.card2, key: 'card2', status: 'ended', createdResource: { today_card_id: CARD_RES2 } })],
      { cards: [] }
    )
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(nonSelect(db)).toEqual([])
    expect(db.calls.some((call) => call.table === 'today_cards')).toBe(false)
  })
})

describe('실행 — 밖에서 바뀜 external_change (가정 1)', () => {
  it('운영툴 밖에서 꺼진 카드는 상태를 두고 is_active 전후를 기록만 한다. 예약됨에 남는다', async () => {
    const { db, run } = setup([cardItem()], { cards: [cardRow({ is_active: false })] })
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('scheduled')
    expect(db.decisions()).toHaveLength(1)
    expect(db.decisions()[0]).toMatchObject({
      item_id: ID.card,
      action: 'external_change',
      actor: ACTOR,
      reason: null,
      batch_id: result.batchId,
      diff: { is_active: { item: true, resource: false } },
    })
    expect(result.externalChanged).toEqual([{ itemId: ID.card, bundleId: B, itemLabel: CARD_LABEL, isSample: false, diff: { is_active: { item: true, resource: false } } }])
    expect(db.itemWrites()).toEqual([])
  })

  it('같은 차이는 다음 회차에 다시 남기지 않고, 다시 켜면 그대로 이어진다', async () => {
    const { db, run } = setup([cardItem()], { cards: [cardRow({ is_active: false })] })
    ok(await run())
    const second = ok(await run())

    expect(db.decisions()).toHaveLength(1)
    expect(second.externalChanged).toEqual([])

    ;(db.tables.today_cards[0] as Row).is_active = true
    const third = ok(await run())
    expect(statusOf(db, ID.card)).toBe('live')
    expect(third.published).toHaveLength(1)
    expect(db.decisions()).toHaveLength(1)
  })

  it('차이가 바뀌면 새로 남긴다', async () => {
    const { db, run } = setup([cardItem()], { cards: [cardRow({ is_active: false })] })
    ok(await run())
    ;(db.tables.today_cards[0] as Row).ends_at = '2026-10-06T14:59:59.999Z'
    ok(await run())

    expect(db.decisions().map((row) => row.diff)).toEqual([
      { is_active: { item: true, resource: false } },
      { ends_at: { item: ENDS, resource: '2026-10-06T14:59:59.999Z' }, is_active: { item: true, resource: false } },
    ])
  })

  it('이미 남은 external_change는 가장 최근 것과 견준다 — 그 전 것과 같아도 가장 최근이 다르면 새로 남긴다', async () => {
    const inactive = { is_active: { item: true, resource: false } }
    const moved = { starts_at: { item: STARTS, resource: LATER } }
    const { db, run } = setup([cardItem()], {
      cards: [cardRow({ is_active: false })],
      decisions: [
        { id: 'd1', item_id: ID.card, action: 'external_change', diff: inactive, created_at: at(-3 * MINUTE) },
        { id: 'd2', item_id: ID.card, action: 'external_change', diff: moved, created_at: at(-2 * MINUTE) },
      ],
    })
    const result = ok(await run())
    expect(result.externalChanged).toHaveLength(1)
    expect(db.decisions('external_change')).toHaveLength(3)
  })

  it('항목과 시각이 다른 카드는 공개 판정이 참이면 게재중으로 가고, 밖에서 바뀜도 따로 남는다', async () => {
    const { db, run } = setup([cardItem()], { cards: [cardRow({ starts_at: '2026-10-05T01:00:00.000Z' })] })
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('live')
    expect(db.decisions().map((row) => row.action)).toEqual(['external_change'])
    expect(db.decisions()[0].diff).toEqual({ starts_at: { item: STARTS, resource: '2026-10-05T01:00:00.000Z' } })
    expect(countsOf(result)).toEqual([1, 0, 0, 0, 1, 0])
  })

  it('종료 시각이 없는 카드 항목은 공개한 날의 끝으로 등록돼 있으면 밖에서 바뀐 것이 아니다', async () => {
    const { db, run } = setup([cardItem({ endsAt: null })], { cards: [cardRow()] })
    const result = ok(await run())

    expect(result.externalChanged).toEqual([])
    expect(db.decisions()).toEqual([])
    expect(statusOf(db, ID.card)).toBe('live')
  })
})

describe('실행 — 멈춘 준비중 (가정 3)', () => {
  const stuck = (extra: SpecInBundle = {}) => cardItem({ status: 'preparing', updatedAt: at(-11 * MINUTE), ...extra })

  it('10분이 지난 준비중은 실패로 닫고 만든 카드를 참조 확인 뒤 지우고 fail을 남긴다', async () => {
    const { db, run } = setup([stuck()], { cards: [cardRow({ starts_at: LATER, ends_at: FUTURE_ENDS }), cardRow({ id: CARD_RES2 })] })
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('failed')
    expect((db.tables.today_cards as Row[]).map((row) => row.id)).toEqual([CARD_RES2])
    expect(db.calls.some((call) => call.table === 'today_card_events')).toBe(true)
    expect(db.decisions()).toHaveLength(1)
    expect(db.decisions()[0]).toMatchObject({ item_id: ID.card, action: 'fail', actor: ACTOR, reason: STALLED, batch_id: result.batchId })
    expect(result.failed[0]).toMatchObject({ itemId: ID.card, action: 'fail', reason: STALLED, resourceId: null })
  })

  it('만든 카드를 지우지 못하면(노출 기록) 카드는 남기고 사유에 덧붙이며 결과에 자원 ID를 싣는다', async () => {
    const { db, run } = setup([stuck()], { cards: [cardRow()] })
    db.tables.today_card_events = [{ id: 'event-1', card_id: CARD_RES }]
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('failed')
    expect((db.tables.today_cards as Row[]).map((row) => row.id)).toEqual([CARD_RES])
    expect(db.decisions()[0]).toMatchObject({ action: 'fail', reason: `${STALLED}. ${REMAINS}` })
    expect(result.failed[0]).toMatchObject({ reason: `${STALLED}. ${REMAINS}`, resourceId: CARD_RES })
    // 응답·기록에는 고정 문장만, 지우지 못한 이유(테이블 이름)는 서버 로그에만
    expect(JSON.stringify([result, db.decisions()])).not.toContain('today_card_events')
    expect(logged()).toContain('today_card_events')
  })

  it('참조를 읽지 못해도 지우지 않고 실패로 닫는다. DB 오류 원문은 기록에 없다', async () => {
    const { db, run } = setup([stuck()], { cards: [cardRow()] })
    db.failIf = (call) => call.table === 'today_card_events'
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('failed')
    expect(db.tables.today_cards).toHaveLength(1)
    expect(result.failed[0].resourceId).toBe(CARD_RES)
    expect(JSON.stringify([result, db.decisions()])).not.toContain(DB_SECRET)
  })

  it('10분이 안 된 준비중은 그대로 둔다', async () => {
    const { db, run } = setup([stuck({ updatedAt: at(-9 * MINUTE) })], { cards: [cardRow()] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(statusOf(db, ID.card)).toBe('preparing')
    expect(nonSelect(db)).toEqual([])
  })

  it('가장 최근 결정 기록이 이미 fail이면 상태만 닫고 기록은 새로 남기지 않는다', async () => {
    const { db, run } = setup([stuck()], {
      cards: [cardRow()],
      decisions: [
        { id: 'd1', item_id: ID.card, action: 'approve', created_at: at(-30 * MINUTE) },
        { id: 'd2', item_id: ID.card, action: 'fail', reason: '실행 중 닫지 못함', created_at: at(-11 * MINUTE) },
      ],
    })
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('failed')
    expect(db.decisions()).toHaveLength(2)
    expect(db.tables.today_cards).toEqual([])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].action).toBeNull()
  })

  it('fail 뒤에 다시 예약 등록해 준비중이 된 항목은 새 fail을 남긴다', async () => {
    const { db, run } = setup([stuck()], {
      cards: [cardRow()],
      decisions: [
        { id: 'd1', item_id: ID.card, action: 'fail', created_at: at(-40 * MINUTE) },
        { id: 'd2', item_id: ID.card, action: 'execute', created_at: at(-12 * MINUTE) },
      ],
    })
    ok(await run())
    expect(db.decisions('fail')).toHaveLength(2)
  })

  it('시험 묶음의 멈춘 준비중은 undo 없이(카드 테이블을 건드리지 않고) 닫는다', async () => {
    const { db, run } = setup([stuck({ sample: true, createdResource: { sample: true } })], { cards: [cardRow()] })
    ok(await run())

    expect(statusOf(db, ID.card)).toBe('failed')
    expect(db.calls.some((call) => call.table === 'today_cards' || call.table === 'today_card_events')).toBe(false)
    expect(db.decisions()[0]).toMatchObject({ action: 'fail', reason: STALLED })
  })

  it('읽은 뒤 실행 API가 다시 차지해 updated_at이 바뀌었으면 닫지도 지우지도 않는다', async () => {
    const undo = vi.fn(async () => null)
    const handlers: ExecuteHandlerRegistry = { home_feed_card: { ...fakeHandler('home_feed_card'), undo } }
    const { db, run } = setup([stuck()], { handlers })
    db.beforeRun = (call) => {
      if (call.table === 'ops_bundle_items' && call.op === 'update') db.item(ID.card).updated_at = at(-1)
    }
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('preparing')
    expect(undo).not.toHaveBeenCalled()
    expect(db.decisions()).toEqual([])
    expect(result.failed).toEqual([])
  })
})

describe('실행 — 시험 묶음 (가정 4)', () => {
  it('자원을 읽지 않고 항목의 시각만 본다 — 공개 시각이 지난 예약됨은 게재중, 드랍은 곧바로 종료', async () => {
    const { db, run } = setup([
      cardItem({ sample: true, createdResource: { sample: true }, endsAt: null }),
      cardItem({ id: ID.drop, key: 'drop', kind: 'drop_schedule', sample: true, createdResource: { sample: true }, endsAt: null }),
      cardItem({ id: ID.card2, key: 'late', sample: true, createdResource: { sample: true }, endsAt: at(-MINUTE) }),
      cardItem({ id: ID.card3, key: 'live', sample: true, status: 'live', createdResource: { sample: true }, endsAt: at(-MINUTE) }),
    ])
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('live')
    expect(statusOf(db, ID.drop)).toBe('ended')
    expect(statusOf(db, ID.card2)).toBe('ended')
    expect(statusOf(db, ID.card3)).toBe('ended')
    expect(db.calls.some((call) => call.table === 'today_cards')).toBe(false)
    expect(db.decisions()).toEqual([])
    expect(result.published[0].isSample).toBe(true)
    expect(countsOf(result)).toEqual([1, 3, 0, 0, 0, 0])
  })

  it('시험 묶음에는 external_change도 「지워짐」도 없다 — 핸들러가 없는 종류여도 오류가 아니다', async () => {
    const { db, run } = setup([cardItem({ id: ID.mission, kind: 'mission', sample: true, createdResource: { sample: true }, endsAt: null })], { handlers: {} })
    const result = ok(await run())

    expect(statusOf(db, ID.mission)).toBe('live')
    expect(result.errors).toBe(0)
    expect(db.decisions()).toEqual([])
  })
})

describe('실행 — 경합 (가정 5)', () => {
  it('두 회차가 동시에 같은 항목을 닫아도 상태는 한 번 바뀌고 결정 기록도 한 번이다', async () => {
    const { db, run } = setup([cardItem()])
    const [first, second] = (await Promise.all([run(), run()])).map(ok)

    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(first.cancelled.length + second.cancelled.length).toBe(1)
    expect(db.decisions('cancel')).toHaveLength(1)
    expect(db.decisions()).toHaveLength(1)
    // 이긴 회차의 batch_id가 기록에 남는다.
    const winner = first.cancelled.length === 1 ? first : second
    expect(db.decisions()[0].batch_id).toBe(winner.batchId)
  })

  it('두 회차가 동시에 게재 시작을 맞춰도 한 번만 센다', async () => {
    const { db, run } = setup([cardItem()], { cards: [cardRow()] })
    const [first, second] = (await Promise.all([run(), run()])).map(ok)

    expect(statusOf(db, ID.card)).toBe('live')
    expect(first.published.length + second.published.length).toBe(1)
  })

  it('읽은 뒤 다른 곳에서 먼저 바꾼 항목은 바꾸지도 세지도 기록하지도 않는다', async () => {
    const { db, run } = setup([cardItem()])
    db.beforeRun = (call) => {
      if (call.table === 'ops_bundle_items' && call.op === 'update') db.item(ID.card).status = 'cancelled'
    }
    const result = ok(await run())

    expect(result.cancelled).toEqual([])
    expect(db.decisions()).toEqual([])
    expect(result.errors).toBe(0)
  })

  it('상태 변경은 항목 ID와 지금 상태를 함께 조건으로 건다', async () => {
    const { db, run } = setup([cardItem()])
    ok(await run())

    const write = db.itemWrites()[0]
    expect(write.payload).toEqual({ status: 'cancelled', updated_at: NOW.toISOString() })
    expect(write.filters).toEqual([
      ['id', ID.card],
      ['status', 'scheduled'],
    ])
  })
})

describe('실행 — 항목 하나의 오류가 회차를 멈추지 않는다 (가정 2·5)', () => {
  const throwing = (resourceId: string): ExecuteHandlerRegistry => ({
    home_feed_card: {
      ...fakeHandler('home_feed_card'),
      observe: async (_service, id): Promise<ResourceObservation> => {
        if (id === CARD_RES) throw new Error(DB_SECRET)
        if (id === resourceId) return { status: 'error', detail: DB_SECRET }
        return { status: 'missing' }
      },
    },
  })

  it('자원을 읽지 못한(오류·예외) 항목은 건너뛰고 오류로 세며 상태는 그대로다. 다른 항목은 계속한다', async () => {
    const { db, run } = setup(
      [
        cardItem(),
        cardItem({ id: ID.card2, key: 'card2', createdResource: { today_card_id: CARD_RES2 } }),
        cardItem({ id: ID.card3, key: 'card3', createdResource: { today_card_id: CARD_RES3 } }),
      ],
      { handlers: throwing(CARD_RES2) }
    )
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('scheduled')
    expect(statusOf(db, ID.card2)).toBe('scheduled')
    expect(statusOf(db, ID.card3)).toBe('cancelled')
    expect(result.errors).toBe(2)
    expect(idsOf(result.cancelled)).toEqual([ID.card3])
    expect(logged()).toContain(DB_SECRET)
    expect(JSON.stringify([result, db.decisions()])).not.toContain(DB_SECRET)
  })

  it('실제 카드 핸들러가 DB를 읽지 못해도 그 항목만 건너뛴다', async () => {
    const { db, run } = setup([cardItem(), cardItem({ id: ID.card2, key: 'card2', createdResource: { today_card_id: CARD_RES2 } })], { cards: [cardRow(), cardRow({ id: CARD_RES2 })] })
    db.failIf = (call) => call.table === 'today_cards' && call.filters.some(([col, val]) => col === 'id' && val === CARD_RES)
    const result = ok(await run())

    expect(result.errors).toBe(1)
    expect(statusOf(db, ID.card)).toBe('scheduled')
    expect(statusOf(db, ID.card2)).toBe('live')
  })

  it('핸들러가 없는 종류와 observe가 없는 핸들러는 건너뛰고 오류로 센다', async () => {
    const withoutObserve = { ...fakeHandler('mission') } as Partial<ReturnType<typeof fakeHandler>>
    delete withoutObserve.observe
    const { db, run } = setup(
      [
        cardItem({ id: ID.mission, key: 'mission', kind: 'mission', createdResource: { mission_id: MISSION_RES } }),
        cardItem({ id: ID.card2, key: 'badge', kind: 'jam_badge', createdResource: { badge_id: uid(15) } }),
        cardItem({ id: ID.card3, key: 'none', kind: null, createdResource: null }),
      ],
      { handlers: { mission: withoutObserve as ReturnType<typeof fakeHandler> } }
    )
    const result = ok(await run())

    expect(result.errors).toBe(3)
    expect([ID.mission, ID.card2, ID.card3].map((id) => statusOf(db, id))).toEqual(['scheduled', 'scheduled', 'scheduled'])
    expect(nonSelect(db)).toEqual([])
  })

  it('상태 쓰기가 실패한 항목은 건너뛰고 오류로 세며 결정 기록도 남기지 않는다. 다른 항목은 계속한다', async () => {
    const { db, run } = setup([cardItem(), cardItem({ id: ID.card2, key: 'card2', createdResource: { today_card_id: CARD_RES2 } })])
    db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'update' && call.filters.some(([col, val]) => col === 'id' && val === ID.card)
    const result = ok(await run())

    expect(result.errors).toBe(1)
    expect(statusOf(db, ID.card)).toBe('scheduled')
    expect(statusOf(db, ID.card2)).toBe('cancelled')
    expect(db.decisions().map((row) => row.item_id)).toEqual([ID.card2])
    expect(JSON.stringify([result, db.decisions()])).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('항목이 속한 묶음을 찾지 못하면 건너뛰고 오류로 센다', async () => {
    const { db, run } = setup([cardItem()])
    db.tables.ops_bundles = []
    const result = ok(await run())

    expect(result.errors).toBe(1)
    expect(nonSelect(db)).toEqual([])
  })

  it('읽기 재료(항목·묶음·결정 기록)를 읽지 못하면 아무것도 쓰지 않고 500이다', async () => {
    for (const table of ['ops_bundle_items', 'ops_bundles', 'ops_decisions']) {
      const { db, run } = setup([cardItem()])
      db.failIf = (call: FakeCall) => call.table === table && call.op === 'select'
      const result = await run()

      expect(result).toMatchObject({ ok: false, status: 500, error: '상태를 맞추지 못했어요.' })
      expect(nonSelect(db)).toEqual([])
      expect(JSON.stringify(result)).not.toContain(DB_SECRET)
    }
  })

  it('결정 기록을 남기지 못해도 상태는 그대로 두고 decisionLogFailed로 알린다', async () => {
    const { db, run } = setup([cardItem()])
    db.failIf = (call) => call.table === 'ops_decisions' && call.op === 'insert'
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(result.decisionLogFailed).toBe(true)
    expect(result.cancelled).toHaveLength(1)
    expect(db.decisions()).toEqual([])
  })

  it('결정 기록을 남길 것이 없으면 insert를 부르지 않는다', async () => {
    const { db, run } = setup([cardItem()], { cards: [cardRow()] })
    ok(await run())

    expect(db.calls.some((call) => call.table === 'ops_decisions' && call.op === 'insert')).toBe(false)
  })

  it('맞출 항목이 없으면 묶음·결정 기록도 읽지 않는다', async () => {
    const { db, run } = setup([])
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(db.calls.map((call) => call.table)).toEqual(['ops_bundle_items'])
  })
})

// ── 슬랙 ─────────────────────────────────────────────────────────────────────────────────────────

/** 슬랙으로 간 글을 [채널, 글]로. */
const posts = () => h.postOpsSlack.mock.calls.map((args) => [String(args[0]), String(args[1])])
const slackResultOf = (db: FakeDb, itemId: string, action: string) => db.decisions(action).find((row) => row.item_id === itemId)?.slack_result

describe('슬랙 (가정 6)', () => {
  it('공개·종료가 있으면 #jam-report에 요약 한 건을 보낸다. 결정 기록이 없으니 채울 행도 없다', async () => {
    const { db, run } = setup(
      [cardItem(), cardItem({ id: ID.card2, key: 'card2', status: 'live', endsAt: at(-1), createdResource: { today_card_id: CARD_RES2 } })],
      { cards: [cardRow(), cardRow({ id: CARD_RES2, ends_at: at(-1) })] }
    )
    const result = ok(await run())
    await notifyReconcile(db.service, result)

    expect(posts()).toEqual([['report', ['1개 공개, 1개 종료', `• 공개 · ${CARD_LABEL}`, `• 종료 · ${CARD_LABEL}`].join('\n')]])
    expect(db.calls.filter((call) => call.table === 'ops_decisions' && call.op === 'update')).toEqual([])
  })

  it('바뀐 것이 없으면 아무것도 보내지 않는다', async () => {
    const { db, run } = setup([cardItem({ startsAt: LATER, endsAt: FUTURE_ENDS })], { cards: [cardRow({ starts_at: LATER, ends_at: FUTURE_ENDS })] })
    await notifyReconcile(db.service, ok(await run()))
    await notifyReconcile(db.service, ok(await setup([]).run()))

    expect(h.postOpsSlack).not.toHaveBeenCalled()
  })

  it('밖에서 바뀜만 있으면 보내지 않는다', async () => {
    const { db, run } = setup([cardItem()], { cards: [cardRow({ is_active: false })] })
    const result = ok(await run())
    await notifyReconcile(db.service, result)

    expect(result.externalChanged).toHaveLength(1)
    expect(h.postOpsSlack).not.toHaveBeenCalled()
  })

  it('밖에서 지워짐(취소·종료)과 실패는 #jam-alert에 한 건이고 그 행들의 slack_result를 채운다. 요약은 없다', async () => {
    const { db, run } = setup(
      [
        cardItem(),
        cardItem({ id: ID.card2, key: 'card2', status: 'live', createdResource: { today_card_id: CARD_RES2 } }),
        cardItem({ id: ID.card3, key: 'card3', status: 'preparing', updatedAt: at(-11 * MINUTE), createdResource: { today_card_id: CARD_RES3 } }),
        cardItem({ id: uid(6), key: 'moved', createdResource: { today_card_id: uid(16) } }),
      ],
      { cards: [cardRow({ id: uid(16), is_active: false })] }
    )
    db.tables.today_card_events = [{ id: 'event-1', card_id: CARD_RES3 }]
    db.tables.today_cards.push(cardRow({ id: CARD_RES3, starts_at: LATER, ends_at: FUTURE_ENDS }))
    const result = ok(await run())
    await notifyReconcile(db.service, result)

    expect(posts()).toHaveLength(1)
    const [channel, text] = posts()[0]
    expect(channel).toBe('alert')
    expect(text.split('\n')[0]).toBe('상태 맞추기에서 확인할 항목이 있어요 · 실패 1건, 취소 1건, 종료 1건')
    expect(text).toContain(`• 실패 · ${CARD_LABEL} — ${STALLED}. ${REMAINS} · 자원 ID: ${CARD_RES3}`)
    expect(text).toContain(`• 취소 · ${CARD_LABEL} — ${OUTSIDE}`)
    expect(text).toContain(`• 종료 · ${CARD_LABEL} — ${OUTSIDE}`)

    const ok1 = { channel: 'alert', ok: true }
    expect(slackResultOf(db, ID.card, 'cancel')).toEqual(ok1)
    expect(slackResultOf(db, ID.card2, 'end')).toEqual(ok1)
    expect(slackResultOf(db, ID.card3, 'fail')).toEqual(ok1)
    // 밖에서 바뀜 행은 글에 없으니 채우지 않는다.
    expect(slackResultOf(db, uid(6), 'external_change')).toBeNull()
  })

  it('공개·종료와 실패가 함께 있으면 요약 한 건과 알림 한 건이다. 요약은 slack_result를 건드리지 않는다', async () => {
    const { db, run } = setup(
      [cardItem(), cardItem({ id: ID.card2, key: 'card2', status: 'preparing', updatedAt: at(-11 * MINUTE), createdResource: null })],
      { cards: [cardRow()] }
    )
    await notifyReconcile(db.service, ok(await run()))

    expect(posts().map(([channel]) => channel)).toEqual(['report', 'alert'])
    expect(posts()[0][1]).toBe(['1개 공개', `• 공개 · ${CARD_LABEL}`].join('\n'))
    expect(slackResultOf(db, ID.card2, 'fail')).toEqual({ channel: 'alert', ok: true })
  })

  it('시험 묶음 항목은 따로 모아 「[시험]」을 붙인 글로 보내고, slack_result도 그 글이 다룬 항목만 채운다', async () => {
    const { db, run } = setup(
      [
        cardItem(),
        cardItem({ id: ID.card2, key: 'card2', createdResource: { today_card_id: CARD_RES2 } }),
        cardItem({ id: ID.card3, key: 'sample-live', sample: true, createdResource: { sample: true }, endsAt: null }),
        cardItem({ id: ID.drop, key: 'sample-stuck', sample: true, status: 'preparing', updatedAt: at(-11 * MINUTE), createdResource: { sample: true } }),
      ],
      { cards: [cardRow()] }
    )
    // 카드2는 자원이 없어 취소(실제 묶음), 카드1은 공개 중(실제 묶음), 시험 묶음은 게재 시작 + 멈춘 준비중 실패.
    await notifyReconcile(db.service, ok(await run()))

    expect(posts().map(([channel, text]) => [channel, text.startsWith('[시험]')])).toEqual([
      ['report', false],
      ['alert', false],
      ['report', true],
      ['alert', true],
    ])
    expect(posts()[0][1]).toBe(['1개 공개', `• 공개 · ${CARD_LABEL}`].join('\n'))
    expect(posts()[1][1]).toContain('취소 1건')
    expect(posts()[1][1]).not.toContain('실패')
    expect(posts()[3][1]).toContain('실패 1건')
    expect(posts()[3][1]).not.toContain('취소')
    expect(slackResultOf(db, ID.card2, 'cancel')).toEqual({ channel: 'alert', ok: true })
    expect(slackResultOf(db, ID.drop, 'fail')).toEqual({ channel: 'alert', ok: true })
  })

  it('슬랙이 실패하면 오류를 slack_result에 남기고 던지지 않는다', async () => {
    h.postOpsSlack.mockResolvedValue({ ok: false, error: 'not_configured' })
    const { db, run } = setup([cardItem()])
    await expect(notifyReconcile(db.service, ok(await run()))).resolves.toBeUndefined()

    expect(slackResultOf(db, ID.card, 'cancel')).toEqual({ channel: 'alert', ok: false, error: 'not_configured' })
    expect(statusOf(db, ID.card)).toBe('cancelled')
  })

  it('슬랙이 던져도 던지지 않는다', async () => {
    h.postOpsSlack.mockRejectedValue(new Error(DB_SECRET))
    const { db, run } = setup([cardItem()])
    await expect(notifyReconcile(db.service, ok(await run()))).resolves.toBeUndefined()
    expect(statusOf(db, ID.card)).toBe('cancelled')
  })

  it('결정 기록을 남기지 못했으면 알림에 그 줄을 싣고 채울 행이 없어 slack_result를 쓰지 않는다', async () => {
    const { db, run } = setup([cardItem()])
    db.failIf = (call) => call.table === 'ops_decisions' && call.op === 'insert'
    await notifyReconcile(db.service, ok(await run()))

    expect(posts()).toHaveLength(1)
    expect(posts()[0][1].split('\n').at(-1)).toBe('결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요')
    expect(db.calls.filter((call) => call.table === 'ops_decisions' && call.op === 'update')).toEqual([])
  })

  it('결정 기록을 남기지 못했어도 기록이 없는 그룹(공개만 있는 쪽)에는 알림을 보내지 않는다', async () => {
    const { db, run } = setup(
      [cardItem(), cardItem({ id: ID.card3, key: 'sample', sample: true, createdResource: { sample: true }, endsAt: null }), cardItem({ id: ID.card2, key: 'gone', createdResource: { today_card_id: CARD_RES2 } })],
      { cards: [cardRow()] }
    )
    db.failIf = (call) => call.table === 'ops_decisions' && call.op === 'insert'
    await notifyReconcile(db.service, ok(await run()))

    // 실제 묶음: 공개 요약 + 취소 알림(+기록 실패 줄), 시험 묶음: 공개 요약만
    expect(posts().map(([channel, text]) => [channel, text.startsWith('[시험]')])).toEqual([
      ['report', false],
      ['alert', false],
      ['report', true],
    ])
  })

  it('글에는 고정 문장만 있고 DB 오류 원문과 자원 ID(지우지 못한 경우 외)는 없다', async () => {
    const { db, run } = setup([cardItem({ status: 'live' }), cardItem({ id: ID.card2, key: 'card2', createdResource: { today_card_id: CARD_RES2 } })])
    await notifyReconcile(db.service, ok(await run()))

    const all = posts().map(([, text]) => text).join('\n')
    expect(all).not.toContain(DB_SECRET)
    expect(all).not.toContain(CARD_RES)
    expect(all).not.toContain(CARD_RES2)
  })
})
