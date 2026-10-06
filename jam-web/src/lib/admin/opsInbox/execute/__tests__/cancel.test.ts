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
 * - 예약됨 레시피 취소(⑧-a, 티켓 20261002_2221): 실제 레시피 핸들러, 공개 전 취소·이미 공개·종료됨·가장 먼저 성공 배지가 가리킴(409)·없음·시험 묶음.
 *   카드 → 레시피 연결(⑫-b, 티켓 20261006_1218): 가리키는 카드를 함께 취소·게재 중 카드 409·운영툴 밖 카드 409
 * - 예약됨 드랍 취소(⑧-b, 티켓 20261002_2306): 실제 드랍 핸들러, 공개 전 취소(지우지 않고 「취소」 상태)·예정 시각이 지남·실행 시작·끝남(409)·밖에서 취소됨·없음·시험 묶음
 * - 예약됨 JAM! 배지 취소(⑨-a, 티켓 20261004_1756): 실제 배지 핸들러, 공개 전 취소·공개됨·참조 있음(409)·밖에서 지워짐·소프트 삭제·배지를 가리키는 미션·카드 함께 취소(카드→미션→배지 순)·시험 묶음
 * - 예약됨 컬렉션 취소(⑩-a, 티켓 20261004_2039): 실제 컬렉션 핸들러, 공개 전 취소·공개됨·참조 있음(아이템 배지 포함, 409)·밖에서 지워짐·컬렉션을 가리키는 카드 함께 취소(카드→컬렉션 순)·
 *   보상 배지와 함께 취소될 때 컬렉션이 먼저 지워짐(카드→컬렉션→배지 순)·시험 묶음
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

  it('핸들러가 없는 종류는 409로 막힌다(실제 레지스트리는 여섯 종류가 모두 연결돼 컬렉션 핸들러만 뺀 레지스트리로 본다)', async () => {
    const { db, run } = setup([{ id: ID.poster, key: 'collection', kind: 'collection_launch', status: 'scheduled', createdResource: { item_book_id: uid(21) } }], {
      handlers: { ...EXECUTE_HANDLERS, collection_launch: undefined },
    })
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

  it('미션은 이미 공개 시각이 지났는데 카드는 공개 전이면 카드만 지우고 미션에서 막혀 부분 실패(500)다', async () => {
    const { db, run } = linkedSetup()
    ;(db.tables.missions[0] as Row).starts_at = PAST
    const failure = bad(await run(ID.mission))

    expect(failure.status).toBe(500)
    expect(failure.error).toBe('일부만 취소했어요. 나머지는 취소하지 못했어요. 화면을 새로 고쳐 확인해 주세요.')
    expect(failure.extra).toEqual({ cancelled: [ID.card] })
    expect(db.tables.today_cards).toEqual([])
    expect((db.tables.missions as Row[]).map((row) => row.id)).toContain(MISSION_RES)
    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(statusOf(db, ID.mission)).toBe('scheduled')
    expect(failure.slack).toMatchObject({ cancelledLabels: [CARD_LABEL], problems: [{ itemLabel: MISSION_LABEL, reason: '공개 시각이 지나 취소할 수 없어요' }] })
  })

  it('미리 보기는 미션과 그 미션을 가리키는 카드를 쓰기 없이 돌려준다', async () => {
    const { db, preview } = linkedSetup()
    expect(await preview(ID.mission)).toEqual({ ok: true, body: { ok: true, dryRun: true, cancelIds: [ID.card, ID.mission], blockers: [] } })
    expect(nonSelect(db)).toEqual([])
    expect(db.calls.some((call) => call.table === 'missions')).toBe(false)
  })
})

// ── 레시피 취소 ──────────────────────────────────────────────────────────────────────────────────

