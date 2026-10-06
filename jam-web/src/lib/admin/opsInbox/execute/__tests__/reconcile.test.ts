/**
 * 상태 맞추기 엔진 (티켓 20261002_1813, 상위 20260930_1500 ⑦-a). 가정 1~6은 티켓 「착수 전에 정한 것」 번호다.
 * 카드와 미션(티켓 20261002_1944, ⑥)은 실제 핸들러와 메모리 DB(`fakeDb.ts`)로, 오류·경합은 가짜 핸들러로 지킨다.
 *
 * - 판정(`planReconcile`, 가정 2·3·4): §8.6 표의 행마다, 시험 묶음(§8.8), 같은 차이는 한 번, 이미 `fail`, 읽기 결과가 없는 항목
 * - 실행(`reconcileOpsItems`, 가정 5): 조건부 상태 변경·결정 기록(행위자·`batch_id`)·멈춘 준비중 `undo`·동시 두 회차·오류 건너뜀
 * - 슬랙(`notifyReconcile`, 가정 6): 요약·알림·시험 묶음 따로·바뀐 것이 없으면 안 보냄·`slack_result`
 * - 미션(⑥): 실제 미션 핸들러의 공개·종료·밖에서 지워짐·숨김·노출일 판정, 멈춘 준비중 카드·미션은 카드부터 지운다(가정 4)
 * - 레시피(⑧-a, 티켓 20261002_2221): 실제 레시피 핸들러의 공개·종료(종료 시각 그 순간부터)·밖에서 지워짐·시각 차이 external_change, 멈춘 준비중 레시피 undo
 * - 드랍 예약(⑧-b, 티켓 20261002_2306): 실제 드랍 핸들러의 놓음 → 기록 없이 종료, 놓침·건너뜀·실패 → fail과 사유, 밖에서 취소·지워짐 → cancel, 실행 중·멈춤은 그대로,
 *   예정 시각 차이 external_change, 멈춘 준비중 드랍 예약 undo
 * - JAM! 배지(⑨-a, 티켓 20261004_1756): 실제 배지 핸들러의 공개·종료(양 끝 포함)·밖에서 지워짐·소프트 삭제·시각 차이 external_change, 멈춘 준비중 배지 undo(참조 확인),
 *   카드·미션·배지가 함께 멈추면 카드 → 미션 → 배지 순으로 지운다
 * - 컬렉션(⑩-a, 티켓 20261004_2039): 실제 컬렉션 핸들러의 공개(공개 시각이 비어도 공개)·종료·밖에서 지워짐·밖에서 비활성(기록만, 상태 유지)·시각 차이 external_change, 멈춘 준비중 컬렉션 undo(참조 확인),
 *   카드·컬렉션·보상 배지가 함께 멈추면 카드 → 컬렉션 → 배지 순으로 지운다
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
const ID = { card: uid(1), card2: uid(2), card3: uid(3), mission: uid(4), drop: uid(5), recipe: uid(6), badge: uid(7) }
const CARD_RES = uid(11)
const CARD_RES2 = uid(12)
const CARD_RES3 = uid(13)
const MISSION_RES = uid(14)
const RECIPE_RES = uid(15)
const DROP_RES = uid(16)
const BADGE_RES = uid(17)
const BOOK_RES = uid(18)

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

/** 상시 미션 항목(종료 시각 없음). 공개 시각은 `STARTS`다. */
const missionItem = (extra: SpecInBundle = {}): SpecInBundle => ({
  id: ID.mission,
  key: 'mission',
  kind: 'mission',
  status: 'scheduled',
  startsAt: STARTS,
  endsAt: null,
  createdResource: { mission_id: MISSION_RES },
  ...extra,
})

const missionRow = (extra: Row = {}): Row => ({ id: MISSION_RES, starts_at: STARTS, ends_at: null, exposure_mode: 'start_date', exposure_at: null, ...extra })
const MISSION_LABEL = '미션 · 10/5(월) 09:00'

/** 상시 레시피 항목(종료 시각 없음). 공개 시각은 `STARTS`다. */
const recipeItem = (extra: SpecInBundle = {}): SpecInBundle => ({
  id: ID.recipe,
  key: 'recipe',
  kind: 'recipe',
  status: 'scheduled',
  startsAt: STARTS,
  endsAt: null,
  createdResource: { recipe_id: RECIPE_RES },
  ...extra,
})

const recipeRow = (extra: Row = {}): Row => ({ id: RECIPE_RES, valid_from: STARTS, valid_until: null, ...extra })
const RECIPE_LABEL = '믹스 레시피 · 10/5(월) 09:00'

/** 드랍 예약 항목(종료 시각 없음). 예정 시각은 `STARTS`다. */
const dropItem = (extra: SpecInBundle = {}): SpecInBundle => ({
  id: ID.drop,
  key: 'drop',
  kind: 'drop_schedule',
  status: 'scheduled',
  startsAt: STARTS,
  endsAt: null,
  createdResource: { ambient_drop_schedule_id: DROP_RES },
  ...extra,
})

/** 예약 행. 예정 시각은 `STARTS`(지금보다 3시간 전)다. 기본은 아직 `scheduled`다(놓침으로 읽히는 건 3시간을 넘긴 뒤부터). */
const dropRow = (extra: Row = {}): Row => ({
  id: DROP_RES,
  status: 'scheduled',
  scheduled_at: STARTS,
  claimed_at: null,
  finished_at: null,
  canceled_at: null,
  ...extra,
})
const DROP_LABEL = '드랍 일정 · 10/5(월) 09:00'

/** 상시 JAM! 배지 항목(종료 시각 없음). 공개 시각은 `STARTS`다. */
const badgeItem = (extra: SpecInBundle = {}): SpecInBundle => ({
  id: ID.badge,
  key: 'badge',
  kind: 'jam_badge',
  status: 'scheduled',
  startsAt: STARTS,
  endsAt: null,
  createdResource: { badge_id: BADGE_RES },
  ...extra,
})

const badgeRow = (extra: Row = {}): Row => ({ id: BADGE_RES, valid_from: STARTS, valid_until: null, deleted_at: null, ...extra })
const BADGE_LABEL = 'JAM! 배지 · 10/5(월) 09:00'

/** 상시 컬렉션 항목(종료 시각 없음). 공개 시각은 `STARTS`다. */
const bookItem = (extra: SpecInBundle = {}): SpecInBundle => ({
  id: uid(8),
  key: 'collection',
  kind: 'collection_launch',
  status: 'scheduled',
  startsAt: STARTS,
  endsAt: null,
  createdResource: { item_book_id: BOOK_RES },
  ...extra,
})
const BOOK_ITEM_ID = uid(8)

const bookRow = (extra: Row = {}): Row => ({ id: BOOK_RES, is_active: true, valid_from: STARTS, valid_until: null, ...extra })
const BOOK_LABEL = '컬렉션 런칭 · 10/5(월) 09:00'

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
  missions?: Row[]
  recipes?: Row[]
  drops?: Row[]
  badges?: Row[]
  books?: Row[]
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
  db.tables.missions = options.missions ?? []
  db.tables.combination_recipes = options.recipes ?? []
  db.tables.ambient_drop_schedules = options.drops ?? []
  db.tables.badges = options.badges ?? []
  db.tables.item_books = options.books ?? []
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

