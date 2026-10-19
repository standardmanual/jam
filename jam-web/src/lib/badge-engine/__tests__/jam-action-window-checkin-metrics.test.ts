/**
 * 체크인 «처음 받은» 지표의 기간 한정 시험 (티켓 20261019_1445 2회, 사용자 결정 3)
 *
 * 대상: `new_checkin_badge_count`(`countNewCheckinBadgeCount`), `checkin_category_count`(`countCheckinCategoryBadges`),
 * `checkin_badge_count`(`countCheckinListedBadges`).
 *
 * 고정하는 것
 *  ① 전체 이력으로 배지별 처음 받은 시각을 정한 뒤 그 시각이 기간 안(하한·상한 포함)인 배지만 센다
 *  ② 처음 받은 시각이 기간 전이면 기간 안에 다시 받아도 새 배지로 세지 않는다
 *  ③ 처음 받은 시각은 활동 시각(`triggered_by_activity_date`)이 우선이고, 없으면 기록 시각(`earned_at`)을 쓴다
 *  ④ 인자를 주지 않으면 받은 모든 배지로 센다(예전 동작 — 배지 엔진 회귀 방지)
 *  ⑤ 읽기 오류와 읽을 수 없는 기간은 0으로 폴백하지 않고 던진다
 *
 * 모조 DB는 `eq`·`in`을 실제로 적용한다(`fakeSupabase.ts`).
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-window-checkin-metrics.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { MetricWindow } from '../jamActionWindow'
import {
  badgeIdsFirstEarnedWithin,
  countCheckinCategoryBadges,
  countCheckinListedBadges,
  countNewCheckinBadgeCount,
  firstEarnDayByBadge,
  firstEarnMsByBadge,
  type CheckinEarnRow,
} from '../jamActionCheckinMetrics'
import { makeFakeDb, type FakeRow } from './fakeSupabase'

const U = 'user-1'
const OTHER = 'user-2'

const FROM = '2026-10-10T00:00:00.000Z'
const TO = '2026-10-20T00:00:00.000Z'
const WINDOW: MetricWindow = { fromIso: FROM, toIso: TO }

const BEFORE = '2026-10-09T23:59:59.999Z'
const AT_FROM = '2026-10-10T00:00:00+00:00'
const INSIDE = '2026-10-15T12:00:00.000Z'
const AT_TO = '2026-10-20T00:00:00+00:00'
const AFTER = '2026-10-20T00:00:00.001Z'

let seq = 0
/** 방문 기록 한 줄 — 활동 시각을 주면 그것이 우선이고, `earnedAt`은 기록 시각이다 */
function earn(badgeId: string, activityAt: string | null, options: { earnedAt?: string | null; userId?: string } = {}): FakeRow {
  seq += 1
  return {
    id: `e${String(seq).padStart(5, '0')}`,
    user_id: options.userId ?? U,
    badge_id: badgeId,
    poi_id: `poi-${badgeId}`,
    triggered_by_activity_date: activityAt,
    earned_at: options.earnedAt === undefined ? '2026-10-31T00:00:00Z' : options.earnedAt,
  }
}

