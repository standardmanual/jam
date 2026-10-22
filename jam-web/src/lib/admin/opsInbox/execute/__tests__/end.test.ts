/**
 * 공개 뒤 「지금 종료」 (티켓 20261006_0950, 상위 20260930_1500 ⑪-a). 가정 번호는 티켓 「착수 전에 정한 것」 번호다. 실제 핸들러 다섯 종류와 메모리 DB(`fakeDb.ts`)로 지킨다.
 *
 * - 종료(가정 6~8): 종류마다 자원의 종료 칼럼이 지금이 되고 항목은 「종료」·`ends_at` = 지금, 결정 기록 `end` 1행(사유·`diff`). 상시 미션도 끝난다. 이미 끝났거나(`alreadyEnded`) 없으면(`missing`) 자원은 건드리지 않는다
 * - 막는 경우: 게재중이 아님(409 `notLive`)·`end`가 없는 종류(409 `noEnd`)·두 번째 요청(409, 자원은 한 번만)·아직 공개 전인 자원(409, 항목은 게재중으로)·묶음에 없는 항목(404)
 * - 실패(가정 6·14): 자원 종료 실패(DB 오류·읽은 뒤 바뀜·핸들러가 던짐)는 항목을 되돌리고 500 `endFailed`, 되돌림도 실패하면 500 `revertFailed`와 `#jam-alert` 글. DB 오류 원문은 어디에도 나오지 않는다
 * - 시험 묶음(가정 12): 자원 읽기·쓰기 없이 상태만 바꾸고 결정 기록을 남기며 슬랙 글이 「[시험]」으로 시작한다. 결정 기록 실패는 200 + `decisionLogFailed`
 * - 티켓 20261006_1038(⑪-b): 숨긴(`hidden`) 게재 중 미션도 시작 시각이 지났으면 끝낸다, 노출일 지정 미션의 시작 시각은 `exposure_at`이다, 409 문장에서 「화면을 새로 고쳐…」를 뺐다, 되돌림 실패 500에 `itemEnded: true`가 실린다
 * - 미리 보기(가정 10·11): 쓰기 0회, 직접 가리키는 `live` 항목만, 미션·컬렉션의 영향 유저 수, 세기 실패는 `impact: null`
 */
import { vi, describe, it, expect, beforeEach, type MockInstance } from 'vitest'

const h = vi.hoisted(() => ({ postOpsSlack: vi.fn() }))

vi.mock('@/lib/admin/opsInbox/slack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/slack')>()
  return { ...actual, postOpsSlack: h.postOpsSlack }
})

import type { ExecuteHandlerRegistry } from '../handlers'
import { EXECUTE_HANDLERS } from '../registry'
import { endItem, notifyEnd, previewEnd, type EndFailure, type EndSuccess } from '../end'
import { DB_SECRET, FakeDb, type FakeCall, type Row } from './fakeDb'
import { NOW, fakeHandler, makeItem, type ItemSpec } from './fixtures'

const B = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ACTOR = 'admin-1'
const NOW_ISO = NOW.toISOString()
/** 지금보다 1시간 앞(공개됨), 지금보다 뒤(10/12), 지금보다 앞(이미 끝남). */
const STARTED = '2026-10-05T02:00:00.000Z'
const ENDS = '2026-10-12T00:00:00.000Z'
const ENDED_EARLIER = '2026-10-05T01:30:00.000Z'
const LABEL = '홈피드 카드 · 10/10(토) 09:00'

const SERVER_FIXED = {
  notLive: '게재중인 항목만 지금 종료할 수 있어요.',
  noEnd: '이 종류는 지금 종료가 없어요. 놓인 드랍은 그대로 둬요.',
  itemNotFound: '찾을 수 없는 항목이에요.',
  endFailed: '지금 종료하지 못했어요. 자원은 그대로 게재 중이에요. 잠시 뒤 다시 눌러 주세요.',
  revertFailed: '지금 종료하지 못했어요. 항목은 종료로 바뀌었지만 자원은 아직 게재 중이에요. 기존 어드민에서 종료 시각을 확인해 주세요.',
}

// ── 종류 표: 항목 종류 → 자원 키·표·종료 칼럼·게재 중인 자원 행 ────────────────────────────────

interface KindCase {
  name: string
  kind: string
  resourceKey: string
  table: string
  column: 'ends_at' | 'valid_until'
  row: (id: string) => Row
}

const KINDS: KindCase[] = [
  { name: '카드', kind: 'home_feed_card', resourceKey: 'today_card_id', table: 'today_cards', column: 'ends_at', row: (id) => ({ id, is_active: true, starts_at: STARTED, ends_at: ENDS }) },
  {
    name: '미션',
    kind: 'mission',
    resourceKey: 'mission_id',
    table: 'missions',
    column: 'ends_at',
    row: (id) => ({ id, starts_at: STARTED, ends_at: ENDS, exposure_mode: 'start_date', exposure_at: null }),
  },
  { name: 'JAM! 배지', kind: 'jam_badge', resourceKey: 'badge_id', table: 'badges', column: 'valid_until', row: (id) => ({ id, valid_from: STARTED, valid_until: ENDS, deleted_at: null }) },
  { name: '컬렉션', kind: 'collection_launch', resourceKey: 'item_book_id', table: 'item_books', column: 'valid_until', row: (id) => ({ id, is_active: true, valid_from: STARTED, valid_until: ENDS }) },
  { name: '레시피', kind: 'recipe', resourceKey: 'recipe_id', table: 'combination_recipes', column: 'valid_until', row: (id) => ({ id, valid_from: STARTED, valid_until: ENDS }) },
]
const MISSION = KINDS[1]

