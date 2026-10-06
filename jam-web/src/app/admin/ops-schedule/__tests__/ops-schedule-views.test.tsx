/**
 * 일정표 월간·타임라인 화면 (티켓 20261006_1538 ③-c, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 월간·타임라인)
 *
 * 저장소에 jsdom·testing-library가 없어(`ops-schedule.test.tsx`와 같은 방식) 서버 본문(`ScheduleBody`)과 보기 래퍼(`OpsScheduleBoard`)를 `renderToStaticMarkup`으로 그려 모양을 고정한다.
 * DB 읽기(`loadScheduleMonth`·`loadScheduleTimeline`)는 가짜로 바꾼다(실 DB에 닿지 않는다). 클릭·포커스 실행과 가로 스크롤 동작은 브라우저 동작이라 카리나가 실렌더로 본다.
 *
 * 지키는 것:
 * - 월간: 월요일 시작 달력 35칸, 칸 머리(날짜·오늘·신호 칩+건수)가 날짜 서랍 버튼, 항목 한 줄 3개 + 「+N개 더」, 좁은 달력(40rem 미만)은 항목 수와 최고 신호만,
 *   상태는 아이콘 + sr-only 글자, 보이는 달 밖 날짜는 흐리게
 * - 타임라인: 상자 안에서만 가로 스크롤(`tabIndex=0`·`aria-label`), 줄 목록 `role="list"`, 신호·미션·드랍 일정·컬렉션 런칭 줄, 막대마다 종류·기간·상태 `aria-label`,
 *   운영 항목은 항목 서랍 버튼·실제 자원은 링크, 컬렉션 준비 구간 점선과 노출 실선, 실패는 destructive 테두리, 오늘 세로선 + 「오늘」, 열 42개
 * - 오류: 일부만 못 읽으면 달력·줄은 그대로 + 「…를 읽지 못해 빠져 있어요」, 모두 못 읽으면 안내 카드 하나, 막대 없는 줄은 못 읽은 재료를 「없다」고 하지 않는다
 * - 기간이 비면 「이 기간에는 올라온 항목이 없어요」 + [오늘로 이동](오늘이 그 기간에 있으면 버튼 없음), 못 읽은 재료가 있으면 비었다고 단정하지 않는다
 * - 서랍: 월간·타임라인에서도 달력의 형제로 열리고 달력이 DOM에 남는다(딤·fixed 없음)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const hoisted = vi.hoisted(() => ({
  search: '',
  month: { value: null as unknown, error: null as Error | null, calls: [] as Array<Record<string, unknown>> },
  timeline: { value: null as unknown, error: null as Error | null, calls: [] as Array<Record<string, unknown>> },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-schedule',
  useSearchParams: () => new URLSearchParams(hoisted.search),
}))

vi.mock('@/lib/admin/opsSchedule/load', () => ({
  loadScheduleWeek: vi.fn(async () => {
    throw new Error('이 시험은 주간 본문을 읽지 않아요')
  }),
  loadScheduleMonth: vi.fn(async (options: Record<string, unknown>) => {
    hoisted.month.calls.push(options)
    if (hoisted.month.error) throw hoisted.month.error
    return hoisted.month.value
  }),
}))

vi.mock('@/lib/admin/opsSchedule/timelineLoad', () => ({
  loadScheduleTimeline: vi.fn(async (options: Record<string, unknown>) => {
    hoisted.timeline.calls.push(options)
    if (hoisted.timeline.error) throw hoisted.timeline.error
    return hoisted.timeline.value
  }),
}))

import { ScheduleBody, SCHEDULE_SOURCE_NOTICES } from '../ScheduleBody'
import { OpsScheduleBoard } from '../OpsScheduleBoard'
import { buildSchedulePeriod, buildScheduleMonth } from '@/lib/admin/opsSchedule/monthView'
import { parseScheduleParams, periodOf } from '@/lib/admin/opsSchedule/params'
import { signalsByDate } from '@/lib/admin/opsSchedule/signalDays'
import { buildTimeline, type BuildTimelineInput, type ScheduleTimeline } from '@/lib/admin/opsSchedule/timeline'
import type { ScheduleSourceErrors } from '@/lib/admin/opsSchedule/load'
import { buildDayCompositions, type SignalBundleInput } from '@/lib/admin/opsSignals/composition'
import { makeSignalResult, type OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import { dayEnd, dayStart, kst, makeBundle, makeItem } from '@/lib/admin/opsSignals/__tests__/fixtures'
import type { WeeklyMissionInput } from '@/lib/admin/weeklyMissions'

const TODAY = '2026-10-07'
const NOW = new Date('2026-10-07T03:00:00.000Z') // KST 2026-10-07(수) 12:00
const MONTH = periodOf('month', TODAY) // 9/28(월) ~ 11/1(일)
const WINDOW = periodOf('timeline', TODAY) // 10/5(월) ~ 11/15(일)

function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  for (let date = from; date <= to; date = shiftDateStr(date, 1)) dates.push(date)
  return dates
}

const cardItem = (id: string, title: string, date: string) =>
  makeItem({ id, kind: 'home_feed_card', status: 'scheduled', startsAt: dayStart(date), endsAt: dayEnd(date), original: { shape: 'hero', exposure_tags: ['all'], copy: { title } } })

const opsItem = (kind: 'mission' | 'drop_schedule' | 'collection_launch', id: string, title: string, startsAt: string, endsAt: string | null, status = 'scheduled') =>
  makeItem({ id, kind, status, startsAt, endsAt, original: { copy: { title } } })

const signal = (date: string, level: 'stop' | 'warn' | 'info', key: OpsSignalOutcome['key']): OpsSignalOutcome => ({
  key,
  name: '신호',
  level,
  state: 'raised',
  uncheckedReason: null,
  results: [makeSignalResult('문장', { date })],
})

function missionRow(id: string, startsAt: string, endsAt: string | null): WeeklyMissionInput {
  return { id, title: `옛 미션 ${id}`, starts_at: startsAt, ends_at: endsAt, gate_axis: null } as WeeklyMissionInput
}

/** 마커(속성 글자)가 들어 있는 요소 하나의 여는 태그부터 닫는 태그 앞까지. 이웃 요소로 새지 않는다. */
function elementAt(out: string, marker: string, tag = 'button'): string {
  const at = out.indexOf(marker)
  expect(at, marker).toBeGreaterThan(-1)
  return out.slice(out.lastIndexOf(`<${tag}`, at), out.indexOf(`</${tag}>`, at))
}