describe('순수 함수 — 처음 받은 시각과 기간', () => {
  const rows: CheckinEarnRow[] = [
    { badge_id: 'a', triggered_by_activity_date: INSIDE, earned_at: '2026-10-31T00:00:00Z' },
    { badge_id: 'a', triggered_by_activity_date: BEFORE, earned_at: '2026-10-31T00:00:00Z' },
    { badge_id: 'b', triggered_by_activity_date: null, earned_at: INSIDE },
    { badge_id: 'c', triggered_by_activity_date: null, earned_at: null },
  ]

  it('배지별로 가장 이른 줄의 시각을 처음 받은 시각으로 하고, 시각을 읽을 수 없는 배지는 뺀다', () => {
    const first = firstEarnMsByBadge(rows)
    expect(first.get('a')).toBe(Date.parse(BEFORE))
    expect(first.get('b')).toBe(Date.parse(INSIDE))
    expect(first.has('c')).toBe(false)
  })

  it('firstEarnDayByBadge는 같은 시각을 KST 날짜 키로 옮긴다 (기존 동작)', () => {
    expect(firstEarnDayByBadge(rows).get('a')).toBe('2026-10-10') // 2026-10-09T23:59Z = KST 10-10 08:59
    expect(firstEarnDayByBadge(rows).get('b')).toBe('2026-10-15')
    expect(firstEarnDayByBadge(rows).has('c')).toBe(false)
  })

  it('처음 받은 시각이 기간 안인 배지만 돌려준다 — 기간 전에 처음 받은 a는 기간 안 줄이 있어도 뺀다', () => {
    expect([...badgeIdsFirstEarnedWithin(rows, WINDOW)]).toEqual(['b'])
  })

  it('하한·상한 정각은 포함하고 1ms 밖은 뺀다', () => {
    const edge = (badge: string, at: string): CheckinEarnRow => ({ badge_id: badge, triggered_by_activity_date: at, earned_at: null })
    const within = badgeIdsFirstEarnedWithin(
      [edge('before', BEFORE), edge('atFrom', AT_FROM), edge('atTo', AT_TO), edge('after', AFTER)],
      WINDOW
    )
    expect([...within].sort()).toEqual(['atFrom', 'atTo'])
  })

  it('상한이 없으면 하한 이후는 끝까지 센다', () => {
    const within = badgeIdsFirstEarnedWithin(
      [
        { badge_id: 'old', triggered_by_activity_date: BEFORE, earned_at: null },
        { badge_id: 'late', triggered_by_activity_date: '2027-03-01T00:00:00Z', earned_at: null },
      ],
      { fromIso: FROM, toIso: null }
    )
    expect([...within]).toEqual(['late'])
  })

  it('기간의 하한·상한이 시각으로 읽히지 않으면 던진다 (조용히 0이나 전부로 폴백하지 않는다)', () => {
    expect(() => badgeIdsFirstEarnedWithin(rows, { fromIso: 'nope', toIso: null })).toThrow(/하한/)
    expect(() => badgeIdsFirstEarnedWithin(rows, { fromIso: FROM, toIso: 'nope' })).toThrow(/상한/)
  })
})

describe('new_checkin_badge_count — 기간 안에 처음 받은 배지 수', () => {
  it('처음 받은 시각이 기간 안인 배지만 센다 (전·후는 뺀다)', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [earn('before', BEFORE), earn('inside', INSIDE), earn('after', AFTER)],
    })
    expect(await countNewCheckinBadgeCount(client, U, WINDOW)).toBe(1)
  })

  it('기간 전에 받은 배지를 기간 안에 다시 받아도 새 배지로 세지 않는다 (사용자 결정 3)', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [
        earn('old', BEFORE), // 기간 전에 처음
        earn('old', INSIDE), // 기간 안에 다시
        earn('old', INSIDE),
        earn('fresh', INSIDE), // 기간 안에 처음
      ],
    })
    expect(await countNewCheckinBadgeCount(client, U, WINDOW)).toBe(1)
    // 행부터 기간으로 거르는 잘못된 구현이라면 2가 된다 — 인자가 없을 때는 받은 모든 배지(2)다
    expect(await countNewCheckinBadgeCount(client, U)).toBe(2)
  })

  it('같은 배지를 기간 안에 여러 번 받아도 1이다', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [earn('x', INSIDE), earn('x', AT_TO), earn('x', AT_FROM)],
    })
    expect(await countNewCheckinBadgeCount(client, U, WINDOW)).toBe(1)
  })

  it('하한·상한 정각은 포함하고 1ms 밖은 센 배지에서 뺀다', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [earn('b0', BEFORE), earn('b1', AT_FROM), earn('b2', INSIDE), earn('b3', AT_TO), earn('b4', AFTER)],
    })
    expect(await countNewCheckinBadgeCount(client, U, WINDOW)).toBe(3)
  })

  it('활동 시각이 없는 줄은 기록 시각(earned_at)으로 처음 받은 시각을 정한다', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [
        earn('byEarnedAt', null, { earnedAt: INSIDE }), // 기록 시각이 기간 안 → 센다
        earn('byEarnedAtBefore', null, { earnedAt: BEFORE }), // 기록 시각이 기간 전 → 뺀다
      ],
    })
    expect(await countNewCheckinBadgeCount(client, U, WINDOW)).toBe(1)
  })

  it('활동 시각이 있으면 기록 시각보다 우선한다 — 며칠 뒤에 동기화한 옛 활동은 활동 시각으로 본다', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [
        // 참가 전에 한 활동을 기간 안에 동기화했다 → 처음 받은 시각은 활동 시각(기간 전)이라 센 배지가 아니다
        earn('lateSync', BEFORE, { earnedAt: INSIDE }),
        // 활동은 기간 안, 기록은 기간 뒤 → 활동 시각이 기간 안이라 센다
        earn('inTime', INSIDE, { earnedAt: AFTER }),
      ],
    })
    expect(await countNewCheckinBadgeCount(client, U, WINDOW)).toBe(1)
  })

  it('처음 받은 시각을 읽을 수 없는 배지는 기간 안에서는 뺀다 / 인자가 없으면 종류로 센다', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [earn('noTime', null, { earnedAt: null }), earn('inside', INSIDE)],
    })
    expect(await countNewCheckinBadgeCount(client, U, WINDOW)).toBe(1)
    expect(await countNewCheckinBadgeCount(client, U)).toBe(2)
  })

  it('다른 유저의 기록은 세지 않는다', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [earn('mine', INSIDE), earn('theirs', INSIDE, { userId: OTHER })],
    })
    expect(await countNewCheckinBadgeCount(client, U, WINDOW)).toBe(1)
  })

  it('읽기 오류는 0으로 폴백하지 않고 던진다', async () => {
    const { client } = makeFakeDb({}, { errors: { user_checkin_badge_earns: 'DB 장애' } })
    await expect(countNewCheckinBadgeCount(client, U, WINDOW)).rejects.toThrow(/DB 장애/)
  })
})