const ITEM_ID = uid(1)
const RES_ID = uid(11)

/** 게재중 항목 한 건의 명세. 항목의 `ends_at`은 자원의 종료 시각과 같다(상태 맞추기가 맞춰 둔 상태). */
const liveSpec = (kind: KindCase, extra: ItemSpec = {}): ItemSpec => ({
  id: ITEM_ID,
  key: 'item',
  kind: kind.kind,
  status: 'live',
  endsAt: ENDS,
  createdResource: { [kind.resourceKey]: RES_ID },
  ...extra,
})

// ── 준비 ─────────────────────────────────────────────────────────────────────────────────────────

function setup(specs: ItemSpec[], options: { bundle?: Row; handlers?: ExecuteHandlerRegistry; resources?: Record<string, Row[]> } = {}) {
  const db = new FakeDb()
  db.tables.ops_bundles = [{ id: B, is_sample: false, ...options.bundle }]
  db.tables.ops_bundle_items = specs.map((spec) => ({ ...makeItem(spec), bundle_id: B }))
  for (const [table, rows] of Object.entries(options.resources ?? {})) db.tables[table] = rows
  const handlers = options.handlers ?? EXECUTE_HANDLERS
  const run = (itemId: string = ITEM_ID, reason: string | null = null) => endItem(db.service, { bundleId: B, itemId, actor: ACTOR, reason }, { handlers, now: () => NOW })
  const preview = (itemId: string = ITEM_ID) => previewEnd(db.service, { bundleId: B, itemId }, { handlers, now: () => NOW })
  return { db, handlers, run, preview }
}

/** 종류 하나의 게재중 항목과 그 자원 행으로 준비한다. */
function setupKind(kind: KindCase, options: { spec?: ItemSpec; row?: Partial<Row>; bundle?: Row; handlers?: ExecuteHandlerRegistry } = {}) {
  return setup([liveSpec(kind, options.spec)], { bundle: options.bundle, handlers: options.handlers, resources: { [kind.table]: [{ ...kind.row(RES_ID), ...options.row }] } })
}

const ok = (outcome: EndSuccess | EndFailure) => {
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  return outcome as EndSuccess
}
const bad = (outcome: { ok: boolean }) => {
  expect(outcome.ok).toBe(false)
  return outcome as EndFailure
}

/** 미리 보기 성공의 본문. */
function ok2(outcome: Awaited<ReturnType<typeof previewEnd>>) {
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  return (outcome as Extract<typeof outcome, { ok: true }>).body
}

const nonSelect = (db: FakeDb) => db.calls.filter((call) => call.op !== 'select')
const rowOf = (db: FakeDb, table: string, id: string = RES_ID) => (db.tables[table] as Row[]).find((row) => row.id === id) as Row
const resourceTouches = (db: FakeDb) => db.calls.filter((call) => !call.table.startsWith('ops_'))
const resourceWrites = (db: FakeDb, table: string) => db.calls.filter((call) => call.table === table && call.op === 'update')

