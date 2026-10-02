/**
 * 공개 전 취소 (티켓 20261002_1256, 상위 20260930_1500 ④-b). 가정 1~6은 티켓 「착수 전에 정한 것」 번호다.
 * 카드와 미션(티켓 20261002_1944, ⑥)은 실제 핸들러와 메모리 DB(`fakeDb.ts`)로, 함께 취소·부분 실패는 가짜 종류 핸들러로 지킨다.
 *
 * - 카드 취소(가정 2·4): 행 삭제·항목 취소·`cancel` 기록, 시험 묶음은 `today_cards`에 쓰지 않는다
 * - 막는 경우: 공개 시각이 지남·노출 기록·예약됨이 아님·핸들러 없음·묶음에 없는 항목은 쓰기 없이 4xx
 * - 자원이 이미 없음(`missing`), DB 오류는 500 고정 문장이고 원문은 서버 로그에만 있다
 * - 함께 취소(가정 3): 예약됨 항목이 가리키면 함께, 게재중·준비중이 가리키면 409, 가리키는 대상은 그대로
 * - 부분 실패·상태 저장 실패·결정 기록 실패(`decisionLogFailed`)·상태 경합
 * - 미리 보기(가정 5): 쓰기 없음. 슬랙(가정 6): 요약·알림과 `slack_result`
 * - 예약됨 미션 취소(⑥): 실제 미션 핸들러, 미션을 가리키는 카드를 먼저 지운 뒤 미션을 지운다
 */
import { vi, describe, it, expect, beforeEach, type MockInstance } from 'vitest'

const h = vi.hoisted(() => ({ postOpsSlack: vi.fn() }))

vi.mock('@/lib/admin/opsInbox/slack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/slack')>()
  return { ...actual, postOpsSlack: h.postOpsSlack }
})

import type { CancelResult, ExecutableKind, ExecuteHandlerRegistry } from '../handlers'
import { EXECUTE_HANDLERS } from '../registry'
import { cancelItem, notifyCancel, previewCancel, type CancelFailure, type CancelSuccess } from '../cancel'
import { DB_SECRET, FakeDb, type FakeCall, type Row } from './fakeDb'
import { LATER, NOW, fakeHandler, makeItem, type ItemSpec } from './fixtures'

const B = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ID = { card: uid(1), mission: uid(2), badge: uid(3), poster: uid(4) }
const CARD_RES = uid(11)
const MISSION_RES = uid(12)
const ACTOR = 'admin-1'
const PAST = '2026-10-05T02:00:00.000Z'
const CARD_LABEL = '홈피드 카드 · 10/10(토) 09:00'
const MISSION_LABEL = '미션 · 10/10(토) 09:00'

const cardSpec = (extra: ItemSpec = {}): ItemSpec => ({
  id: ID.card,
  key: 'card',
  kind: 'home_feed_card',
  status: 'scheduled',
  createdResource: { today_card_id: CARD_RES },
  ...extra,
})
const missionSpec = (extra: ItemSpec = {}): ItemSpec => ({
  id: ID.mission,
  key: 'mission',
  kind: 'mission',
  status: 'scheduled',
  createdResource: { mission_id: MISSION_RES },
  ...extra,
})

// ── 가짜 종류 핸들러(미션 등 레지스트리에 없는 종류) ─────────────────────────────────────────────

interface Recorder {
  /** `cancel:<자원 ID>`를 부른 순서대로. */
  events: string[]
}

/** 자원 ID별 결과를 정할 수 있는 가짜 레지스트리. 정하지 않은 자원은 늘 성공한다. */
function fakeRegistry(rec: Recorder, results: Record<string, CancelResult | 'throw'> = {}, kinds: readonly ExecutableKind[] = ['home_feed_card', 'mission', 'jam_badge']): ExecuteHandlerRegistry {
  return Object.fromEntries(
    kinds.map((kind) => [
      kind,
      {
        ...fakeHandler(kind),
        cancel: async (_service: unknown, resourceId: string) => {
          rec.events.push(`cancel:${resourceId}`)
          const result = results[resourceId]
          if (result === 'throw') throw new Error(DB_SECRET)
          return result ?? { ok: true, missing: false }
        },
      },
    ])
  )
}

// ── 준비 ─────────────────────────────────────────────────────────────────────────────────────────

function setup(specs: ItemSpec[], options: { bundle?: Row; handlers?: ExecuteHandlerRegistry; cards?: Row[] } = {}) {
  const db = new FakeDb()
  db.tables.ops_bundles = [{ id: B, is_sample: false, ...options.bundle }]
  db.tables.ops_bundle_items = specs.map((spec) => ({ ...makeItem(spec), bundle_id: B }))
  db.tables.today_cards = options.cards ?? [{ id: CARD_RES, starts_at: LATER }]
  const handlers = options.handlers ?? EXECUTE_HANDLERS
  const run = (itemId: string = ID.card, reason: string | null = null) =>
    cancelItem(db.service, { bundleId: B, itemId, actor: ACTOR, reason }, { handlers, now: () => NOW })
  const preview = (itemId: string = ID.card) => previewCancel(db.service, { bundleId: B, itemId }, { handlers, now: () => NOW })
  return { db, handlers, run, preview }
}

const ok = (outcome: CancelSuccess | CancelFailure) => {
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  return outcome as CancelSuccess
}
const bad = (outcome: { ok: boolean }) => {
  expect(outcome.ok).toBe(false)
  return outcome as CancelFailure
}

