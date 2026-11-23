/**
 * 홈피드 카드 시드·색 자동 정하기의 서버 보조 (티켓 20261121_1531, 상위 20261120_2026 6회차-2).
 * 서비스 클라이언트는 운영 묶음 실행 시험의 메모리 DB(`FakeDb`)로 대신한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeFeedCardValues,
  fetchBadgeBgColors,
  fetchFeedCardImageColors,
  fetchCollectionBadgeColors,
  fetchRecentBgKeys,
  FEED_RECENT_BG_LIMIT,
  serverRandomUint32,
} from '@/lib/admin/feedCardServer'
import { DEFAULT_FEED_PALETTE } from '@/lib/today/feedAssign'
import { chipExclusionRule, violatesImageColorRule } from '@/lib/today/feedColorRules'
import { boxAllowedFor, FEED_COLOR_KEYS, FEED_COLOR_USAGE, FEED_DEEP_GREEN_KEY } from '@/lib/today/feedConstants'
import { FakeDb } from '@/lib/admin/opsInbox/execute/__tests__/fakeDb'

const STARTS = '2026-12-01T00:00:00.000Z'
const ENDS = '2026-12-07T14:59:59.999Z'
const LOG_LABEL = '[시험 로그 머리말]'

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

function dbWith(rows: Array<Record<string, unknown>>): FakeDb {
  const db = new FakeDb()
  db.tables.today_cards = rows
  return db
}

describe('serverRandomUint32', () => {
  it('0 이상 2^32 미만 정수를 돌려준다', () => {
    for (let i = 0; i < 20; i++) {
      const value = serverRandomUint32()
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(2 ** 32)
    }
  })
})

describe('fetchRecentBgKeys — 같은 시기 노출 카드의 바탕 키(등록 순서, 최근 12장)', () => {
  const at = (n: number) => `2026-11-${String(n).padStart(2, '0')}T00:00:00.000Z`

  it('기간이 겹치고 바탕이 있는 카드만, 등록 순서(created_at 오름차순)로 돌려준다 — 가장 최근 카드가 마지막이다', async () => {
    const db = dbWith([
      { id: 'c', bg_color_key: 'blue', created_at: at(3), starts_at: '2026-12-06T00:00:00.000Z', ends_at: '2026-12-20T00:00:00.000Z' }, // 뒤쪽이 겹침
      { id: 'a', bg_color_key: 'red', created_at: at(1), starts_at: '2026-11-30T00:00:00.000Z', ends_at: '2026-12-02T00:00:00.000Z' }, // 앞쪽이 겹침
      { id: 'b', bg_color_key: 'green', created_at: at(2), starts_at: '2026-12-03T00:00:00.000Z', ends_at: '2026-12-04T00:00:00.000Z' }, // 안쪽
      { id: 'd', bg_color_key: 'purple', created_at: at(4), starts_at: '2026-11-01T00:00:00.000Z', ends_at: '2026-11-30T23:59:59.000Z' }, // 앞서 끝남
      { id: 'e', bg_color_key: 'yellow', created_at: at(5), starts_at: '2026-12-08T00:00:00.000Z', ends_at: '2026-12-09T00:00:00.000Z' }, // 뒤에 시작
      { id: 'f', bg_color_key: null, created_at: at(6), starts_at: '2026-12-02T00:00:00.000Z', ends_at: '2026-12-03T00:00:00.000Z' }, // 바탕 없음
    ])
    expect(await fetchRecentBgKeys(db.service, { startsAt: STARTS, endsAt: ENDS })).toEqual(['red', 'green', 'blue'])
  })

  it('기간 필터를 starts_at <= 끝, ends_at >= 시작으로 걸고 바탕 없는 행을 뺀다', async () => {
    const db = dbWith([])
    await fetchRecentBgKeys(db.service, { startsAt: STARTS, endsAt: ENDS })
    expect(db.calls).toHaveLength(1)
    expect(db.calls[0].filters).toEqual([
      ['starts_at <=', ENDS],
      ['ends_at >=', STARTS],
      ['bg_color_key not is', null],
    ])
  })

  it(`가장 최근 ${FEED_RECENT_BG_LIMIT}장만 가져오고(오래된 카드가 잘린다) 등록 순서는 그대로다`, async () => {
    expect(FEED_RECENT_BG_LIMIT).toBe(12)
    const rows = Array.from({ length: 15 }, (_, index) => ({
      id: `card-${index + 1}`,
      bg_color_key: `k${index + 1}`,
      created_at: at(index + 1),
      starts_at: STARTS,
      ends_at: ENDS,
    }))
    const keys = await fetchRecentBgKeys(dbWith(rows).service, { startsAt: STARTS, endsAt: ENDS })
    expect(keys).toHaveLength(12)
    expect(keys[0]).toBe('k4')
    expect(keys[11]).toBe('k15')
  })

  it('excludeId가 있으면 그 카드는 빼고, 없으면 id 조건을 걸지 않는다', async () => {
    const db = dbWith([
      { id: 'self', bg_color_key: 'red', created_at: at(1), starts_at: STARTS, ends_at: ENDS },
      { id: 'other', bg_color_key: 'blue', created_at: at(2), starts_at: STARTS, ends_at: ENDS },
    ])
    expect(await fetchRecentBgKeys(db.service, { startsAt: STARTS, endsAt: ENDS, excludeId: 'self' })).toEqual(['blue'])
    expect(db.calls[0].filters[0]).toEqual(['id !=', 'self'])
    expect(await fetchRecentBgKeys(db.service, { startsAt: STARTS, endsAt: ENDS })).toEqual(['red', 'blue'])
    expect(db.calls[1].filters.some(([name]) => name === 'id !=')).toBe(false)
  })

  it('기간이 비어 있으면(null·없음·글자 아님) DB를 읽지 않고 빈 목록이다', async () => {
    const db = dbWith([{ id: 'a', bg_color_key: 'red', starts_at: STARTS, ends_at: ENDS }])
    expect(await fetchRecentBgKeys(db.service, { startsAt: null, endsAt: ENDS })).toEqual([])
    expect(await fetchRecentBgKeys(db.service, { startsAt: STARTS, endsAt: undefined })).toEqual([])
    expect(await fetchRecentBgKeys(db.service, { startsAt: 123, endsAt: ENDS })).toEqual([])
    expect(db.calls).toEqual([])
  })

  it('조회가 실패하면 빈 목록이고 오류는 지정한 머리말로 서버 로그에만 남는다', async () => {
    const db = dbWith([{ id: 'a', bg_color_key: 'red', starts_at: STARTS, ends_at: ENDS }])
    db.failIf = (call) => call.op === 'select'
    expect(await fetchRecentBgKeys(db.service, { startsAt: STARTS, endsAt: ENDS }, LOG_LABEL)).toEqual([])
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0][0]).toBe(LOG_LABEL)
  })
})

describe('completeFeedCardValues — 비어 있는 시드와 색 정하기', () => {
  const period = { startsAt: STARTS, endsAt: ENDS }

  it('비어 있으면 서버 난수로 시드를 정하고 세 색 키를 채운다', async () => {
    const decided = await completeFeedCardValues(dbWith([]).service, {}, period, () => 123456)
    expect(decided.feed_seed).toBe(123456)
    for (const key of [decided.bg_color_key, decided.chip_color_key, decided.box_color_key]) expect(FEED_COLOR_KEYS).toContain(key)
  })

  it('지정한 시드·색은 덮어쓰지 않는다', async () => {
    const decided = await completeFeedCardValues(
      dbWith([]).service,
      { feed_seed: 42, bg_color_key: 'yellow', chip_color_key: 'purple' },
      period,
      () => 999,
    )
    expect(decided.feed_seed).toBe(42)
    expect(decided.bg_color_key).toBe('yellow')
    expect(decided.chip_color_key).toBe('purple')
    expect(FEED_COLOR_KEYS).toContain(decided.box_color_key) // 비어 있던 칸만 정한다
  })

  it('feed_seed가 있으면 그 값이 색 계산 시드다: 난수를 뽑지 않고, 같은 값을 난수로 뽑았을 때와 같은 색·같은 저장 시드가 된다', async () => {
    const random = vi.fn(() => 999)
    const given = await completeFeedCardValues(dbWith([]).service, { feed_seed: 424242 }, period, random)
    const drawn = await completeFeedCardValues(dbWith([]).service, {}, period, () => 424242)
    expect(random).not.toHaveBeenCalled()
    expect(given).toEqual(drawn)
    expect(given.feed_seed).toBe(424242)
    // 다른 난수가 들어와도 지정한 시드의 결과다
    const other = await completeFeedCardValues(dbWith([]).service, { feed_seed: 424242 }, period, () => 1)
    expect(other).toEqual(given)
  })

  it('feed_seed가 없으면 지금처럼 난수를 한 번 뽑아 시드로 쓴다', async () => {
    const random = vi.fn(() => 5150)
    const decided = await completeFeedCardValues(dbWith([]).service, { feed_seed: null }, period, random)
    expect(random).toHaveBeenCalledTimes(1)
    expect(decided.feed_seed).toBe(5150)
  })

  it('같은 시드·같은 앞 카드 목록은 같은 값이다', async () => {
    const rows = [{ id: 'a', bg_color_key: 'red', starts_at: STARTS, ends_at: ENDS }]
    const first = await completeFeedCardValues(dbWith(rows).service, {}, period, () => 777)
    const second = await completeFeedCardValues(dbWith(rows).service, {}, period, () => 777)
    expect(second).toEqual(first)
  })

  it('같은 시기 카드의 바탕이 등록 순서로 배정에 들어가, 짙은 초록이 없던 앞 카드 5장 뒤 6번째 카드는 반드시 짙은 초록 바탕이다', async () => {
    const keys = ['yellow', 'pink', 'sky', 'green', 'yellow']
    const rows = keys.map((key, index) => ({
      id: `used-${index}`,
      bg_color_key: key,
      created_at: `2026-11-0${index + 1}T00:00:00.000Z`,
      starts_at: STARTS,
      ends_at: ENDS,
    }))
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const decided = await completeFeedCardValues(dbWith(rows).service, {}, period, () => seed * 40503)
      expect(decided.bg_color_key, `seed ${seed}`).toBe(FEED_DEEP_GREEN_KEY)
      expect(decided.box_color_key).not.toBe(FEED_DEEP_GREEN_KEY)
    }
  })

  it('이어 붙이면 6번째 카드에 짙은 초록이 나오고 바탕은 바로 앞 카드와 같지 않다(서버 경로로 한 장씩 저장)', async () => {
    const rows: Array<Record<string, unknown>> = []
    let previous: string | null = null
    let sinceDeep = 0
    for (let index = 0; index < 40; index += 1) {
      const decided = await completeFeedCardValues(dbWith(rows).service, {}, period, () => (index + 1) * 40503)
      if (previous !== null) expect(decided.bg_color_key, `카드 ${index}`).not.toBe(previous)
      if (decided.bg_color_key === FEED_DEEP_GREEN_KEY) sinceDeep = 0
      else {
        sinceDeep += 1
        // 짙은 초록 뒤 6번째 카드까지 오는 동안(사이 5장) 한 번은 나와야 한다 — 6장 연속 다른 바탕이면 어긴 것이다
        expect(sinceDeep, `카드 ${index}`).toBeLessThanOrEqual(5)
      }
      previous = decided.bg_color_key
      rows.push({ id: `c${index}`, bg_color_key: decided.bg_color_key, created_at: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(), starts_at: STARTS, ends_at: ENDS })
    }
  })

  it('시드 100개의 자동 배정이 쓰임 표·배제 표를 모두 통과하고 기본 조합으로 되돌리지 않는다', async () => {
    const db = dbWith([])
    for (let seed = 1; seed <= 100; seed++) {
      const decided = await completeFeedCardValues(db.service, {}, period, () => seed * 40503)
      expect(decided.usedFallback).toBe(false)
      expect(decided.warnings).toEqual([])
      expect(FEED_COLOR_USAGE.bg as readonly string[]).toContain(decided.bg_color_key)
      expect(FEED_COLOR_USAGE.valueChip as readonly string[]).toContain(decided.chip_color_key)
      expect(boxAllowedFor(decided.box_color_key, true)).toBe(true)
      expect(chipExclusionRule(decided.chip_color_key, decided.bg_color_key)).toBeNull()
      expect(chipExclusionRule(decided.chip_color_key, decided.box_color_key)).toBeNull()
    }
  })

  it('지정한 칩·바탕은 덮어쓰지 않고, 비어 있는 박스는 지정한 칩과 배제 표를 통과하는 색으로 정한다', async () => {
    for (let seed = 1; seed <= 30; seed++) {
      const decided = await completeFeedCardValues(
        dbWith([]).service,
        { bg_color_key: 'green', chip_color_key: 'red' },
        period,
        () => seed * 40503,
      )
      expect(decided.bg_color_key).toBe('green')
      expect(decided.chip_color_key).toBe('red')
      expect(['green', 'green-deep']).not.toContain(decided.box_color_key)
      expect(decided.usedFallback).toBe(false)
    }
  })

  it('앞 카드 조회가 실패해도 정한다(빈 목록)', async () => {
    const db = dbWith([{ id: 'a', bg_color_key: 'red', starts_at: STARTS, ends_at: ENDS }])
    db.failIf = (call) => call.op === 'select'
    const decided = await completeFeedCardValues(db.service, {}, period, () => 5, LOG_LABEL)
    expect(decided.feed_seed).toBe(5)
    expect(errorSpy).toHaveBeenCalledWith(LOG_LABEL, expect.anything())
  })
})

describe('이미지 대표 색 읽기와 자동 배정 (티켓 20261121_1828)', () => {
  const period = { startsAt: STARTS, endsAt: ENDS }
  const dbWithBadges = (rows: Array<Record<string, unknown>>): FakeDb => {
    const db = new FakeDb()
    db.tables.badges = rows
    return db
  }

  it('fetchBadgeBgColors: badges에서 칸 id·bg_colors만 한 번 읽고 badge_ids 순서로 돌려주며, 삭제됐거나 행이 없는 배지는 뺀다', async () => {
    const db = dbWithBadges([
      { id: 'b2', bg_colors: ['#222222'] },
      { id: 'b1', bg_colors: ['#111111'] },
      { id: 'b3', bg_colors: null },
      { id: 'b4', bg_colors: ['#444444'], deleted_at: '2026-11-01T00:00:00Z' },
    ])
    const colors = await fetchBadgeBgColors(db.service, ['b1', 'gone', 'b4', 'b2', 'b3'])
    expect(colors).toEqual([['#111111'], ['#222222'], null])
    expect(db.calls).toHaveLength(1)
    expect(db.calls[0]).toMatchObject({ table: 'badges', op: 'select', filters: [['id', ['b1', 'gone', 'b4', 'b2', 'b3']], ['deleted_at', null]] })
  })

  it('fetchBadgeBgColors: id가 없으면 읽지 않고 빈 목록이다. 조회가 실패하면 null이고 서버 로그에 남긴다', async () => {
    const db = dbWithBadges([{ id: 'b1', bg_colors: ['#111111'] }])
    expect(await fetchBadgeBgColors(db.service, [])).toEqual([])
    expect(db.calls).toEqual([])
    db.failIf = (call) => call.table === 'badges'
    expect(await fetchBadgeBgColors(db.service, ['b1'], LOG_LABEL)).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(LOG_LABEL, expect.anything())
  })

  it('fetchFeedCardImageColors: 커버 유형은 DB를 읽지 않고 커버 색을 쓴다', async () => {
    const db = dbWithBadges([])
    const image = await fetchFeedCardImageColors(db.service, { feedType: 'hero_box', boxKind: null, coverColors: ['#123456'], badgeIds: ['b1'] })
    expect(image).toEqual({ imageHexes: ['#123456'], chipOnImage: true })
    expect(db.calls).toEqual([])
  })

  it('fetchFeedCardImageColors: 배지 유형은 배지 색을 한 번 읽는다(성공)', async () => {
    const db = dbWithBadges([
      { id: 'b1', bg_colors: ['#111111', '#222222'] },
      { id: 'b2', bg_colors: ['#333333'] },
    ])
    const image = await fetchFeedCardImageColors(db.service, { feedType: 'drop_pickup', boxKind: null, coverColors: null, badgeIds: ['b1', 'b2'] })
    expect(image).toEqual({ imageHexes: ['#111111', '#222222', '#333333'], chipOnImage: false })
    expect(db.calls.filter((call) => call.table === 'badges')).toHaveLength(1)
  })

  it('fetchFeedCardImageColors: 배지 조회가 실패하면 이미지 규칙 없이(빈 입력) 진행하고 로그를 남긴다', async () => {
    const db = dbWithBadges([{ id: 'b1', bg_colors: ['#111111'] }])
    db.failIf = (call) => call.table === 'badges'
    const image = await fetchFeedCardImageColors(db.service, { feedType: 'badge_intro', boxKind: null, coverColors: null, badgeIds: ['b1'] }, LOG_LABEL)
    expect(image).toEqual({ imageHexes: [], chipOnImage: false })
    expect(errorSpy).toHaveBeenCalledWith(LOG_LABEL, expect.anything())
  })

  it('fetchFeedCardImageColors: 배지 유형이 아니거나 badge_ids가 비어 있으면 badges를 읽지 않는다', async () => {
    const db = dbWithBadges([{ id: 'b1', bg_colors: ['#111111'] }])
    await fetchFeedCardImageColors(db.service, { feedType: 'text_box', boxKind: 'image_mask', coverColors: null, badgeIds: ['b1'] })
    await fetchFeedCardImageColors(db.service, { feedType: 'badge_only', boxKind: null, coverColors: null, badgeIds: [] })
    await fetchFeedCardImageColors(db.service, { feedType: 'badge_only', boxKind: null, coverColors: null, badgeIds: null })
    expect(db.calls).toEqual([])
  })

  const badgeRow = (id: string, name: string, colors: unknown, extra: Record<string, unknown> = {}) => ({
    id,
    item_book_id: 'book-1',
    type: 'item',
    name,
    image_url: `https://example.test/${id}.webp`,
    bg_colors: colors,
    ...extra,
  })

  it('fetchCollectionBadgeColors: 홈과 같은 규칙(이름·id 순, 그림 있는 아이템 배지, 같은 이름은 하나, 최대 4개)으로 고른 배지의 대표 색을 그 순서로 돌려준다', async () => {
    const db = dbWithBadges([
      badgeRow('b6', '여섯', ['#666666']),
      badgeRow('b1', '가', ['#111111']),
      badgeRow('b2', '나', ['#222222']),
      badgeRow('b2x', '나', ['#2a2a2a']), // 같은 이름(다른 등급)은 건너뛴다
      badgeRow('b3', '다', ['#333333']),
      badgeRow('b4', '라', ['#444444']),
      badgeRow('b5', '마', ['#555555']), // 5번째라 잘린다
      badgeRow('bn', '그림없음', ['#999999'], { image_url: null }),
      badgeRow('bc', '체크인', ['#888888'], { type: 'checkin' }),
      badgeRow('bd', '삭제됨', ['#777777'], { deleted_at: '2026-11-01T00:00:00Z' }),
      badgeRow('bo', '다른컬렉션', ['#abcdef'], { item_book_id: 'book-2' }),
    ])
    const first = await fetchCollectionBadgeColors(db.service, 'book-1')
    expect(first).toEqual([['#111111'], ['#222222'], ['#333333'], ['#444444']])
    // 같은 컬렉션은 늘 같은 4개를 본다
    expect(await fetchCollectionBadgeColors(db.service, 'book-1')).toEqual(first)
    expect(db.calls[0]).toMatchObject({ table: 'badges', op: 'select', filters: [['item_book_id', 'book-1'], ['deleted_at', null]] })
  })

  it('fetchCollectionBadgeColors: 조회가 실패하면 null이고 서버 로그에 남긴다', async () => {
    const db = dbWithBadges([badgeRow('b1', '가', ['#111111'])])
    db.failIf = (call) => call.table === 'badges'
    expect(await fetchCollectionBadgeColors(db.service, 'book-1', LOG_LABEL)).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(LOG_LABEL, expect.anything())
  })

  it('fetchFeedCardImageColors: 컬렉션 소개는 커버 색에 아이템 배지 4개 색을 합치고, 대표 색이 비어 있는 배지는 건너뛴다', async () => {
    const db = dbWithBadges([
      badgeRow('b1', '가', ['#111111', '#121212']),
      badgeRow('b2', '나', null),
      badgeRow('b3', '다', []),
      badgeRow('b4', '라', ['#444444']),
      badgeRow('b5', '마', ['#555555']),
    ])
    const image = await fetchFeedCardImageColors(db.service, {
      feedType: 'collection_intro',
      boxKind: null,
      coverColors: ['#abcdef'],
      badgeIds: null,
      itemBookId: 'book-1',
    })
    expect(image).toEqual({ imageHexes: ['#abcdef', '#111111', '#121212', '#444444'], chipOnImage: true })
  })

  it('fetchFeedCardImageColors: 컬렉션 소개라도 item_book_id가 없거나 다른 유형이면 배지를 읽지 않는다(커버 색만, 예전과 같다)', async () => {
    const db = dbWithBadges([badgeRow('b1', '가', ['#111111'])])
    const noBook = await fetchFeedCardImageColors(db.service, { feedType: 'collection_intro', boxKind: null, coverColors: ['#abcdef'], badgeIds: null })
    expect(noBook).toEqual({ imageHexes: ['#abcdef'], chipOnImage: true })
    const hero = await fetchFeedCardImageColors(db.service, { feedType: 'hero_box', boxKind: null, coverColors: ['#abcdef'], badgeIds: null, itemBookId: 'book-1' })
    expect(hero).toEqual({ imageHexes: ['#abcdef'], chipOnImage: true })
    expect(db.calls).toEqual([])
  })

  it('fetchFeedCardImageColors: 컬렉션 배지 조회가 실패하면 없는 것으로 보고 커버 색만 쓴다', async () => {
    const db = dbWithBadges([badgeRow('b1', '가', ['#111111'])])
    db.failIf = (call) => call.table === 'badges'
    const image = await fetchFeedCardImageColors(
      db.service,
      { feedType: 'collection_intro', boxKind: null, coverColors: ['#abcdef'], badgeIds: null, itemBookId: 'book-1' },
      LOG_LABEL,
    )
    expect(image).toEqual({ imageHexes: ['#abcdef'], chipOnImage: true })
    expect(errorSpy).toHaveBeenCalledWith(LOG_LABEL, expect.anything())
  })

  it('completeFeedCardValues: 컬렉션 소개는 아이템 배지 색에 걸리는 배경을 거른다', async () => {
    const red = DEFAULT_FEED_PALETTE.red
    const db = dbWithBadges([badgeRow('b1', '가', [red])])
    for (let seed = 1; seed <= 60; seed++) {
      const decided = await completeFeedCardValues(db.service, {}, period, () => seed * 40503, undefined, {
        feedType: 'collection_intro',
        boxKind: null,
        coverColors: ['#abcdef'],
        badgeIds: null,
        itemBookId: 'book-1',
      })
      expect(violatesImageColorRule(DEFAULT_FEED_PALETTE[decided.bg_color_key], [red])).toBe(false)
    }
  })

  it('completeFeedCardValues: imageSource가 없으면 이미지 규칙 없이 이전과 같은 값이다', async () => {
    const baseline = await completeFeedCardValues(dbWith([]).service, {}, period, () => 321)
    const withNone = await completeFeedCardValues(dbWith([]).service, {}, period, () => 321, undefined, undefined)
    expect(withNone).toEqual(baseline)
    expect(baseline.imageRuleSkipped).toBe(false)
  })

  it('completeFeedCardValues: 커버 대표 색을 주면 시드 100개에서 배경·칩이 규칙 ⑤·⑥을 통과한다', async () => {
    const cover = ['#f5442c', '#95c1f7', '#c0dc66']
    for (let seed = 1; seed <= 100; seed++) {
      const decided = await completeFeedCardValues(dbWith([]).service, {}, period, () => seed * 40503, undefined, {
        feedType: 'hero_box',
        boxKind: null,
        coverColors: cover,
        badgeIds: null,
      })
      expect(decided.usedFallback).toBe(false)
      expect(decided.imageRuleSkipped).toBe(false)
      expect(violatesImageColorRule(DEFAULT_FEED_PALETTE[decided.bg_color_key], cover)).toBe(false)
      expect(violatesImageColorRule(DEFAULT_FEED_PALETTE[decided.chip_color_key], cover)).toBe(false)
    }
  })

  it('completeFeedCardValues: 배지 유형은 배지 대표 색으로 배경만 거른다(배지 행은 한 번만 읽는다)', async () => {
    const colors = ['#f5442c']
    const db = dbWithBadges([{ id: 'b1', bg_colors: colors }])
    const decided = await completeFeedCardValues(db.service, {}, period, () => 77, undefined, {
      feedType: 'badge_intro',
      boxKind: null,
      coverColors: null,
      badgeIds: ['b1'],
    })
    expect(violatesImageColorRule(DEFAULT_FEED_PALETTE[decided.bg_color_key], colors)).toBe(false)
    expect(db.calls.filter((call) => call.table === 'badges')).toHaveLength(1)
  })

  it('completeFeedCardValues: 지정한 색은 이미지 색에 걸려도 덮어쓰지 않는다', async () => {
    const decided = await completeFeedCardValues(dbWith([]).service, { bg_color_key: 'red' }, period, () => 5, undefined, {
      feedType: 'hero_box',
      boxKind: null,
      coverColors: [DEFAULT_FEED_PALETTE.red],
      badgeIds: null,
    })
    expect(decided.bg_color_key).toBe('red')
  })
})

describe('색 덮어쓰기 팔레트로 정하기 (티켓 20261121_2145)', () => {
  const period = { startsAt: STARTS, endsAt: ENDS }

  it('덮어쓰기 행이 없으면 팔레트를 직접 준 것과 같은 값이다(표를 한 번 읽는다)', async () => {
    const db = dbWith([])
    const withTable = await completeFeedCardValues(db.service, { bg_color_key: 'red' }, period, () => 11)
    const explicit = await completeFeedCardValues(
      dbWith([]).service,
      { bg_color_key: 'red' },
      period,
      () => 11,
      undefined,
      undefined,
      DEFAULT_FEED_PALETTE,
    )
    expect(withTable).toEqual(explicit)
    expect(db.calls.filter((call) => call.table === 'feed_color_overrides')).toHaveLength(1)
  })

  // 통합 팔레트 규칙에서 hex를 읽는 것은 그림 색 규칙(⑤·⑥)뿐이다. 분홍을 빨강 hex로 덮어쓰면 빨강 그림 위에서 분홍도 묻힌다.
  const RED_COVER = {
    feedType: 'hero_box',
    boxKind: null,
    coverColors: [DEFAULT_FEED_PALETTE.red],
    badgeIds: null,
  } as const
  const usesPink = (d: { bg_color_key: string; chip_color_key: string }) => d.bg_color_key === 'pink' || d.chip_color_key === 'pink'

  it('표의 덮어쓴 hex로 그림 색 규칙을 판정한다 — 그림 색과 같은 hex로 덮어쓴 색은 바탕·칩으로 고르지 않는다', async () => {
    let baselineUsesPink = 0
    for (let seed = 1; seed <= 30; seed++) {
      const baseline = await completeFeedCardValues(dbWith([]).service, {}, period, () => seed * 40503, undefined, RED_COVER)
      if (usesPink(baseline)) baselineUsesPink += 1
      const db = dbWith([])
      db.tables.feed_color_overrides = [{ color_key: 'pink', hex: DEFAULT_FEED_PALETTE.red }]
      const decided = await completeFeedCardValues(db.service, {}, period, () => seed * 40503, undefined, RED_COVER)
      expect(usesPink(decided)).toBe(false)
    }
    // 덮어쓰지 않으면 분홍이 나오는 카드가 있다(위 단언이 우연히 통과한 것이 아니다)
    expect(baselineUsesPink).toBeGreaterThan(0)
  })

  it('palette를 주면 표를 읽지 않고 그 팔레트를 쓴다', async () => {
    const db = dbWith([])
    const palette = { ...DEFAULT_FEED_PALETTE, pink: DEFAULT_FEED_PALETTE.red }
    for (let seed = 1; seed <= 30; seed++) {
      const decided = await completeFeedCardValues(db.service, {}, period, () => seed * 40503, undefined, RED_COVER, palette)
      expect(usesPink(decided)).toBe(false)
    }
    expect(db.calls.filter((call) => call.table === 'feed_color_overrides')).toEqual([])
  })

  it('표를 읽지 못해도 기본 팔레트로 정하고 서버 로그에 남긴다(저장을 막지 않는다)', async () => {
    const baseline = await completeFeedCardValues(dbWith([]).service, {}, period, () => 99)
    errorSpy.mockClear()
    const db = dbWith([])
    db.failIf = (call) => call.table === 'feed_color_overrides'
    const decided = await completeFeedCardValues(db.service, {}, period, () => 99, LOG_LABEL)
    expect(decided).toEqual(baseline)
    expect((errorSpy.mock.calls as unknown[][]).some((call) => call[0] === LOG_LABEL)).toBe(true)
  })
})