let errorSpy: MockInstance<typeof console.error>
beforeEach(() => {
  h.postOpsSlack.mockReset()
  h.postOpsSlack.mockResolvedValue({ ok: true })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
const logged = () => errorSpy.mock.calls.map((args) => args.join(' ')).join('\n')

/** 응답·결정 기록·슬랙 글(알림까지 보낸 뒤)을 문자열로 모은다. DB 오류 원문과 자원 ID가 나오면 안 되는 곳이다. */
async function outputsOf(db: FakeDb, outcome: EndSuccess | EndFailure): Promise<string[]> {
  if (outcome.slack) await notifyEnd(db.service, outcome.slack)
  return [JSON.stringify(outcome.ok ? outcome.body : { error: outcome.error, ...outcome.extra }), JSON.stringify(db.decisions()), ...h.postOpsSlack.mock.calls.map((args) => String(args[1]))]
}

// ── 종료 ─────────────────────────────────────────────────────────────────────────────────────────

describe('게재중 항목 종료 — 실제 핸들러(가정 6·7, 테스트 ①②)', () => {
  it.each(KINDS)('$name: 자원의 종료 칼럼이 지금이 되고 항목은 「종료」·ends_at = 지금이며 end 기록 1행에 사유와 전후 시각이 있다', async (kind) => {
    const { db, run } = setupKind(kind)
    db.tables[kind.table].push({ ...kind.row(uid(99)) }) // 다른 자원은 그대로여야 한다
    const result = ok(await run(ITEM_ID, '표기 오류가 있었어요'))

    expect(result.body).toEqual({ ok: true, itemId: ITEM_ID, resourceState: 'ended' })
    expect(rowOf(db, kind.table)[kind.column]).toBe(NOW_ISO)
    expect(rowOf(db, kind.table, uid(99))[kind.column]).toBe(ENDS)
    expect(db.item(ITEM_ID)).toMatchObject({ status: 'ended', ends_at: NOW_ISO })

    const rows = db.decisions('end')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ bundle_id: B, item_id: ITEM_ID, action: 'end', actor: ACTOR, reason: '표기 오류가 있었어요', batch_id: result.batchId })
    expect(rows[0].diff).toEqual({ ends_at: { before: ENDS, after: NOW_ISO } })
    expect(db.decisions()).toHaveLength(1)
  })

  it('사유를 적지 않으면 reason이 null이다', async () => {
    const { db, run } = setupKind(KINDS[0])
    ok(await run())
    expect(db.decisions('end')[0].reason).toBeNull()
  })

  it('종료 시각이 없는 상시 미션(ends_at null)도 끝난다. 전후 시각의 before가 null이다', async () => {
    const { db, run } = setupKind(MISSION, { spec: { endsAt: null }, row: { ends_at: null } })
    ok(await run())
    expect(rowOf(db, 'missions').ends_at).toBe(NOW_ISO)
    expect(db.item(ITEM_ID)).toMatchObject({ status: 'ended', ends_at: NOW_ISO })
    expect(db.decisions('end')[0].diff).toEqual({ ends_at: { before: null, after: NOW_ISO } })
  })

  it('노출일 지정(scheduled)·꺼진 카드·비활성 컬렉션처럼 공개 판정 칸이 달라도 공개 시각이 지났으면 끝낸다', async () => {
    const scheduled = setupKind(MISSION, { row: { exposure_mode: 'scheduled', exposure_at: STARTED, starts_at: '2026-10-20T00:00:00.000Z' } })
    ok(await scheduled.run())
    expect(rowOf(scheduled.db, 'missions').ends_at).toBe(NOW_ISO)

    const offCard = setupKind(KINDS[0], { row: { is_active: false } })
    ok(await offCard.run())
    expect(rowOf(offCard.db, 'today_cards').ends_at).toBe(NOW_ISO)
  })

  it('운영툴 밖에서 숨긴(hidden) 게재 중 미션도 시작 시각이 지났으면 끝낸다(티켓 20261006_1038 결정 1)', async () => {
    const { db, run } = setupKind(MISSION, { row: { exposure_mode: 'hidden' } })
    const result = ok(await run())
    expect(result.body.resourceState).toBe('ended')
    expect(rowOf(db, 'missions').ends_at).toBe(NOW_ISO)
    expect(db.item(ITEM_ID)).toMatchObject({ status: 'ended', ends_at: NOW_ISO })
    expect(db.decisions('end')).toHaveLength(1)
  })

  it('노출일 지정 미션의 시작 시각은 exposure_at이다. exposure_at이 비어 있으면 starts_at으로 가른다', async () => {
    const noExposureAt = setupKind(MISSION, { row: { exposure_mode: 'scheduled', exposure_at: null } })
    expect(ok(await noExposureAt.run()).body.resourceState).toBe('ended')
    expect(rowOf(noExposureAt.db, 'missions').ends_at).toBe(NOW_ISO)
  })
})

describe('자원이 이미 끝났거나 없음(가정 8, 테스트 ③④)', () => {
  it.each(KINDS)('$name: 종료 시각이 이미 지났으면 자원은 쓰지 않고 alreadyEnded로 항목만 닫는다', async (kind) => {
    const { db, run } = setupKind(kind, { row: { [kind.column]: ENDED_EARLIER } })
    const result = ok(await run())
    expect(result.body.resourceState).toBe('alreadyEnded')
    expect(resourceWrites(db, kind.table)).toHaveLength(0)
    expect(rowOf(db, kind.table)[kind.column]).toBe(ENDED_EARLIER)
    expect(db.item(ITEM_ID).status).toBe('ended')
    expect(db.decisions('end')).toHaveLength(1)
  })

  it.each(KINDS)('$name: 자원 행이 없으면 missing으로 항목만 닫는다', async (kind) => {
    const { db, run } = setup([liveSpec(kind)], { resources: { [kind.table]: [] } })
    const result = ok(await run())
    expect(result.body.resourceState).toBe('missing')
    expect(resourceWrites(db, kind.table)).toHaveLength(0)
    expect(db.item(ITEM_ID).status).toBe('ended')
  })

  it('소프트 삭제된 배지(deleted_at)와 자원 ID가 비어 있는 항목도 missing이다', async () => {
    const badge = KINDS[2]
    const deleted = setupKind(badge, { row: { deleted_at: '2026-10-01T00:00:00.000Z' } })
    expect(ok(await deleted.run()).body.resourceState).toBe('missing')
    expect(resourceWrites(deleted.db, 'badges')).toHaveLength(0)

    for (const createdResource of [null, {}, { today_card_id: '' }, { today_card_id: '   ' }]) {
      const { db, run } = setup([liveSpec(KINDS[0], { createdResource })], { resources: { today_cards: [KINDS[0].row(RES_ID)] } })
      expect(ok(await run()).body.resourceState, JSON.stringify(createdResource)).toBe('missing')
      expect(resourceTouches(db)).toHaveLength(0)
      expect(db.item(ITEM_ID).status).toBe('ended')
    }
  })

  it('종료 시각이 정확히 지금인 자원은 아직 끝나지 않은 것이다(카드·배지·컬렉션·미션은 지금 > 종료일 때만 지난 것)', async () => {
    for (const kind of [KINDS[0], MISSION, KINDS[2], KINDS[3]]) {
      const { db, run } = setupKind(kind, { row: { [kind.column]: NOW_ISO } })
      expect(ok(await run()).body.resourceState, kind.name).toBe('ended')
      expect(rowOf(db, kind.table)[kind.column]).toBe(NOW_ISO)
    }
  })
})

