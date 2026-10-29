/**
 * 기간 동안 모은 잼 읽기(`readJamEarnedWithin`) 시험 (티켓 20261019_1445 3-A회, 사용자 결정 2)
 *
 * 미션 전용 키 `jam_period_earned`는 «정산된 활동의 **시작 시각**이 참가 뒤 기간 안인 활동»의 잼만 센다.
 * 잼 원장의 정산 시각(`jam_transactions.created_at`)이 아니라 활동 시각(`strava_activities.start_date`)을 따라가는 것이 핵심이라,
 * 이 파일은
 *  ① 기간 안(하한·상한 경계 포함) 활동의 정산 잼만 더하고
 *  ② 참가 전 활동을 늦게 정산해도(정산 시각이 기간 안이어도) 세지 않으며
 *  ③ 채움(음수)·운영자 지급·회수 줄과 다른 유저의 줄은 합계에 넣지 않고
 *  ④ 정산되지 않은 활동은 0이며, 활동 id가 200개를 넘으면 나눠 읽고
 *  ⑤ 읽지 못하면 0으로 바꾸지 않고 던진다
 *  ⑥ 서비스 활동 잼(`service_activity`, 티켓 20261028_1736)은 지급 시각(`created_at`)이 기간 안인 양수 줄만 더하고, 소멸·채움·운영자 조정은 세지 않는다
 * 를 고정한다. 모조 DB는 `eq`·`in`·`gte`·`lte`를 실제로 적용한다(`fakeSupabase.ts`).
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-window-jam-metrics.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { MetricWindow } from '../jamActionWindow'
import { readJamEarnedWithin } from '../jamActionJamMetrics'
import { makeFakeDb, type FakeRow } from './fakeSupabase'

const U = 'user-1'
const OTHER = 'user-2'

const FROM = '2026-10-10T00:00:00.000Z'
const TO = '2026-10-20T00:00:00.000Z'
const WINDOW: MetricWindow = { fromIso: FROM, toIso: TO }

// 활동 시작 시각 — 표기를 일부러 섞는다(`Z`와 `+00:00`)
const BEFORE = '2026-10-09T23:59:59.999Z'
const AT_FROM = '2026-10-10T00:00:00+00:00'
const INSIDE = '2026-10-15T12:00:00.000Z'
const AT_TO = '2026-10-20T00:00:00+00:00'
const AFTER = '2026-10-20T00:00:00.001Z'

const SYNCED_AT = '2026-10-18T00:00:00.000Z' // 정산(동기화) 시각 — 기간 안이다. 활동 시각과 상관없이 같은 값을 준다

const activity = (id: string, startDate: string, userId = U): FakeRow => ({ id, user_id: userId, start_date: startDate })
const settlement = (activityId: string, amount: number, userId = U): FakeRow => ({
  id: `tx-${activityId}`,
  user_id: userId,
  amount,
  reason: 'activity_settlement',
  source_activity_id: activityId,
  created_at: SYNCED_AT,
})

describe('readJamEarnedWithin — 활동의 시작 시각이 기간 안인 정산 잼만 센다', () => {
  const tables = () => ({
    strava_activities: [
      activity('a-before', BEFORE),
      activity('a-from', AT_FROM),
      activity('a-inside', INSIDE),
      activity('a-to', AT_TO),
      activity('a-after', AFTER),
    ],
    jam_transactions: [
      settlement('a-before', 100),
      settlement('a-from', 10),
      settlement('a-inside', 20),
      settlement('a-to', 30),
      settlement('a-after', 1000),
    ],
  })

  it('기간 안 3건(하한 경계·중간·상한 경계)만 더한다 — 기간 전·후 활동의 잼은 뺀다', async () => {
    const { client } = makeFakeDb(tables())
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(60)
  })

  it('참가 전에 한 활동을 기간 안에 늦게 정산해도 세지 않는다 (정산 시각이 아니라 활동 시각 기준)', async () => {
    // a-before는 정산 시각(SYNCED_AT)이 기간 안이지만 활동 시각이 기간 전이다 — jam_transactions.created_at을 쓰면 100이 섞인다
    const { client } = makeFakeDb(tables())
    const total = await readJamEarnedWithin(client, U, WINDOW)
    expect(total).toBe(60)
    expect(total).not.toBe(160)
  })

  it('활동 시각이 기간 안이면 정산이 기간 밖 시각이어도 센다', async () => {
    const { client } = makeFakeDb({
      strava_activities: [activity('a1', INSIDE)],
      jam_transactions: [{ ...settlement('a1', 7), created_at: '2026-12-01T00:00:00.000Z' }],
    })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(7)
  })

  it('상한이 없으면(상시 미션) 하한 이후의 활동을 전부 센다', async () => {
    const { client } = makeFakeDb(tables())
    expect(await readJamEarnedWithin(client, U, { fromIso: FROM })).toBe(1060)
    expect(await readJamEarnedWithin(client, U, { fromIso: FROM, toIso: null })).toBe(1060)
  })

  it('다른 유저의 활동과 정산 줄은 세지 않는다', async () => {
    const { client } = makeFakeDb({
      strava_activities: [activity('a-mine', INSIDE), activity('a-theirs', INSIDE, OTHER)],
      jam_transactions: [settlement('a-mine', 5), settlement('a-theirs', 500, OTHER)],
    })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(5)
  })
})

describe('readJamEarnedWithin — 채움·운영자 지급·회수 줄은 합계에 들지 않는다', () => {
  it('reason이 activity_settlement가 아닌 줄은 더하지 않는다', async () => {
    const { client } = makeFakeDb({
      strava_activities: [activity('a1', INSIDE)],
      jam_transactions: [
        settlement('a1', 40),
        // 캡슐·잠긴 배지 채움(음수)과 운영자 지급·회수 — DB 제약상 source_activity_id는 비지만, 같은 활동 id를 가진 줄이 있어도 reason으로 걸러진다
        { id: 'fill', user_id: U, amount: -15, reason: 'capsule_fill', source_activity_id: 'a1', created_at: SYNCED_AT },
        { id: 'fill2', user_id: U, amount: -5, reason: 'locked_item_badge_fill', source_activity_id: null, created_at: SYNCED_AT },
        { id: 'grant', user_id: U, amount: 300, reason: 'admin_grant', source_activity_id: null, created_at: SYNCED_AT },
        { id: 'deduct', user_id: U, amount: -20, reason: 'admin_deduct', source_activity_id: null, created_at: SYNCED_AT },
      ],
    })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(40)
  })

  it('모은 양은 쓴 양으로 줄지 않는다 — 채움이 아무리 커도 정산 합계 그대로다', async () => {
    const { client } = makeFakeDb({
      strava_activities: [activity('a1', INSIDE)],
      jam_transactions: [
        settlement('a1', 40),
        { id: 'fill', user_id: U, amount: -1000, reason: 'capsule_fill', source_activity_id: null, created_at: SYNCED_AT },
      ],
    })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(40)
  })
})

describe('readJamEarnedWithin — 정산되지 않은 활동과 활동이 없는 경우', () => {
  it('정산되지 않은 활동은 줄이 없어 0이다', async () => {
    const { client } = makeFakeDb({ strava_activities: [activity('a1', INSIDE)], jam_transactions: [] })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(0)
  })

  it('기간 안 활동이 없으면 0이고 활동 정산 줄은 읽지 않는다 (서비스 활동 줄은 활동 id와 무관해 한 번 읽는다)', async () => {
    const db = makeFakeDb({ strava_activities: [activity('a1', BEFORE)], jam_transactions: [settlement('a1', 99)] })
    expect(await readJamEarnedWithin(db.client, U, WINDOW)).toBe(0)
    expect(db.queried).toEqual(['strava_activities', 'jam_transactions'])
  })
})

describe('readJamEarnedWithin — 활동 id를 200개씩 나눠 읽는다', () => {
  it('활동 450건이면 활동 정산 줄을 3번(200·200·50) 읽고(서비스 활동 줄 1번 별도) 합계는 전부 더한 값이다', async () => {
    const ids = Array.from({ length: 450 }, (_, n) => `a${n}`)
    const db = makeFakeDb({
      strava_activities: ids.map((id) => activity(id, INSIDE)),
      jam_transactions: ids.map((id) => settlement(id, 2)),
    })
    expect(await readJamEarnedWithin(db.client, U, WINDOW)).toBe(900)
    expect(db.queried.filter((table) => table === 'jam_transactions')).toHaveLength(3 + 1)
  })

  it('활동 행이 한 페이지(1,000행)를 넘어도 끝까지 읽는다', async () => {
    const ids = Array.from({ length: 1200 }, (_, n) => `a${n}`)
    const db = makeFakeDb({
      strava_activities: ids.map((id) => activity(id, INSIDE)),
      jam_transactions: ids.map((id) => settlement(id, 1)),
    })
    expect(await readJamEarnedWithin(db.client, U, WINDOW)).toBe(1200)
    expect(db.queried.filter((table) => table === 'strava_activities')).toHaveLength(2)
    expect(db.queried.filter((table) => table === 'jam_transactions')).toHaveLength(6 + 1)
  })
})

describe('readJamEarnedWithin — 걸러진 활동은 읽지 않는다 (티켓 20261017_1459)', () => {
  it('인정된 활동(걸러짐 표시 없음·옛 행 포함)만 읽는다 — 걸러진 활동의 원장 줄이 있어도 세지 않는다', async () => {
    // 걸러진 활동은 정산되지 않아 원장에 줄이 없는 것이 정상이다. 줄이 있는 잘못된 상태에서도 인정 활동 기준을 지킨다.
    const { client } = makeFakeDb({
      strava_activities: [
        { ...activity('a-ok', INSIDE), filter_reason: null },
        activity('a-legacy', INSIDE), // 열이 비어 있는 옛 행 = 인정
        { ...activity('a-filtered', INSIDE), filter_reason: 'virtual' },
      ],
      jam_transactions: [settlement('a-ok', 10), settlement('a-legacy', 20), settlement('a-filtered', 500)],
    })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(30)
  })
})

const SERVICE_AT = '2026-10-15T09:00:00.000Z' // 지급 시각 — 기간 안
const service = (id: string, amount: number, createdAt: string, overrides: FakeRow = {}): FakeRow => ({
  id,
  user_id: U,
  amount,
  reason: 'service_activity',
  source_activity_id: null,
  created_at: createdAt,
  ...overrides,
})

describe('readJamEarnedWithin — 서비스 활동 잼은 지급 시각이 기간 안인 양수 줄을 더한다 (티켓 20261028_1736)', () => {
  it('활동 정산 합에 서비스 활동 잼을 더한다', async () => {
    const { client } = makeFakeDb({
      strava_activities: [activity('a1', INSIDE)],
      jam_transactions: [settlement('a1', 40), service('s1', 5, SERVICE_AT), service('s2', 20, SERVICE_AT)],
    })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(65)
  })

  it('활동이 하나도 없어도 서비스 활동 잼만으로 센다', async () => {
    const { client } = makeFakeDb({ jam_transactions: [service('s1', 30, SERVICE_AT)] })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(30)
  })

  it('지급 시각이 기간 밖인 줄은 세지 않는다 — 하한·상한 경계는 포함이다', async () => {
    const { client } = makeFakeDb({
      jam_transactions: [
        service('before', 1000, BEFORE),
        service('at-from', 1, AT_FROM),
        service('inside', 2, SERVICE_AT),
        service('at-to', 4, AT_TO),
        service('after', 1000, AFTER),
      ],
    })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(7)
  })

  it('상한이 없으면 하한 이후의 서비스 활동 잼을 전부 센다', async () => {
    const { client } = makeFakeDb({
      jam_transactions: [service('before', 1000, BEFORE), service('inside', 2, SERVICE_AT), service('after', 4, AFTER)],
    })
    expect(await readJamEarnedWithin(client, U, { fromIso: FROM })).toBe(6)
  })

  it('소멸(capsule_forfeit, 음수)·채움·운영자 조정 줄과 음수 service_activity 줄은 세지 않는다', async () => {
    const { client } = makeFakeDb({
      jam_transactions: [
        service('ok', 10, SERVICE_AT),
        service('forfeit', -50, SERVICE_AT, { reason: 'capsule_forfeit' }),
        service('fill', -30, SERVICE_AT, { reason: 'capsule_fill' }),
        service('locked-fill', -20, SERVICE_AT, { reason: 'locked_item_badge_fill' }),
        service('grant', 500, SERVICE_AT, { reason: 'admin_grant' }),
        service('deduct', -40, SERVICE_AT, { reason: 'admin_deduct' }),
        service('negative', -7, SERVICE_AT),
      ],
    })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(10)
  })

  it('다른 유저의 서비스 활동 줄은 세지 않는다', async () => {
    const { client } = makeFakeDb({
      jam_transactions: [service('mine', 5, SERVICE_AT), service('theirs', 500, SERVICE_AT, { user_id: OTHER })],
    })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(5)
  })

  it('서비스 활동 줄이 한 페이지(1,000행)를 넘어도 끝까지 읽는다', async () => {
    const db = makeFakeDb({
      jam_transactions: Array.from({ length: 1200 }, (_, n) => service(`s${n}`, 1, SERVICE_AT)),
    })
    expect(await readJamEarnedWithin(db.client, U, WINDOW)).toBe(1200)
    expect(db.queried.filter((table) => table === 'jam_transactions')).toHaveLength(2)
  })

  it('활동이 없어도 잼 원장 조회 오류는 0으로 바꾸지 않고 던진다', async () => {
    const { client } = makeFakeDb({}, { errors: { jam_transactions: '원장 장애' } })
    await expect(readJamEarnedWithin(client, U, WINDOW)).rejects.toThrow('원장 장애')
  })
})

describe('readJamEarnedWithin — 읽지 못하면 0으로 바꾸지 않고 던진다', () => {
  it('활동 조회 오류는 던진다', async () => {
    const { client } = makeFakeDb({}, { errors: { strava_activities: '활동 장애' } })
    await expect(readJamEarnedWithin(client, U, WINDOW)).rejects.toThrow('활동 장애')
  })

  it('잼 원장 조회 오류는 던진다', async () => {
    const { client } = makeFakeDb({ strava_activities: [activity('a1', INSIDE)] }, { errors: { jam_transactions: '원장 장애' } })
    await expect(readJamEarnedWithin(client, U, WINDOW)).rejects.toThrow('원장 장애')
  })

  it('양을 숫자로 읽지 못하면 던진다', async () => {
    const { client } = makeFakeDb({
      strava_activities: [activity('a1', INSIDE)],
      jam_transactions: [{ ...settlement('a1', 1), amount: 'abc' }],
    })
    await expect(readJamEarnedWithin(client, U, WINDOW)).rejects.toThrow('숫자로 읽지 못했다')
  })

  it('숫자 문자열(numeric이 문자열로 오는 경우)은 숫자로 읽는다', async () => {
    const { client } = makeFakeDb({
      strava_activities: [activity('a1', INSIDE)],
      jam_transactions: [{ ...settlement('a1', 1), amount: '12' }],
    })
    expect(await readJamEarnedWithin(client, U, WINDOW)).toBe(12)
  })
})