const nonSelect = (db: FakeDb) => db.calls.filter((call) => call.op !== 'select')
const statusOf = (db: FakeDb, id: string) => db.item(id).status
const isCardDelete = (call: FakeCall) => call.table === 'today_cards' && call.op === 'delete'

let errorSpy: MockInstance<typeof console.error>
beforeEach(() => {
  h.postOpsSlack.mockReset()
  h.postOpsSlack.mockResolvedValue({ ok: true })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
const logged = () => errorSpy.mock.calls.map((args) => args.join(' ')).join('\n')

/** 응답·결정 기록·슬랙 글(알림까지 보낸 뒤)을 문자열로 모은다. DB 오류 원문과 자원 ID가 나오면 안 되는 곳이다. */
async function outputsOf(db: FakeDb, outcome: CancelSuccess | CancelFailure): Promise<string[]> {
  if (outcome.slack) await notifyCancel(db.service, outcome.slack)
  return [
    JSON.stringify(outcome.ok ? outcome.body : { error: outcome.error, ...outcome.extra }),
    JSON.stringify(db.decisions()),
    ...h.postOpsSlack.mock.calls.map((args) => String(args[1])),
  ]
}

// ── 카드 취소 ────────────────────────────────────────────────────────────────────────────────────

describe('예약됨 카드 취소 — 실제 카드 핸들러(가정 2·4)', () => {
  it('행을 지우고 항목을 「취소」로 두며 cancel 기록을 같은 batch_id로 남긴다', async () => {
    const { db, run } = setup([cardSpec(), { id: ID.poster, key: 'poster', kind: 'home_feed_card', status: 'approved' }])
    db.tables.today_cards = [{ id: CARD_RES, starts_at: LATER }, { id: uid(99), starts_at: LATER }]
    const result = ok(await run(ID.card, '일정이 바뀌었어요'))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.card], missing: [] })
    expect((db.tables.today_cards as Row[]).map((row) => row.id)).toEqual([uid(99)])
    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(db.item(ID.card).updated_at).toBe(NOW.toISOString())
    expect(statusOf(db, ID.poster)).toBe('approved')
    expect(db.decisions('cancel')).toMatchObject([
      { bundle_id: B, item_id: ID.card, action: 'cancel', actor: ACTOR, reason: '일정이 바뀌었어요', batch_id: result.batchId },
    ])
    expect(result.slack).toMatchObject({ isSample: false, cancelledLabels: [CARD_LABEL], problems: [], decisionLogFailed: false })
    expect(logged()).toBe('')
  })

  it('사유가 없으면 reason은 null이다', async () => {
    const { db, run } = setup([cardSpec()])
    ok(await run())
    expect(db.decisions('cancel')[0].reason).toBeNull()
  })

  it('상태는 예약됨일 때만 바꾸는 조건부 update이고 같은 묶음으로 좁힌다', async () => {
    const { db, run } = setup([cardSpec()])
    ok(await run())
    const update = db.itemWrites().find((call) => call.op === 'update')
    expect(update?.payload).toEqual({ status: 'cancelled', updated_at: NOW.toISOString() })
    expect(update?.filters).toEqual([['bundle_id', B], ['status', 'scheduled'], ['id', [ID.card]]])
  })

  it('지울 때 공개 시각 조건(starts_at > 지금)을 함께 건다', async () => {
    const { db, run } = setup([cardSpec()])
    ok(await run())
    const removed = db.calls.find(isCardDelete)
    expect(removed?.filters).toEqual([['id', CARD_RES], ['starts_at >', NOW.toISOString()]])
  })

  it('시험 묶음은 today_cards를 읽지도 쓰지도 않고 항목만 「취소」로 둔다', async () => {
    const { db, run } = setup([cardSpec({ createdResource: { sample: true } })], { bundle: { is_sample: true } })
    const result = ok(await run())

    expect(result.body).toEqual({ ok: true, cancelled: [ID.card], missing: [] })
    expect(db.calls.filter((call) => call.table === 'today_cards')).toEqual([])
    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(db.decisions('cancel')).toHaveLength(1)
    expect(result.slack.isSample).toBe(true)
  })

  it('공개 시각이 지났으면 409이고 아무것도 지우지 않는다(상태 맞추기가 아직 게재중으로 바꾸지 않은 카드)', async () => {
    const { db, run } = setup([cardSpec()], { cards: [{ id: CARD_RES, starts_at: PAST }] })
    const failure = bad(await run())

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('공개 시각이 지나 취소할 수 없어요')
    expect(failure.slack).toBeUndefined()
    expect(nonSelect(db)).toEqual([])
    expect(db.tables.today_cards).toHaveLength(1)
    expect(statusOf(db, ID.card)).toBe('scheduled')
    expect(db.decisions()).toEqual([])
  })

  it('노출·열람 기록이 붙은 카드는 409이고 아무것도 지우지 않는다. 테이블 이름은 응답에 없다', async () => {
    const { db, run } = setup([cardSpec()])
    db.tables.today_card_events = [{ id: 'event-1', card_id: CARD_RES }]
    const failure = bad(await run())

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('노출 기록이 있거나 확인하지 못해 카드를 지우지 않았어요')
    expect(failure.error).not.toContain('today_card_events')
    expect(nonSelect(db)).toEqual([])
    expect(statusOf(db, ID.card)).toBe('scheduled')
    expect(logged()).toContain('today_card_events')
  })

  it('예약됨이 아닌 항목은 409이고 자원도 항목도 건드리지 않는다', async () => {
    for (const status of ['arrived', 'reviewing', 'approved', 'preparing', 'live', 'ended', 'rejected', 'cancelled', 'failed']) {
      const { db, run } = setup([cardSpec({ status })])
      const failure = bad(await run())
      expect(failure.status, status).toBe(409)
      expect(failure.error, status).toBe('예약됨 항목만 취소할 수 있어요')
      expect(nonSelect(db), status).toEqual([])
      expect(db.calls.some((call) => call.table === 'today_cards'), status).toBe(false)
    }
  })

  it('묶음에 없는 항목은 404, 묶음이 없어도 404다', async () => {
    const { db, run } = setup([cardSpec()])
    expect(bad(await run(uid(77))).status).toBe(404)
    db.tables.ops_bundles = []
    expect(bad(await run(ID.card)).status).toBe(404)
    expect(nonSelect(db)).toEqual([])
  })

  it('다른 묶음의 항목 ID로는 취소할 수 없다', async () => {
    const { db, run } = setup([cardSpec()])
    ;(db.item(ID.card) as Row).bundle_id = 'other-bundle'
    // 묶음 조회가 `bundle_id`로 좁히므로 이 묶음에서는 항목이 보이지 않는다
    expect(bad(await run()).status).toBe(404)
    expect(nonSelect(db)).toEqual([])
  })

  it('카드 행이 이미 없으면 밖에서 지워진 것이라 항목은 취소하고 missing에 싣는다', async () => {
    const { db, run } = setup([cardSpec()], { cards: [] })
    const result = ok(await run())

    expect(result.body).toEqual({ ok: true, cancelled: [ID.card], missing: [ID.card] })
    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(db.calls.filter(isCardDelete)).toEqual([])
    expect(db.decisions('cancel')).toHaveLength(1)
  })

  it('자원 ID가 없는 예약됨 항목은 자원이 이미 없는 것으로 보고 상태만 바꾼다', async () => {
    const { db, run } = setup([cardSpec({ createdResource: null })])
    const result = ok(await run())

    expect(result.body).toEqual({ ok: true, cancelled: [ID.card], missing: [ID.card] })
    expect(db.calls.filter((call) => call.table === 'today_cards')).toEqual([])
    expect(logged()).toContain('자원 ID가 없는 예약됨 항목')
  })

  it('DB 오류는 500 고정 문장이고 원문·카드 ID는 응답·기록·슬랙에 없다. 아무것도 남기지 않는다', async () => {
    const { db, run } = setup([cardSpec()])
    db.failIf = isCardDelete
    const failure = bad(await run())

    expect(failure.status).toBe(500)
    expect(failure.error).toBe('취소하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(failure.slack).toBeUndefined()
    expect(nonSelect(db).filter((call) => call.table !== 'today_cards')).toEqual([])
    expect(statusOf(db, ID.card)).toBe('scheduled')
    for (const output of await outputsOf(db, failure)) {
      expect(output).not.toContain(DB_SECRET)
      expect(output).not.toContain(CARD_RES)
    }
    expect(logged()).toContain(DB_SECRET)
    expect(h.postOpsSlack).not.toHaveBeenCalled()
  })

  it('묶음·항목을 읽지 못하면 500 고정 문장이고 원문은 로그에만 있다', async () => {
    const { db, run } = setup([cardSpec()])
    db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'select'
    const failure = bad(await run())

    expect(failure.status).toBe(500)
    expect(failure.error).toBe('취소하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(JSON.stringify(failure)).not.toContain(DB_SECRET)
    expect(nonSelect(db)).toEqual([])
    expect(logged()).toContain(DB_SECRET)
  })

  it('결정 기록을 남기지 못해도 자원과 상태는 그대로 두고 decisionLogFailed로 알린다', async () => {
    const { db, run } = setup([cardSpec()])
    db.failIf = (call) => call.table === 'ops_decisions' && call.op === 'insert'
    const result = ok(await run())

    expect(result.body).toEqual({ ok: true, cancelled: [ID.card], missing: [], decisionLogFailed: true })
    expect(db.tables.today_cards).toEqual([])
    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(db.decisions()).toEqual([])
    expect(result.slack.decisionLogFailed).toBe(true)
    for (const output of await outputsOf(db, result)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })

  it('지운 사이 항목이 다른 곳에서 바뀌어 상태가 안 바뀌면 409이고 결정 기록을 남기지 않는다', async () => {
    const { db, run } = setup([cardSpec()])
    db.beforeRun = (call) => {
      if (call.table === 'ops_bundle_items' && call.op === 'update') db.item(ID.card).status = 'cancelled' // 다른 관리자가 먼저 취소
    }
    const failure = bad(await run())

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('그사이 항목 상태가 바뀌어 취소하지 못했어요. 화면을 새로 고쳐 확인해 주세요.')
    expect(db.decisions()).toEqual([])
    expect(failure.slack).toBeUndefined()
    expect(logged()).toContain('그사이 다른 곳에서 바뀌어')
  })

  it('자원은 지웠는데 상태를 저장하지 못하면 500이고 알림 글을 남긴다. 결정 기록은 없다', async () => {
    const { db, run } = setup([cardSpec()])
    db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'update'
    const failure = bad(await run())

    expect(failure.status).toBe(500)
    expect(failure.error).toBe('항목 상태를 바꾸지 못했어요. 잠시 뒤 화면을 새로 고쳐 확인해 주세요.')
    expect(failure.extra).toEqual({ cancelled: [] })
    expect(failure.slack).toMatchObject({ cancelledLabels: [], problems: [{ itemLabel: CARD_LABEL, reason: '자원은 지웠지만 항목 상태를 바꾸지 못했어요' }] })
    expect(db.decisions()).toEqual([])
    for (const output of await outputsOf(db, failure)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
    expect(h.postOpsSlack.mock.calls.map((args) => args[0])).toEqual(['alert'])
  })
})

// ── 함께 취소할 항목 ─────────────────────────────────────────────────────────────────────────────

describe('함께 취소할 항목 — 가짜 종류 핸들러(가정 3·4)', () => {
  /** 카드가 미션을 가리킨다(카드 → 미션). */
  const linked = (extra: { card?: ItemSpec; mission?: ItemSpec } = {}): ItemSpec[] => [
    cardSpec({ links: ['mission'], ...extra.card }),
    missionSpec({ ...extra.mission }),
  ]

  it('예약됨 항목이 가리키면 함께 취소한다. 가리키는 항목의 자원을 먼저 지우고 같은 batch_id로 둘 다 기록한다', async () => {
    const rec: Recorder = { events: [] }
    const { db, run } = setup(linked(), { handlers: fakeRegistry(rec) })
    const result = ok(await run(ID.mission, '미션을 접어요'))

    expect(rec.events).toEqual([`cancel:${CARD_RES}`, `cancel:${MISSION_RES}`])
    expect(result.body).toEqual({ ok: true, cancelled: [ID.card, ID.mission], missing: [] })
    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(statusOf(db, ID.mission)).toBe('cancelled')
    expect(db.decisions('cancel').map((row) => [row.item_id, row.reason, row.batch_id])).toEqual([
      [ID.card, '미션을 접어요', result.batchId],
      [ID.mission, '미션을 접어요', result.batchId],
    ])
    expect(result.slack.cancelledLabels).toEqual([CARD_LABEL, MISSION_LABEL])
    // 상태는 한 번의 조건부 update로 바꾼다
    expect(db.itemWrites().filter((call) => call.op === 'update')).toHaveLength(1)
  })

  it('가리키는 대상은 그대로 둔다(카드를 취소해도 미션은 남는다)', async () => {
    const rec: Recorder = { events: [] }
    const { db, run } = setup(linked(), { handlers: fakeRegistry(rec) })
    const result = ok(await run(ID.card))

    expect(rec.events).toEqual([`cancel:${CARD_RES}`])
    expect(result.body.cancelled).toEqual([ID.card])
    expect(statusOf(db, ID.mission)).toBe('scheduled')
  })

  it('다른 예약됨 항목을 거쳐 가리키는 항목도 함께 취소한다', async () => {
    const rec: Recorder = { events: [] }
    const badgeRes = uid(13)
    const { db, run } = setup(
      [
        cardSpec({ links: ['mission'] }),
        missionSpec({ links: ['badge'] }),
        { id: ID.badge, key: 'badge', kind: 'jam_badge', status: 'scheduled', createdResource: { badge_id: badgeRes } },
      ],
      { handlers: fakeRegistry(rec) }
    )
    const result = ok(await run(ID.badge))

    expect(rec.events).toEqual([`cancel:${CARD_RES}`, `cancel:${MISSION_RES}`, `cancel:${badgeRes}`])
    expect(result.body.cancelled).toEqual([ID.card, ID.mission, ID.badge])
    expect(db.decisions('cancel')).toHaveLength(3)
  })

  it('게재 중인 항목이 가리키면 409이고 아무것도 취소하지 않는다. 막는 항목을 알린다', async () => {
    const rec: Recorder = { events: [] }
    const { db, run } = setup(linked({ card: { status: 'live' } }), { handlers: fakeRegistry(rec) })
    const failure = bad(await run(ID.mission))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.')
    expect(failure.extra).toEqual({ blockers: [{ id: ID.card, reason: failure.error }] })
    expect(rec.events).toEqual([])
    expect(nonSelect(db)).toEqual([])
    expect(statusOf(db, ID.mission)).toBe('scheduled')
  })

  it('예약 등록이 진행 중인 항목이 가리키면 409이고 아무것도 취소하지 않는다', async () => {
    const rec: Recorder = { events: [] }
    const { db, run } = setup(linked({ card: { status: 'preparing' } }), { handlers: fakeRegistry(rec) })
    const failure = bad(await run(ID.mission))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('예약 등록이 진행 중인 항목이 있어요. 잠시 뒤 다시 시도해 주세요.')
    expect(failure.extra).toEqual({ blockers: [{ id: ID.card, reason: failure.error }] })
    expect(rec.events).toEqual([])
    expect(nonSelect(db)).toEqual([])
  })

  it('게재중과 준비중이 함께 있으면 게재중 문장을 먼저 보이고 두 항목을 모두 알린다', async () => {
    const rec: Recorder = { events: [] }
    const { db, run } = setup(
      [...linked({ card: { status: 'preparing' } }), { id: ID.poster, key: 'poster', kind: 'home_feed_card', status: 'live', links: ['mission'] }],
      { handlers: fakeRegistry(rec) }
    )
    const failure = bad(await run(ID.mission))

    expect(failure.error).toBe('이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.')
    expect((failure.extra?.blockers as Array<{ id: string }>).map((blocker) => blocker.id)).toEqual([ID.card, ID.poster])
    expect(nonSelect(db)).toEqual([])
  })

  it('가리키는 항목이 승인됨·종료·반려 등이면 건드리지 않고 시작 항목만 취소한다', async () => {
    for (const status of ['approved', 'reviewing', 'ended', 'rejected', 'failed', 'cancelled']) {
      const rec: Recorder = { events: [] }
      const { db, run } = setup(linked({ card: { status } }), { handlers: fakeRegistry(rec) })
      const result = ok(await run(ID.mission))
      expect(result.body.cancelled, status).toEqual([ID.mission])
      expect(statusOf(db, ID.card), status).toBe(status)
      expect(rec.events, status).toEqual([`cancel:${MISSION_RES}`])
    }
  })

  it('종류에 핸들러가 없으면 409이고 아무것도 취소하지 않는다(함께 취소할 항목의 종류도 본다)', async () => {
    const rec: Recorder = { events: [] }
    const { db, run } = setup(linked(), { handlers: fakeRegistry(rec, {}, ['mission']) }) // 카드 핸들러 없음
    const failure = bad(await run(ID.mission))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('아직 취소를 연결하지 않은 종류예요')
    expect(rec.events).toEqual([])
    expect(nonSelect(db)).toEqual([])
  })

  it('종류 이름이 레지스트리 객체의 기본 속성과 같아도 핸들러로 보지 않는다', async () => {
    const { db, run } = setup([cardSpec({ kind: 'constructor' })])
    const failure = bad(await run())
    expect(failure.status).toBe(409)
    expect(failure.error).toBe('아직 취소를 연결하지 않은 종류예요')
    expect(nonSelect(db)).toEqual([])
  })

  it('실제 레지스트리에 아직 없는 종류(레시피 등)는 409로 막힌다', async () => {
    const { db, run } = setup([{ id: ID.poster, key: 'recipe', kind: 'recipe', status: 'scheduled', createdResource: { recipe_id: uid(21) } }])
    const failure = bad(await run(ID.poster))
    expect(failure.status).toBe(409)
    expect(failure.error).toBe('아직 취소를 연결하지 않은 종류예요')
    expect(nonSelect(db)).toEqual([])
  })

  it('시험 묶음은 함께 취소할 항목까지 자원 단계 없이 상태만 바꾼다', async () => {
    const rec: Recorder = { events: [] }
    const { db, run } = setup(linked({ card: { createdResource: { sample: true } }, mission: { createdResource: { sample: true } } }), {
      handlers: fakeRegistry(rec),
      bundle: { is_sample: true },
    })
    const result = ok(await run(ID.mission))

    expect(rec.events).toEqual([])
    expect(result.body.cancelled).toEqual([ID.card, ID.mission])
    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(statusOf(db, ID.mission)).toBe('cancelled')
    expect(db.calls.filter((call) => call.table === 'today_cards')).toEqual([])
  })

  it('자원이 이미 없던 항목은 missing에 싣고 나머지는 지운다', async () => {
    const rec: Recorder = { events: [] }
    const { run } = setup(linked(), { handlers: fakeRegistry(rec, { [CARD_RES]: { ok: true, missing: true } }) })
    const result = ok(await run(ID.mission))
    expect(result.body).toEqual({ ok: true, cancelled: [ID.card, ID.mission], missing: [ID.card] })
  })
})

// ── 미션 취소 ────────────────────────────────────────────────────────────────────────────────────

describe('예약됨 미션 취소 — 실제 카드·미션 핸들러 (티켓 20261002_1944)', () => {
  const missionRow = (extra: Row = {}): Row => ({ id: MISSION_RES, starts_at: LATER, ends_at: null, exposure_mode: 'start_date', exposure_at: null, ...extra })
  /** 카드가 미션을 가리키는 그룹. 카드 행은 미션 ID를 `mission_id`로 갖는다. */
  function linkedSetup(options: Parameters<typeof setup>[1] = {}, specs: ItemSpec[] = [cardSpec({ links: ['mission'] }), missionSpec()]) {
    const made = setup(specs, { ...options, cards: [{ id: CARD_RES, starts_at: LATER, mission_id: MISSION_RES }] })
    made.db.tables.missions = [missionRow(), { id: uid(98), starts_at: LATER, ends_at: null, exposure_mode: 'start_date', exposure_at: null }]
    return made
  }
  const orderOf = (db: FakeDb) => db.calls.map((call) => `${call.table}:${call.op}`)

  it('미션을 취소하면 그 미션을 가리키는 카드를 먼저 지운 뒤 미션을 지운다. 카드가 남아 있으면 미션의 참조 확인에 걸리기 때문이다', async () => {
    const { db, run } = linkedSetup()
    const result = ok(await run(ID.mission, '미션을 접어요'))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.card, ID.mission], missing: [] })
    expect(db.tables.today_cards).toEqual([])
    expect((db.tables.missions as Row[]).map((row) => row.id)).toEqual([uid(98)])
    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(statusOf(db, ID.mission)).toBe('cancelled')
    expect(db.decisions('cancel').map((row) => [row.item_id, row.reason, row.batch_id])).toEqual([
      [ID.card, '미션을 접어요', result.batchId],
      [ID.mission, '미션을 접어요', result.batchId],
    ])
    const order = orderOf(db)
    expect(order.indexOf('today_cards:delete')).toBeLessThan(order.indexOf('missions:delete'))
    // 미션의 참조 확인(today_cards를 미션 ID로 센다)은 카드를 지운 뒤에 이뤄졌다
    expect(order.lastIndexOf('today_cards:select')).toBeGreaterThan(order.indexOf('today_cards:delete'))
    expect(db.calls.find((call) => call.table === 'missions' && call.op === 'delete')?.filters).toEqual([['id', MISSION_RES], ['starts_at >', NOW.toISOString()]])
    expect(result.slack.cancelledLabels).toEqual([CARD_LABEL, MISSION_LABEL])
  })

  it('카드만 취소하면 미션은 남는다', async () => {
    const { db, run } = linkedSetup()
    const result = ok(await run(ID.card))

    expect(result.body.cancelled).toEqual([ID.card])
    expect(db.tables.today_cards).toEqual([])
    expect((db.tables.missions as Row[]).map((row) => row.id)).toEqual([MISSION_RES, uid(98)])
    expect(statusOf(db, ID.mission)).toBe('scheduled')
  })

  it('운영툴 밖에서 만든 카드가 미션을 가리키면 409이고 아무것도 지우지 않는다. 테이블 이름은 응답에 없다', async () => {
    const { db, run } = setup([missionSpec()], { cards: [{ id: uid(60), starts_at: LATER, mission_id: MISSION_RES }] })
    db.tables.missions = [missionRow()]
    const failure = bad(await run(ID.mission))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('참여 기록이나 연결이 있거나 확인하지 못해 미션을 지우지 않았어요')
    expect(failure.error).not.toContain('today_cards')
    expect(nonSelect(db)).toEqual([])
    expect(statusOf(db, ID.mission)).toBe('scheduled')
    expect(logged()).toContain('today_cards')
  })

  it('참여 기록이 붙은 미션은 409이고 지우지 않는다', async () => {
    const { db, run } = setup([missionSpec()], { cards: [] })
    db.tables.missions = [missionRow()]
    db.tables.user_mission_participations = [{ id: 'p-1', mission_id: MISSION_RES }]
    const failure = bad(await run(ID.mission))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('참여 기록이나 연결이 있거나 확인하지 못해 미션을 지우지 않았어요')
    expect(nonSelect(db)).toEqual([])
    expect(db.tables.missions).toHaveLength(1)
    expect(logged()).toContain('user_mission_participations')
  })

  it('공개 시각이 지난 미션은 409이고 아무것도 지우지 않는다(상태 맞추기가 아직 게재중으로 바꾸지 않은 미션)', async () => {
    const { db, run } = setup([missionSpec()], { cards: [] })
    db.tables.missions = [missionRow({ starts_at: PAST })]
    const failure = bad(await run(ID.mission))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('공개 시각이 지나 취소할 수 없어요')
    expect(failure.slack).toBeUndefined()
    expect(nonSelect(db)).toEqual([])
    expect(statusOf(db, ID.mission)).toBe('scheduled')
    expect(db.decisions()).toEqual([])
  })

  it('밖에서 이미 지워진 미션은 missing으로 두고 항목만 「취소」로 둔다', async () => {
    const { db, run } = setup([missionSpec()], { cards: [] })
    const result = ok(await run(ID.mission))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.mission], missing: [ID.mission] })
    expect(statusOf(db, ID.mission)).toBe('cancelled')
    expect(nonSelect(db).filter((call) => call.table === 'missions')).toEqual([])
  })

  it('시험 묶음은 missions를 읽지도 쓰지도 않고 항목만 「취소」로 둔다', async () => {
    const { db, run } = setup([cardSpec({ links: ['mission'], createdResource: { sample: true } }), missionSpec({ createdResource: { sample: true } })], { bundle: { is_sample: true } })
    const result = ok(await run(ID.mission))

    expect(result.body.cancelled).toEqual([ID.card, ID.mission])
    expect(db.calls.filter((call) => call.table === 'missions' || call.table === 'today_cards')).toEqual([])
  })

  it('미리 보기는 미션과 그 미션을 가리키는 카드를 쓰기 없이 돌려준다', async () => {
    const { db, preview } = linkedSetup()
    expect(await preview(ID.mission)).toEqual({ ok: true, body: { ok: true, dryRun: true, cancelIds: [ID.card, ID.mission], blockers: [] } })
    expect(nonSelect(db)).toEqual([])
    expect(db.calls.some((call) => call.table === 'missions')).toBe(false)
  })
})