describe('예약됨 레시피 취소 — 실제 레시피 핸들러 (티켓 20261002_2221)', () => {
  const RECIPE_RES = uid(21)
  const OTHER_RECIPE = uid(97)
  const BADGE_RES = uid(22)
  const RECIPE_LABEL = '믹스 레시피 · 10/10(토) 09:00'
  const REFERENCED = '가장 먼저 성공 배지나 카드가 이 레시피를 가리키고 있거나 확인하지 못해 지우지 않았어요'
  const recipeSpec = (extra: ItemSpec = {}): ItemSpec => ({
    id: ID.poster,
    key: 'recipe',
    kind: 'recipe',
    status: 'scheduled',
    createdResource: { recipe_id: RECIPE_RES },
    ...extra,
  })
  const recipeRow = (extra: Row = {}): Row => ({ id: RECIPE_RES, valid_from: LATER, valid_until: null, ...extra })
  const firstSuccessBadge: Row = { id: BADGE_RES, deleted_at: null, condition_json: { recipe_first_success: { recipe_id: RECIPE_RES } } }

  /** 지울 레시피(슬롯 포함)와 다른 레시피 하나가 있는 DB. */
  function recipeSetup(options: Parameters<typeof setup>[1] = {}, specs: ItemSpec[] = [recipeSpec()]) {
    const made = setup(specs, { ...options, cards: [] })
    made.db.tables.combination_recipes = [recipeRow(), recipeRow({ id: OTHER_RECIPE })]
    made.db.tables.combination_recipe_slots = [
      { id: 's1', recipe_id: RECIPE_RES },
      { id: 's2', recipe_id: OTHER_RECIPE },
    ]
    return made
  }
  const recipeIds = (db: FakeDb) => (db.tables.combination_recipes as Row[]).map((row) => row.id)
  /** 카드가 레시피를 가리키는 그룹(티켓 20261006_1218). 카드 행은 레시피 ID를 `recipe_id`로 갖는다. */
  function linkedRecipeSetup(options: Parameters<typeof setup>[1] = {}, specs: ItemSpec[] = [cardSpec({ links: ['recipe'] }), recipeSpec()]) {
    const made = recipeSetup(options, specs)
    made.db.tables.today_cards = [{ id: CARD_RES, starts_at: LATER, recipe_id: RECIPE_RES }]
    return made
  }
  const orderOf = (db: FakeDb) => db.calls.map((call) => `${call.table}:${call.op}`)

  it('공개 전이고 가리키는 배지가 없으면 레시피와 슬롯을 지우고 항목을 「취소」로 두며 cancel 기록을 남긴다. 다른 레시피는 건드리지 않는다', async () => {
    const { db, run } = recipeSetup()
    const result = ok(await run(ID.poster, '레시피를 접어요'))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.poster], missing: [] })
    expect(recipeIds(db)).toEqual([OTHER_RECIPE])
    expect((db.tables.combination_recipe_slots as Row[]).map((slot) => slot.id)).toEqual(['s2'])
    expect(statusOf(db, ID.poster)).toBe('cancelled')
    expect(db.decisions('cancel').map((row) => [row.item_id, row.reason, row.batch_id])).toEqual([[ID.poster, '레시피를 접어요', result.batchId]])
    expect(db.calls.find((call) => call.table === 'combination_recipes' && call.op === 'delete')?.filters).toEqual([['id', RECIPE_RES], ['valid_from >', NOW.toISOString()]])
    expect(result.slack.cancelledLabels).toEqual([RECIPE_LABEL])
  })

  it('공개 시각이 지난 레시피는 409이고 아무것도 지우지 않는다(상태 맞추기가 아직 게재중으로 바꾸지 않은 레시피)', async () => {
    const { db, run } = recipeSetup()
    db.tables.combination_recipes = [recipeRow({ valid_from: PAST })]
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('공개 시각이 지나 취소할 수 없어요')
    expect(failure.slack).toBeUndefined()
    expect(nonSelect(db)).toEqual([])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
    expect(db.decisions()).toEqual([])
  })

  it('공개됐다가 종료된 레시피도 409이고 지우지 않는다', async () => {
    const { db, run } = recipeSetup()
    db.tables.combination_recipes = [recipeRow({ valid_from: PAST, valid_until: '2026-10-05T02:30:00.000Z' })]
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('공개 시각이 지나 취소할 수 없어요')
    expect(nonSelect(db)).toEqual([])
  })

  it('가장 먼저 성공 배지가 이 레시피를 가리키면 409이고 아무것도 지우지 않는다. 레시피·배지 ID는 응답에 없다', async () => {
    const { db, run } = recipeSetup()
    db.tables.badges = [firstSuccessBadge]
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe(REFERENCED)
    expect(failure.error).not.toContain(RECIPE_RES)
    expect(failure.error).not.toContain(BADGE_RES)
    expect(nonSelect(db)).toEqual([])
    expect(recipeIds(db)).toEqual([RECIPE_RES, OTHER_RECIPE])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
    expect(db.decisions()).toEqual([])
  })

  it('레시피를 취소하면 그 레시피를 여는 카드를 먼저 지운 뒤 레시피를 지운다. 카드가 남아 있으면 레시피의 참조 확인에 걸리기 때문이다', async () => {
    const { db, run } = linkedRecipeSetup()
    const result = ok(await run(ID.poster, '레시피를 접어요'))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.card, ID.poster], missing: [] })
    expect(db.tables.today_cards).toEqual([])
    expect(recipeIds(db)).toEqual([OTHER_RECIPE])
    expect(statusOf(db, ID.card)).toBe('cancelled')
    expect(statusOf(db, ID.poster)).toBe('cancelled')
    const order = orderOf(db)
    expect(order.indexOf('today_cards:delete')).toBeLessThan(order.indexOf('combination_recipes:delete'))
    // 레시피의 참조 확인(today_cards를 레시피 ID로 센다)은 카드를 지운 뒤에 이뤄졌다
    expect(order.lastIndexOf('today_cards:select')).toBeGreaterThan(order.indexOf('today_cards:delete'))
  })

  it('카드만 취소하면 레시피는 남는다', async () => {
    const { db, run } = linkedRecipeSetup()
    const result = ok(await run(ID.card))

    expect(result.body.cancelled).toEqual([ID.card])
    expect(db.tables.today_cards).toEqual([])
    expect(recipeIds(db)).toEqual([RECIPE_RES, OTHER_RECIPE])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
  })

  it('레시피를 여는 카드가 이미 게재 중이면 409이고 아무것도 취소하지 않는다(그 카드를 먼저 종료해야 한다)', async () => {
    const { db, run } = linkedRecipeSetup({}, [cardSpec({ links: ['recipe'], status: 'live' }), recipeSpec()])
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.')
    expect(failure.extra).toEqual({ blockers: [{ id: ID.card, reason: failure.error }] })
    expect(nonSelect(db)).toEqual([])
    expect(recipeIds(db)).toEqual([RECIPE_RES, OTHER_RECIPE])
  })

  it('운영툴 밖에서 만든 카드(어드민 카드)가 레시피를 가리키면 409이고 아무것도 지우지 않는다. 테이블 이름·ID는 응답에 없다(티켓 20261006_1218 가정 A)', async () => {
    const { db, run } = recipeSetup({}, [recipeSpec()])
    db.tables.today_cards = [{ id: uid(60), starts_at: LATER, recipe_id: RECIPE_RES }]
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe(REFERENCED)
    expect(failure.error).not.toContain('today_cards')
    expect(failure.error).not.toContain(RECIPE_RES)
    expect(nonSelect(db)).toEqual([])
    expect(recipeIds(db)).toEqual([RECIPE_RES, OTHER_RECIPE])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
    expect(db.decisions()).toEqual([])
  })

  it('다른 레시피를 가리키는 어드민 카드는 취소를 막지 않는다', async () => {
    const { db, run } = recipeSetup({}, [recipeSpec()])
    db.tables.today_cards = [{ id: uid(60), starts_at: LATER, recipe_id: OTHER_RECIPE }, { id: uid(61), starts_at: LATER, recipe_id: null }]
    ok(await run(ID.poster))

    expect(recipeIds(db)).toEqual([OTHER_RECIPE])
    expect((db.tables.today_cards as Row[]).map((row) => row.id)).toEqual([uid(60), uid(61)])
  })

  it('가리키는 배지가 지워졌거나 다른 레시피를 가리키면 취소할 수 있다', async () => {
    const { db, run } = recipeSetup()
    db.tables.badges = [{ ...firstSuccessBadge, deleted_at: '2026-10-01T00:00:00.000Z' }, { id: uid(23), deleted_at: null, condition_json: { recipe_first_success: { recipe_id: OTHER_RECIPE } } }]
    ok(await run(ID.poster))

    expect(recipeIds(db)).toEqual([OTHER_RECIPE])
  })

  it('밖에서 이미 지워진 레시피는 missing으로 두고 항목만 「취소」로 둔다', async () => {
    const { db, run } = setup([recipeSpec()], { cards: [] })
    const result = ok(await run(ID.poster))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.poster], missing: [ID.poster] })
    expect(statusOf(db, ID.poster)).toBe('cancelled')
    expect(nonSelect(db).filter((call) => call.table.startsWith('combination_recipe'))).toEqual([])
  })

  it('읽지 못하면 500 고정 문장이고 DB 오류 원문·레시피 ID는 응답·기록·슬랙에 없다. 항목은 예약됨 그대로다', async () => {
    const { db, run } = recipeSetup()
    db.failIf = (call) => call.table === 'combination_recipes' && call.op === 'select'
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(500)
    for (const output of await outputsOf(db, failure)) {
      expect(output).not.toContain(DB_SECRET)
      expect(output).not.toContain(RECIPE_RES)
    }
    expect(recipeIds(db)).toEqual([RECIPE_RES, OTHER_RECIPE])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
    expect(logged()).toContain(DB_SECRET)
  })

  it('가리키는 배지를 읽지 못하면 지우지 않고 500이다(확인 없이 지우지 않는다)', async () => {
    const { db, run } = recipeSetup()
    db.failIf = (call) => call.table === 'badges'
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(500)
    expect(recipeIds(db)).toEqual([RECIPE_RES, OTHER_RECIPE])
    expect(JSON.stringify(failure)).not.toContain(DB_SECRET)
  })

  it('시험 묶음은 레시피 표를 읽지도 쓰지도 않고 항목만 「취소」로 둔다', async () => {
    const { db, run } = setup([recipeSpec({ createdResource: { sample: true } })], { bundle: { is_sample: true }, cards: [] })
    const result = ok(await run(ID.poster))

    expect(result.body.cancelled).toEqual([ID.poster])
    expect(db.calls.filter((call) => call.table.startsWith('combination_recipe'))).toEqual([])
  })

  it('미리 보기는 쓰기 없이 레시피 하나를 돌려준다', async () => {
    const { db, preview } = recipeSetup()
    expect(await preview(ID.poster)).toEqual({ ok: true, body: { ok: true, dryRun: true, cancelIds: [ID.poster], blockers: [] } })
    expect(nonSelect(db)).toEqual([])
    expect(db.calls.some((call) => call.table.startsWith('combination_recipe'))).toBe(false)
  })
})

