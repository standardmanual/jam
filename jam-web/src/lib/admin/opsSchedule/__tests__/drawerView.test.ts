/**
 * 일정표 서랍이 그리는 값의 계산 (티켓 20261006_1537 ③-b)
 *
 * 지키는 것:
 * - 날짜 서랍 신호 안내(가정 5): 못 읽음 / 검사 범위 밖(「이상 없음」 금지, 줄이 있어도 안내) / 범위 안에서 뜬 것 없음 / 줄만 보임
 * - 대표 카드·항목 목록 안내는 못 읽은 재료를 「없다」고 하지 않는다
 * - 날짜 서랍 항목 구역(티켓 20261006_1538 ③-c): 항목이 0개이고 못 읽은 재료가 있으면 「올라온 항목이 없어요」 대신 「일부 항목을 읽지 못해 빠져 있을 수 있어요」만 보인다
 * - 옛 카드·미션 요약: 칸 항목·미션 막대에서 찾고(대소문자 무시), 운영 항목 키이거나 이 주에 없으면 null이다. 경로가 없으면 키로 만든다
 * - 서랍 키를 출처별로 나눈다
 */
import { describe, expect, it } from 'vitest'
import {
  DAY_EMPTY_TEXT,
  DAY_ITEMS_PARTIAL_TEXT,
  DAY_REPRESENTATIVE_NONE_TEXT,
  DAY_REPRESENTATIVE_UNREAD_TEXT,
  DAY_SIGNAL_NONE_TEXT,
  DAY_SIGNAL_UNCHECKED_TEXT,
  DAY_SIGNAL_UNREAD_TEXT,
  dayItemsNotice,
  dayItemsSection,
  daySignalNotice,
  dayRepresentativeNotice,
  formatDayTitle,
  legacyEntryOf,
  legacyHref,
  statusByDrawerKey,
} from '../drawerView'
import { splitItemKey } from '../drawerParams'
import type { DaySignals } from '../signalDays'
import type { ScheduleDay, ScheduleItem, ScheduleMissionBar, ScheduleWeek } from '../weekView'

const ID = '3f2a9c1e-0000-4000-8000-0000000000a1'

function signals(over: Partial<DaySignals> = {}): DaySignals {
  return { checked: true, topLevel: null, count: 0, lines: [], ...over }
}

function item(over: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: `card-${ID}-2026-10-06`,
    origin: 'card',
    drawerKey: `card:${ID}`,
    kind: 'home_feed_card',
    title: '옛 카드 제목',
    time: 'T03',
    status: null,
    isSample: false,
    dim: false,
    href: `/admin/today/${ID}?date=2026-10-06`,
    note: '노출 3 · 열람 1',
    ...over,
  }
}

function week(items: ScheduleItem[] = [], missionBars: ScheduleMissionBar[] = []): ScheduleWeek {
  const days: ScheduleDay[] = Array.from({ length: 7 }, (_, index) => ({
    date: `2026-10-${String(5 + index).padStart(2, '0')}`,
    weekdayLabel: ['월', '화', '수', '목', '금', '토', '일'][index],
    dateLabel: `10월 ${5 + index}일`,
    isToday: false,
    items: index === 1 ? items : [],
    longActiveCount: 0,
    longInactiveCount: 0,
    automation: [],
    signals: null,
    representative: null,
  }))
  return { weekStart: '2026-10-05', weekEnd: '2026-10-11', days, missionBars, openEndedMissionCount: 0, contentCount: items.length }
}

describe('formatDayTitle', () => {
  it('「10월 7일(화)」 모양이다', () => {
    expect(formatDayTitle({ dateLabel: '10월 7일', weekdayLabel: '화' })).toBe('10월 7일(화)')
  })
})

describe('daySignalNotice(가정 5)', () => {
  it('신호를 못 읽었으면 신호가 없다는 뜻이 아니라고 알린다', () => {
    expect(daySignalNotice(null)).toBe(DAY_SIGNAL_UNREAD_TEXT)
    expect(DAY_SIGNAL_UNREAD_TEXT).toContain('신호가 없다는 뜻은 아니에요')
  })

  it('검사 범위 밖이면 「확인하는 기간이 아니에요」이고 「이상 없음」이라고 하지 않는다', () => {
    const notice = daySignalNotice(signals({ checked: false }))
    expect(notice).toBe(DAY_SIGNAL_UNCHECKED_TEXT)
    expect(notice).not.toContain('이상 없')
  })

  it('범위 밖이어도 날짜가 있는 결과가 줄로 남아 있으면 안내가 함께 붙는다', () => {
    expect(daySignalNotice(signals({ checked: false, count: 1, topLevel: 'warn' }))).toBe(DAY_SIGNAL_UNCHECKED_TEXT)
  })

  it('범위 안에서 뜬 신호가 없으면 「뜬 신호가 없어요」이고 이상 없음이라고 하지 않는다', () => {
    expect(daySignalNotice(signals())).toBe(DAY_SIGNAL_NONE_TEXT)
    expect(DAY_SIGNAL_NONE_TEXT).not.toContain('이상 없')
  })

  it('범위 안에서 신호가 떴으면 안내 없이 줄만 보인다', () => {
    expect(daySignalNotice(signals({ count: 2, topLevel: 'stop' }))).toBeNull()
  })
})