describe('실행 — 미션의 상태 전이 (티켓 20261002_1944, 실제 미션 핸들러)', () => {
  it('예약됨 미션이 공개 중이면 게재중으로 옮기고 결정 기록은 없다', async () => {
    const { db, run } = setup([missionItem()], { missions: [missionRow()] })
    const result = ok(await run())

    expect(statusOf(db, ID.mission)).toBe('live')
    expect(db.decisions()).toEqual([])
    expect(result.published[0]).toMatchObject({ itemId: ID.mission, itemLabel: MISSION_LABEL, isSample: false, action: null, reason: null })
    expect(countsOf(result)).toEqual([1, 0, 0, 0, 0, 0])
    expect(db.calls.filter((call) => call.table === 'missions' && call.op !== 'select')).toEqual([])
  })

  it('공개 시각 전이면 아무것도 바꾸지 않는다', async () => {
    const { db, run } = setup([missionItem({ startsAt: LATER })], { missions: [missionRow({ starts_at: LATER })] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(nonSelect(db)).toEqual([])
  })

  it('상시 미션(종료 시각 없음)은 종료되지 않고 밖에서 바뀐 것도 아니다', async () => {
    const { db, run } = setup([missionItem({ status: 'live' })], { missions: [missionRow()] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(statusOf(db, ID.mission)).toBe('live')
    expect(db.decisions()).toEqual([])
  })

  it('게재중 미션의 종료 시각이 지났으면 종료한다. 결정 기록은 없다', async () => {
    const { db, run } = setup([missionItem({ status: 'live', endsAt: at(-1) })], { missions: [missionRow({ ends_at: at(-1) })] })
    const result = ok(await run())

    expect(statusOf(db, ID.mission)).toBe('ended')
    expect(db.decisions()).toEqual([])
    expect(result.ended[0]).toMatchObject({ itemId: ID.mission, action: null })
  })

  it('예약됨 미션이 밖에서 지워졌으면 취소하고 cancel을, 게재중 미션이면 종료하고 end를 남긴다', async () => {
    const scheduled = setup([missionItem()])
    const cancelled = ok(await scheduled.run())
    expect(statusOf(scheduled.db, ID.mission)).toBe('cancelled')
    expect(scheduled.db.decisions()[0]).toMatchObject({ item_id: ID.mission, action: 'cancel', actor: ACTOR, reason: OUTSIDE, batch_id: cancelled.batchId })

    const live = setup([missionItem({ status: 'live' })])
    ok(await live.run())
    expect(statusOf(live.db, ID.mission)).toBe('ended')
    expect(live.db.decisions()[0]).toMatchObject({ item_id: ID.mission, action: 'end', reason: OUTSIDE })
  })

  it('운영툴 밖에서 숨김이 된 미션은 상태를 두고 is_active 전후를 기록만 한다. 예약됨에 남는다', async () => {
    const { db, run } = setup([missionItem()], { missions: [missionRow({ exposure_mode: 'hidden' })] })
    const result = ok(await run())

    expect(statusOf(db, ID.mission)).toBe('scheduled')
    expect(db.decisions()).toHaveLength(1)
    expect(db.decisions()[0]).toMatchObject({ item_id: ID.mission, action: 'external_change', actor: ACTOR, diff: { is_active: { item: true, resource: false } } })
    expect(result.externalChanged).toHaveLength(1)
    expect(db.itemWrites()).toEqual([])
    // 같은 차이는 다시 남기지 않는다
    ok(await run())
    expect(db.decisions()).toHaveLength(1)
  })

  it('밖에서 노출일 지정으로 바뀌면 공개 시각은 노출일이다: 노출일 전이면 게재중이 되지 않고 시각 차이를 기록한다', async () => {
    const { db, run } = setup([missionItem()], { missions: [missionRow({ exposure_mode: 'scheduled', exposure_at: LATER })] })
    const result = ok(await run())

    expect(statusOf(db, ID.mission)).toBe('scheduled')
    expect(db.decisions()[0]).toMatchObject({ action: 'external_change', diff: { starts_at: { item: STARTS, resource: LATER } } })
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 1, 0])
  })

  it('밖에서 종료 시각이 정해지면 상태는 그대로 두고 ends_at 차이를 기록한다(항목은 상시)', async () => {
    const { db, run } = setup([missionItem({ status: 'live' })], { missions: [missionRow({ ends_at: FUTURE_ENDS })] })
    const result = ok(await run())

    expect(statusOf(db, ID.mission)).toBe('live')
    expect(db.decisions()[0]).toMatchObject({ action: 'external_change', diff: { ends_at: { item: null, resource: FUTURE_ENDS } } })
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 1, 0])
  })

  it('미션 시각을 읽을 수 없으면 그 항목만 건너뛰고 상태를 바꾸지 않는다', async () => {
    const { db, run } = setup([missionItem()], { missions: [missionRow({ ends_at: 'not-a-date' })] })
    const result = ok(await run())

    expect(result.errors).toBe(1)
    expect(statusOf(db, ID.mission)).toBe('scheduled')
    expect(nonSelect(db)).toEqual([])
  })
})

describe('실행 — 멈춘 준비중 카드·미션은 카드부터 지운다 (티켓 20261002_1944 가정 4)', () => {
  const stuck = (extra: SpecInBundle = {}): SpecInBundle => ({ status: 'preparing', updatedAt: at(-11 * MINUTE), ...extra })
  /** 제출 순서는 미션이 앞이다: 순서를 맞추지 않으면 미션을 먼저 지우려다 카드의 mission_id 참조에 걸린다. */
  const pair = (): SpecInBundle[] => [missionItem(stuck({ position: 1 })), cardItem(stuck({ position: 2, links: ['mission'] }))]
  const seed = (db: FakeDb) => {
    db.tables.missions = [missionRow({ starts_at: LATER }), missionRow({ id: uid(98) })]
    db.tables.today_cards = [cardRow({ starts_at: LATER, ends_at: FUTURE_ENDS, mission_id: MISSION_RES }), cardRow({ id: CARD_RES2 })]
  }

  it('카드와 미션이 함께 멈추면 카드를 먼저 지워 미션도 남기지 않는다', async () => {
    const { db, run } = setup(pair())
    seed(db)
    const result = ok(await run())

    expect(statusOf(db, ID.card)).toBe('failed')
    expect(statusOf(db, ID.mission)).toBe('failed')
    expect((db.tables.today_cards as Row[]).map((row) => row.id)).toEqual([CARD_RES2])
    expect((db.tables.missions as Row[]).map((row) => row.id)).toEqual([uid(98)])
    const order = db.calls.map((call) => `${call.table}:${call.op}`)
    expect(order.indexOf('today_cards:delete')).toBeLessThan(order.indexOf('missions:delete'))
    // 남은 자원이 없으니 사유에 「만든 자원이 남아 있어요」가 붙지 않는다
    expect(result.failed.map((change) => [change.itemId, change.reason, change.resourceId])).toEqual([
      [ID.card, STALLED, null],
      [ID.mission, STALLED, null],
    ])
    expect(db.decisions('fail').map((row) => row.item_id)).toEqual([ID.card, ID.mission])
  })

  it('제출 순서와 상관없이 같다(카드가 앞이어도 카드가 먼저다)', async () => {
    const { db, run } = setup([cardItem(stuck({ position: 1, links: ['mission'] })), missionItem(stuck({ position: 2 }))])
    seed(db)
    const result = ok(await run())

    expect(idsOf(result.failed)).toEqual([ID.card, ID.mission])
    expect((db.tables.missions as Row[]).map((row) => row.id)).toEqual([uid(98)])
  })

  it('자원을 지우지 않는 전이는 제자리에 둔다: 다른 전이의 결과 순서가 바뀌지 않는다', async () => {
    const stuckCard = uid(6)
    const { db, run } = setup([
      cardItem({ id: ID.card2, key: 'card2', createdResource: { today_card_id: CARD_RES2 } }), // 공개 → 게재중
      missionItem(stuck({ position: 1 })),
      cardItem(stuck({ id: stuckCard, key: 'card-stuck', position: 2, createdResource: { today_card_id: CARD_RES } })),
    ])
    db.tables.missions = [missionRow({ starts_at: LATER })]
    db.tables.today_cards = [cardRow({ id: CARD_RES2 }), cardRow({ starts_at: LATER, ends_at: FUTURE_ENDS })]
    const result = ok(await run())

    expect(idsOf(result.published)).toEqual([ID.card2])
    expect(idsOf(result.failed)).toEqual([stuckCard, ID.mission])
    expect(db.tables.missions).toEqual([])
  })

  it('카드가 이미 지워져 있어도(밖에서 또는 앞서) 미션은 지워진다', async () => {
    const { db, run } = setup(pair())
    db.tables.missions = [missionRow({ starts_at: LATER })]
    db.tables.today_cards = []
    ok(await run())

    expect(db.tables.missions).toEqual([])
    expect(statusOf(db, ID.mission)).toBe('failed')
  })

  it('운영툴 밖의 카드가 미션을 가리키면 미션은 지우지 못하고 자원 ID와 함께 실패로 닫는다', async () => {
    const { db, run } = setup([missionItem(stuck())])
    db.tables.missions = [missionRow({ starts_at: LATER })]
    db.tables.today_cards = [cardRow({ id: uid(60), mission_id: MISSION_RES })]
    const result = ok(await run())

    expect(statusOf(db, ID.mission)).toBe('failed')
    expect(db.tables.missions).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ reason: `${STALLED}. ${REMAINS}`, resourceId: MISSION_RES })
    expect(JSON.stringify([result, db.decisions()])).not.toContain('today_cards')
    expect(logged()).toContain('today_cards')
  })
})