// ── 드랍 예약 취소 ───────────────────────────────────────────────────────────────────────────────

describe('예약됨 드랍 취소 — 실제 드랍 핸들러 (티켓 20261002_2306)', () => {
  const DROP_RES = uid(31)
  const OTHER_DROP = uid(96)
  const DROP_LABEL = '드랍 일정 · 10/10(토) 09:00'
  const PUBLISHED = '공개 시각이 지나 취소할 수 없어요'
  const dropSpec = (extra: ItemSpec = {}): ItemSpec => ({
    id: ID.poster,
    key: 'drop',
    kind: 'drop_schedule',
    status: 'scheduled',
    createdResource: { ambient_drop_schedule_id: DROP_RES },
    ...extra,
  })
  const dropRow = (extra: Row = {}): Row => ({
    id: DROP_RES,
    status: 'scheduled',
    scheduled_at: LATER,
    claimed_at: null,
    canceled_at: null,
    finished_at: null,
    ...extra,
  })
  const statuses = (db: FakeDb) => (db.tables.ambient_drop_schedules as Row[]).map((row) => [row.id, row.status])

  /** 취소할 예약과 다른 예약 하나가 있는 DB. */
  function dropSetup(options: Parameters<typeof setup>[1] = {}, specs: ItemSpec[] = [dropSpec()]) {
    const made = setup(specs, { ...options, cards: [] })
    made.db.tables.ambient_drop_schedules = [dropRow(), dropRow({ id: OTHER_DROP })]
    return made
  }

  it('공개 전이면 예약을 지우지 않고 「취소」 상태로 남기고 항목을 「취소」로 두며 cancel 기록을 남긴다. 다른 예약은 건드리지 않는다', async () => {
    const { db, run } = dropSetup()
    const result = ok(await run(ID.poster, '드랍을 접어요'))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.poster], missing: [] })
    expect(statuses(db)).toEqual([
      [DROP_RES, 'canceled'],
      [OTHER_DROP, 'scheduled'],
    ])
    expect(db.tables.ambient_drop_schedules[0]).toMatchObject({ canceled_at: NOW.toISOString(), updated_at: NOW.toISOString() })
    expect(db.calls.filter((call) => call.table === 'ambient_drop_schedules' && call.op === 'delete')).toEqual([])
    expect(db.calls.find((call) => call.table === 'ambient_drop_schedules' && call.op === 'update')?.filters).toEqual([
      ['id', DROP_RES],
      ['status', 'scheduled'],
    ])
    expect(statusOf(db, ID.poster)).toBe('cancelled')
    expect(db.decisions('cancel').map((row) => [row.item_id, row.reason, row.batch_id])).toEqual([[ID.poster, '드랍을 접어요', result.batchId]])
    expect(result.slack.cancelledLabels).toEqual([DROP_LABEL])
  })

  it('예정 시각이 지난 예약은 아직 scheduled여도 409이고 아무것도 바꾸지 않는다(서버 함수는 시각을 보지 않아 핸들러가 막는다)', async () => {
    const { db, run } = dropSetup()
    db.tables.ambient_drop_schedules = [dropRow({ scheduled_at: PAST })]
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe(PUBLISHED)
    expect(failure.slack).toBeUndefined()
    expect(nonSelect(db)).toEqual([])
    expect(statuses(db)).toEqual([[DROP_RES, 'scheduled']])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
    expect(db.decisions()).toEqual([])
  })

  it.each([
    ['실행 중', { status: 'running', claimed_at: PAST }],
    ['멈춤', { status: 'running', claimed_at: '2026-10-05T01:00:00.000Z' }],
    ['완료', { status: 'done', finished_at: PAST }],
    ['건너뜀', { status: 'skipped', finished_at: PAST }],
    ['실패', { status: 'failed', finished_at: PAST }],
    ['놓침', { status: 'missed', finished_at: PAST }],
  ])('%s 예약은 409이고 아무것도 바꾸지 않는다', async (_name, extra) => {
    const { db, run } = dropSetup()
    db.tables.ambient_drop_schedules = [dropRow(extra)]
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe(PUBLISHED)
    expect(nonSelect(db)).toEqual([])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
  })

  it('밖에서 이미 취소된 예약은 missing으로 두고 항목만 「취소」로 둔다. 예약 행은 다시 쓰지 않는다', async () => {
    const { db, run } = dropSetup()
    db.tables.ambient_drop_schedules = [dropRow({ status: 'canceled', canceled_at: PAST })]
    const result = ok(await run(ID.poster))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.poster], missing: [ID.poster] })
    expect(statusOf(db, ID.poster)).toBe('cancelled')
    expect(nonSelect(db).filter((call) => call.table === 'ambient_drop_schedules')).toEqual([])
  })

  it('밖에서 지워진 예약은 missing으로 두고 항목만 「취소」로 둔다', async () => {
    const { db, run } = setup([dropSpec()], { cards: [] })
    const result = ok(await run(ID.poster))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.poster], missing: [ID.poster] })
    expect(statusOf(db, ID.poster)).toBe('cancelled')
    expect(nonSelect(db).filter((call) => call.table === 'ambient_drop_schedules')).toEqual([])
  })

  it('읽지 못하면 500 고정 문장이고 DB 오류 원문·예약 ID는 응답·기록·슬랙에 없다. 항목은 예약됨 그대로다', async () => {
    const { db, run } = dropSetup()
    db.failIf = (call) => call.table === 'ambient_drop_schedules' && call.op === 'select'
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(500)
    for (const output of await outputsOf(db, failure)) {
      expect(output).not.toContain(DB_SECRET)
      expect(output).not.toContain(DROP_RES)
    }
    expect(statuses(db)).toEqual([
      [DROP_RES, 'scheduled'],
      [OTHER_DROP, 'scheduled'],
    ])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
    expect(logged()).toContain(DB_SECRET)
  })

  it('상태를 바꾸는 쓰기가 실패하면 500이고 예약은 그대로다. 원문은 로그에만 남는다', async () => {
    const { db, run } = dropSetup()
    db.failIf = (call) => call.table === 'ambient_drop_schedules' && call.op === 'update'
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(500)
    expect(statuses(db)[0]).toEqual([DROP_RES, 'scheduled'])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
    for (const output of await outputsOf(db, failure)) expect(output).not.toContain(DB_SECRET)
  })

  it('읽은 뒤 쓰기 전에 실행이 시작되면 취소하지 않고 409다', async () => {
    const { db, run } = dropSetup()
    db.beforeRun = (call) => {
      if (call.table === 'ambient_drop_schedules' && call.op === 'update') db.tables.ambient_drop_schedules[0].status = 'running'
    }
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe(PUBLISHED)
    expect(statuses(db)[0]).toEqual([DROP_RES, 'running'])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
    expect(db.decisions()).toEqual([])
  })

  it('시험 묶음은 예약 표를 읽지도 쓰지도 않고 항목만 「취소」로 둔다', async () => {
    const { db, run } = setup([dropSpec({ createdResource: { sample: true } })], { bundle: { is_sample: true }, cards: [] })
    const result = ok(await run(ID.poster))

    expect(result.body.cancelled).toEqual([ID.poster])
    expect(db.calls.filter((call) => call.table === 'ambient_drop_schedules')).toEqual([])
  })

  it('미리 보기는 쓰기 없이 드랍 하나를 돌려준다', async () => {
    const { db, preview } = dropSetup()
    expect(await preview(ID.poster)).toEqual({ ok: true, body: { ok: true, dryRun: true, cancelIds: [ID.poster], blockers: [] } })
    expect(nonSelect(db)).toEqual([])
    expect(db.calls.some((call) => call.table === 'ambient_drop_schedules')).toBe(false)
  })
})