// ── 막는 경우 ────────────────────────────────────────────────────────────────────────────────────

describe('막는 경우(가정 13·14, 테스트 ⑤⑥⑦)', () => {
  it.each(['scheduled', 'ended', 'cancelled', 'approved', 'preparing', 'rejected'])('게재중이 아닌 항목(%s)은 409 notLive이고 쓰기가 없다', async (status) => {
    const { db, run } = setupKind(MISSION, { spec: { status } })
    const failure = bad(await run())
    expect(failure.status).toBe(409)
    expect(failure.error).toBe(SERVER_FIXED.notLive)
    expect(nonSelect(db)).toEqual([])
    expect(db.item(ITEM_ID).status).toBe(status)
  })

  it('end가 없는 종류(드랍 예약)는 게재중이어도 409 noEnd이고 쓰기가 없다', async () => {
    const { db, run, preview } = setup([{ id: ITEM_ID, key: 'drop', kind: 'drop_schedule', status: 'live', createdResource: { ambient_drop_schedule_id: RES_ID } }])
    const failure = bad(await run())
    expect(failure).toMatchObject({ status: 409, error: SERVER_FIXED.noEnd })
    expect(bad(await preview())).toMatchObject({ status: 409, error: SERVER_FIXED.noEnd })
    expect(nonSelect(db)).toEqual([])
    expect(db.item(ITEM_ID).status).toBe('live')
  })

  it('레지스트리에 없는 종류와 알 수 없는 종류도 409 noEnd다', async () => {
    const { db, run } = setup([liveSpec(MISSION)], { handlers: {} })
    expect(bad(await run())).toMatchObject({ status: 409, error: SERVER_FIXED.noEnd })
    const unknown = setup([{ id: ITEM_ID, key: 'x', kind: 'constructor', status: 'live' }])
    expect(bad(await unknown.run())).toMatchObject({ status: 409, error: SERVER_FIXED.noEnd })
    expect(nonSelect(db)).toEqual([])
    expect(nonSelect(unknown.db)).toEqual([])
  })

  it('두 번째 요청(선점 0행)은 409이고 자원은 한 번만 바뀐다', async () => {
    const { db, run } = setupKind(MISSION)
    ok(await run())
    const second = bad(await run())
    expect(second).toMatchObject({ status: 409, error: SERVER_FIXED.notLive })
    expect(resourceWrites(db, 'missions')).toHaveLength(1)
    expect(db.decisions('end')).toHaveLength(1)
  })

  it('읽은 뒤 다른 곳(상태 맞추기)이 먼저 닫으면 선점이 0행이라 409이고 자원을 건드리지 않는다', async () => {
    const { db, run } = setupKind(MISSION)
    db.beforeRun = (call: FakeCall) => {
      if (call.table === 'ops_bundle_items' && call.op === 'update') db.item(ITEM_ID).status = 'ended'
    }
    expect(bad(await run())).toMatchObject({ status: 409, error: SERVER_FIXED.notLive })
    expect(resourceTouches(db).filter((call) => call.op !== 'select')).toEqual([])
    expect(db.decisions()).toEqual([])
  })

  it('묶음에 없는 항목과 없는 묶음은 404다', async () => {
    const { db, run } = setupKind(MISSION)
    expect(bad(await run(uid(77)))).toMatchObject({ status: 404, error: SERVER_FIXED.itemNotFound })
    db.tables.ops_bundles = []
    expect(bad(await run())).toMatchObject({ status: 404 })
    expect(nonSelect(db)).toEqual([])
  })

  it('아직 공개 전인 자원은 409이고 항목은 원래 ends_at의 게재중으로 돌아온다', async () => {
    const future = '2026-10-20T00:00:00.000Z'
    const cases: Array<[KindCase, Partial<Row>]> = [
      [KINDS[0], { starts_at: future }],
      [MISSION, { starts_at: future }],
      [MISSION, { exposure_mode: 'hidden', starts_at: future }],
      [MISSION, { exposure_mode: 'scheduled', exposure_at: future, starts_at: STARTED }],
      [KINDS[2], { valid_from: future }],
      [KINDS[3], { valid_from: future }],
      [KINDS[4], { valid_from: future }],
    ]
    for (const [kind, row] of cases) {
      const { db, run } = setupKind(kind, { row })
      const failure = bad(await run())
      expect(failure, `${kind.name} ${JSON.stringify(row)}`).toMatchObject({ status: 409, error: SERVER_FIXED.notLive })
      expect(db.item(ITEM_ID)).toMatchObject({ status: 'live', ends_at: ENDS })
      expect(resourceWrites(db, kind.table)).toHaveLength(0)
      expect(db.decisions()).toEqual([])
    }
  })
})