describe('실행 — 레시피의 상태 전이 (티켓 20261002_2221, 실제 레시피 핸들러)', () => {
  const recipeWrites = (db: FakeDb) => db.calls.filter((call) => call.table.startsWith('combination_recipe') && call.op !== 'select')

  it('예약됨 레시피가 공개 중이면 게재중으로 옮기고 결정 기록은 없다. 레시피 표에는 쓰지 않는다', async () => {
    const { db, run } = setup([recipeItem()], { recipes: [recipeRow()] })
    const result = ok(await run())

    expect(statusOf(db, ID.recipe)).toBe('live')
    expect(db.decisions()).toEqual([])
    expect(result.published[0]).toMatchObject({ itemId: ID.recipe, itemLabel: RECIPE_LABEL, isSample: false, action: null, reason: null })
    expect(countsOf(result)).toEqual([1, 0, 0, 0, 0, 0])
    expect(recipeWrites(db)).toEqual([])
  })

  it('공개 시각 전이면 아무것도 바꾸지 않는다', async () => {
    const { db, run } = setup([recipeItem({ startsAt: LATER })], { recipes: [recipeRow({ valid_from: LATER })] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(nonSelect(db)).toEqual([])
  })

  it('공개 시각이 정확히 지금이면 게재중이다', async () => {
    const { db, run } = setup([recipeItem({ startsAt: NOW.toISOString() })], { recipes: [recipeRow({ valid_from: NOW.toISOString() })] })
    ok(await run())

    expect(statusOf(db, ID.recipe)).toBe('live')
  })

  it('상시 레시피(종료 시각 없음)는 종료되지 않고 밖에서 바뀐 것도 아니다', async () => {
    const { db, run } = setup([recipeItem({ status: 'live' })], { recipes: [recipeRow()] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(statusOf(db, ID.recipe)).toBe('live')
    expect(db.decisions()).toEqual([])
  })

  it('게재중 레시피의 종료 시각이 지났으면 종료한다. 결정 기록은 없다', async () => {
    const { db, run } = setup([recipeItem({ status: 'live', endsAt: at(-1) })], { recipes: [recipeRow({ valid_until: at(-1) })] })
    const result = ok(await run())

    expect(statusOf(db, ID.recipe)).toBe('ended')
    expect(db.decisions()).toEqual([])
    expect(result.ended[0]).toMatchObject({ itemId: ID.recipe, action: null })
  })

  it('레시피는 종료 시각 그 순간부터 끝이다(미션·카드와 달리 정확히 지금이어도 종료다)', async () => {
    const { db, run } = setup([recipeItem({ status: 'live', endsAt: NOW.toISOString() })], { recipes: [recipeRow({ valid_until: NOW.toISOString() })] })
    ok(await run())

    expect(statusOf(db, ID.recipe)).toBe('ended')
  })

  it('예약됨 레시피가 밖에서 지워졌으면 취소하고 cancel을, 게재중 레시피면 종료하고 end를 남긴다', async () => {
    const scheduled = setup([recipeItem()])
    const cancelled = ok(await scheduled.run())
    expect(statusOf(scheduled.db, ID.recipe)).toBe('cancelled')
    expect(scheduled.db.decisions()[0]).toMatchObject({ item_id: ID.recipe, action: 'cancel', actor: ACTOR, reason: OUTSIDE, batch_id: cancelled.batchId })

    const live = setup([recipeItem({ status: 'live' })])
    ok(await live.run())
    expect(statusOf(live.db, ID.recipe)).toBe('ended')
    expect(live.db.decisions()[0]).toMatchObject({ item_id: ID.recipe, action: 'end', reason: OUTSIDE })
  })

  it('밖에서 종료 시각이 정해지면 상태는 그대로 두고 ends_at 차이를 기록한다(항목은 상시). 같은 차이는 다시 남기지 않는다', async () => {
    const { db, run } = setup([recipeItem({ status: 'live' })], { recipes: [recipeRow({ valid_until: FUTURE_ENDS })] })
    const result = ok(await run())

    expect(statusOf(db, ID.recipe)).toBe('live')
    expect(db.decisions()[0]).toMatchObject({ action: 'external_change', diff: { ends_at: { item: null, resource: FUTURE_ENDS } } })
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 1, 0])
    ok(await run())
    expect(db.decisions()).toHaveLength(1)
  })

  it('밖에서 공개 시각이 바뀌면 상태는 레시피의 공개 판정을 따르고 starts_at 차이를 기록한다', async () => {
    const { db, run } = setup([recipeItem()], { recipes: [recipeRow({ valid_from: LATER })] })
    const result = ok(await run())

    expect(statusOf(db, ID.recipe)).toBe('scheduled')
    expect(db.decisions()[0]).toMatchObject({ action: 'external_change', diff: { starts_at: { item: STARTS, resource: LATER } } })
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 1, 0])
  })

  it('레시피에는 비활성 칸이 없어 is_active 차이는 만들지 않는다', async () => {
    const { db, run } = setup([recipeItem()], { recipes: [recipeRow()] })
    ok(await run())

    expect(db.decisions().filter((row) => row.action === 'external_change')).toEqual([])
  })

  it('레시피 시각을 읽을 수 없으면 그 항목만 건너뛰고 상태를 바꾸지 않는다', async () => {
    const { db, run } = setup([recipeItem()], { recipes: [recipeRow({ valid_until: 'not-a-date' })] })
    const result = ok(await run())

    expect(result.errors).toBe(1)
    expect(statusOf(db, ID.recipe)).toBe('scheduled')
    expect(nonSelect(db)).toEqual([])
  })

  describe('멈춘 준비중 레시피', () => {
    const stuck = (extra: SpecInBundle = {}) => recipeItem({ status: 'preparing', updatedAt: at(-11 * MINUTE), ...extra })
    const OTHER = uid(96)

    it('10분이 지난 준비중은 실패로 닫고 만든 레시피를 지운다(슬롯도 함께). 다른 레시피는 건드리지 않고 fail을 남긴다', async () => {
      const { db, run } = setup([stuck()], { recipes: [recipeRow({ valid_from: LATER }), recipeRow({ id: OTHER })] })
      db.tables.combination_recipe_slots = [
        { id: 's1', recipe_id: RECIPE_RES },
        { id: 's2', recipe_id: OTHER },
      ]
      const result = ok(await run())

      expect(statusOf(db, ID.recipe)).toBe('failed')
      expect((db.tables.combination_recipes as Row[]).map((row) => row.id)).toEqual([OTHER])
      expect((db.tables.combination_recipe_slots as Row[]).map((row) => row.id)).toEqual(['s2'])
      expect(db.decisions()[0]).toMatchObject({ item_id: ID.recipe, action: 'fail', actor: ACTOR, reason: STALLED, batch_id: result.batchId })
      expect(result.failed[0]).toMatchObject({ itemId: ID.recipe, action: 'fail', reason: STALLED, resourceId: null })
    })

    it('공개 시각이 이미 지난 멈춘 레시피도 지운다(시각 조건 없음)', async () => {
      const { db, run } = setup([stuck({ startsAt: STARTS })], { recipes: [recipeRow()] })
      ok(await run())

      expect(statusOf(db, ID.recipe)).toBe('failed')
      expect(db.tables.combination_recipes).toEqual([])
    })

    it('만든 레시피를 가리키는 배지가 있으면 지우지 않고 사유에 덧붙이며 결과에 자원 ID를 싣는다. 배지 정보는 응답·기록에 없다', async () => {
      const { db, run } = setup([stuck()], { recipes: [recipeRow()] })
      db.tables.badges = [{ id: uid(60), deleted_at: null, condition_json: { recipe_first_success: { recipe_id: RECIPE_RES } } }]
      const result = ok(await run())

      expect(statusOf(db, ID.recipe)).toBe('failed')
      expect(db.tables.combination_recipes).toHaveLength(1)
      expect(db.decisions()[0]).toMatchObject({ action: 'fail', reason: `${STALLED}. ${REMAINS}` })
      expect(result.failed[0]).toMatchObject({ reason: `${STALLED}. ${REMAINS}`, resourceId: RECIPE_RES })
      expect(JSON.stringify([result, db.decisions()])).not.toContain(uid(60))
      expect(logged()).toContain('이 레시피를 가리키는 배지')
    })

    it('참조를 읽지 못해도 지우지 않고 실패로 닫는다. DB 오류 원문은 기록에 없다', async () => {
      const { db, run } = setup([stuck()], { recipes: [recipeRow()] })
      db.failIf = (call) => call.table === 'badges'
      const result = ok(await run())

      expect(statusOf(db, ID.recipe)).toBe('failed')
      expect(db.tables.combination_recipes).toHaveLength(1)
      expect(result.failed[0].resourceId).toBe(RECIPE_RES)
      expect(JSON.stringify([result, db.decisions()])).not.toContain(DB_SECRET)
    })
  })
})

