/**
 * 일정표 주소 읽기·기간 계산 (티켓 20261006_1536 ③-a)
 *
 * 지키는 것: 기본값(주간·오늘), 틀린 값 처리, 옛 `?week=`는 `date`가 없을 때만, 거르기 여러 개·검증·중복 제거, 서랍 키 검증,
 * 서버 쿼리 객체와 URLSearchParams 둘 다 읽기, 보기별 기간(주간 월~일·월간 월요일 시작 달력·타임라인 4주 격자 6주 창)과 이동 간격.
 */
import { describe, expect, it } from 'vitest'
import {
  TIMELINE_STEP_DAYS,
  TIMELINE_WINDOW_DAYS,
  formatPeriodLabel,
  parseScheduleParams,
  periodOf,
  shiftPeriod,
} from '@/lib/admin/opsSchedule/params'
import { scheduleHref } from '@/lib/admin/opsHome/links'

// 2026-10-07은 수요일이다(그 주 월요일은 10-05).
const NOW = new Date('2026-10-07T03:00:00.000Z')
const ITEM_ID = '3f2b8c1e-0000-4000-8000-000000000001'

describe('parseScheduleParams — 기본값', () => {
  it('쿼리가 없으면 주간 보기·오늘(KST)이고 거르기·서랍은 비어 있다', () => {
    expect(parseScheduleParams({}, NOW)).toEqual({
      view: 'week',
      date: '2026-10-07',
      kinds: [],
      tribes: [],
      patterns: [],
      drawer: null,
      item: null,
      drawerDate: null,
      includeSample: false,
    })
    expect(parseScheduleParams(null, NOW).date).toBe('2026-10-07')
    expect(parseScheduleParams(undefined, NOW).view).toBe('week')
  })

  it('오늘은 KST 기준이다(UTC로는 아직 전날이어도 KST 날짜를 쓴다)', () => {
    expect(parseScheduleParams({}, new Date('2026-10-06T16:00:00.000Z')).date).toBe('2026-10-07')
  })

  it('틀린 view·date는 기본값으로 떨어진다', () => {
    expect(parseScheduleParams({ view: 'year', date: '2026-02-30' }, NOW)).toMatchObject({ view: 'week', date: '2026-10-07' })
    expect(parseScheduleParams({ view: '', date: 'abc' }, NOW)).toMatchObject({ view: 'week', date: '2026-10-07' })
  })

  it('view·date를 읽는다(서버 쿼리 객체)', () => {
    expect(parseScheduleParams({ view: 'month', date: '2026-11-03' }, NOW)).toMatchObject({ view: 'month', date: '2026-11-03' })
    expect(parseScheduleParams({ view: 'timeline' }, NOW).view).toBe('timeline')
  })

  it('같은 키가 두 번 오면 값 없음으로 본다(view·date)', () => {
    expect(parseScheduleParams({ view: ['month', 'timeline'], date: ['2026-11-03', '2026-11-04'] }, NOW)).toMatchObject({
      view: 'week',
      date: '2026-10-07',
    })
  })
})

describe('parseScheduleParams — 옛 ?week=', () => {
  it('date가 없으면 week를 읽어 그 주 월요일로 맞춘다', () => {
    expect(parseScheduleParams({ week: '2026-09-21' }, NOW).date).toBe('2026-09-21')
    expect(parseScheduleParams({ week: '2026-09-24' }, NOW).date).toBe('2026-09-21')
  })

  it('date가 올바르면 week는 읽지 않는다', () => {
    expect(parseScheduleParams({ week: '2026-09-21', date: '2026-10-14' }, NOW).date).toBe('2026-10-14')
  })

  it('date가 틀렸으면 week로 떨어지고, week도 틀리면 오늘이다', () => {
    expect(parseScheduleParams({ week: '2026-09-21', date: 'abc' }, NOW).date).toBe('2026-09-21')
    expect(parseScheduleParams({ week: '2026-W41' }, NOW).date).toBe('2026-10-07')
  })
})