// ── 월간 ─────────────────────────────────────────────────────────────────────────────────────────

/** 10/6 칸에 카드 5개, 10/8 칸에 미션 1개, 10/7(오늘)에 신호 2건(중단 최고)이 있는 달. */
function makeMonth(over: { bundles?: SignalBundleInput[]; cards?: null } = {}) {
  const bundles = over.bundles ?? [
    makeBundle([
      ...['a', 'b', 'c', 'd', 'e'].map((id) => cardItem(`card-${id}`, `카드 ${id.toUpperCase()}`, '2026-10-06')),
      opsItem('mission', 'mission-1', '가을 미션', kst('2026-10-08', '09:00'), kst('2026-10-20', '09:00')),
    ]),
  ]
  const dates = dateRange(MONTH.start, MONTH.end)
  return buildScheduleMonth({
    date: TODAY,
    today: TODAY,
    includeSample: false,
    compositions: buildDayCompositions({ cards: [], missions: [], bundles }, dates),
    bundles,
    cards: over.cards === null ? null : [],
    missions: [],
    signals: signalsByDate(
      [signal(TODAY, 'warn', 'format_error'), signal(TODAY, 'stop', 'execution_failed')],
      [TODAY, '2026-10-08'],
      dates
    ),
  })
}

async function renderMonthBody(over: { month?: ReturnType<typeof makeMonth>; sourceErrors?: ScheduleSourceErrors; query?: Record<string, string> } = {}): Promise<string> {
  hoisted.month.value = { month: over.month ?? makeMonth(), sourceErrors: over.sourceErrors ?? {} }
  return renderToStaticMarkup(await ScheduleBody({ params: parseScheduleParams({ view: 'month', date: TODAY, ...over.query }, NOW) })).replace(/<!-- -->/g, '')
}

// ── 타임라인 ──────────────────────────────────────────────────────────────────────────────────────

function makeTimeline(over: Partial<BuildTimelineInput> = {}): ScheduleTimeline {
  const bundles = over.bundles ?? [
    makeBundle([
      opsItem('mission', 'm1', '가을 미션', kst('2026-10-08', '09:00'), kst('2026-10-14', '18:00')),
      opsItem('mission', 'm2', '검토 미션', kst('2026-10-16', '09:00'), kst('2026-10-18', '09:00'), 'reviewing'),
      opsItem('mission', 'm3', '실패 미션', kst('2026-10-20', '09:00'), kst('2026-10-22', '09:00'), 'failed'),
      opsItem('drop_schedule', 'd1', '가을 드랍', kst('2026-10-09', '10:00'), null),
      opsItem('collection_launch', 'c1', '가을 컬렉션', kst('2026-10-26', '09:00'), kst('2026-11-09', '09:00')),
    ]),
  ]
  const dates = dateRange(WINDOW.start, WINDOW.end)
  const days = buildSchedulePeriod({
    ...WINDOW,
    today: TODAY,
    includeSample: false,
    compositions: buildDayCompositions({ cards: [], missions: [], bundles }, dates),
    bundles,
    cards: [],
    missions: [],
    signals: signalsByDate([signal(TODAY, 'stop', 'execution_failed'), signal('2026-10-09', 'info', 'overlap')], [TODAY, '2026-10-09'], dates),
  }).days
  return buildTimeline({
    ...WINDOW,
    today: TODAY,
    now: NOW,
    includeSample: false,
    bundles,
    missions: [missionRow('legacy-1', kst('2026-10-12', '09:00'), kst('2026-10-30', '09:00'))],
    dropSchedules: [],
    itemBooks: [],
    leadDays: 7,
    days,
    ...over,
  })
}

