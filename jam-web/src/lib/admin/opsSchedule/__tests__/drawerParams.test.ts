/**
 * 일정표 서랍의 주소 값 (티켓 20261006_1537 ③-b)
 *
 * 지키는 것:
 * - 열기: `drawer=item&item=` / `drawer=day&date=`. 다른 키(`view`·`kind`(여러 개)·`tribe`·`pattern`·`sample`)와 그 순서는 그대로다
 * - 닫기: `drawer`·`item`을 지우고 `date`는 남긴다(날짜 서랍의 날짜가 기준일로 남는다). 다른 키는 그대로다
 * - 항목 서랍은 기준일을 건드리지 않고, 날짜 서랍은 항목 키를 지운다
 * - 새로고침해도 유지된다: 만든 쿼리를 `parseScheduleParams`가 같은 서랍으로 읽는다(옛 카드·미션 키 포함)
 * - 포커스 복귀 선택자: 서랍을 연 칸의 `data-drawer-trigger` 값과 한 글자도 어긋나지 않고, 따옴표로 선택자를 깨뜨릴 수 없다
 */
import { describe, it, expect } from 'vitest'
import { parseScheduleParams } from '../params'
import {
  closeDrawerQuery,
  drawerTargetOf,
  drawerTriggerSelector,
  drawerTriggerValue,
  isSameDrawerTarget,
  openDrawerQuery,
  type ScheduleDrawerTarget,
} from '../drawerParams'

const NOW = new Date('2026-10-07T03:00:00.000Z')
const ITEM = '3f2a9c1e-0000-4000-8000-0000000000a1'
const CARD_KEY = `card:${ITEM}`
const MISSION_KEY = `mission:${ITEM}`

const parse = (query: string) => parseScheduleParams(new URLSearchParams(query), NOW)

describe('openDrawerQuery', () => {
  it('항목 서랍은 drawer=item&item=을 더하고 기준일은 건드리지 않는다', () => {
    const query = openDrawerQuery('view=week&date=2026-10-06', { kind: 'item', key: ITEM })
    expect(query).toBe(`view=week&date=2026-10-06&drawer=item&item=${ITEM}`)
  })

  it('날짜 서랍은 drawer=day&date=를 더하고 그 날짜가 기준일이 되며 항목 키는 지운다', () => {
    const query = openDrawerQuery(`view=week&date=2026-10-05&drawer=item&item=${ITEM}`, { kind: 'day', date: '2026-10-08' })
    expect(parse(query)).toMatchObject({ drawer: 'day', date: '2026-10-08', item: null })
    expect(query).not.toContain('item=')
  })

  it('다른 키(거르기 여러 개·시험 포함)와 순서를 그대로 둔다', () => {
    const search = '?view=week&date=2026-10-06&kind=mission&kind=home_feed_card&tribe=runners&pattern=P01&sample=1'
    const query = openDrawerQuery(search, { kind: 'item', key: ITEM })
    expect(query.startsWith('view=week&date=2026-10-06&kind=mission&kind=home_feed_card&tribe=runners&pattern=P01&sample=1&')).toBe(true)
    expect(parse(query)).toMatchObject({ kinds: ['mission', 'home_feed_card'], tribes: ['runners'], patterns: ['P01'], includeSample: true })
  })

  it('이미 열린 서랍을 다른 항목으로 바꾸면 키가 한 번만 남는다', () => {
    const query = openDrawerQuery(`drawer=item&item=${ITEM}`, { kind: 'item', key: MISSION_KEY })
    expect(new URLSearchParams(query).getAll('item')).toEqual([MISSION_KEY])
    expect(new URLSearchParams(query).getAll('drawer')).toEqual(['item'])
  })

  it('쿼리가 비어 있어도 연다', () => {
    expect(openDrawerQuery('', { kind: 'day', date: '2026-10-07' })).toBe('drawer=day&date=2026-10-07')
  })
})