describe('parseScheduleParams — 거르기', () => {
  it('종류·트라이브·패턴을 여러 개 읽는다(배열·URLSearchParams)', () => {
    const fromObject = parseScheduleParams({ kind: ['mission', 'home_feed_card'], tribe: ['runner', 'walker'], pattern: ['P01', 'P12'] }, NOW)
    expect(fromObject).toMatchObject({ kinds: ['mission', 'home_feed_card'], tribes: ['runner', 'walker'], patterns: ['P01', 'P12'] })
    const fromUrl = parseScheduleParams(new URLSearchParams('kind=mission&kind=recipe&tribe=Runner&pattern=p03&sample=1'), NOW)
    expect(fromUrl).toMatchObject({ kinds: ['mission', 'recipe'], tribes: ['runner'], patterns: ['P03'], includeSample: true })
  })

  it('한 값만 와도 목록이다', () => {
    expect(parseScheduleParams({ kind: 'mission' }, NOW).kinds).toEqual(['mission'])
  })

  it('허용 밖 값과 빈 값은 버리고 같은 값은 한 번만 둔다', () => {
    const parsed = parseScheduleParams(
      { kind: ['mission', 'mission', 'unknown', ''], tribe: ['runner', 'RUNNER', '!!', ' '], pattern: ['P01', 'T01', 'P01', 'P1'] },
      NOW
    )
    expect(parsed.kinds).toEqual(['mission'])
    expect(parsed.tribes).toEqual(['runner'])
    expect(parsed.patterns).toEqual(['P01'])
  })
})

describe('parseScheduleParams — 서랍·시험', () => {
  it('항목 서랍은 항목 키가 올바를 때만 열린다(운영 항목·옛 카드·옛 미션)', () => {
    expect(parseScheduleParams({ drawer: 'item', item: ITEM_ID }, NOW)).toMatchObject({ drawer: 'item', item: ITEM_ID })
    expect(parseScheduleParams({ drawer: 'item', item: `card:${ITEM_ID}` }, NOW)).toMatchObject({ drawer: 'item', item: `card:${ITEM_ID}` })
    expect(parseScheduleParams({ drawer: 'item', item: `mission:${ITEM_ID}` }, NOW).item).toBe(`mission:${ITEM_ID}`)
    expect(parseScheduleParams({ drawer: 'item', item: 'abc' }, NOW)).toMatchObject({ drawer: null, item: null })
    expect(parseScheduleParams({ drawer: 'item' }, NOW)).toMatchObject({ drawer: null, item: null })
    expect(parseScheduleParams({ drawer: 'item', item: `bundle:${ITEM_ID}` }, NOW).drawer).toBeNull()
  })

  it('날짜 서랍은 date만 있으면 열리고 item은 비운다', () => {
    expect(parseScheduleParams({ drawer: 'day', date: '2026-10-08', item: ITEM_ID }, NOW)).toMatchObject({
      drawer: 'day',
      date: '2026-10-08',
      item: null,
    })
  })

  it('모르는 drawer 값은 닫힌 것이다(S3의 drawer=empty와 겹치지 않는다)', () => {
    expect(parseScheduleParams({ drawer: 'empty' }, NOW).drawer).toBeNull()
  })

  it('sample=1일 때만 시험 묶음을 포함한다', () => {
    expect(parseScheduleParams({ sample: '1' }, NOW).includeSample).toBe(true)
    expect(parseScheduleParams({ sample: '0' }, NOW).includeSample).toBe(false)
  })

  it('scheduleHref가 만든 주소를 그대로 다시 읽는다', () => {
    const href = scheduleHref(
      { view: 'month', date: '2026-10-14', kinds: ['mission'], tribes: ['runner'], patterns: ['P02'], drawer: 'item', item: `card:${ITEM_ID}` },
      { includeSample: true }
    )
    const parsed = parseScheduleParams(new URLSearchParams(href.split('?')[1]), NOW)
    expect(parsed).toEqual({
      view: 'month',
      date: '2026-10-14',
      kinds: ['mission'],
      tribes: ['runner'],
      patterns: ['P02'],
      drawer: 'item',
      item: `card:${ITEM_ID}`,
      drawerDate: null,
      includeSample: true,
    })
  })
})