// ── 실패 ─────────────────────────────────────────────────────────────────────────────────────────

describe('자원 종료 실패(가정 6, 테스트 ⑧⑨)', () => {
  it.each(KINDS)('$name: 자원 쓰기가 DB 오류면 항목이 게재중과 원래 ends_at으로 돌아오고 500 endFailed이며 원문이 어디에도 없다', async (kind) => {
    const { db, run } = setupKind(kind)
    db.failIf = (call) => call.table === kind.table && call.op === 'update'
    const failure = bad(await run())

    expect(failure).toMatchObject({ status: 500, error: SERVER_FIXED.endFailed })
    expect(db.item(ITEM_ID)).toMatchObject({ status: 'live', ends_at: ENDS })
    expect(rowOf(db, kind.table)[kind.column]).toBe(kind.row(RES_ID)[kind.column])
    expect(db.decisions()).toEqual([])
    expect(failure.slack).toBeUndefined()
    for (const text of await outputsOf(db, failure)) expect(text).not.toContain(DB_SECRET)
    expect(logged()).toContain(DB_SECRET) // 원문은 서버 로그에만 있다
  })

  it('읽은 뒤 다른 곳이 종료 시각을 바꾸면(0행) 항목을 되돌리고 500 endFailed이며 바뀐 값은 그대로다', async () => {
    const { db, run } = setupKind(MISSION)
    const other = '2026-10-15T00:00:00.000Z'
    db.beforeRun = (call) => {
      if (call.table === 'missions' && call.op === 'update') rowOf(db, 'missions').ends_at = other
    }
    const failure = bad(await run())
    expect(failure).toMatchObject({ status: 500, error: SERVER_FIXED.endFailed })
    expect(failure.extra).toBeUndefined() // 항목을 되돌렸으니 itemEnded는 없다
    expect(db.item(ITEM_ID)).toMatchObject({ status: 'live', ends_at: ENDS })
    expect(rowOf(db, 'missions').ends_at).toBe(other)
    expect(db.decisions()).toEqual([])
  })

  it('핸들러가 던져도 항목을 되돌리고 500 endFailed이며 원문이 어디에도 없다', async () => {
    const handlers: ExecuteHandlerRegistry = {
      mission: {
        ...fakeHandler('mission'),
        end: async () => {
          throw new Error(DB_SECRET)
        },
      },
    }
    const { db, run } = setupKind(MISSION, { handlers })
    const failure = bad(await run())
    expect(failure).toMatchObject({ status: 500, error: SERVER_FIXED.endFailed })
    expect(db.item(ITEM_ID)).toMatchObject({ status: 'live', ends_at: ENDS })
    for (const text of await outputsOf(db, failure)) expect(text).not.toContain(DB_SECRET)
  })

  it('선점 update가 DB 오류면 아무것도 바뀌지 않고 500 endFailed다(자원은 읽지도 않는다)', async () => {
    const { db, run } = setupKind(MISSION)
    db.failIf = (call) => call.table === 'ops_bundle_items' && call.op === 'update'
    const failure = bad(await run())
    expect(failure).toMatchObject({ status: 500, error: SERVER_FIXED.endFailed })
    expect(db.item(ITEM_ID).status).toBe('live')
    expect(resourceTouches(db)).toEqual([])
    for (const text of await outputsOf(db, failure)) expect(text).not.toContain(DB_SECRET)
  })

  it('되돌리기도 실패하면 500 revertFailed이고 항목은 종료로 남으며 #jam-alert 글을 올린다(원문 없음)', async () => {
    const { db, run } = setupKind(MISSION)
    db.failIf = (call) => (call.table === 'missions' && call.op === 'update') || (call.table === 'ops_bundle_items' && call.op === 'update' && (call.payload as Row).status === 'live')
    const failure = bad(await run())

    expect(failure).toMatchObject({ status: 500, error: SERVER_FIXED.revertFailed, extra: { itemEnded: true } })
    expect(db.item(ITEM_ID).status).toBe('ended')
    expect(rowOf(db, 'missions').ends_at).toBe(ENDS)
    expect(db.decisions()).toEqual([])
    expect(failure.slack).toMatchObject({ resourceState: null, problem: '항목은 종료로 바뀌었지만 자원은 아직 게재 중이에요' })

    const outputs = await outputsOf(db, failure)
    expect(h.postOpsSlack.mock.calls).toEqual([['alert', '지금 종료를 끝내지 못했어요\n• 미션 · 10/10(토) 09:00 — 항목은 종료로 바뀌었지만 자원은 아직 게재 중이에요']])
    for (const text of outputs) expect(text).not.toContain(DB_SECRET)
  })
})

