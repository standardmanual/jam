/**
 * 일정표 거르기 판정 (티켓 20261006_1539 ③-d)
 *
 * 지키는 것: 종류·트라이브·패턴 판정(같은 종류끼리 OR, 종류가 다르면 AND), 트라이브·패턴 거르기에서는 옛 카드·미션이 빠짐,
 * 거르기가 켜지면 자동 실행을 숨김, 장기 카드 줄은 「홈피드 카드」 종류 거르기일 때만 남음, 신호는 그날 전체 기준 그대로,
 * 월간·타임라인·주간의 개수(`contentCount`) 다시 계산, 주소 만들기(`filterQuery`)가 다른 키를 그대로 둠, 거르기가 꺼지면 같은 객체를 돌려줌.
 */
import { describe, expect, it } from 'vitest'
import {
  filterQuery,
  filtersExcludeLegacy,
  filterScheduleDays,
  filterScheduleMonth,
  filterScheduleTimeline,
  filterScheduleWeek,
  hasScheduleFilters,
  type ScheduleFilters,
} from '@/lib/admin/opsSchedule/filters'
import type { ScheduleTimeline, TimelineBar } from '@/lib/admin/opsSchedule/timeline'
import type { ScheduleDay, ScheduleItem, ScheduleMissionBar, ScheduleWeek } from '@/lib/admin/opsSchedule/weekView'

const NONE: ScheduleFilters = { kinds: [], tribes: [], patterns: [] }
const TRIBE_A = '3f2a9c1e-0000-4000-8000-00000000000a'
const TRIBE_B = '3f2a9c1e-0000-4000-8000-00000000000b'

function item(id: string, over: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id,
    origin: 'ops',
    drawerKey: id,
    kind: 'home_feed_card',
    title: `항목 ${id}`,
    time: '09:00',
    status: 'reviewing',
    isSample: false,
    dim: false,
    href: null,
    note: null,
    tribeId: null,
    patternNo: null,
    ...over,
  }
}

const SIGNALS = { topLevel: 'warn', count: 2, checked: true } as unknown as NonNullable<ScheduleDay['signals']>

function day(date: string, items: ScheduleItem[], over: Partial<ScheduleDay> = {}): ScheduleDay {
  return {
    date,
    weekdayLabel: '화',
    dateLabel: '10월 6일',
    isToday: false,
    items,
    longActiveCount: 2,
    longInactiveCount: 1,
    automation: [{ id: 'cron-1', time: '09:00', label: 'POI 정리', routine: false, dim: false }],
    signals: SIGNALS,
    representative: null,
    ...over,
  }
}

const OPS_CARD_A = item('card-a', { tribeId: TRIBE_A, patternNo: 'P01' })
const OPS_CARD_B = item('card-b', { tribeId: TRIBE_B, patternNo: 'P02' })
const OPS_MISSION = item('mission-ops', { kind: 'mission', tribeId: TRIBE_A, patternNo: 'P01' })
const OPS_DROP = item('drop-ops', { kind: 'drop_schedule' })
const LEGACY_CARD = item('legacy-card', { origin: 'card', status: null })
const LEGACY_MISSION = item('legacy-mission', { origin: 'mission', kind: 'mission', status: null })

const ALL_ITEMS = [OPS_CARD_A, OPS_CARD_B, OPS_MISSION, OPS_DROP, LEGACY_CARD, LEGACY_MISSION]
const ids = (days: ScheduleDay[]) => days.flatMap((entry) => entry.items.map((entry2) => entry2.id))

function filtered(filters: Partial<ScheduleFilters>): string[] {
  return ids(filterScheduleDays([day('2026-10-06', ALL_ITEMS)], { ...NONE, ...filters }))
}