async function renderTimelineBody(over: { timeline?: ScheduleTimeline; sourceErrors?: ScheduleSourceErrors } = {}): Promise<string> {
  hoisted.timeline.value = { timeline: over.timeline ?? makeTimeline(), sourceErrors: over.sourceErrors ?? {} }
  return renderToStaticMarkup(await ScheduleBody({ params: parseScheduleParams({ view: 'timeline', date: TODAY }, NOW) })).replace(/<!-- -->/g, '')
}

beforeEach(() => {
  hoisted.search = ''
  hoisted.month = { value: null, error: null, calls: [] }
  hoisted.timeline = { value: null, error: null, calls: [] }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('월간 본문 — 읽기와 달력 틀', () => {
  it('주소의 date·sample을 읽기에 그대로 넘긴다', async () => {
    await renderMonthBody({ query: { sample: '1', date: '2026-10-21' } })
    expect(hoisted.month.calls.at(-1)).toEqual({ date: '2026-10-21', includeSample: true })
    await renderMonthBody({ query: {} })
    expect(hoisted.month.calls.at(-1)).toEqual({ date: TODAY, includeSample: false })
  })

  it('월요일 시작 달력 35칸이 있고 칸 머리마다 날짜 서랍 버튼이다', async () => {
    const out = await renderMonthBody()
    expect(out).toContain('aria-label="월간 달력"')
    for (const label of ['월', '화', '수', '목', '금', '토', '일']) expect(out).toContain(`<span>${label}</span>`)
    const triggers = [...out.matchAll(/data-drawer-trigger="day:(\d{4}-\d{2}-\d{2})"/g)].map((match) => match[1])
    expect(triggers).toEqual(dateRange(MONTH.start, MONTH.end))
    expect(triggers).toHaveLength(35)
  })

  it('오늘 칸에만 aria-current=date와 「오늘」 글자가 있고, 보이는 달 밖(9/28~30·11/1)은 흐리게 그린다', async () => {
    const out = await renderMonthBody()
    expect(out.match(/aria-current="date"/g)).toHaveLength(1)
    expect(out.match(/>오늘</g)).toHaveLength(1)
    expect(out.match(/bg-muted\/40 text-muted-foreground/g)).toHaveLength(4)
  })

  it('달의 첫날과 달력의 첫 칸은 「10월 1일」처럼 달을 쓰고 나머지는 숫자만이다(화면 읽기용 글자는 날짜 전체)', async () => {
    const out = await renderMonthBody()
    expect(out).toContain('<span aria-hidden="true">9월 28일</span>')
    expect(out).toContain('<span aria-hidden="true">10월 1일</span>')
    expect(out).toContain('<span aria-hidden="true">15</span>')
    expect(out).toContain('<span class="sr-only">10월 15일 목요일</span>')
  })

  it('달력 폭이 기준이다: 40rem 미만에서는 항목 줄이 숨고 항목 수가 보인다', async () => {
    const out = await renderMonthBody()
    expect(out).toContain('class="@container mb-10 min-w-0"')
    expect(out).toContain('hidden @[40rem]:block')
    // 항목 5개 칸: 좁은 모양은 수만(숫자 + 화면 읽기용 「항목 5개」)
    expect(out).toContain('<p class="px-1 text-xs tabular-nums text-muted-foreground @[40rem]:hidden"><span aria-hidden="true">5</span><span class="sr-only">항목 5개</span></p>')
  })

  it('항목이 없는 칸은 「일정 없음」이고 좁은 모양에는 수가 없다', async () => {
    const out = await renderMonthBody()
    expect(out).toContain('일정 없음')
    expect(out).not.toContain('항목 0개')
  })
})

describe('월간 본문 — 칸 항목과 「+N개 더」', () => {
  it('항목 5개 칸은 3개만 한 줄씩 보이고 「+2개 더」가 날짜 서랍으로 간다', async () => {
    const out = await renderMonthBody()
    const day = out.slice(out.indexOf('data-drawer-trigger="day:2026-10-06"'), out.indexOf('data-drawer-trigger="day:2026-10-07"'))
    expect(day.match(/data-drawer-trigger="item:/g)).toHaveLength(3)
    expect(day).toContain('+2개 더')
    expect(day).toContain('aria-label="10월 6일 항목 2개 더 보기"')
    // 3개를 넘는 칸에만 「더」 단추가 있다
    expect(out.match(/개 더</g)).toHaveLength(1)
  })

  it('항목은 종류 아이콘 + 상태 아이콘(글자는 sr-only) + 제목이다', async () => {
    const out = await renderMonthBody()
    const mission = out.slice(out.indexOf('data-drawer-trigger="item:mission-1"'))
    const item = mission.slice(0, mission.indexOf('</button>'))
    expect(item).toContain('<span class="sr-only">미션</span>')
    expect(item).toContain('<span class="sr-only">예약됨</span>')
    expect(item).toContain('가을 미션')
    // 상태 글자가 눈에 보이는 칩이 아니다
    expect(item).not.toContain('</svg>예약됨')
  })

  it('운영 미션은 시작일 칸에만 있다(10/8 한 번)', async () => {
    const out = await renderMonthBody()
    expect(out.match(/data-drawer-trigger="item:mission-1"/g)).toHaveLength(1)
  })

  it('칸 머리에 그날 가장 높은 신호 수준 칩과 건수가 있다(좁으면 아이콘만, 건수는 넓을 때만)', async () => {
    const out = await renderMonthBody()
    const head = out.slice(out.indexOf('data-drawer-trigger="day:2026-10-07"'), out.indexOf('data-drawer-trigger="day:2026-10-08"'))
    const button = head.slice(0, head.indexOf('</button>'))
    expect(button).toContain('<span class="sr-only">중단</span>')
    expect(button).toContain('</svg>중단</span>')
    expect(button).toContain('@[40rem]:inline">2건<')
    expect(button).not.toContain('>주의<')
    // 건수 0·확인 기간 밖 칸에는 칩이 없다
    const quiet = out.slice(out.indexOf('data-drawer-trigger="day:2026-10-09"'), out.indexOf('data-drawer-trigger="day:2026-10-10"'))
    expect(quiet.slice(0, quiet.indexOf('</button>'))).not.toContain('중단')
    expect(out).not.toContain('이상 없')
  })

  it('칸 머리 버튼은 40rem 미만에서 44px(min-h-11)다', async () => {
    const out = await renderMonthBody()
    expect(out).toContain('mb-1 flex min-h-11 w-full')
    expect(out).toContain('@[40rem]:min-h-0')
  })

  it('운영 항목 제목은 텍스트로만 들어온다(HTML이 해석되지 않는다)', async () => {
    const bundles = [makeBundle([cardItem('card-x', '<img src=x onerror=alert(1)>', '2026-10-06')])]
    const out = await renderMonthBody({ month: makeMonth({ bundles }) })
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(out).not.toContain('<img src=x')
  })
})

describe('월간 본문 — 오류와 빈 기간', () => {
  it('읽기가 던지면 안내 카드 하나다', async () => {
    hoisted.month.error = new Error('월간 읽기 실패(시험)')
    const out = renderToStaticMarkup(await ScheduleBody({ params: parseScheduleParams({ view: 'month', date: TODAY }, NOW) }))
    expect(out).toContain('일정을 불러오지 못했어요')
    expect(out).not.toContain('월간 달력')
  })

  it('카드·미션·운영 항목을 모두 못 읽으면 안내 카드 하나다', async () => {
    const out = await renderMonthBody({ sourceErrors: { cards: '실패', missions: '실패', bundles: '실패' } })
    expect(out).toContain('일정을 불러오지 못했어요')
    expect(out).not.toContain('월간 달력')
  })

  it('일부만 못 읽으면 달력은 그대로 + 못 읽은 재료 안내(「미편성」 단정 없음)', async () => {
    const out = await renderMonthBody({ sourceErrors: { cards: '실패', signals: '실패' } })
    expect(out).toContain('일부 일정을 불러오지 못했어요')
    expect(out).toContain(SCHEDULE_SOURCE_NOTICES.cards)
    expect(out).toContain(SCHEDULE_SOURCE_NOTICES.signals)
    expect(out).not.toContain(SCHEDULE_SOURCE_NOTICES.missions)
    expect(out).toContain('aria-label="월간 달력"')
    expect(out).not.toContain('미편성')
  })

  it('기간이 비면 「이 기간에는 올라온 항목이 없어요」 + [오늘로 이동](같은 보기·같은 거르기로 오늘)', async () => {
    const empty = buildScheduleMonth({ date: '2026-12-10', today: TODAY, includeSample: false, compositions: [], bundles: [], cards: [], missions: [], signals: null })
    const out = await renderMonthBody({ month: empty, query: { date: '2026-12-10', kind: 'mission' } })
    expect(out).toContain('이 기간에는 올라온 항목이 없어요')
    expect(out).toContain(`href="/admin/ops-schedule?view=month&amp;date=${TODAY}&amp;kind=mission"`)
    expect(out).toContain('오늘로 이동')
  })

  it('오늘이 그 달에 있으면 [오늘로 이동]이 없다', async () => {
    const empty = buildScheduleMonth({ date: TODAY, today: TODAY, includeSample: false, compositions: [], bundles: [], cards: [], missions: [], signals: null })
    const out = await renderMonthBody({ month: empty })
    expect(out).toContain('이 기간에는 올라온 항목이 없어요')
    expect(out).not.toContain('오늘로 이동')
  })

  it('못 읽은 재료가 있으면 빈 기간이라고 단정하지 않는다', async () => {
    const empty = buildScheduleMonth({ date: TODAY, today: TODAY, includeSample: false, compositions: [], bundles: null, cards: [], missions: [], signals: null })
    const out = await renderMonthBody({ month: empty, sourceErrors: { bundles: '실패' } })
    expect(out).not.toContain('이 기간에는 올라온 항목이 없어요')
    expect(out).toContain(SCHEDULE_SOURCE_NOTICES.bundles)
  })
})

describe('타임라인 본문 — 읽기와 틀', () => {
  it('주소의 date·sample을 읽기에 그대로 넘긴다', async () => {
    hoisted.timeline.value = { timeline: makeTimeline(), sourceErrors: {} }
    await ScheduleBody({ params: parseScheduleParams({ view: 'timeline', date: '2026-10-21', sample: '1' }, NOW) })
    expect(hoisted.timeline.calls.at(-1)).toEqual({ date: '2026-10-21', includeSample: true })
  })

  it('타임라인 상자 안에서만 가로 스크롤된다(키보드로 닿고 이름이 있다)', async () => {
    const out = await renderTimelineBody()
    expect(out).toMatch(/<div tabindex="0" role="region" aria-label="타임라인, 가로로 밀어서 볼 수 있어요" class="overflow-x-auto /)
    // 안쪽 폭은 상자 안에 있다(페이지가 아니라 상자가 스크롤된다)
    expect(out).toContain('relative min-w-[69rem]')
    // 안쪽 최소 폭이 바깥 틀(flex 항목 `main`)을 밀어내지 않게 상자가 안쪽 폭을 바깥에 알리지 않는다
    expect(out).toMatch(/<div tabindex="0" role="region"[^>]*class="[^"]*contain-inline-size/)
    expect(out.indexOf('overflow-x-auto')).toBeLessThan(out.indexOf('min-w-[69rem]'))
    expect(out).toContain('class="mb-10 min-w-0"')
  })

  it('줄 목록은 role=list이고 신호·미션·드랍 일정·컬렉션 런칭 순서다', async () => {
    const out = await renderTimelineBody()
    expect(out).toContain('<ul role="list">')
    const labels = ['신호', '미션', '드랍 일정', '컬렉션 런칭'].map((label) => out.indexOf(`>${label}</div>`))
    expect(labels.every((index) => index > -1)).toBe(true)
    expect([...labels].sort((a, b) => a - b)).toEqual(labels)
    expect(out.match(/<li class="grid grid-cols-\[6rem_minmax\(0,1fr\)\]/g)).toHaveLength(4)
  })

  it('열은 42개이고 주 눈금 6개(10/5…11/9)가 있다', async () => {
    const out = await renderTimelineBody()
    expect(out).toContain('grid-cols-[repeat(42,minmax(0,1fr))]')
    for (const label of ['10/5', '10/12', '10/19', '10/26', '11/2', '11/9']) expect(out).toContain(`>${label}</span>`)
  })

  it('오늘 세로선에 「오늘」 글자가 있고 창 밖이면 없다', async () => {
    const out = await renderTimelineBody()
    expect(out).toContain('>오늘</span>')
    expect(out).toContain('pointer-events-none absolute inset-y-0 left-24 right-0')
    // 10/7은 3열 → (3 − 0.5) / 42 × 100%
    expect(out).toContain(`style="left:${((3 - 0.5) / 42) * 100}%"`)
    const outside = await renderTimelineBody({ timeline: makeTimeline({ today: '2026-12-01' }) })
    expect(outside).not.toContain('>오늘</span>')
  })
})

describe('타임라인 본문 — 막대', () => {
  it('운영 항목 막대는 항목 서랍 버튼이고 aria-label에 종류·기간·상태가 있다', async () => {
    const out = await renderTimelineBody()
    const button = elementAt(out, 'data-drawer-trigger="item:m1"')
    expect(button).toContain('aria-label="미션 「가을 미션」, 10월 8일부터 10월 14일까지, 상태 예약됨"')
    expect(button).toContain('style="grid-column:4 / 11;grid-row:1 / span 1"')
    expect(button).toContain('가을 미션')
    expect(button).toContain('tabler-icon') // 상태 아이콘
  })

  it('하루짜리 막대도 한 칸 폭이다', async () => {
    const out = await renderTimelineBody()
    expect(out).toContain('aria-label="드랍 일정 「가을 드랍」, 10월 9일, 상태 예약됨"')
    expect(out).toContain('style="grid-column:5 / 6;grid-row:1 / span 1"')
  })

  it('승인 전은 점선이고 실패는 「실패」 색(destructive 테두리)이다', async () => {
    const out = await renderTimelineBody()
    expect(elementAt(out, 'data-drawer-trigger="item:m2"')).toContain('border-dashed')
    const failedButton = elementAt(out, 'data-drawer-trigger="item:m3"')
    expect(failedButton).toContain('border-destructive')
    expect(failedButton).not.toContain('border-dashed')
    expect(failedButton).toContain('aria-label="미션 「실패 미션」, 10월 20일부터 10월 22일까지, 상태 실패"')
    // 예약됨은 실선(secondary)
    const scheduled = elementAt(out, 'data-drawer-trigger="item:m1"')
    expect(scheduled).not.toContain('border-dashed')
    expect(scheduled).toContain('bg-secondary')
  })

  it('운영 항목과 합치지 않은 실제 자원 막대는 관리 화면 링크이고 항목 서랍 키가 없다', async () => {
    const out = await renderTimelineBody()
    expect(out).toContain('aria-label="미션 「옛 미션 legacy-1」, 10월 12일부터 10월 30일까지, 상태 예약됨"')
    expect(out).toContain('href="/admin/missions/legacy-1"')
    expect(out).not.toContain('data-drawer-trigger="item:legacy-1"')
  })

  it('컬렉션은 준비 구간 점선 칸(aria-hidden)과 노출 실선 막대가 따로 있다', async () => {
    const out = await renderTimelineBody()
    // 10/26 시작, 리드 7일 → 준비 10/19~10/25(15~21열), 노출 10/26~11/9(22~36열)
    expect(out).toContain('aria-label="컬렉션 런칭 「가을 컬렉션」, 10월 26일부터 11월 9일까지, 상태 예약됨, 준비는 10월 19일부터"')
    expect(out).toMatch(/<span aria-hidden="true" class="[^"]*border-dashed[^"]*bg-muted" style="grid-column:15 \/ 22;grid-row:1 \/ span 1"><\/span>/)
    expect(out).toContain('style="grid-column:22 / 37;grid-row:1 / span 1"')
  })

  it('신호 줄에는 날짜 서랍을 여는 칩 칸이 있다(그날 가장 높은 수준)', async () => {
    const out = await renderTimelineBody()
    expect(out).toContain('data-drawer-trigger="day:2026-10-07"')
    expect(out).toContain('aria-label="10월 7일 신호 중단 1건, 눌러서 날짜 서랍 열기"')
    expect(out).toContain('aria-label="10월 9일 신호 참고 1건, 눌러서 날짜 서랍 열기"')
  })

  it('시험 묶음의 막대에는 시험 표식(아이콘, 글자는 sr-only)이 있다', async () => {
    const bundles = [makeBundle([opsItem('mission', 'ms', '시험 미션', kst('2026-10-08', '09:00'), null)], { isSample: true })]
    const dates = dateRange(WINDOW.start, WINDOW.end)
    const days = buildSchedulePeriod({ ...WINDOW, today: TODAY, includeSample: true, compositions: buildDayCompositions({ cards: [], missions: [], bundles }, dates), bundles, cards: [], missions: [], signals: null }).days
    const out = await renderTimelineBody({ timeline: makeTimeline({ bundles, includeSample: true, days, missions: [] }) })
    expect(out).toContain('<span class="sr-only">시험</span>')
    expect(out).toContain('시험 묶음')
  })
})

describe('타임라인 본문 — 빈 줄과 오류', () => {
  it('막대가 없는 줄은 「올라온 항목이 없어요」이고, 신호 줄은 못 읽음·기간 밖을 구분한다', async () => {
    const noSignalDays = buildSchedulePeriod({ ...WINDOW, today: TODAY, includeSample: false, compositions: [], bundles: [], cards: [], missions: [], signals: null }).days
    const out = await renderTimelineBody({ timeline: makeTimeline({ bundles: [], missions: [], days: noSignalDays }) })
    expect(out.match(/이 기간에는 올라온 항목이 없어요/g)?.length).toBeGreaterThanOrEqual(3)
    // 신호를 읽지 못했으면 신호가 없다는 뜻이 아니라고 알린다
    expect(out).toContain('신호를 읽지 못했어요. 신호가 없다는 뜻은 아니에요')
    const unchecked = buildSchedulePeriod({ ...WINDOW, today: TODAY, includeSample: false, compositions: [], bundles: [], cards: [], missions: [], signals: signalsByDate([], [], dateRange(WINDOW.start, WINDOW.end)) }).days
    const outside = await renderTimelineBody({ timeline: makeTimeline({ bundles: [], missions: [], days: unchecked }) })
    expect(outside).toContain('이 기간은 신호를 확인하는 기간이 아니에요')
    expect(outside).not.toContain('이상 없')
  })

  it('그 줄의 재료를 못 읽었으면 「없다」고 하지 않고 빠져 있을 수 있다고 알린다', async () => {
    const out = await renderTimelineBody({
      timeline: makeTimeline({ bundles: [], missions: null, dropSchedules: null, itemBooks: [] }),
      sourceErrors: { missions: '실패', dropSchedules: '실패' },
    })
    expect(out).toContain('일부 항목을 읽지 못해 빠져 있을 수 있어요')
    // 컬렉션 줄은 읽었고 비었다
    expect(out).toContain('이 기간에는 올라온 항목이 없어요')
    expect(out).toContain(SCHEDULE_SOURCE_NOTICES.missions)
    expect(out).toContain(SCHEDULE_SOURCE_NOTICES.dropSchedules)
  })

  it('컬렉션 준비 기간 규칙을 못 읽으면 28일로 그렸다고 알린다', async () => {
    const out = await renderTimelineBody({ sourceErrors: { rules: '실패' } })
    expect(out).toContain('컬렉션 준비 기간 기준을 읽지 못해 28일로 그렸어요')
    expect(out).toContain('일부 일정을 불러오지 못했어요')
  })

  it('읽기가 던지거나 카드·미션·운영 항목을 모두 못 읽으면 안내 카드 하나다', async () => {
    hoisted.timeline.error = new Error('타임라인 읽기 실패(시험)')
    const failed = renderToStaticMarkup(await ScheduleBody({ params: parseScheduleParams({ view: 'timeline', date: TODAY }, NOW) }))
    expect(failed).toContain('일정을 불러오지 못했어요')
    hoisted.timeline.error = null
    const all = await renderTimelineBody({ sourceErrors: { cards: '실패', missions: '실패', bundles: '실패' } })
    expect(all).toContain('일정을 불러오지 못했어요')
    expect(all).not.toContain('aria-label="타임라인"')
  })

  it('항목·막대가 하나도 없고 모두 읽었으면 「이 기간에는 올라온 항목이 없어요」 + [오늘로 이동](창에 오늘이 없을 때)', async () => {
    const timeline = makeTimeline({ bundles: [], missions: [], today: '2026-12-31' })
    const out = await renderTimelineBody({ timeline })
    expect(out).toContain('오늘로 이동')
    expect(out).toContain(`href="/admin/ops-schedule?view=timeline&amp;date=${TODAY}"`)
    const withToday = await renderTimelineBody({ timeline: makeTimeline({ bundles: [], missions: [] }) })
    expect(withToday).not.toContain('오늘로 이동')
  })
})

describe('서랍 — 월간·타임라인에서도 달력의 형제로 열린다', () => {
  const boardMonth = (search: string, sourceErrors: ScheduleSourceErrors = {}) => {
    hoisted.search = search
    return renderToStaticMarkup(<OpsScheduleBoard month={makeMonth()} sourceErrors={sourceErrors} />).replace(/<!-- -->/g, '')
  }
  const boardTimeline = (search: string, sourceErrors: ScheduleSourceErrors = {}) => {
    hoisted.search = search
    return renderToStaticMarkup(<OpsScheduleBoard timeline={makeTimeline()} sourceErrors={sourceErrors} />).replace(/<!-- -->/g, '')
  }

  it('닫혀 있으면 서랍 틀도 2열 배치도 없다', () => {
    for (const out of [boardMonth('view=month'), boardTimeline('view=timeline')]) {
      expect(out).not.toContain('<aside')
      expect(out).not.toContain('@[68rem]:grid-cols-[minmax(0,1fr)_28rem]')
    }
  })

  it('월간: 날짜 서랍이 열려도 달력 35칸이 DOM에 남고 서랍은 형제 요소다(딤·fixed 없음)', () => {
    const out = boardMonth('view=month&date=2026-10-06&drawer=day')
    expect(out).toContain('<aside aria-label="서랍 · 10월 6일(화)"')
    expect(out.indexOf('</section>')).toBeLessThan(out.indexOf('<aside'))
    expect(out.match(/data-drawer-trigger="day:/g)).toHaveLength(35)
    expect(out).toContain('항목 5개')
    expect(out).not.toMatch(/class="[^"]*\bfixed\b/)
    expect(out).not.toContain('aria-modal')
    expect(out).toContain('@[68rem]:grid-cols-[minmax(0,1fr)_28rem]')
    // 열린 날짜의 칸 머리가 선택이다
    const head = out.slice(out.indexOf('data-drawer-trigger="day:2026-10-06"') - 40)
    expect(head.slice(0, head.indexOf('</button>'))).toContain('aria-current="true"')
  })

  it('월간: 「+2개 더」로 연 날짜 서랍에는 가려진 항목까지 5개가 모두 있다', () => {
    const out = boardMonth('view=month&date=2026-10-06&drawer=day')
    for (const title of ['카드 A', '카드 B', '카드 C', '카드 D', '카드 E']) expect(out).toContain(title)
  })

  it('월간: 못 읽은 재료가 있으면 항목 0개 날짜 서랍이 「올라온 항목이 없어요」라고 단정하지 않는다', () => {
    const out = boardMonth('view=month&date=2026-10-14&drawer=day', { cards: '실패' })
    expect(out).toContain('일부 항목을 읽지 못해 빠져 있을 수 있어요')
    expect(out).not.toContain('이 날짜에는 올라온 항목이 없어요')
  })

  it('월간: 옛 미션(mission:<ID>) 서랍은 이미 읽은 달력 데이터로 바로 그린다', () => {
    const legacyId = '3f2a9c1e-0000-4000-8000-0000000000f1'
    const dates = dateRange(MONTH.start, MONTH.end)
    const month = buildScheduleMonth({
      date: TODAY,
      today: TODAY,
      includeSample: false,
      compositions: buildDayCompositions({ cards: [], missions: [{ id: legacyId, title: '옛 미션', startsAt: kst('2026-10-12', '09:00'), endsAt: kst('2026-10-30', '09:00') }], bundles: [] }, dates),
      bundles: [],
      cards: [],
      missions: [missionRow(legacyId, kst('2026-10-12', '09:00'), kst('2026-10-30', '09:00'))],
      signals: null,
    })
    hoisted.search = `view=month&drawer=item&item=mission:${legacyId}`
    const out = renderToStaticMarkup(<OpsScheduleBoard month={month} sourceErrors={{}} />)
    expect(out).toContain('서랍 · 미션 「옛 미션 ' + legacyId + '」')
    expect(out).toContain('data-drawer-trigger="item:mission:' + legacyId + '"')
  })

  it('타임라인: 날짜 서랍(신호 칩에서 연다)이 열려도 타임라인 상자가 그대로 남는다', () => {
    const out = boardTimeline('view=timeline&date=2026-10-07&drawer=day')
    expect(out).toContain('<aside aria-label="서랍 · 10월 7일(수)"')
    expect(out.indexOf('</section>')).toBeLessThan(out.indexOf('<aside'))
    expect(out).toContain('aria-label="타임라인, 가로로 밀어서 볼 수 있어요"')
    expect(out).toContain('신호 1건')
    // 열린 날짜의 신호 칩이 선택이다
    const cell = out.slice(out.indexOf('data-drawer-trigger="day:2026-10-07"') - 20)
    expect(cell.slice(0, cell.indexOf('</button>'))).toContain('aria-current="true"')
  })

  it('타임라인: 항목 서랍이 열리면 그 막대가 선택이다(운영 항목 키)', () => {
    const out = boardTimeline('view=timeline&date=2026-10-07&drawer=item&item=3f2a9c1e-0000-4000-8000-0000000000a1')
    expect(out).toContain('<aside aria-label="서랍"')
    // 서랍 키가 UUID가 아닌 운영 항목('m1')은 주소가 닫힌 것으로 본다(`parseScheduleParams`) — 달력만 있다
    expect(boardTimeline('view=timeline&drawer=item&item=m1')).not.toContain('<aside')
  })
})