// ── 시험 묶음 · 결정 기록 ────────────────────────────────────────────────────────────────────────

describe('시험 묶음(가정 12, 테스트 ⑩)과 결정 기록 실패(테스트 ⑪)', () => {
  it('시험 묶음은 자원을 읽거나 쓰지 않고 항목만 닫는다. end 기록은 같고 슬랙 글이 「[시험]」으로 시작한다', async () => {
    const { db, run } = setup([liveSpec(KINDS[0], { createdResource: { sample: true } })], { bundle: { is_sample: true } })
    const result = ok(await run(ITEM_ID, '시험'))

    expect(result.body).toEqual({ ok: true, itemId: ITEM_ID, resourceState: 'ended' })
    expect(resourceTouches(db)).toEqual([])
    expect(db.item(ITEM_ID)).toMatchObject({ status: 'ended', ends_at: NOW_ISO })
    expect(db.decisions('end')).toHaveLength(1)
    expect(db.decisions('end')[0].diff).toEqual({ ends_at: { before: ENDS, after: NOW_ISO } })

    await notifyEnd(db.service, result.slack)
    expect(h.postOpsSlack.mock.calls).toEqual([['report', `[시험] 지금 종료 1건\n• ${LABEL}\n사유: 시험`]])
  })

  it('결정 기록 insert가 실패하면 자원과 상태는 그대로 두고 decisionLogFailed로 알린다(요약과 알림)', async () => {
    const { db, run } = setupKind(MISSION)
    db.failIf = (call) => call.table === 'ops_decisions' && call.op === 'insert'
    const result = ok(await run())

    expect(result.body).toEqual({ ok: true, itemId: ITEM_ID, resourceState: 'ended', decisionLogFailed: true })
    expect(rowOf(db, 'missions').ends_at).toBe(NOW_ISO)
    expect(db.item(ITEM_ID).status).toBe('ended')
    expect(db.decisions()).toEqual([])
    expect(logged()).toContain(DB_SECRET)

    for (const text of await outputsOf(db, result)) expect(text).not.toContain(DB_SECRET)
    expect(h.postOpsSlack.mock.calls.map((args) => args[0])).toEqual(['report', 'alert'])
    expect(h.postOpsSlack.mock.calls[1][1]).toBe('결정 기록을 남기지 못했어요. 서버 로그를 확인해 주세요')
  })
})

describe('슬랙 글', () => {
  it('종료 요약을 #jam-report에 올리고 결과를 같은 batch_id의 end 기록에 채운다. 알림은 없다', async () => {
    const { db, run } = setupKind(KINDS[0])
    const result = ok(await run(ITEM_ID, '표기 오류가 있었어요'))
    await notifyEnd(db.service, result.slack)

    expect(h.postOpsSlack.mock.calls).toEqual([['report', `지금 종료 1건\n• ${LABEL}\n사유: 표기 오류가 있었어요`]])
    expect(db.decisions('end')[0].slack_result).toEqual({ channel: 'report', ok: true })
  })

  it('자원이 이미 끝나 있었거나 없었으면 항목 줄 끝에 표시한다', async () => {
    const ended = setupKind(KINDS[0], { row: { ends_at: ENDED_EARLIER } })
    await notifyEnd(ended.db.service, ok(await ended.run()).slack)
    expect(h.postOpsSlack.mock.calls[0][1]).toBe(`지금 종료 1건\n• ${LABEL} (이미 끝나 있었어요)`)

    h.postOpsSlack.mockClear()
    const gone = setup([liveSpec(KINDS[0])], { resources: { today_cards: [] } })
    await notifyEnd(gone.db.service, ok(await gone.run()).slack)
    expect(h.postOpsSlack.mock.calls[0][1]).toBe(`지금 종료 1건\n• ${LABEL} (자원이 이미 없었어요)`)
  })

  it('슬랙이 실패해도 던지지 않고 실패가 slack_result에 남는다', async () => {
    h.postOpsSlack.mockResolvedValue({ ok: false, error: 'not_configured' })
    const { db, run } = setupKind(KINDS[0])
    await expect(notifyEnd(db.service, ok(await run()).slack)).resolves.toBeUndefined()
    expect(db.decisions('end')[0].slack_result).toEqual({ channel: 'report', ok: false, error: 'not_configured' })
  })
})

// ── 미리 보기 ────────────────────────────────────────────────────────────────────────────────────