describe('periodOf', () => {
  it('주간은 그 날짜가 속한 월~일이다', () => {
    expect(periodOf('week', '2026-10-07')).toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(periodOf('week', '2026-10-05')).toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(periodOf('week', '2026-10-11')).toEqual({ start: '2026-10-05', end: '2026-10-11' })
  })

  it('월간은 월요일 시작 달력 전체다(앞뒤 달 날짜 포함)', () => {
    // 2026-10-01은 목요일, 10-31은 토요일
    expect(periodOf('month', '2026-10-15')).toEqual({ start: '2026-09-28', end: '2026-11-01' })
    // 2026-02-01은 일요일, 02-28은 토요일
    expect(periodOf('month', '2026-02-10')).toEqual({ start: '2026-01-26', end: '2026-03-01' })
  })

  it('월간 기간은 항상 7의 배수 일수다', () => {
    for (const date of ['2026-01-15', '2026-02-15', '2026-03-15', '2026-10-15', '2026-12-31']) {
      const { start, end } = periodOf('month', date)
      const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1
      expect(days % 7).toBe(0)
    }
  })

  it('타임라인은 6주 창이고 월요일에서 시작한다', () => {
    const { start, end } = periodOf('timeline', '2026-10-07')
    expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(1)
    expect((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1).toBe(TIMELINE_WINDOW_DAYS)
    expect(start <= '2026-10-07' && '2026-10-07' <= end).toBe(true)
  })

  it('타임라인 창은 4주 격자에 고정되어 같은 칸 안의 날짜를 눌러도 창이 흔들리지 않는다', () => {
    const base = periodOf('timeline', '2026-10-07')
    const sameCell = ['2026-10-05', '2026-10-11', '2026-10-12', '2026-10-25'].filter((date) => periodOf('timeline', date).start === base.start)
    expect(sameCell.length).toBeGreaterThan(1)
    // 창 시작은 격자 칸마다 정확히 4주씩 움직인다
    const next = periodOf('timeline', shiftPeriod('timeline', '2026-10-07', 1))
    const previous = periodOf('timeline', shiftPeriod('timeline', '2026-10-07', -1))
    expect((Date.parse(`${next.start}T00:00:00Z`) - Date.parse(`${base.start}T00:00:00Z`)) / 86_400_000).toBe(TIMELINE_STEP_DAYS)
    expect((Date.parse(`${base.start}T00:00:00Z`) - Date.parse(`${previous.start}T00:00:00Z`)) / 86_400_000).toBe(TIMELINE_STEP_DAYS)
  })

  it('격자 기준(2024-01-01) 이전 날짜도 같은 규칙이다', () => {
    const { start } = periodOf('timeline', '2023-12-25')
    expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(1)
    expect(start <= '2023-12-25').toBe(true)
  })
})

describe('shiftPeriod', () => {
  it('주간은 7일씩, 타임라인은 4주씩 움직인다', () => {
    expect(shiftPeriod('week', '2026-10-07', 1)).toBe('2026-10-14')
    expect(shiftPeriod('week', '2026-10-07', -1)).toBe('2026-09-30')
    expect(shiftPeriod('timeline', '2026-10-07', 1)).toBe('2026-11-04')
    expect(shiftPeriod('timeline', '2026-10-07', -1)).toBe('2026-09-09')
  })

  it('월간은 한 달씩 움직이고 말일이 없는 달은 그 달의 말일로 맞춘다', () => {
    expect(shiftPeriod('month', '2026-10-15', 1)).toBe('2026-11-15')
    expect(shiftPeriod('month', '2026-10-31', 1)).toBe('2026-11-30')
    expect(shiftPeriod('month', '2026-03-31', -1)).toBe('2026-02-28')
    expect(shiftPeriod('month', '2026-12-10', 1)).toBe('2027-01-10')
    expect(shiftPeriod('month', '2026-01-10', -1)).toBe('2025-12-10')
  })
})

describe('formatPeriodLabel', () => {
  it('주간·타임라인은 기간 범위, 월간은 년월이다', () => {
    expect(formatPeriodLabel('week', '2026-10-07')).toBe('2026년 10월 5일 ~ 10월 11일')
    expect(formatPeriodLabel('month', '2026-10-07')).toBe('2026년 10월')
    expect(formatPeriodLabel('week', '2026-12-30')).toBe('2026년 12월 28일 ~ 2027년 1월 3일')
  })
})