describe('closeDrawerQuery', () => {
  it('drawer·item을 지우고 date와 다른 키는 남긴다', () => {
    const query = closeDrawerQuery(`?view=week&date=2026-10-08&drawer=day&kind=mission&sample=1`)
    expect(query).toBe('view=week&date=2026-10-08&kind=mission&sample=1')
    const itemClosed = closeDrawerQuery(`view=week&date=2026-10-06&drawer=item&item=${ITEM}`)
    expect(itemClosed).toBe('view=week&date=2026-10-06')
  })

  it('서랍이 없으면 그대로이고, 키가 모두 사라지면 빈 문자열이다', () => {
    expect(closeDrawerQuery('view=week')).toBe('view=week')
    expect(closeDrawerQuery(`drawer=item&item=${ITEM}`)).toBe('')
  })

  it('열었다 닫으면 처음 쿼리로 돌아온다', () => {
    const start = 'view=week&date=2026-10-06&kind=mission&sample=1'
    expect(closeDrawerQuery(openDrawerQuery(start, { kind: 'item', key: ITEM }))).toBe(start)
  })
})

describe('새로고침해도 유지된다 — 만든 쿼리를 같은 서랍으로 읽는다', () => {
  it.each<[string, ScheduleDrawerTarget]>([
    ['운영 항목', { kind: 'item', key: ITEM }],
    ['옛 카드', { kind: 'item', key: CARD_KEY }],
    ['옛 미션', { kind: 'item', key: MISSION_KEY }],
    ['날짜', { kind: 'day', date: '2026-10-09' }],
  ])('%s', (_label, target) => {
    const query = openDrawerQuery('view=week&date=2026-10-06', target)
    expect(drawerTargetOf(parse(query))).toEqual(target)
  })

  it('서랍이 없으면 null이다', () => {
    expect(drawerTargetOf(parse('view=week&date=2026-10-06'))).toBeNull()
    // 항목 서랍인데 항목 키가 없거나 틀리면 닫힌 것이다
    expect(drawerTargetOf(parse('drawer=item'))).toBeNull()
    expect(drawerTargetOf(parse('drawer=item&item=not-a-uuid'))).toBeNull()
  })

  it('날짜 서랍에 date가 없으면 오늘이 기준일이다', () => {
    expect(drawerTargetOf(parse('drawer=day'))).toEqual({ kind: 'day', date: '2026-10-07' })
  })
})

describe('isSameDrawerTarget', () => {
  it('같은 종류·같은 값만 같다(항목 키의 대소문자는 가리지 않는다)', () => {
    expect(isSameDrawerTarget({ kind: 'item', key: ITEM }, { kind: 'item', key: ITEM.toUpperCase() })).toBe(true)
    expect(isSameDrawerTarget({ kind: 'day', date: '2026-10-07' }, { kind: 'day', date: '2026-10-07' })).toBe(true)
    expect(isSameDrawerTarget({ kind: 'day', date: '2026-10-07' }, { kind: 'day', date: '2026-10-08' })).toBe(false)
    expect(isSameDrawerTarget({ kind: 'item', key: ITEM }, { kind: 'item', key: CARD_KEY })).toBe(false)
    expect(isSameDrawerTarget({ kind: 'item', key: ITEM }, { kind: 'day', date: '2026-10-07' })).toBe(false)
    expect(isSameDrawerTarget(null, { kind: 'day', date: '2026-10-07' })).toBe(false)
    expect(isSameDrawerTarget(null, null)).toBe(false)
  })
})

describe('포커스 복귀 선택자', () => {
  it('칸에 다는 값과 선택자가 같은 값을 가리킨다', () => {
    expect(drawerTriggerValue({ kind: 'item', key: ITEM })).toBe(`item:${ITEM}`)
    expect(drawerTriggerValue({ kind: 'item', key: CARD_KEY })).toBe(`item:${CARD_KEY}`)
    expect(drawerTriggerValue({ kind: 'day', date: '2026-10-07' })).toBe('day:2026-10-07')
    expect(drawerTriggerSelector({ kind: 'item', key: ITEM })).toBe(`[data-drawer-trigger="item:${ITEM}"]`)
    expect(drawerTriggerSelector({ kind: 'item', key: MISSION_KEY })).toBe(`[data-drawer-trigger="item:${MISSION_KEY}"]`)
    expect(drawerTriggerSelector({ kind: 'day', date: '2026-10-07' })).toBe('[data-drawer-trigger="day:2026-10-07"]')
  })

  it('따옴표·역슬래시로 선택자를 깨뜨릴 수 없다', () => {
    const selector = drawerTriggerSelector({ kind: 'item', key: 'x"] , body[a="' })
    expect(selector).toBe('[data-drawer-trigger="item:x] , body[a="]')
    expect(selector.match(/"/g)).toHaveLength(2)
    expect(drawerTriggerSelector({ kind: 'day', date: '2026\\-10' })).toBe('[data-drawer-trigger="day:2026-10"]')
  })
})