// ── 실패 ─────────────────────────────────────────────────────────────────────────────────────────

describe('실패 경로 — 첫 실패에서 멈춘다(가정 4)', () => {
  const linked = (): ItemSpec[] => [cardSpec({ links: ['mission'] }), missionSpec()]
  const errorResult: CancelResult = { ok: false, code: 'error', failure: { reason: '미션을 지우지 못했어요', detail: DB_SECRET } }

  it('앞 항목을 지운 뒤 실패하면 지운 항목만 「취소」로 두고 500 { error, cancelled }와 알림 글을 남긴다', async () => {
    const rec: Recorder = { events: [] }
    const { db, run } = setup(linked(), { handlers: fakeRegistry(rec, { [MISSION_RES]: errorResult }) })
    const failure = bad(await run(ID.mission, '접어요'))

    expect(rec.events).toEqual([`cancel:${CARD_RES}`, `cancel:${MISSION_RES}`])
    expect(failure.status).toBe(500)
    expect(failure.error).toBe('일부만 취소했어요. 나머지는 취소하지 못했어요. 화면을 새로 고쳐 확인해 주세요.')
    expect(failure.extra).toEqual({ cancelled: [ID.card] })
    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(statusOf(db, ID.mission)).toBe('scheduled')
    expect(db.decisions('cancel').map((row) => [row.item_id, row.reason])).toEqual([[ID.card, '접어요']])
    expect(failure.slack).toMatchObject({ cancelledLabels: [CARD_LABEL], problems: [{ itemLabel: MISSION_LABEL, reason: '미션을 지우지 못했어요' }] })

    for (const output of await outputsOf(db, failure)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
    expect(h.postOpsSlack.mock.calls.map((args) => args[0])).toEqual(['report', 'alert'])
  })

  it('앞 항목을 지운 뒤 공개됨·기록 있음으로 막혀도 같은 부분 실패로 다룬다', async () => {
    const rec: Recorder = { events: [] }
    const published: CancelResult = { ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } }
    const { db, run } = setup(linked(), { handlers: fakeRegistry(rec, { [MISSION_RES]: published }) })
    const failure = bad(await run(ID.mission))

    expect(failure.status).toBe(500)
    expect(failure.extra).toEqual({ cancelled: [ID.card] })
    expect(failure.slack?.problems).toEqual([{ itemLabel: MISSION_LABEL, reason: '공개 시각이 지나 취소할 수 없어요' }])
    expect(statusOf(db, ID.mission)).toBe('scheduled')
  })

  it('첫 항목에서 공개됨·기록 있음으로 막히면 409이고 아무것도 남기지 않는다', async () => {
    for (const [code, reason] of [
      ['published', '공개 시각이 지나 취소할 수 없어요'],
      ['referenced', '노출 기록이 있거나 확인하지 못해 카드를 지우지 않았어요'],
    ] as const) {
      const rec: Recorder = { events: [] }
      const { db, run } = setup(linked(), { handlers: fakeRegistry(rec, { [CARD_RES]: { ok: false, code, failure: { reason, detail: DB_SECRET } } }) })
      const failure = bad(await run(ID.mission))

      expect(failure.status, code).toBe(409)
      expect(failure.error, code).toBe(reason)
      expect(failure.slack, code).toBeUndefined()
      expect(rec.events, code).toEqual([`cancel:${CARD_RES}`]) // 첫 실패에서 멈춰 미션 자원은 건드리지 않는다
      expect(nonSelect(db), code).toEqual([])
      expect(JSON.stringify(failure), code).not.toContain(DB_SECRET)
    }
  })

  it('첫 항목의 오류는 500 고정 문장이다. 핸들러의 사유 문장도 응답에 싣지 않는다', async () => {
    const rec: Recorder = { events: [] }
    const { db, run } = setup(linked(), { handlers: fakeRegistry(rec, { [CARD_RES]: errorResult }) })
    const failure = bad(await run(ID.mission))

    expect(failure.status).toBe(500)
    expect(failure.error).toBe('취소하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(failure.slack).toBeUndefined()
    expect(nonSelect(db)).toEqual([])
    expect(logged()).toContain(DB_SECRET)
  })

  it('핸들러가 던져도 오류 실패로 바꿔 흐름을 멈춘다. 원문은 응답에 없다', async () => {
    const rec: Recorder = { events: [] }
    const { db, run } = setup(linked(), { handlers: fakeRegistry(rec, { [MISSION_RES]: 'throw' }) })
    const failure = bad(await run(ID.mission))

    expect(failure.status).toBe(500)
    expect(failure.extra).toEqual({ cancelled: [ID.card] })
    expect(failure.slack?.problems).toEqual([{ itemLabel: MISSION_LABEL, reason: '취소 중 오류가 났어요' }])
    for (const output of await outputsOf(db, failure)) expect(output).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET)
  })
})