// ── JAM! 배지 취소 ───────────────────────────────────────────────────────────────────────────────

describe('예약됨 JAM! 배지 취소 — 실제 배지 핸들러 (티켓 20261004_1756)', () => {
  const BADGE_RES = uid(13)
  const badgeSpec = (extra: ItemSpec = {}): ItemSpec => ({
    id: ID.badge,
    key: 'badge',
    kind: 'jam_badge',
    status: 'scheduled',
    createdResource: { badge_id: BADGE_RES },
    ...extra,
  })
  const badgeRow = (extra: Row = {}): Row => ({ id: BADGE_RES, name: '첫 믹스', valid_from: LATER, valid_until: null, deleted_at: null, ...extra })
  const OTHER_BADGE = { id: uid(98), name: '기존 배지', valid_from: PAST, valid_until: null, deleted_at: null }
  const BADGE_LABEL = 'JAM! 배지 · 10/10(토) 09:00'
  const orderOf = (db: FakeDb) => db.calls.map((call) => `${call.table}:${call.op}`)

  /** 배지만 있는 묶음. 카드·미션 행은 없다. */
  function soloSetup(options: Parameters<typeof setup>[1] = {}) {
    const made = setup([badgeSpec()], { ...options, cards: [] })
    made.db.tables.badges = [badgeRow(), OTHER_BADGE]
    return made
  }

  /** 카드와 미션이 배지를 가리키는 그룹. 카드 행은 `badge_ids`, 미션 행은 `reward_badge_ids`로 배지 ID를 갖는다. */
  function linkedSetup(options: Parameters<typeof setup>[1] = {}, specs: ItemSpec[] = [cardSpec({ links: ['badge'] }), missionSpec({ links: ['badge'] }), badgeSpec()]) {
    const made = setup(specs, { ...options, cards: [{ id: CARD_RES, starts_at: LATER, badge_ids: [BADGE_RES] }] })
    made.db.tables.missions = [{ id: MISSION_RES, starts_at: LATER, ends_at: null, exposure_mode: 'start_date', exposure_at: null, reward_badge_ids: [BADGE_RES] }]
    made.db.tables.badges = [badgeRow(), OTHER_BADGE]
    return made
  }

  it('공개 전 배지를 취소하면 그 ID의 행만 지우고 지울 때 `valid_from > 지금` 조건을 건다. 항목은 「취소」, 결정 기록 한 줄이다', async () => {
    const { db, run } = soloSetup()
    const result = ok(await run(ID.badge, '배지를 접어요'))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.badge], missing: [] })
    expect((db.tables.badges as Row[]).map((row) => row.id)).toEqual([OTHER_BADGE.id])
    expect(statusOf(db, ID.badge)).toBe('cancelled')
    expect(db.decisions('cancel').map((row) => [row.item_id, row.reason, row.batch_id])).toEqual([[ID.badge, '배지를 접어요', result.batchId]])
    expect(db.calls.find((call) => call.table === 'badges' && call.op === 'delete')?.filters).toEqual([['id', BADGE_RES], ['valid_from >', NOW.toISOString()]])
    expect(result.slack.cancelledLabels).toEqual([BADGE_LABEL])
    // created_resource는 지운 뒤에도 남는다(무엇을 만들었다가 지웠는지)
    expect(db.item(ID.badge).created_resource).toEqual({ badge_id: BADGE_RES })
  })

  it('배지를 취소하면 그 배지를 가리키는 카드·미션이 먼저 취소되고 배지는 마지막에 지워진다. 가리키는 항목이 남아 있으면 배지의 참조 확인에 걸리기 때문이다', async () => {
    const { db, run } = linkedSetup()
    const result = ok(await run(ID.badge))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.card, ID.mission, ID.badge], missing: [] })
    expect(db.tables.today_cards).toEqual([])
    expect(db.tables.missions).toEqual([])
    expect((db.tables.badges as Row[]).map((row) => row.id)).toEqual([OTHER_BADGE.id])
    for (const id of [ID.card, ID.mission, ID.badge]) expect(statusOf(db, id)).toBe('cancelled')
    const order = orderOf(db)
    expect(order.indexOf('today_cards:delete')).toBeLessThan(order.indexOf('missions:delete'))
    expect(order.indexOf('missions:delete')).toBeLessThan(order.indexOf('badges:delete'))
    // 배지의 참조 확인(배열 칸을 배지 ID로 센다)은 가리키던 행을 지운 뒤에 이뤄졌다
    expect(order.lastIndexOf('missions:select')).toBeGreaterThan(order.indexOf('missions:delete'))
    expect(result.slack.cancelledLabels).toEqual([CARD_LABEL, MISSION_LABEL, BADGE_LABEL])
    expect(new Set(db.decisions('cancel').map((row) => row.batch_id))).toEqual(new Set([result.batchId]))
  })

  it('카드만 취소하면 배지는 남는다', async () => {
    const { db, run } = linkedSetup()
    const result = ok(await run(ID.card))

    expect(result.body.cancelled).toEqual([ID.card])
    expect((db.tables.badges as Row[]).map((row) => row.id)).toEqual([BADGE_RES, OTHER_BADGE.id])
    expect(statusOf(db, ID.badge)).toBe('scheduled')
    expect(statusOf(db, ID.mission)).toBe('scheduled')
  })

  it.each([
    ['공개 시각이 지났다', { valid_from: PAST }],
    ['공개 시각이 정확히 지금이다', { valid_from: NOW.toISOString() }],
    ['공개 시각이 비었다', { valid_from: null }],
  ])('%s: 409이고 아무것도 지우지 않는다(상태 맞추기가 아직 게재중으로 바꾸지 않은 배지)', async (_label, row) => {
    const { db, run } = soloSetup()
    ;(db.tables.badges[0] as Row).valid_from = row.valid_from
    const failure = bad(await run(ID.badge))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('공개 시각이 지나 취소할 수 없어요')
    expect(failure.slack).toBeUndefined()
    expect(nonSelect(db)).toEqual([])
    expect(statusOf(db, ID.badge)).toBe('scheduled')
    expect(db.decisions()).toEqual([])
  })

  it('획득 기록이 붙은 배지는 409이고 지우지 않는다. 테이블 이름은 응답에 없다', async () => {
    const { db, run } = soloSetup()
    db.tables.user_activity_badges = [{ id: 'u-1', badge_id: BADGE_RES }]
    const failure = bad(await run(ID.badge))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('획득 기록이나 연결이 있거나 확인하지 못해 배지를 지우지 않았어요')
    expect(failure.error).not.toContain('user_activity_badges')
    expect(nonSelect(db)).toEqual([])
    expect(db.tables.badges).toHaveLength(2)
    expect(logged()).toContain('user_activity_badges')
  })

  it('운영툴 밖에서 만든 미션이 배지를 보상으로 가리키면 409이고 아무것도 지우지 않는다', async () => {
    const { db, run } = soloSetup()
    db.tables.missions = [{ id: uid(61), starts_at: LATER, reward_badge_ids: [BADGE_RES] }]
    const failure = bad(await run(ID.badge))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('획득 기록이나 연결이 있거나 확인하지 못해 배지를 지우지 않았어요')
    expect(nonSelect(db)).toEqual([])
    expect(logged()).toContain('missions.reward_badge_ids')
  })

  it('밖에서 이미 지워지거나 소프트 삭제된 배지는 missing으로 두고 항목만 「취소」로 둔다', async () => {
    const gone = setup([badgeSpec()], { cards: [] })
    const goneResult = ok(await gone.run(ID.badge))
    expect(goneResult.body).toEqual({ ok: true, cancelled: [ID.badge], missing: [ID.badge] })
    expect(statusOf(gone.db, ID.badge)).toBe('cancelled')
    expect(nonSelect(gone.db).filter((call) => call.table === 'badges')).toEqual([])

    const soft = soloSetup()
    ;(soft.db.tables.badges[0] as Row).deleted_at = '2026-10-04T00:00:00.000Z'
    const softResult = ok(await soft.run(ID.badge))
    expect(softResult.body).toEqual({ ok: true, cancelled: [ID.badge], missing: [ID.badge] })
    expect(soft.db.tables.badges).toHaveLength(2) // 소프트 삭제된 행은 그대로 둔다
  })

  it('배지를 가리키는 미션이 이미 게재 중이면 아무것도 취소하지 않고 409다', async () => {
    const { db, run } = linkedSetup({}, [missionSpec({ links: ['badge'], status: 'live' }), badgeSpec()])
    const failure = bad(await run(ID.badge))

    expect(failure.status).toBe(409)
    expect(failure.error).toContain('이미 게재 중')
    expect(nonSelect(db)).toEqual([])
    expect((db.tables.badges as Row[]).map((row) => row.id)).toEqual([BADGE_RES, OTHER_BADGE.id])
  })

  it('배지는 취소 시점에 공개 시각이 지났는데 미션·카드는 공개 전이면 카드·미션만 지우고 배지에서 막혀 부분 실패(500)다', async () => {
    const { db, run } = linkedSetup()
    ;(db.tables.badges[0] as Row).valid_from = PAST
    const failure = bad(await run(ID.badge))

    expect(failure.status).toBe(500)
    expect(failure.extra).toEqual({ cancelled: [ID.card, ID.mission] })
    expect(db.tables.today_cards).toEqual([])
    expect(db.tables.missions).toEqual([])
    expect((db.tables.badges as Row[]).map((row) => row.id)).toContain(BADGE_RES)
    expect(statusOf(db, ID.badge)).toBe('scheduled')
    expect(failure.slack).toMatchObject({ problems: [{ itemLabel: BADGE_LABEL, reason: '공개 시각이 지나 취소할 수 없어요' }] })
  })

  it('지우는 중 DB 오류는 500 고정 문장이다. DB 오류 원문·배지 ID는 응답·기록·슬랙에 없고 서버 로그에만 있다', async () => {
    const { db, run } = soloSetup()
    db.failIf = (call) => call.table === 'badges' && call.op === 'delete'
    const failure = bad(await run(ID.badge))

    expect(failure.status).toBe(500)
    expect(failure.error).toBe('취소하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    for (const output of await outputsOf(db, failure)) {
      expect(output).not.toContain(DB_SECRET)
      expect(output).not.toContain(BADGE_RES)
    }
    expect(logged()).toContain(DB_SECRET)
    expect(statusOf(db, ID.badge)).toBe('scheduled')
  })

  it('시험 묶음은 badges를 읽지도 쓰지도 않고 항목만 「취소」로 둔다', async () => {
    const { db, run } = setup([badgeSpec({ createdResource: { sample: true } })], { bundle: { is_sample: true }, cards: [] })
    const result = ok(await run(ID.badge))

    expect(result.body.cancelled).toEqual([ID.badge])
    expect(db.calls.filter((call) => call.table === 'badges')).toEqual([])
  })

  it('미리 보기는 배지와 그 배지를 가리키는 카드·미션을 쓰기 없이 돌려준다', async () => {
    const { db, preview } = linkedSetup()
    expect(await preview(ID.badge)).toEqual({ ok: true, body: { ok: true, dryRun: true, cancelIds: [ID.card, ID.mission, ID.badge], blockers: [] } })
    expect(nonSelect(db)).toEqual([])
    expect(db.calls.some((call) => call.table === 'badges')).toBe(false)
  })
})