describe('대표 카드·항목 목록 안내', () => {
  const none = { representative: null }
  const rep = { representative: { title: '대표', drawerKey: 'x' } }

  it('대표 카드가 있으면 안내가 없다', () => {
    expect(dayRepresentativeNotice(rep, {})).toBeNull()
    expect(dayRepresentativeNotice(rep, { cards: '실패' })).toBeNull()
  })

  it('대표 카드가 없고 모두 읽었으면 「없어요」이다', () => {
    expect(dayRepresentativeNotice(none, {})).toBe(DAY_REPRESENTATIVE_NONE_TEXT)
    // 미션·신호를 못 읽은 것은 대표 카드와 상관없다
    expect(dayRepresentativeNotice(none, { missions: '실패', signals: '실패' })).toBe(DAY_REPRESENTATIVE_NONE_TEXT)
  })

  it('카드나 운영 묶음을 못 읽었으면 「없다」고 하지 않는다', () => {
    expect(dayRepresentativeNotice(none, { cards: '실패' })).toBe(DAY_REPRESENTATIVE_UNREAD_TEXT)
    expect(dayRepresentativeNotice(none, { bundles: '실패' })).toBe(DAY_REPRESENTATIVE_UNREAD_TEXT)
  })

  it('항목 목록은 카드·미션·운영 항목 중 하나라도 못 읽었으면 빠졌을 수 있다고 알린다', () => {
    expect(dayItemsNotice({})).toBeNull()
    for (const source of ['cards', 'missions', 'bundles'] as const) expect(dayItemsNotice({ [source]: '실패' })).toBe(DAY_ITEMS_PARTIAL_TEXT)
  })
})

describe('dayItemsSection — 날짜 서랍 항목 구역(③-b에서 넘어온 조건)', () => {
  it('항목이 있으면 개수가 머리 글자이고 빈 글자는 없다', () => {
    expect(dayItemsSection(3, {})).toEqual({ title: '항목 3개', notice: null, emptyText: null })
  })

  it('항목이 있는데 못 읽은 재료가 있으면 목록 위에 안내가 붙는다', () => {
    expect(dayItemsSection(2, { missions: '실패' })).toEqual({ title: '항목 2개', notice: DAY_ITEMS_PARTIAL_TEXT, emptyText: null })
  })

  it('항목이 0개이고 모두 읽었으면 「올라온 항목이 없어요」이다', () => {
    expect(dayItemsSection(0, {})).toEqual({ title: '항목 0개', notice: null, emptyText: DAY_EMPTY_TEXT })
    // 신호·노출 수를 못 읽은 것은 항목 목록과 상관없다
    expect(dayItemsSection(0, { signals: '실패', metrics: '실패' }).emptyText).toBe(DAY_EMPTY_TEXT)
  })

  it('항목이 0개이고 카드·미션·묶음 중 하나라도 못 읽었으면 「없어요」 단정 없이 안내만 보인다(개수도 말하지 않는다)', () => {
    for (const source of ['cards', 'missions', 'bundles'] as const) {
      const section = dayItemsSection(0, { [source]: '실패' })
      expect(section, source).toEqual({ title: '항목', notice: DAY_ITEMS_PARTIAL_TEXT, emptyText: null })
      expect(JSON.stringify(section)).not.toContain('올라온 항목이 없어요')
      expect(JSON.stringify(section)).not.toContain('0개')
    }
  })
})