// ── 미리 보기 ────────────────────────────────────────────────────────────────────────────────────

describe('미리 보기 { dryRun: true }(가정 5)', () => {
  const linked = (extra: { card?: ItemSpec } = {}): ItemSpec[] => [cardSpec({ links: ['mission'], ...extra.card }), missionSpec()]

  it('쓰기 없이 함께 취소될 항목을 돌려준다. 자원 핸들러도 부르지 않는다', async () => {
    const rec: Recorder = { events: [] }
    const { db, preview } = setup(linked(), { handlers: fakeRegistry(rec) })
    const result = await preview(ID.mission)

    expect(result).toEqual({ ok: true, body: { ok: true, dryRun: true, cancelIds: [ID.card, ID.mission], blockers: [] } })
    expect(nonSelect(db)).toEqual([])
    expect(db.calls.some((call) => call.table === 'today_cards')).toBe(false)
    expect(rec.events).toEqual([])
    expect(h.postOpsSlack).not.toHaveBeenCalled()
  })

  it('막는 항목이 있어도 200이고 이유와 함께 알린다(확인창이 보인다)', async () => {
    const rec: Recorder = { events: [] }
    const { db, preview } = setup(linked({ card: { status: 'live' } }), { handlers: fakeRegistry(rec) })
    const result = await preview(ID.mission)

    expect(result).toEqual({
      ok: true,
      body: {
        ok: true,
        dryRun: true,
        cancelIds: [ID.mission],
        blockers: [{ id: ID.card, reason: '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.' }],
      },
    })
    expect(nonSelect(db)).toEqual([])
  })

  it('연결이 없으면 자기 자신만 돌려준다', async () => {
    const { preview } = setup([cardSpec()])
    expect(await preview()).toEqual({ ok: true, body: { ok: true, dryRun: true, cancelIds: [ID.card], blockers: [] } })
  })

  it('예약됨이 아니면 409, 묶음에 없는 항목은 404, 핸들러가 없으면 409다', async () => {
    const { db, preview } = setup([cardSpec({ status: 'approved' }), { id: ID.poster, key: 'recipe', kind: 'recipe', status: 'scheduled', createdResource: { recipe_id: uid(21) } }])
    expect(await preview(ID.card)).toMatchObject({ ok: false, status: 409, error: '예약됨 항목만 취소할 수 있어요' })
    expect(await preview(uid(77))).toMatchObject({ ok: false, status: 404 })
    expect(await preview(ID.poster)).toMatchObject({ ok: false, status: 409, error: '아직 취소를 연결하지 않은 종류예요' })
    expect(nonSelect(db)).toEqual([])
  })

  it('읽지 못하면 500 고정 문장이다', async () => {
    const { db, preview } = setup([cardSpec()])
    db.failIf = (call) => call.table === 'ops_bundles'
    const result = await preview()
    expect(result).toMatchObject({ ok: false, status: 500, error: '함께 취소될 항목을 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(JSON.stringify(result)).not.toContain(DB_SECRET)
  })
})

// ── 슬랙 ─────────────────────────────────────────────────────────────────────────────────────────

describe('슬랙 알림(가정 6)', () => {
  const linked = (): ItemSpec[] => [cardSpec({ links: ['mission'] }), missionSpec()]

  it('취소한 항목을 한 건으로 #jam-report에 올리고 결과를 batch_id와 cancel 행에 채운다', async () => {
    const rec: Recorder = { events: [] }
    const { db, run } = setup(linked(), { handlers: fakeRegistry(rec) })
    const result = ok(await run(ID.mission))
    await notifyCancel(db.service, result.slack)

    expect(h.postOpsSlack.mock.calls).toEqual([['report', `공개 전 취소 2건\n• ${CARD_LABEL}\n• ${MISSION_LABEL}`]])
    expect(db.decisions('cancel').map((row) => row.slack_result)).toEqual([
      { channel: 'report', ok: true },
      { channel: 'report', ok: true },
    ])
  })

  it('시험 묶음이면 글 앞에 「[시험]」이 붙는다', async () => {
    const { db, run } = setup([cardSpec({ createdResource: { sample: true } })], { bundle: { is_sample: true } })
    await notifyCancel(db.service, ok(await run()).slack)
    expect(h.postOpsSlack.mock.calls).toEqual([['report', `[시험] 공개 전 취소 1건\n• ${CARD_LABEL}`]])
  })

  it('부분 실패는 요약 한 건과 알림 한 건을 올린다. 알림의 결과가 cancel 행에 남는다', async () => {
    const rec: Recorder = { events: [] }
    const fails: CancelResult = { ok: false, code: 'error', failure: { reason: '미션을 지우지 못했어요', detail: DB_SECRET } }
    const { db, run } = setup(linked(), { handlers: fakeRegistry(rec, { [MISSION_RES]: fails }) })
    h.postOpsSlack.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: 'not_configured' })
    const failure = bad(await run(ID.mission))
    await notifyCancel(db.service, failure.slack as NonNullable<typeof failure.slack>)

    expect(h.postOpsSlack.mock.calls).toEqual([
      ['report', `공개 전 취소 1건\n• ${CARD_LABEL}`],
      ['alert', `공개 전 취소를 끝내지 못했어요 · 1건 취소, 1건 남음\n• ${MISSION_LABEL} — 미션을 지우지 못했어요`],
    ])
    expect(db.decisions('cancel').map((row) => row.slack_result)).toEqual([{ channel: 'alert', ok: false, error: 'not_configured' }])
  })

  it('결정 기록을 남기지 못했으면 알림을 한 건 올리고 채울 행이 없다', async () => {
    const { db, run } = setup([cardSpec()])
    db.failIf = (call) => call.table === 'ops_decisions' && call.op === 'insert'
    const result = ok(await run())
    await notifyCancel(db.service, result.slack)

    expect(h.postOpsSlack.mock.calls.map((args) => args[0])).toEqual(['report', 'alert'])
    expect(h.postOpsSlack.mock.calls[1][1]).toBe('결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요')
    expect(db.calls.some((call) => call.table === 'ops_decisions' && call.op === 'update')).toBe(false)
  })

  it('슬랙이 실패하거나 던져도 던지지 않는다', async () => {
    const { db, run } = setup([cardSpec()])
    const result = ok(await run())
    h.postOpsSlack.mockRejectedValue(new Error('network down'))
    await expect(notifyCancel(db.service, result.slack)).resolves.toBeUndefined()
    expect(statusOf(db, ID.card)).toBe('cancelled')
  })
})