describe('미리 보기(가정 10·11, 테스트 ⑫⑬)', () => {
  /** 카드(게재중) → 미션(게재중) → 배지(게재중). 예약됨·종료 카드도 미션을 가리킨다. */
  function chain() {
    const spec = (id: number, key: string, kind: string, status: string, extra: ItemSpec = {}): ItemSpec => ({ id: uid(id), key, kind, status, position: id, ...extra })
    return [
      spec(1, 'card', 'home_feed_card', 'live', { links: ['mission'] }),
      spec(2, 'mission', 'mission', 'live', { links: ['badge'], createdResource: { mission_id: RES_ID } }),
      spec(3, 'badge', 'jam_badge', 'live', { createdResource: { badge_id: uid(13) } }),
      spec(4, 'cardScheduled', 'home_feed_card', 'scheduled', { links: ['mission'] }),
      spec(5, 'cardEnded', 'home_feed_card', 'ended', { links: ['mission'] }),
    ]
  }

  it('쓰기가 없고 이 항목을 직접 가리키는 게재중 항목만 pointedByLive에 담는다(예약됨·종료 항목, 이 항목이 가리키는 항목은 뺀다)', async () => {
    const { db, preview } = setup(chain())
    const mission = ok2(await preview(uid(2)))
    expect(mission.pointedByLive).toEqual([{ id: uid(1), kind: 'home_feed_card', label: LABEL }])
    expect(mission.kind).toBe('mission')
    expect(mission.isSample).toBe(false)

    expect(ok2(await preview(uid(3))).pointedByLive).toEqual([{ id: uid(2), kind: 'mission', label: '미션 · 10/10(토) 09:00' }]) // 카드는 미션을 거쳐 가리키므로 뺀다
    expect(ok2(await preview(uid(1))).pointedByLive).toEqual([])
    expect(nonSelect(db)).toEqual([])
  })

  it('게재중이 아닌 항목·묶음에 없는 항목은 실행과 같은 409·404다', async () => {
    const { db, preview } = setup(chain())
    expect(bad(await preview(uid(4)))).toMatchObject({ status: 409, error: SERVER_FIXED.notLive })
    expect(bad(await preview(uid(5)))).toMatchObject({ status: 409, error: SERVER_FIXED.notLive })
    expect(bad(await preview(uid(77)))).toMatchObject({ status: 404, error: SERVER_FIXED.itemNotFound })
    expect(nonSelect(db)).toEqual([])
  })

  it('미션: 참가자 수와 진행 중 유저 수(참가 − 완료)를 센다. 다른 미션의 기록은 세지 않는다', async () => {
    const { db, preview } = setup([liveSpec(MISSION)], { resources: { missions: [MISSION.row(RES_ID)] } })
    db.tables.user_mission_participations = [
      { id: 'p1', mission_id: RES_ID, user_id: 'u1' },
      { id: 'p2', mission_id: RES_ID, user_id: 'u2' },
      { id: 'p3', mission_id: RES_ID, user_id: 'u3' },
      { id: 'p9', mission_id: uid(99), user_id: 'u1' },
    ]
    db.tables.user_mission_completions = [
      { id: 'c1', mission_id: RES_ID, user_id: 'u1' },
      { id: 'c9', mission_id: uid(99), user_id: 'u2' },
    ]
    expect(ok2(await preview()).impact).toEqual({ participants: 3, inProgressUsers: 2 })
    expect(nonSelect(db)).toEqual([])
  })

  it('컬렉션: 채우는 중 유저 수는 같은 유저의 여러 칸을 한 명으로 세고 완성한 유저를 뺀다', async () => {
    const collection = KINDS[3]
    const { db, preview } = setup([liveSpec(collection)], { resources: { item_books: [collection.row(RES_ID)] } })
    db.tables.user_item_book_slots = [
      { id: 's1', item_book_id: RES_ID, user_id: 'u1' },
      { id: 's2', item_book_id: RES_ID, user_id: 'u1' },
      { id: 's3', item_book_id: RES_ID, user_id: 'u2' },
      { id: 's4', item_book_id: RES_ID, user_id: 'u3' },
      { id: 's9', item_book_id: uid(99), user_id: 'u9' },
    ]
    db.tables.user_item_book_completions = [
      { item_book_id: RES_ID, user_id: 'u3' },
      { item_book_id: uid(99), user_id: 'u1' },
    ]
    expect(ok2(await preview()).impact).toEqual({ fillingUsers: 2 })
  })

  it('컬렉션(4등급): 등급별 완성 기록이 하나라도 있는 유저를 채우는 중에서 뺀다. 옛 완성 기록은 보지 않는다', async () => {
    const collection = KINDS[3]
    const { db, preview } = setup([liveSpec(collection)], { resources: { item_books: [{ ...collection.row(RES_ID), tier_mode: true }] } })
    db.tables.user_item_book_slots = [
      { id: 's1', item_book_id: RES_ID, user_id: 'u1' },
      { id: 's2', item_book_id: RES_ID, user_id: 'u1' },
      { id: 's3', item_book_id: RES_ID, user_id: 'u2' },
      { id: 's4', item_book_id: RES_ID, user_id: 'u3' },
      { id: 's5', item_book_id: RES_ID, user_id: 'u4' },
      { id: 's9', item_book_id: uid(99), user_id: 'u9' },
    ]
    db.tables.user_item_book_tier_completions = [
      // u3은 두 등급을 완성했어도 한 명이다
      { item_book_id: RES_ID, user_id: 'u3', tier: 'common' },
      { item_book_id: RES_ID, user_id: 'u3', tier: 'rare' },
      { item_book_id: RES_ID, user_id: 'u4', tier: 'mystic' },
      // 다른 컬렉션의 기록은 세지 않는다
      { item_book_id: uid(99), user_id: 'u1', tier: 'common' },
    ]
    // 옛 완성 기록은 4등급 컬렉션에서 완성으로 보지 않는다(u2는 계속 채우는 중이다)
    db.tables.user_item_book_completions = [{ item_book_id: RES_ID, user_id: 'u2' }]
    expect(ok2(await preview()).impact).toEqual({ fillingUsers: 2 })
    expect(db.calls.some((call) => call.table === 'user_item_book_tier_completions')).toBe(true)
    expect(db.calls.some((call) => call.table === 'user_item_book_completions')).toBe(false)
    expect(nonSelect(db)).toEqual([])
  })

  it('컬렉션(옛 방식): 등급별 완성 기록은 보지 않는다', async () => {
    const collection = KINDS[3]
    const { db, preview } = setup([liveSpec(collection)], { resources: { item_books: [{ ...collection.row(RES_ID), tier_mode: false }] } })
    db.tables.user_item_book_slots = [
      { id: 's1', item_book_id: RES_ID, user_id: 'u1' },
      { id: 's2', item_book_id: RES_ID, user_id: 'u2' },
    ]
    db.tables.user_item_book_completions = [{ item_book_id: RES_ID, user_id: 'u2' }]
    db.tables.user_item_book_tier_completions = [{ item_book_id: RES_ID, user_id: 'u1', tier: 'common' }]
    expect(ok2(await preview()).impact).toEqual({ fillingUsers: 1 })
    expect(db.calls.some((call) => call.table === 'user_item_book_tier_completions')).toBe(false)
  })

  it('컬렉션(4등급): 등급별 완성 기록을 읽지 못하면 impact는 null이고 원문은 응답에 없다', async () => {
    const collection = KINDS[3]
    const { db, preview } = setup([liveSpec(collection)], { resources: { item_books: [{ ...collection.row(RES_ID), tier_mode: true }] } })
    db.tables.user_item_book_slots = [{ id: 's1', item_book_id: RES_ID, user_id: 'u1' }]
    db.failIf = (call) => call.table === 'user_item_book_tier_completions'
    const result = ok2(await preview())
    expect(result.impact).toBeNull()
    expect(JSON.stringify(result)).not.toContain(DB_SECRET)
  })

  it('카드·배지·레시피는 숫자 없이 빈 impact이고 사용자 기록 표를 읽지 않는다. 시험 묶음도 세지 않는다', async () => {
    for (const kind of [KINDS[0], KINDS[2], KINDS[4]]) {
      const { db, preview } = setupKind(kind)
      expect(ok2(await preview()).impact, kind.name).toEqual({})
      expect(db.calls.filter((call) => call.table.startsWith('user_'))).toEqual([])
    }
    const sample = setup([liveSpec(MISSION, { createdResource: { sample: true } })], { bundle: { is_sample: true } })
    expect(ok2(await sample.preview()).impact).toEqual({})
    expect(ok2(await sample.preview()).isSample).toBe(true)
    expect(sample.db.calls.filter((call) => call.table.startsWith('user_'))).toEqual([])
  })

  it('자원 ID가 비어 있는 미션은 셀 대상이 없어 빈 impact이다', async () => {
    const { db, preview } = setup([liveSpec(MISSION, { createdResource: null })])
    expect(ok2(await preview()).impact).toEqual({})
    expect(db.calls.filter((call) => call.table.startsWith('user_'))).toEqual([])
  })

  it('세기가 실패하면 impact는 null이고 미리 보기는 200이다. 원문은 서버 로그에만 있다', async () => {
    for (const failingTable of ['user_mission_participations', 'user_mission_completions']) {
      const { db, preview } = setup([liveSpec(MISSION)], { resources: { missions: [MISSION.row(RES_ID)] } })
      db.failIf = (call) => call.table === failingTable
      const result = ok2(await preview())
      expect(result.impact, failingTable).toBeNull()
      expect(JSON.stringify(result)).not.toContain(DB_SECRET)
    }
    expect(logged()).toContain(DB_SECRET)

    const collection = KINDS[3]
    const { db, preview } = setup([liveSpec(collection)], { resources: { item_books: [collection.row(RES_ID)] } })
    db.failIf = (call) => call.table === 'user_item_book_slots'
    expect(ok2(await preview()).impact).toBeNull()
  })

  it('묶음을 읽지 못하면 500 previewFailed이고 원문은 없다', async () => {
    const { db, preview } = setup(chain())
    db.failIf = (call) => call.table === 'ops_bundles'
    const failure = bad(await preview(uid(2)))
    expect(failure).toMatchObject({ status: 500, error: '지금 종료할 항목을 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(failure.error).not.toContain(DB_SECRET)
  })
})