describe('판정 — 종류·트라이브·패턴', () => {
  it('거르기가 꺼져 있으면 모든 항목이 남는다', () => {
    expect(filtered({})).toEqual(ALL_ITEMS.map((entry) => entry.id))
    expect(hasScheduleFilters(NONE)).toBe(false)
  })

  it('종류: 고른 종류만 남는다(옛 카드는 홈피드 카드, 옛 미션은 미션이다). 여러 개면 하나라도 맞으면 남는다', () => {
    expect(filtered({ kinds: ['mission'] })).toEqual(['mission-ops', 'legacy-mission'])
    expect(filtered({ kinds: ['home_feed_card'] })).toEqual(['card-a', 'card-b', 'legacy-card'])
    expect(filtered({ kinds: ['mission', 'drop_schedule'] })).toEqual(['mission-ops', 'drop-ops', 'legacy-mission'])
  })

  it('트라이브: 그 트라이브의 운영 항목만 남고 옛 카드·미션과 트라이브가 없는 운영 항목은 빠진다', () => {
    expect(filtered({ tribes: [TRIBE_A] })).toEqual(['card-a', 'mission-ops'])
    expect(filtered({ tribes: [TRIBE_A, TRIBE_B] })).toEqual(['card-a', 'card-b', 'mission-ops'])
  })

  it('패턴: 그 패턴의 운영 항목만 남는다(번호는 대문자로 맞춘다)', () => {
    expect(filtered({ patterns: ['P02'] })).toEqual(['card-b'])
    expect(filtered({ patterns: ['P01', 'P02'] })).toEqual(['card-a', 'card-b', 'mission-ops'])
  })

  it('종류가 다른 거르기끼리는 모두 맞아야 남는다', () => {
    expect(filtered({ kinds: ['mission'], tribes: [TRIBE_A] })).toEqual(['mission-ops'])
    expect(filtered({ kinds: ['home_feed_card'], tribes: [TRIBE_A], patterns: ['P02'] })).toEqual([])
  })

  it('트라이브·패턴 거르기만 옛 카드·미션을 빼서 안내 문장을 띄운다', () => {
    expect(filtersExcludeLegacy({ ...NONE, kinds: ['mission'] })).toBe(false)
    expect(filtersExcludeLegacy({ ...NONE, tribes: [TRIBE_A] })).toBe(true)
    expect(filtersExcludeLegacy({ ...NONE, patterns: ['P01'] })).toBe(true)
  })
})

describe('칸 — 자동 실행·장기 카드·신호', () => {
  it('거르기가 하나라도 켜지면 자동 실행 줄이 숨는다', () => {
    const [out] = filterScheduleDays([day('2026-10-06', ALL_ITEMS)], { ...NONE, kinds: ['mission'] })
    expect(out.automation).toEqual([])
    const [off] = filterScheduleDays([day('2026-10-06', ALL_ITEMS)], NONE)
    expect(off.automation).toHaveLength(1)
  })

  it('장기 카드 줄은 종류 거르기에 「홈피드 카드」가 있을 때만 남고 트라이브·패턴 거르기면 숨는다', () => {
    const base = day('2026-10-06', ALL_ITEMS)
    const counts = (filters: Partial<ScheduleFilters>) => {
      const [out] = filterScheduleDays([base], { ...NONE, ...filters })
      return [out.longActiveCount, out.longInactiveCount]
    }
    expect(counts({ kinds: ['home_feed_card'] })).toEqual([2, 1])
    expect(counts({ kinds: ['home_feed_card', 'mission'] })).toEqual([2, 1])
    expect(counts({ kinds: ['mission'] })).toEqual([0, 0])
    expect(counts({ tribes: [TRIBE_A] })).toEqual([0, 0])
    expect(counts({ kinds: ['home_feed_card'], patterns: ['P01'] })).toEqual([0, 0])
  })

  it('신호 칩은 거르기와 무관하게 그날 전체 기준 그대로다', () => {
    const [out] = filterScheduleDays([day('2026-10-06', ALL_ITEMS)], { ...NONE, kinds: ['recipe'] })
    expect(out.items).toEqual([])
    expect(out.signals).toBe(SIGNALS)
  })
})