describe('checkin_category_count — 기간 안에 처음 받은 배지 가운데 장소 종류별 개수', () => {
  const badges = (...ids: string[]): FakeRow[] => ids.map((id) => ({ id, type: 'checkin', name: id, category: 'train_subway' }))

  it('처음 받은 시각이 기간 안인 배지만 센다 / 기간 전에 처음 받은 배지는 다시 받아도 뺀다', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [
        earn('s1', BEFORE),
        earn('s1', INSIDE), // 다시 받음 — 새 배지가 아니다
        earn('s2', INSIDE),
        earn('s3', AT_TO),
        earn('s4', AFTER),
      ],
      badges: badges('s1', 's2', 's3', 's4'),
    })
    expect(await countCheckinCategoryBadges(client, U, 'train_subway', WINDOW)).toBe(2)
    expect(await countCheckinCategoryBadges(client, U, 'train_subway')).toBe(4)
  })

  it('badges.category가 없으면 연결 지점의 카테고리를 쓰고, 다른 카테고리는 세지 않는다', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [earn('a', INSIDE), earn('b', INSIDE), earn('c', INSIDE)],
      badges: [
        { id: 'a', category: null },
        { id: 'b', category: 'michelin' },
        { id: 'c', category: null },
      ],
      poi: [
        { linked_badge_id: 'a', category: 'train_subway' },
        { linked_badge_id: 'c', category: 'michelin' },
      ],
    })
    expect(await countCheckinCategoryBadges(client, U, 'train_subway', WINDOW)).toBe(1)
    expect(await countCheckinCategoryBadges(client, U, 'michelin', WINDOW)).toBe(2)
  })

  it('기간 안에 처음 받은 배지가 없으면 0이고 카테고리를 조회하지 않는다', async () => {
    const db = makeFakeDb({ user_checkin_badge_earns: [earn('s1', BEFORE)], badges: badges('s1') })
    expect(await countCheckinCategoryBadges(db.client, U, 'train_subway', WINDOW)).toBe(0)
    expect(db.queried).toEqual(['user_checkin_badge_earns'])
  })

  it('배지가 200개를 넘어도 나눠 읽은 결과를 합쳐 센다', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `s${i}`)
    const { client } = makeFakeDb({
      user_checkin_badge_earns: ids.map((id) => earn(id, INSIDE)),
      badges: badges(...ids),
    })
    expect(await countCheckinCategoryBadges(client, U, 'train_subway', WINDOW)).toBe(450)
  })

  it('배지 카테고리·연결 지점 조회 오류는 던진다', async () => {
    const earns = [earn('s1', INSIDE)]
    const badgesFail = makeFakeDb({ user_checkin_badge_earns: earns }, { errors: { badges: 'badges 장애' } })
    await expect(countCheckinCategoryBadges(badgesFail.client, U, 'train_subway', WINDOW)).rejects.toThrow(/badges 장애/)
    const poiFail = makeFakeDb({ user_checkin_badge_earns: earns, badges: badges('s1') }, { errors: { poi: 'poi 장애' } })
    await expect(countCheckinCategoryBadges(poiFail.client, U, 'train_subway', WINDOW)).rejects.toThrow(/poi 장애/)
  })
})