describe('실행 — 드랍 예약의 상태 전이 (티켓 20261002_2306, 실제 드랍 핸들러)', () => {
  const dropWrites = (db: FakeDb) => db.calls.filter((call) => call.table === 'ambient_drop_schedules' && call.op !== 'select')
  const UNPLACED = (label: string) => `드랍을 놓지 못했어요(${label})`

  it('놓은 드랍(done)은 종료로 옮기고 결정 기록을 남기지 않는다. 예약 표에는 쓰지 않는다. 놓인 드랍은 그대로다', async () => {
    const { db, run } = setup([dropItem()], { drops: [dropRow({ status: 'done', finished_at: at(-2 * MINUTE) })] })
    const result = ok(await run())

    expect(statusOf(db, ID.drop)).toBe('ended')
    expect(db.decisions()).toEqual([])
    expect(result.ended[0]).toMatchObject({ itemId: ID.drop, itemLabel: DROP_LABEL, isSample: false, action: null, reason: null })
    expect(countsOf(result)).toEqual([0, 1, 0, 0, 0, 0])
    expect(dropWrites(db)).toEqual([])
  })

  it('예정 시각이 지났어도 아직 scheduled(실행기가 선점하기 전)면 그대로 둔다. 게재중으로도 넘기지 않는다', async () => {
    const { db, run } = setup([dropItem()], { drops: [dropRow()] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(statusOf(db, ID.drop)).toBe('scheduled')
    expect(nonSelect(db)).toEqual([])
  })

  it('공개 시각 전의 예약도 그대로 둔다', async () => {
    const { db, run } = setup([dropItem({ startsAt: LATER })], { drops: [dropRow({ scheduled_at: LATER })] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(nonSelect(db)).toEqual([])
  })

  it.each([
    ['실행 중', { status: 'running', claimed_at: at(-5 * MINUTE) }],
    ['멈춤(선점 뒤 30분이 지난 running)', { status: 'running', claimed_at: at(-31 * MINUTE) }],
  ])('%s인 예약은 그대로 둔다(놓기가 끝나기 전에는 바꾸지 않는다)', async (_name, extra) => {
    const { db, run } = setup([dropItem()], { drops: [dropRow(extra)] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(statusOf(db, ID.drop)).toBe('scheduled')
    expect(nonSelect(db)).toEqual([])
  })

  it.each([
    ['skipped', '건너뜀'],
    ['failed', '실패'],
    ['missed', '놓침'],
  ])('%s는 예약됨 항목을 실패로 닫고 fail과 「드랍을 놓지 못했어요(%s)」를 남긴다', async (status, label) => {
    const { db, run } = setup([dropItem()], { drops: [dropRow({ status, finished_at: at(-2 * MINUTE) })] })
    const result = ok(await run())

    expect(statusOf(db, ID.drop)).toBe('failed')
    expect(db.decisions()[0]).toMatchObject({ item_id: ID.drop, action: 'fail', actor: ACTOR, reason: UNPLACED(label), batch_id: result.batchId })
    expect(result.failed[0]).toMatchObject({ itemId: ID.drop, itemLabel: DROP_LABEL, action: 'fail', reason: UNPLACED(label) })
    expect(countsOf(result)).toEqual([0, 0, 0, 1, 0, 0])
    expect(dropWrites(db)).toEqual([])
  })

  it('cron이 아직 표시하지 못했어도 예정 시각 + 3시간이 지난 scheduled 예약은 놓침으로 읽어 실패로 닫는다', async () => {
    const { db, run } = setup([dropItem()], { drops: [dropRow({ scheduled_at: at(-3 * 60 * MINUTE - 1) })] })
    ok(await run())

    expect(statusOf(db, ID.drop)).toBe('failed')
    expect(db.decisions()[0]).toMatchObject({ action: 'fail', reason: UNPLACED('놓침') })
    expect(dropWrites(db)).toEqual([])
  })

  it('밖에서 취소된 예약은 항목을 취소로 옮기고 cancel을 남긴다. 예약이 지워졌어도 같다', async () => {
    const canceled = setup([dropItem()], { drops: [dropRow({ status: 'canceled', canceled_at: at(-MINUTE) })] })
    const first = ok(await canceled.run())
    expect(statusOf(canceled.db, ID.drop)).toBe('cancelled')
    expect(canceled.db.decisions()[0]).toMatchObject({ item_id: ID.drop, action: 'cancel', actor: ACTOR, reason: OUTSIDE, batch_id: first.batchId })
    expect(countsOf(first)).toEqual([0, 0, 1, 0, 0, 0])

    const deleted = setup([dropItem()])
    ok(await deleted.run())
    expect(statusOf(deleted.db, ID.drop)).toBe('cancelled')
    expect(deleted.db.decisions()[0]).toMatchObject({ action: 'cancel', reason: OUTSIDE })
  })

  it('밖에서 예정 시각이 바뀌면 상태는 예약의 상태를 따르고 starts_at 차이를 기록한다. 같은 차이는 다시 남기지 않는다', async () => {
    const { db, run } = setup([dropItem()], { drops: [dropRow({ scheduled_at: LATER })] })
    const result = ok(await run())

    expect(statusOf(db, ID.drop)).toBe('scheduled')
    expect(db.decisions()[0]).toMatchObject({ action: 'external_change', diff: { starts_at: { item: STARTS, resource: LATER } } })
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 1, 0])
    ok(await run())
    expect(db.decisions()).toHaveLength(1)
  })

  it('드랍에는 종료 시각과 비활성 칸이 없어 ends_at·is_active 차이는 만들지 않는다', async () => {
    const { db, run } = setup([dropItem()], { drops: [dropRow()] })
    ok(await run())

    expect(db.decisions().filter((row) => row.action === 'external_change')).toEqual([])
  })

  it('읽지 못하면 그 항목만 건너뛰고 상태를 바꾸지 않는다. DB 오류 원문은 기록에 없다', async () => {
    const { db, run } = setup([dropItem()], { drops: [dropRow({ status: 'done' })] })
    db.failIf = (call) => call.table === 'ambient_drop_schedules'
    const result = ok(await run())

    expect(result.errors).toBe(1)
    expect(statusOf(db, ID.drop)).toBe('scheduled')
    expect(nonSelect(db)).toEqual([])
    expect(JSON.stringify([result, db.decisions()])).not.toContain(DB_SECRET)
  })

  it('예정 시각을 읽을 수 없으면 그 항목만 건너뛰고 상태를 바꾸지 않는다', async () => {
    const { db, run } = setup([dropItem()], { drops: [dropRow({ status: 'done', scheduled_at: 'not-a-date' })] })
    const result = ok(await run())

    expect(result.errors).toBe(1)
    expect(statusOf(db, ID.drop)).toBe('scheduled')
    expect(nonSelect(db)).toEqual([])
  })

  describe('멈춘 준비중 드랍 예약', () => {
    const stuck = (extra: SpecInBundle = {}) => dropItem({ status: 'preparing', updatedAt: at(-11 * MINUTE), ...extra })
    const OTHER = uid(95)

    it('10분이 지난 준비중은 실패로 닫고 만든 예약을 지운다. 다른 예약은 건드리지 않고 fail을 남긴다', async () => {
      const { db, run } = setup([stuck()], { drops: [dropRow({ scheduled_at: LATER }), dropRow({ id: OTHER, scheduled_at: LATER })] })
      const result = ok(await run())

      expect(statusOf(db, ID.drop)).toBe('failed')
      expect((db.tables.ambient_drop_schedules as Row[]).map((row) => row.id)).toEqual([OTHER])
      expect(db.decisions()[0]).toMatchObject({ item_id: ID.drop, action: 'fail', actor: ACTOR, reason: STALLED, batch_id: result.batchId })
      expect(result.failed[0]).toMatchObject({ itemId: ID.drop, action: 'fail', reason: STALLED, resourceId: null })
    })

    it('예정 시각이 이미 지난 공개 전 예약도 지운다(시각 조건 없음)', async () => {
      const { db, run } = setup([stuck({ startsAt: STARTS })], { drops: [dropRow()] })
      ok(await run())

      expect(statusOf(db, ID.drop)).toBe('failed')
      expect(db.tables.ambient_drop_schedules).toEqual([])
    })

    it('이미 실행이 시작된 예약은 지우지 않고 사유에 덧붙이며 결과에 자원 ID를 싣는다. 예약 ID는 기록에 없다', async () => {
      const { db, run } = setup([stuck()], { drops: [dropRow({ status: 'running', claimed_at: at(-MINUTE) })] })
      const result = ok(await run())

      expect(statusOf(db, ID.drop)).toBe('failed')
      expect(db.tables.ambient_drop_schedules).toHaveLength(1)
      expect(db.decisions()[0]).toMatchObject({ action: 'fail', reason: `${STALLED}. ${REMAINS}` })
      expect(result.failed[0]).toMatchObject({ reason: `${STALLED}. ${REMAINS}`, resourceId: DROP_RES })
      expect(JSON.stringify(db.decisions())).not.toContain(DROP_RES)
    })

    it('지우지 못해도 실패로 닫는다. DB 오류 원문은 기록에 없다', async () => {
      const { db, run } = setup([stuck()], { drops: [dropRow()] })
      db.failIf = (call) => call.table === 'ambient_drop_schedules' && call.op === 'delete'
      const result = ok(await run())

      expect(statusOf(db, ID.drop)).toBe('failed')
      expect(db.tables.ambient_drop_schedules).toHaveLength(1)
      expect(result.failed[0].resourceId).toBe(DROP_RES)
      expect(JSON.stringify([result, db.decisions()])).not.toContain(DB_SECRET)
    })
  })
})

describe('실행 — JAM! 배지의 상태 전이 (티켓 20261004_1756, 실제 배지 핸들러)', () => {
  const badgeWrites = (db: FakeDb) => db.calls.filter((call) => call.table === 'badges' && call.op !== 'select')

  it('예약됨 배지가 공개 중이면 게재중으로 옮기고 결정 기록은 없다. badges 표에는 쓰지 않는다', async () => {
    const { db, run } = setup([badgeItem()], { badges: [badgeRow()] })
    const result = ok(await run())

    expect(statusOf(db, ID.badge)).toBe('live')
    expect(db.decisions()).toEqual([])
    expect(result.published[0]).toMatchObject({ itemId: ID.badge, itemLabel: BADGE_LABEL, isSample: false, action: null, reason: null })
    expect(countsOf(result)).toEqual([1, 0, 0, 0, 0, 0])
    expect(badgeWrites(db)).toEqual([])
  })

  it('공개 시각 전이면 아무것도 바꾸지 않는다', async () => {
    const { db, run } = setup([badgeItem({ startsAt: LATER })], { badges: [badgeRow({ valid_from: LATER })] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(nonSelect(db)).toEqual([])
  })

  it('공개 시각이 정확히 지금이면 게재중이다(양 끝 포함)', async () => {
    const { db, run } = setup([badgeItem({ startsAt: NOW.toISOString() })], { badges: [badgeRow({ valid_from: NOW.toISOString() })] })
    ok(await run())

    expect(statusOf(db, ID.badge)).toBe('live')
  })

  it('상시 배지(종료 시각 없음)는 종료되지 않고 밖에서 바뀐 것도 아니다', async () => {
    const { db, run } = setup([badgeItem({ status: 'live' })], { badges: [badgeRow()] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(statusOf(db, ID.badge)).toBe('live')
    expect(db.decisions()).toEqual([])
  })

  it('게재중 배지의 종료 시각이 지났으면 종료한다. 결정 기록은 없다', async () => {
    const { db, run } = setup([badgeItem({ status: 'live', endsAt: at(-1) })], { badges: [badgeRow({ valid_until: at(-1) })] })
    const result = ok(await run())

    expect(statusOf(db, ID.badge)).toBe('ended')
    expect(db.decisions()).toEqual([])
    expect(result.ended[0]).toMatchObject({ itemId: ID.badge, action: null })
  })

  it('종료 시각이 정확히 지금이면 아직 게재중이다(양 끝 포함: 발급 엔진과 같다)', async () => {
    const { db, run } = setup([badgeItem({ status: 'live', endsAt: NOW.toISOString() })], { badges: [badgeRow({ valid_until: NOW.toISOString() })] })
    const result = ok(await run())

    expect(statusOf(db, ID.badge)).toBe('live')
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('예약됨인데 공개·종료 시각이 모두 지난 늦은 회차는 게재중을 거치지 않고 곧바로 종료한다. 결정 기록은 없다', async () => {
    const { db, run } = setup([badgeItem({ endsAt: at(-1) })], { badges: [badgeRow({ valid_until: at(-1) })] })
    const result = ok(await run())

    expect(statusOf(db, ID.badge)).toBe('ended')
    expect(db.decisions()).toEqual([])
    expect(countsOf(result)).toEqual([0, 1, 0, 0, 0, 0])
  })

  it('예약됨 배지가 밖에서 지워졌으면 취소하고 cancel을, 게재중 배지면 종료하고 end를 남긴다', async () => {
    const scheduled = setup([badgeItem()])
    const cancelled = ok(await scheduled.run())
    expect(statusOf(scheduled.db, ID.badge)).toBe('cancelled')
    expect(scheduled.db.decisions()[0]).toMatchObject({ item_id: ID.badge, action: 'cancel', actor: ACTOR, reason: OUTSIDE, batch_id: cancelled.batchId })

    const live = setup([badgeItem({ status: 'live' })])
    ok(await live.run())
    expect(statusOf(live.db, ID.badge)).toBe('ended')
    expect(live.db.decisions()[0]).toMatchObject({ item_id: ID.badge, action: 'end', reason: OUTSIDE })
  })

  it('소프트 삭제된 배지도 밖에서 지워진 것으로 본다(예약됨 → 취소, 게재중 → 종료)', async () => {
    const deleted = { deleted_at: '2026-10-05T01:00:00.000Z' }
    const scheduled = setup([badgeItem()], { badges: [badgeRow(deleted)] })
    ok(await scheduled.run())
    expect(statusOf(scheduled.db, ID.badge)).toBe('cancelled')
    expect(scheduled.db.decisions()[0]).toMatchObject({ action: 'cancel', reason: OUTSIDE })

    const live = setup([badgeItem({ status: 'live' })], { badges: [badgeRow(deleted)] })
    ok(await live.run())
    expect(statusOf(live.db, ID.badge)).toBe('ended')
    expect(live.db.decisions()[0]).toMatchObject({ action: 'end', reason: OUTSIDE })
  })

  it('밖에서 공개 시각이 바뀌면 상태는 그대로 두고 시각 차이를 external_change로 한 번만 기록한다', async () => {
    const { db, run } = setup([badgeItem()], { badges: [badgeRow({ valid_from: LATER })] })
    const result = ok(await run())

    expect(statusOf(db, ID.badge)).toBe('scheduled')
    expect(db.decisions()[0]).toMatchObject({ item_id: ID.badge, action: 'external_change', actor: ACTOR, diff: { starts_at: { item: STARTS, resource: LATER } } })
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 1, 0])
    ok(await run())
    expect(db.decisions()).toHaveLength(1)
  })

  it('밖에서 종료 시각이 정해지면 상태는 그대로 두고 ends_at 차이를 기록한다(항목은 상시)', async () => {
    const { db, run } = setup([badgeItem({ status: 'live' })], { badges: [badgeRow({ valid_until: FUTURE_ENDS })] })
    const result = ok(await run())

    expect(statusOf(db, ID.badge)).toBe('live')
    expect(db.decisions()[0]).toMatchObject({ action: 'external_change', diff: { ends_at: { item: null, resource: FUTURE_ENDS } } })
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 1, 0])
  })

  it.each([
    ['공개 시각이 비었다', { valid_from: null }],
    ['종료 시각을 읽을 수 없다', { valid_until: 'not-a-date' }],
  ])('%s: 그 항목만 건너뛰고 상태를 바꾸지 않는다', async (_label, row) => {
    const { db, run } = setup([badgeItem()], { badges: [badgeRow(row)] })
    const result = ok(await run())

    expect(result.errors).toBe(1)
    expect(statusOf(db, ID.badge)).toBe('scheduled')
    expect(nonSelect(db)).toEqual([])
  })

  describe('멈춘 준비중 배지', () => {
    const stuck = (extra: SpecInBundle = {}): SpecInBundle => ({ status: 'preparing', updatedAt: at(-11 * MINUTE), ...extra })

    it('핸들러 undo가 참조를 확인한 뒤 지우고 실패(fail)로 닫는다', async () => {
      const { db, run } = setup([badgeItem(stuck())], { badges: [badgeRow({ valid_from: LATER }), badgeRow({ id: uid(98) })] })
      const result = ok(await run())

      expect(statusOf(db, ID.badge)).toBe('failed')
      expect((db.tables.badges as Row[]).map((row) => row.id)).toEqual([uid(98)])
      expect(db.decisions('fail')[0]).toMatchObject({ item_id: ID.badge, reason: STALLED })
      expect(result.failed[0]).toMatchObject({ itemId: ID.badge, reason: STALLED, resourceId: null })
      // 자원을 지웠으니 항목 ID 기준 이미지 파일도 정리한다(티켓 20261006_1801).
      expect(db.removedFiles).toEqual([{ bucket: 'images', paths: [`ops-inbox/badges/${ID.badge}.png`, `ops-inbox/badges/${ID.badge}.webp`] }])
      const order = db.calls.map((call) => `${call.table}:${call.op}`)
      expect(order.indexOf('user_activity_badges:select')).toBeLessThan(order.lastIndexOf('badges:delete'))
    })

    it('획득 기록이 붙어 지우지 못하면 자원은 남기고 사유에 「만든 자원이 남아 있어요」를 덧붙인다. 테이블 이름은 응답·기록에 없다', async () => {
      const { db, run } = setup([badgeItem(stuck())], { badges: [badgeRow({ valid_from: LATER })] })
      db.tables.user_activity_badges = [{ id: 'u-1', badge_id: BADGE_RES }]
      const result = ok(await run())

      expect(statusOf(db, ID.badge)).toBe('failed')
      expect(db.tables.badges).toHaveLength(1)
      expect(result.failed[0]).toMatchObject({ reason: `${STALLED}. ${REMAINS}`, resourceId: BADGE_RES })
      expect(JSON.stringify([result, db.decisions()])).not.toContain('user_activity_badges')
      expect(logged()).toContain('user_activity_badges')
      expect(db.removedFiles).toEqual([]) // 자원이 남았으니 파일도 남긴다
    })

    it('카드·미션·배지가 함께 멈추면 카드 → 미션 → 배지 순으로 지운다(배지를 먼저 지우려면 가리키는 쪽이 남아 참조에 걸린다)', async () => {
      // 제출 순서는 배지가 앞이다(생성 순서의 정반대로 지워야 한다).
      const { db, run } = setup([
        badgeItem(stuck({ position: 1 })),
        missionItem(stuck({ position: 2, links: ['badge'] })),
        cardItem(stuck({ position: 3, links: ['badge'] })),
      ])
      db.tables.badges = [badgeRow({ valid_from: LATER }), badgeRow({ id: uid(98) })]
      db.tables.missions = [missionRow({ starts_at: LATER, reward_badge_ids: [BADGE_RES] })]
      db.tables.today_cards = [cardRow({ starts_at: LATER, ends_at: FUTURE_ENDS, badge_ids: [BADGE_RES] })]
      const result = ok(await run())

      expect(idsOf(result.failed)).toEqual([ID.card, ID.mission, ID.badge])
      expect(db.tables.today_cards).toEqual([])
      expect(db.tables.missions).toEqual([])
      expect((db.tables.badges as Row[]).map((row) => row.id)).toEqual([uid(98)])
      const order = db.calls.map((call) => `${call.table}:${call.op}`)
      expect(order.indexOf('today_cards:delete')).toBeLessThan(order.indexOf('missions:delete'))
      expect(order.indexOf('missions:delete')).toBeLessThan(order.indexOf('badges:delete'))
      for (const failed of result.failed) expect(failed.reason).toBe(STALLED)
    })
  })

  it('시험 묶음의 배지는 badges를 읽지 않고 항목의 시각만 본다', async () => {
    const { db, run } = setup([badgeItem({ sample: true, createdResource: { sample: true } })])
    const result = ok(await run())

    expect(statusOf(db, ID.badge)).toBe('live')
    expect(countsOf(result)).toEqual([1, 0, 0, 0, 0, 0])
    expect(db.calls.some((call) => call.table === 'badges')).toBe(false)
  })
})

describe('실행 — 컬렉션의 상태 전이 (티켓 20261004_2039, 실제 컬렉션 핸들러)', () => {
  const bookWrites = (db: FakeDb) => db.calls.filter((call) => call.table === 'item_books' && call.op !== 'select')

  it('예약됨 컬렉션이 공개 중이면 게재중으로 옮기고 결정 기록은 없다. item_books 표에는 쓰지 않는다', async () => {
    const { db, run } = setup([bookItem()], { books: [bookRow()] })
    const result = ok(await run())

    expect(statusOf(db, BOOK_ITEM_ID)).toBe('live')
    expect(db.decisions()).toEqual([])
    expect(result.published[0]).toMatchObject({ itemId: BOOK_ITEM_ID, itemLabel: BOOK_LABEL, isSample: false, action: null, reason: null })
    expect(countsOf(result)).toEqual([1, 0, 0, 0, 0, 0])
    expect(bookWrites(db)).toEqual([])
  })

  it('공개 시각 전이면 아무것도 바꾸지 않는다', async () => {
    const { db, run } = setup([bookItem({ startsAt: LATER })], { books: [bookRow({ valid_from: LATER })] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(nonSelect(db)).toEqual([])
  })

  it('공개 시각이 정확히 지금이면 게재중이다(양 끝 포함)', async () => {
    const { db, run } = setup([bookItem({ startsAt: NOW.toISOString() })], { books: [bookRow({ valid_from: NOW.toISOString() })] })
    ok(await run())

    expect(statusOf(db, BOOK_ITEM_ID)).toBe('live')
  })

  it('상시 컬렉션(종료 시각 없음)은 종료되지 않고 밖에서 바뀐 것도 아니다', async () => {
    const { db, run } = setup([bookItem({ status: 'live' })], { books: [bookRow()] })
    const result = ok(await run())

    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    expect(statusOf(db, BOOK_ITEM_ID)).toBe('live')
    expect(db.decisions()).toEqual([])
  })

  it('게재중 컬렉션의 종료 시각이 지났으면 종료한다. 결정 기록은 없다', async () => {
    const { db, run } = setup([bookItem({ status: 'live', endsAt: at(-1) })], { books: [bookRow({ valid_until: at(-1) })] })
    const result = ok(await run())

    expect(statusOf(db, BOOK_ITEM_ID)).toBe('ended')
    expect(db.decisions()).toEqual([])
    expect(result.ended[0]).toMatchObject({ itemId: BOOK_ITEM_ID, action: null })
  })

  it('종료 시각이 정확히 지금이면 아직 게재중이다(양 끝 포함)', async () => {
    const { db, run } = setup([bookItem({ status: 'live', endsAt: NOW.toISOString() })], { books: [bookRow({ valid_until: NOW.toISOString() })] })
    const result = ok(await run())

    expect(statusOf(db, BOOK_ITEM_ID)).toBe('live')
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('예약됨인데 공개·종료 시각이 모두 지난 늦은 회차는 게재중을 거치지 않고 곧바로 종료한다. 결정 기록은 없다', async () => {
    const { db, run } = setup([bookItem({ endsAt: at(-1) })], { books: [bookRow({ valid_until: at(-1) })] })
    const result = ok(await run())

    expect(statusOf(db, BOOK_ITEM_ID)).toBe('ended')
    expect(db.decisions()).toEqual([])
    expect(countsOf(result)).toEqual([0, 1, 0, 0, 0, 0])
  })

  it('밖에서 공개 시각이 비워지면(바로 공개) 공개 중으로 읽고 항목과 시각 차이를 external_change로 기록한다', async () => {
    const { db, run } = setup([bookItem()], { books: [bookRow({ valid_from: null })] })
    const result = ok(await run())

    expect(statusOf(db, BOOK_ITEM_ID)).toBe('live')
    expect(db.decisions()[0]).toMatchObject({ item_id: BOOK_ITEM_ID, action: 'external_change', diff: { starts_at: { item: STARTS, resource: null } } })
    expect(countsOf(result)).toEqual([1, 0, 0, 0, 1, 0])
  })

  it('예약됨 컬렉션이 밖에서 지워졌으면 취소하고 cancel을, 게재중 컬렉션이면 종료하고 end를 남긴다', async () => {
    const scheduled = setup([bookItem()])
    const cancelled = ok(await scheduled.run())
    expect(statusOf(scheduled.db, BOOK_ITEM_ID)).toBe('cancelled')
    expect(scheduled.db.decisions()[0]).toMatchObject({ item_id: BOOK_ITEM_ID, action: 'cancel', actor: ACTOR, reason: OUTSIDE, batch_id: cancelled.batchId })

    const live = setup([bookItem({ status: 'live' })])
    ok(await live.run())
    expect(statusOf(live.db, BOOK_ITEM_ID)).toBe('ended')
    expect(live.db.decisions()[0]).toMatchObject({ item_id: BOOK_ITEM_ID, action: 'end', reason: OUTSIDE })
  })

  it('밖에서 비활성이 되면 상태는 그대로 두고 is_active 차이를 external_change로 한 번만 기록한다(⑦-a 사용자 결정: 밖에서 숨겨도 기록만)', async () => {
    const scheduled = setup([bookItem({ startsAt: LATER })], { books: [bookRow({ valid_from: LATER, is_active: false })] })
    const result = ok(await scheduled.run())
    expect(statusOf(scheduled.db, BOOK_ITEM_ID)).toBe('scheduled')
    expect(scheduled.db.decisions()[0]).toMatchObject({ item_id: BOOK_ITEM_ID, action: 'external_change', diff: { is_active: { item: true, resource: false } } })
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 1, 0])
    ok(await scheduled.run())
    expect(scheduled.db.decisions()).toHaveLength(1)

    // 공개 시각이 지난 예약됨도 비활성이면 게재중으로 옮기지 않는다
    const passed = setup([bookItem()], { books: [bookRow({ is_active: false })] })
    ok(await passed.run())
    expect(statusOf(passed.db, BOOK_ITEM_ID)).toBe('scheduled')
    expect(passed.db.decisions()[0]).toMatchObject({ action: 'external_change', diff: { is_active: { item: true, resource: false } } })

    // 게재중 컬렉션이 비활성이 돼도 종료로 옮기지 않는다
    const live = setup([bookItem({ status: 'live' })], { books: [bookRow({ is_active: false })] })
    ok(await live.run())
    expect(statusOf(live.db, BOOK_ITEM_ID)).toBe('live')
  })

  it('밖에서 공개 시각이 바뀌면 상태는 그대로 두고 시각 차이를 external_change로 한 번만 기록한다', async () => {
    const { db, run } = setup([bookItem()], { books: [bookRow({ valid_from: LATER })] })
    const result = ok(await run())

    expect(statusOf(db, BOOK_ITEM_ID)).toBe('scheduled')
    expect(db.decisions()[0]).toMatchObject({ item_id: BOOK_ITEM_ID, action: 'external_change', actor: ACTOR, diff: { starts_at: { item: STARTS, resource: LATER } } })
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 1, 0])
    ok(await run())
    expect(db.decisions()).toHaveLength(1)
  })

  it('밖에서 종료 시각이 정해지면 상태는 그대로 두고 ends_at 차이를 기록한다(항목은 상시)', async () => {
    const { db, run } = setup([bookItem({ status: 'live' })], { books: [bookRow({ valid_until: FUTURE_ENDS })] })
    const result = ok(await run())

    expect(statusOf(db, BOOK_ITEM_ID)).toBe('live')
    expect(db.decisions()[0]).toMatchObject({ action: 'external_change', diff: { ends_at: { item: null, resource: FUTURE_ENDS } } })
    expect(countsOf(result)).toEqual([0, 0, 0, 0, 1, 0])
  })

  it.each([
    ['공개 시각을 읽을 수 없다', { valid_from: 'not-a-date' }],
    ['종료 시각을 읽을 수 없다', { valid_until: 'not-a-date' }],
  ])('%s: 그 항목만 건너뛰고 상태를 바꾸지 않는다', async (_label, row) => {
    const { db, run } = setup([bookItem()], { books: [bookRow(row)] })
    const result = ok(await run())

    expect(result.errors).toBe(1)
    expect(statusOf(db, BOOK_ITEM_ID)).toBe('scheduled')
    expect(nonSelect(db)).toEqual([])
  })

  describe('멈춘 준비중 컬렉션', () => {
    const stuck = (extra: SpecInBundle = {}): SpecInBundle => ({ status: 'preparing', updatedAt: at(-11 * MINUTE), ...extra })

    it('핸들러 undo가 참조를 확인한 뒤 지우고 실패(fail)로 닫는다. 공개 시각이 지난 뒤여도 지운다', async () => {
      const { db, run } = setup([bookItem(stuck())], { books: [bookRow({ valid_from: STARTS }), bookRow({ id: uid(98) })] })
      const result = ok(await run())

      expect(statusOf(db, BOOK_ITEM_ID)).toBe('failed')
      expect((db.tables.item_books as Row[]).map((row) => row.id)).toEqual([uid(98)])
      expect(db.decisions('fail')[0]).toMatchObject({ item_id: BOOK_ITEM_ID, reason: STALLED })
      expect(result.failed[0]).toMatchObject({ itemId: BOOK_ITEM_ID, reason: STALLED, resourceId: null })
      const order = db.calls.map((call) => `${call.table}:${call.op}`)
      expect(order.indexOf('user_item_book_slots:select')).toBeLessThan(order.lastIndexOf('item_books:delete'))
    })

    it('아이템 배지·유저 기록이 붙어 지우지 못하면 자원은 남기고 사유에 「만든 자원이 남아 있어요」를 덧붙인다. 테이블 이름은 응답·기록에 없다', async () => {
      const { db, run } = setup([bookItem(stuck())], { books: [bookRow({ valid_from: LATER })] })
      db.tables.badges = [{ id: uid(60), item_book_id: BOOK_RES, deleted_at: null }]
      const result = ok(await run())

      expect(statusOf(db, BOOK_ITEM_ID)).toBe('failed')
      expect(db.tables.item_books).toHaveLength(1)
      expect(result.failed[0]).toMatchObject({ reason: `${STALLED}. ${REMAINS}`, resourceId: BOOK_RES })
      expect(JSON.stringify([result, db.decisions()])).not.toContain('badges')
      expect(logged()).toContain('badges.item_book_id')
    })

    it('카드·컬렉션·보상 배지가 함께 멈추면 카드 → 컬렉션 → 배지 순으로 지운다(배지를 먼저 지우려면 컬렉션이 남아 참조에 걸린다)', async () => {
      // 제출 순서는 배지가 앞이다(생성 순서의 정반대로 지워야 한다).
      const { db, run } = setup([
        badgeItem(stuck({ position: 1 })),
        bookItem(stuck({ position: 2, links: ['badge'] })),
        cardItem(stuck({ position: 3, links: ['collection'] })),
      ])
      db.tables.badges = [badgeRow({ valid_from: LATER }), badgeRow({ id: uid(98) })]
      db.tables.item_books = [bookRow({ valid_from: LATER, reward_badge_id: BADGE_RES })]
      db.tables.today_cards = [cardRow({ starts_at: LATER, ends_at: FUTURE_ENDS, item_book_id: BOOK_RES })]
      const result = ok(await run())

      expect(idsOf(result.failed)).toEqual([ID.card, BOOK_ITEM_ID, ID.badge])
      expect(db.tables.today_cards).toEqual([])
      expect(db.tables.item_books).toEqual([])
      expect((db.tables.badges as Row[]).map((row) => row.id)).toEqual([uid(98)])
      const order = db.calls.map((call) => `${call.table}:${call.op}`)
      expect(order.indexOf('today_cards:delete')).toBeLessThan(order.indexOf('item_books:delete'))
      expect(order.indexOf('item_books:delete')).toBeLessThan(order.indexOf('badges:delete'))
      for (const failed of result.failed) expect(failed.reason).toBe(STALLED)
    })
  })

  it('시험 묶음의 컬렉션은 item_books를 읽지 않고 항목의 시각만 본다', async () => {
    const { db, run } = setup([bookItem({ sample: true, createdResource: { sample: true } })])
    const result = ok(await run())

    expect(statusOf(db, BOOK_ITEM_ID)).toBe('live')
    expect(countsOf(result)).toEqual([1, 0, 0, 0, 0, 0])
    expect(db.calls.some((call) => call.table === 'item_books')).toBe(false)
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

  // 지금 종료 API(티켓 20261006_0950 가정 9): 읽은 뒤 그 API가 항목을 먼저 닫으면 전이는 0행인데, 읽은 시각 차이는 낡은 값이라 「밖에서 바뀜」으로 남기면 안 된다.
  describe('계획한 전이가 0행인 항목의 밖에서 바뀜(지금 종료 API와의 경합)', () => {
    /** 게재중 카드: 자원은 방금 끝났고(종료 시각이 항목과 다르다) 항목은 아직 게재중이라 `live → ended` 전이와 시각 차이가 함께 계획된다. */
    const endingCard = () => cardItem({ status: 'live' })
    const endedRow = () => cardRow({ ends_at: at(-MINUTE) })

    it('항목을 읽은 뒤 다른 곳이 먼저 닫으면 전이가 0행이라 external_change 행도 「종료」 집계도 남지 않는다', async () => {
      const { db, run } = setup([endingCard()], { cards: [endedRow()] })
      db.beforeRun = (call) => {
        if (call.table === 'ops_bundle_items' && call.op === 'update') db.item(ID.card).status = 'ended'
      }
      const result = ok(await run())

      expect(result.ended).toEqual([])
      expect(result.externalChanged).toEqual([])
      expect(db.decisions()).toEqual([])
      expect(countsOf(result)).toEqual([0, 0, 0, 0, 0, 0])
    })

    it('경합이 없으면 같은 항목은 종료되고 시각 차이도 남는다(회귀)', async () => {
      const { db, run } = setup([endingCard()], { cards: [endedRow()] })
      const result = ok(await run())

      expect(statusOf(db, ID.card)).toBe('ended')
      expect(result.ended).toHaveLength(1)
      expect(idsOf(result.externalChanged)).toEqual([ID.card])
      expect(db.decisions().map((row) => row.action)).toEqual(['external_change']) // 종료 시각이 지나 닫히는 전이는 기록 없이 집계만 한다
    })

    it('전이를 계획하지 않은 항목의 차이는 그대로 남고, 경합으로 진 항목만 뺀다', async () => {
      const { db, run } = setup([endingCard(), cardItem({ id: ID.card2, key: 'card2', createdResource: { today_card_id: CARD_RES2 } })], {
        cards: [endedRow(), cardRow({ id: CARD_RES2, is_active: false })],
      })
      db.beforeRun = (call) => {
        if (call.table === 'ops_bundle_items' && call.op === 'update') db.item(ID.card).status = 'ended'
      }
      const result = ok(await run())

      expect(idsOf(result.externalChanged)).toEqual([ID.card2])
      expect(db.decisions().map((row) => [row.item_id, row.action])).toEqual([[ID.card2, 'external_change']])
    })

    it('전이가 오류로 던진 항목의 차이는 지금처럼 남는다', async () => {
      const { db, run } = setup([endingCard()], { cards: [endedRow()] })
      db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'update'
      const result = ok(await run())

      expect(result.errors).toBe(1)
      expect(result.ended).toEqual([])
      expect(idsOf(result.externalChanged)).toEqual([ID.card])
    })
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