describe('보기별 — contentCount 다시 계산', () => {
  const bar = (id: string, over: Partial<ScheduleMissionBar> = {}): ScheduleMissionBar => ({
    id,
    title: id,
    startCol: 0,
    endCol: 2,
    startsThisWeek: true,
    endsThisWeek: true,
    isGate: false,
    status: 'live',
    isSample: false,
    drawerKey: id,
    href: null,
    tribeId: null,
    patternNo: null,
    ...over,
  })
  const week = (): ScheduleWeek => ({
    weekStart: '2026-10-05',
    weekEnd: '2026-10-11',
    days: [day('2026-10-06', ALL_ITEMS)],
    missionBars: [bar('ops-bar', { tribeId: TRIBE_A }), bar('legacy-bar', { status: null })],
    openEndedMissionCount: 3,
    contentCount: 99,
  })

  it('주간: 미션 막대도 거른다(옛 미션 막대는 트라이브·패턴이면 빠진다) — 개수는 칸 항목 + 장기 카드 + 막대다', () => {
    const out = filterScheduleWeek(week(), { ...NONE, kinds: ['mission'] })
    expect(out.missionBars.map((entry) => entry.id)).toEqual(['ops-bar', 'legacy-bar'])
    expect(out.contentCount).toBe(2 + 0 + 0 + 2)
    const byTribe = filterScheduleWeek(week(), { ...NONE, tribes: [TRIBE_A] })
    expect(byTribe.missionBars.map((entry) => entry.id)).toEqual(['ops-bar'])
    expect(byTribe.contentCount).toBe(2 + 1)
  })

  it('주간: 맞는 항목이 하나도 없으면 contentCount가 0이다(빈 상태를 보일 수 있다)', () => {
    const out = filterScheduleWeek(week(), { ...NONE, kinds: ['recipe'] })
    expect(out.contentCount).toBe(0)
    expect(out.openEndedMissionCount).toBe(3)
  })

  it('거르기가 꺼져 있으면 같은 객체를 돌려준다', () => {
    const w = week()
    expect(filterScheduleWeek(w, NONE)).toBe(w)
  })

  it('월간: 칸마다 거르고 개수를 다시 센다(앞뒤 달 칸도 같다)', () => {
    const month = { days: [day('2026-09-29', ALL_ITEMS), day('2026-10-01', ALL_ITEMS)], contentCount: 99, month: '2026-10' }
    const out = filterScheduleMonth(month, { ...NONE, tribes: [TRIBE_B] })
    expect(ids(out.days)).toEqual(['card-b', 'card-b'])
    expect(out.contentCount).toBe(2)
    expect(out.month).toBe('2026-10')
  })

  describe('타임라인', () => {
    const tbar = (id: string, rowKey: TimelineBar['rowKey'], over: Partial<TimelineBar> = {}): TimelineBar => ({
      id,
      rowKey,
      origin: 'ops',
      drawerKey: id,
      href: null,
      title: id,
      status: 'live',
      isSample: false,
      dim: false,
      startDate: '2026-10-06',
      endDate: '2026-10-08',
      startCol: 2,
      endCol: 4,
      clippedStart: false,
      clippedEnd: false,
      dashed: false,
      prep: null,
      lane: 0,
      ariaLabel: id,
      tribeId: null,
      patternNo: null,
      ...over,
    })
    const timeline = (): ScheduleTimeline => ({
      start: '2026-10-05',
      end: '2026-11-15',
      columnCount: 42,
      ticks: [],
      todayCol: 3,
      signalCells: [{ date: '2026-10-07', col: 3, level: 'warn', count: 2, ariaLabel: '신호' }],
      signalNotice: null,
      rows: [
        {
          key: 'mission',
          label: '미션',
          bars: [tbar('m-a', 'mission', { tribeId: TRIBE_A, lane: 0 }), tbar('m-b', 'mission', { tribeId: TRIBE_B, lane: 1 }), tbar('m-legacy', 'mission', { origin: 'legacy', drawerKey: null })],
          laneCount: 3,
        },
        { key: 'drop_schedule', label: '드랍 일정', bars: [tbar('d-1', 'drop_schedule')], laneCount: 1 },
        { key: 'collection_launch', label: '컬렉션 런칭', bars: [], laneCount: 0 },
      ],
      days: [day('2026-10-06', ALL_ITEMS)],
      leadDays: 28,
      contentCount: 99,
    })

    it('종류 거르기는 줄 단위로 거른다(옛 자원 막대도 같은 줄이면 남는다)', () => {
      const out = filterScheduleTimeline(timeline(), { ...NONE, kinds: ['mission'] })
      expect(out.rows.map((row) => row.bars.map((entry) => entry.id))).toEqual([['m-a', 'm-b', 'm-legacy'], [], []])
      expect(out.rows[1].laneCount).toBe(0)
    })

    it('트라이브 거르기는 그 트라이브의 운영 항목 막대만 남기고 레인을 다시 배정한다', () => {
      const out = filterScheduleTimeline(timeline(), { ...NONE, tribes: [TRIBE_B] })
      expect(out.rows[0].bars.map((entry) => entry.id)).toEqual(['m-b'])
      expect(out.rows[0].bars[0].lane).toBe(0)
      expect(out.rows[0].laneCount).toBe(1)
      expect(out.rows[1].bars).toEqual([])
    })

    it('신호 칩은 그대로이고 개수는 막대 + 칸 항목으로 다시 센다', () => {
      const source = timeline()
      const out = filterScheduleTimeline(source, { ...NONE, tribes: [TRIBE_B] })
      expect(out.signalCells).toBe(source.signalCells)
      expect(out.contentCount).toBe(1 + 1)
    })

    it('원본 막대를 바꾸지 않는다', () => {
      const source = timeline()
      filterScheduleTimeline(source, { ...NONE, tribes: [TRIBE_B] })
      expect(source.rows[0].bars[1].lane).toBe(1)
    })
  })
})

describe('filterQuery — 주소 만들기', () => {
  it('거르기 키만 새로 쓰고 다른 키(view·date·sample·서랍)는 그대로 둔다', () => {
    const query = filterQuery('?view=month&date=2026-10-07&kind=mission&drawer=day&sample=1', { kinds: ['recipe', 'mission'], tribes: ['runner'], patterns: ['P02'] })
    expect(query).toBe('view=month&date=2026-10-07&drawer=day&sample=1&kind=recipe&kind=mission&tribe=runner&pattern=P02')
  })

  it('모두 비우면 거르기 키가 사라진다', () => {
    expect(filterQuery('view=week&kind=mission&tribe=a&pattern=P01', NONE)).toBe('view=week')
    expect(filterQuery('', NONE)).toBe('')
  })
})