describe('checkin_badge_count — 기간 안에 처음 받은 배지 가운데 지정 이름의 개수', () => {
  const catalog: FakeRow[] = [
    { id: 'seongsu', type: 'checkin', name: '성수역' },
    { id: 'wangsimni', type: 'checkin', name: '왕십리역' },
    { id: 'konkuk', type: 'checkin', name: '건대입구역' },
  ]
  const NAMES = ['성수역', '왕십리역', '건대입구역']

  it('처음 받은 시각이 기간 안인 이름만 센다 / 기간 전에 처음 받은 이름은 다시 받아도 뺀다', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [
        earn('seongsu', BEFORE),
        earn('seongsu', INSIDE), // 다시 받음
        earn('wangsimni', INSIDE),
        earn('konkuk', AT_FROM),
      ],
      badges: catalog,
    })
    expect(await countCheckinListedBadges(client, U, NAMES, WINDOW)).toBe(2)
    expect(await countCheckinListedBadges(client, U, NAMES)).toBe(3)
  })

  it('이름은 type=checkin 배지로만 푼다 (같은 이름의 다른 종류 배지는 무시)', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [earn('act-badge', INSIDE)],
      badges: [{ id: 'act-badge', type: 'activity', name: '성수역' }],
    })
    expect(await countCheckinListedBadges(client, U, ['성수역'], WINDOW)).toBe(0)
  })

  it('카탈로그에 없는 이름은 무시하고 나머지로 센다', async () => {
    const { client } = makeFakeDb({ user_checkin_badge_earns: [earn('seongsu', INSIDE)], badges: catalog })
    expect(await countCheckinListedBadges(client, U, ['성수역', '없는이름'], WINDOW)).toBe(1)
  })

  it('같은 이름의 체크인 배지가 둘이면 하나라도 기간 안에 처음 받았으면 그 이름 1개다', async () => {
    const { client } = makeFakeDb({
      user_checkin_badge_earns: [earn('seongsu-a', BEFORE), earn('seongsu-b', INSIDE)],
      badges: [
        { id: 'seongsu-a', type: 'checkin', name: '성수역' },
        { id: 'seongsu-b', type: 'checkin', name: '성수역' },
      ],
    })
    expect(await countCheckinListedBadges(client, U, ['성수역'], WINDOW)).toBe(1)
  })

  it('목록에 같은 이름이 두 번 있으면 두 번 센다 (배지 발급과 같은 규칙)', async () => {
    const { client } = makeFakeDb({ user_checkin_badge_earns: [earn('seongsu', INSIDE)], badges: catalog })
    expect(await countCheckinListedBadges(client, U, ['성수역', '성수역'], WINDOW)).toBe(2)
  })

  it('기간 안에 처음 받은 배지가 없거나 이름 목록이 비면 0이고 이름을 조회하지 않는다', async () => {
    const none = makeFakeDb({ user_checkin_badge_earns: [earn('seongsu', BEFORE)], badges: catalog })
    expect(await countCheckinListedBadges(none.client, U, NAMES, WINDOW)).toBe(0)
    expect(none.queried).toEqual(['user_checkin_badge_earns'])

    const empty = makeFakeDb({ user_checkin_badge_earns: [earn('seongsu', INSIDE)], badges: catalog })
    expect(await countCheckinListedBadges(empty.client, U, [], WINDOW)).toBe(0)
    expect(empty.queried).toEqual(['user_checkin_badge_earns'])
  })

  it('이름 조회 오류는 던진다', async () => {
    const { client } = makeFakeDb({ user_checkin_badge_earns: [earn('seongsu', INSIDE)] }, { errors: { badges: '이름 장애' } })
    await expect(countCheckinListedBadges(client, U, NAMES, WINDOW)).rejects.toThrow(/이름 장애/)
  })
})