describe('legacyEntryOf — 옛 카드·미션 요약', () => {
  it('옛 카드는 칸 항목에서 제목·유형·노출 줄·비활성·경로를 찾는다', () => {
    const entry = legacyEntryOf(week([item({ dim: true })]), `card:${ID}`)
    expect(entry).toEqual({
      origin: 'card',
      id: ID,
      title: '옛 카드 제목',
      time: 'T03',
      note: '노출 3 · 열람 1',
      inactive: true,
      href: `/admin/today/${ID}?date=2026-10-06`,
    })
  })

  it('키의 대소문자는 가리지 않는다', () => {
    expect(legacyEntryOf(week([item()]), `card:${ID.toUpperCase()}`)?.title).toBe('옛 카드 제목')
  })

  it('상시 미션 시작 항목은 미션이고 유형 칸이 없다', () => {
    const start = item({ id: `mission-${ID}`, origin: 'mission', drawerKey: `mission:${ID}`, kind: 'mission', title: '상시 미션', time: '상시', href: `/admin/missions/${ID}`, note: null })
    expect(legacyEntryOf(week([start]), `mission:${ID}`)).toMatchObject({ origin: 'mission', title: '상시 미션', time: null, href: `/admin/missions/${ID}` })
  })

  it('옛 미션 막대에서도 찾는다', () => {
    const bar: ScheduleMissionBar = {
      id: `mission-${ID}`,
      title: '기간 미션',
      startCol: 0,
      endCol: 2,
      startsThisWeek: true,
      endsThisWeek: false,
      isGate: false,
      status: null,
      isSample: false,
      drawerKey: `mission:${ID}`,
      href: null,
    }
    expect(legacyEntryOf(week([], [bar]), `mission:${ID}`)).toMatchObject({ title: '기간 미션', href: `/admin/missions/${ID}` })
  })

  it('경로가 없는 항목은 키로 만든 경로를 쓴다', () => {
    expect(legacyEntryOf(week([item({ href: null })]), `card:${ID}`)?.href).toBe(`/admin/today/${ID}`)
    expect(legacyHref('mission', ID)).toBe(`/admin/missions/${ID}`)
  })

  it('운영 항목 키이거나 이 주에서 못 찾으면 null이다', () => {
    expect(legacyEntryOf(week([item()]), ID)).toBeNull()
    expect(legacyEntryOf(week([item()]), 'card:3f2a9c1e-0000-4000-8000-0000000000ff')).toBeNull()
    // 카드 키로 미션 막대를 찾지 않는다
    expect(legacyEntryOf(week([]), `card:${ID}`)).toBeNull()
  })

  it('같은 키가 여러 날 칸에 있으면 처음 만나는 칸의 값이다', () => {
    const first = item({ title: '첫날' })
    const second = item({ id: `card-${ID}-2026-10-07`, title: '이튿날' })
    const w = week([first])
    w.days[2].items = [second]
    expect(legacyEntryOf(w, `card:${ID}`)?.title).toBe('첫날')
  })
})

describe('splitItemKey', () => {
  it('접두사로 출처를 나눈다', () => {
    expect(splitItemKey(ID)).toEqual({ origin: 'ops', id: ID })
    expect(splitItemKey(`card:${ID}`)).toEqual({ origin: 'card', id: ID })
    expect(splitItemKey(`mission:${ID}`)).toEqual({ origin: 'mission', id: ID })
  })
})

describe('statusByDrawerKey — 잔상 비교용', () => {
  it('상태가 있는 칸 항목·미션 막대만 서랍 키로 모은다(옛 카드·미션은 상태가 없어 빠진다)', () => {
    const ops = item({ id: 'ops-1', origin: 'ops', drawerKey: 'ops-1', status: 'scheduled' })
    const bar: ScheduleMissionBar = {
      id: 'ops-bar',
      title: '운영 미션',
      startCol: 0,
      endCol: 1,
      startsThisWeek: true,
      endsThisWeek: true,
      isGate: false,
      status: 'live',
      isSample: false,
      drawerKey: 'ops-bar',
      href: null,
    }
    const legacyBar: ScheduleMissionBar = { ...bar, id: 'legacy-bar', status: null, drawerKey: `mission:${ID}` }
    expect(statusByDrawerKey(week([ops, item()], [bar, legacyBar]))).toEqual({ 'ops-1': 'scheduled', 'ops-bar': 'live' })
  })

  it('같은 항목이 여러 날 칸에 있어도 키 하나다', () => {
    const w = week([item({ origin: 'ops', drawerKey: 'ops-2', status: 'live' })])
    w.days[2].items = [item({ id: 'ops-2-2026-10-07', origin: 'ops', drawerKey: 'ops-2', status: 'live' })]
    expect(statusByDrawerKey(w)).toEqual({ 'ops-2': 'live' })
  })

  it('항목이 없으면 빈 객체다', () => {
    expect(statusByDrawerKey(week())).toEqual({})
  })
})