// ── 컬렉션 취소 ──────────────────────────────────────────────────────────────────────────────────

describe('예약됨 컬렉션 취소 — 실제 컬렉션 핸들러 (티켓 20261004_2039)', () => {
  const BOOK_RES = uid(14)
  const BADGE_RES = uid(13)
  const bookSpec = (extra: ItemSpec = {}): ItemSpec => ({
    id: ID.poster,
    key: 'collection',
    kind: 'collection_launch',
    status: 'scheduled',
    createdResource: { item_book_id: BOOK_RES },
    ...extra,
  })
  const badgeSpec = (extra: ItemSpec = {}): ItemSpec => ({
    id: ID.badge,
    key: 'badge',
    kind: 'jam_badge',
    status: 'scheduled',
    createdResource: { badge_id: BADGE_RES },
    ...extra,
  })
  const bookRow = (extra: Row = {}): Row => ({ id: BOOK_RES, name: '가을 컬렉션', is_active: true, valid_from: LATER, valid_until: null, reward_badge_id: null, ...extra })
  const OTHER_BOOK = { id: uid(97), name: '기존 컬렉션', is_active: true, valid_from: PAST, valid_until: null }
  const BOOK_LABEL = '컬렉션 런칭 · 10/10(토) 09:00'
  const BADGE_LABEL = 'JAM! 배지 · 10/10(토) 09:00'
  const orderOf = (db: FakeDb) => db.calls.map((call) => `${call.table}:${call.op}`)
  const bookIds = (db: FakeDb) => (db.tables.item_books as Row[]).map((row) => row.id)

  /** 컬렉션만 있는 묶음. 카드 행은 없다. */
  function soloSetup(options: Parameters<typeof setup>[1] = {}) {
    const made = setup([bookSpec()], { ...options, cards: [] })
    made.db.tables.item_books = [bookRow(), OTHER_BOOK]
    return made
  }

  /** 카드가 컬렉션을 가리키는 그룹. 카드 행은 컬렉션 ID를 `item_book_id`로 갖는다. */
  function cardSetup(options: Parameters<typeof setup>[1] = {}, specs: ItemSpec[] = [cardSpec({ links: ['collection'] }), bookSpec()]) {
    const made = setup(specs, { ...options, cards: [{ id: CARD_RES, starts_at: LATER, item_book_id: BOOK_RES }] })
    made.db.tables.item_books = [bookRow(), OTHER_BOOK]
    return made
  }

  /** 카드 → 컬렉션 → 보상 배지 그룹. 컬렉션 행은 `reward_badge_id`로 배지 ID를 갖는다. */
  function chainSetup(options: Parameters<typeof setup>[1] = {}) {
    const made = setup([cardSpec({ links: ['collection'] }), bookSpec({ links: ['badge'] }), badgeSpec()], {
      ...options,
      cards: [{ id: CARD_RES, starts_at: LATER, item_book_id: BOOK_RES }],
    })
    made.db.tables.item_books = [bookRow({ reward_badge_id: BADGE_RES }), OTHER_BOOK]
    made.db.tables.badges = [{ id: BADGE_RES, name: '완성 보상', valid_from: LATER, valid_until: null, deleted_at: null }]
    return made
  }

  it('공개 전 컬렉션을 취소하면 그 ID의 행만 지우고 지울 때 `valid_from > 지금` 조건을 건다. 항목은 「취소」, 결정 기록 한 줄이다', async () => {
    const { db, run } = soloSetup()
    const result = ok(await run(ID.poster, '컬렉션을 접어요'))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.poster], missing: [] })
    expect(bookIds(db)).toEqual([OTHER_BOOK.id])
    expect(statusOf(db, ID.poster)).toBe('cancelled')
    expect(db.decisions('cancel').map((row) => [row.item_id, row.reason, row.batch_id])).toEqual([[ID.poster, '컬렉션을 접어요', result.batchId]])
    expect(db.calls.find((call) => call.table === 'item_books' && call.op === 'delete')?.filters).toEqual([['id', BOOK_RES], ['valid_from >', NOW.toISOString()]])
    expect(result.slack.cancelledLabels).toEqual([BOOK_LABEL])
    // created_resource는 지운 뒤에도 남는다(무엇을 만들었다가 지웠는지)
    expect(db.item(ID.poster).created_resource).toEqual({ item_book_id: BOOK_RES })
  })

  it('컬렉션을 취소하면 그 컬렉션을 가리키는 카드가 먼저 취소되고 컬렉션은 나중에 지워진다. 카드가 남아 있으면 컬렉션의 참조 확인에 걸리기 때문이다', async () => {
    const { db, run } = cardSetup()
    const result = ok(await run(ID.poster))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.card, ID.poster], missing: [] })
    expect(db.tables.today_cards).toEqual([])
    expect(bookIds(db)).toEqual([OTHER_BOOK.id])
    for (const id of [ID.card, ID.poster]) expect(statusOf(db, id)).toBe('cancelled')
    const order = orderOf(db)
    expect(order.indexOf('today_cards:delete')).toBeLessThan(order.indexOf('item_books:delete'))
    // 컬렉션의 참조 확인(카드의 컬렉션 칸을 센다)은 카드를 지운 뒤에 이뤄졌다
    expect(order.lastIndexOf('today_cards:select')).toBeGreaterThan(order.indexOf('today_cards:delete'))
    expect(result.slack.cancelledLabels).toEqual([CARD_LABEL, BOOK_LABEL])
  })

  it('카드만 취소하면 컬렉션은 남는다', async () => {
    const { db, run } = cardSetup()
    const result = ok(await run(ID.card))

    expect(result.body.cancelled).toEqual([ID.card])
    expect(bookIds(db)).toEqual([BOOK_RES, OTHER_BOOK.id])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
  })

  it('보상 배지를 취소하면 그 배지를 보상으로 가리키는 컬렉션(과 그 컬렉션을 가리키는 카드)이 먼저 취소되고 배지는 마지막에 지워진다. 컬렉션이 남아 있으면 배지의 참조 확인에 걸리기 때문이다', async () => {
    const { db, run } = chainSetup()
    const result = ok(await run(ID.badge))

    expect(result.body).toEqual({ ok: true, cancelled: [ID.card, ID.poster, ID.badge], missing: [] })
    expect(db.tables.today_cards).toEqual([])
    expect(bookIds(db)).toEqual([OTHER_BOOK.id])
    expect(db.tables.badges).toEqual([])
    for (const id of [ID.card, ID.poster, ID.badge]) expect(statusOf(db, id)).toBe('cancelled')
    const order = orderOf(db)
    expect(order.indexOf('today_cards:delete')).toBeLessThan(order.indexOf('item_books:delete'))
    expect(order.indexOf('item_books:delete')).toBeLessThan(order.indexOf('badges:delete'))
    // 배지의 참조 확인(컬렉션의 보상 배지 칸을 센다)은 컬렉션을 지운 뒤에 이뤄졌다
    expect(order.lastIndexOf('item_books:select')).toBeGreaterThan(order.indexOf('item_books:delete'))
    expect(result.slack.cancelledLabels).toEqual([CARD_LABEL, BOOK_LABEL, BADGE_LABEL])
  })

  it('컬렉션만 취소하면 보상 배지는 남는다(가리키는 쪽만 함께 취소된다)', async () => {
    const { db, run } = chainSetup()
    const result = ok(await run(ID.poster))

    expect(result.body.cancelled).toEqual([ID.card, ID.poster])
    expect(bookIds(db)).toEqual([OTHER_BOOK.id])
    expect(db.tables.badges).toHaveLength(1)
    expect(statusOf(db, ID.badge)).toBe('scheduled')
  })

  it.each([
    ['공개 시각이 지났다', { valid_from: PAST }],
    ['공개 시각이 정확히 지금이다', { valid_from: NOW.toISOString() }],
    ['공개 시각이 비었다', { valid_from: null }],
  ])('%s: 409이고 아무것도 지우지 않는다(상태 맞추기가 아직 게재중으로 바꾸지 않은 컬렉션)', async (_label, row) => {
    const { db, run } = soloSetup()
    ;(db.tables.item_books[0] as Row).valid_from = row.valid_from
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('공개 시각이 지나 취소할 수 없어요')
    expect(failure.slack).toBeUndefined()
    expect(nonSelect(db)).toEqual([])
    expect(statusOf(db, ID.poster)).toBe('scheduled')
    expect(db.decisions()).toEqual([])
  })

  it.each([
    ['아이템 배지가 붙었다(소프트 삭제된 배지도)', 'badges', { id: uid(70), item_book_id: BOOK_RES, deleted_at: '2026-09-01T00:00:00.000Z' }],
    ['유저가 장착했다', 'user_item_book_slots', { user_id: uid(71), item_book_id: BOOK_RES }],
    ['유저가 완성했다', 'user_item_book_completions', { user_id: uid(71), item_book_id: BOOK_RES }],
    ['포인트 내역이 있다', 'point_transactions', { id: uid(72), source_item_book_id: BOOK_RES }],
    ['자동 드랍 설정이 고른 컬렉션이다', 'ambient_drop_config', { id: 1, collection_ids: [BOOK_RES] }],
    ['끝나지 않은 드랍 예약이 고른 컬렉션이다', 'ambient_drop_schedules', { id: uid(73), status: 'scheduled', collection_ids: [BOOK_RES] }],
  ])('%s: 409이고 지우지 않는다. 테이블 이름은 응답에 없다', async (_label, table, row) => {
    const { db, run } = soloSetup()
    db.tables[table] = [row]
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(409)
    expect(failure.error).toBe('아이템 배지나 유저 기록·연결이 있거나 확인하지 못해 컬렉션을 지우지 않았어요')
    expect(failure.error).not.toContain(table)
    expect(nonSelect(db)).toEqual([])
    expect(db.tables.item_books).toHaveLength(2)
    expect(logged()).toContain(table)
  })

  it('공개 전에 취소된 드랍 예약(「취소」로 남은 행)은 막지 않는다', async () => {
    const { db, run } = soloSetup()
    db.tables.ambient_drop_schedules = [{ id: uid(74), status: 'canceled', collection_ids: [BOOK_RES] }]
    const result = ok(await run(ID.poster))
    expect(result.body.cancelled).toEqual([ID.poster])
  })

  it('밖에서 이미 지워진 컬렉션은 missing으로 두고 항목만 「취소」로 둔다', async () => {
    const gone = setup([bookSpec()], { cards: [] })
    const result = ok(await gone.run(ID.poster))
    expect(result.body).toEqual({ ok: true, cancelled: [ID.poster], missing: [ID.poster] })
    expect(statusOf(gone.db, ID.poster)).toBe('cancelled')
    expect(nonSelect(gone.db).filter((call) => call.table === 'item_books')).toEqual([])
  })

  it('컬렉션을 가리키는 카드가 이미 게재 중이면 아무것도 취소하지 않고 409다', async () => {
    const { db, run } = cardSetup({}, [cardSpec({ links: ['collection'], status: 'live' }), bookSpec()])
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(409)
    expect(failure.error).toContain('이미 게재 중')
    expect(nonSelect(db)).toEqual([])
    expect(bookIds(db)).toEqual([BOOK_RES, OTHER_BOOK.id])
  })

  it('컬렉션은 취소 시점에 공개 시각이 지났는데 카드는 공개 전이면 카드만 지우고 컬렉션에서 막혀 부분 실패(500)다', async () => {
    const { db, run } = cardSetup()
    ;(db.tables.item_books[0] as Row).valid_from = PAST
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(500)
    expect(failure.extra).toEqual({ cancelled: [ID.card] })
    expect(db.tables.today_cards).toEqual([])
    expect(bookIds(db)).toContain(BOOK_RES)
    expect(statusOf(db, ID.poster)).toBe('scheduled')
    expect(failure.slack).toMatchObject({ problems: [{ itemLabel: BOOK_LABEL, reason: '공개 시각이 지나 취소할 수 없어요' }] })
  })

  it('지우는 중 DB 오류는 500 고정 문장이다. DB 오류 원문·컬렉션 ID는 응답·기록·슬랙에 없고 서버 로그에만 있다', async () => {
    const { db, run } = soloSetup()
    db.failIf = (call) => call.table === 'item_books' && call.op === 'delete'
    const failure = bad(await run(ID.poster))

    expect(failure.status).toBe(500)
    expect(failure.error).toBe('취소하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    for (const output of await outputsOf(db, failure)) {
      expect(output).not.toContain(DB_SECRET)
      expect(output).not.toContain(BOOK_RES)
    }
    expect(logged()).toContain(DB_SECRET)
    expect(statusOf(db, ID.poster)).toBe('scheduled')
  })

  it('시험 묶음은 item_books를 읽지도 쓰지도 않고 항목만 「취소」로 둔다', async () => {
    const { db, run } = setup([bookSpec({ createdResource: { sample: true } })], { bundle: { is_sample: true }, cards: [] })
    const result = ok(await run(ID.poster))

    expect(result.body.cancelled).toEqual([ID.poster])
    expect(db.calls.filter((call) => call.table === 'item_books')).toEqual([])
  })

  it('미리 보기는 컬렉션과 그 컬렉션을 가리키는 카드를 쓰기 없이 돌려준다', async () => {
    const { db, preview } = cardSetup()
    expect(await preview(ID.poster)).toEqual({ ok: true, body: { ok: true, dryRun: true, cancelIds: [ID.card, ID.poster], blockers: [] } })
    expect(nonSelect(db)).toEqual([])
    expect(db.calls.some((call) => call.table === 'item_books')).toBe(false)
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
    const { db, preview } = setup([cardSpec({ status: 'approved' }), { id: ID.poster, key: 'collection', kind: 'collection_launch', status: 'scheduled', createdResource: { item_book_id: uid(21) } }], {
      handlers: { ...EXECUTE_HANDLERS, collection_launch: undefined },
    })
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
