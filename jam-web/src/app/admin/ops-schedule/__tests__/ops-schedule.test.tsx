/**
 * 일정표 화면 조립 (티켓 20261006_1536 ③-a)
 *
 * 저장소에 jsdom·testing-library가 없어(`app/admin/__tests__/home-page.test.tsx`와 같은 방식) 서버 컴포넌트를 `await`로 불러 얻은 요소를
 * `renderToStaticMarkup`으로 그려 모양을 고정한다. DB 읽기(`loadScheduleWeek`)와 시험 스위치 구역은 가짜로 바꾼다(실 DB에 닿지 않는다).
 *
 * 지키는 것:
 * - 머리(제목·부제·시험 스위치) → 도구줄 → 본문 순서이고, 본문만 `Suspense`로 읽는다(머리·도구줄은 바로 보인다)
 * - 주소(`view`·`date`·`sample`·거르기)가 도구줄 링크에 그대로 이어진다: 주 이동·오늘·보기 전환 모두 `sample=1`을 잃지 않는다(②-c 게이트 메모)
 * - 주간만 열려 있고 월간·타임라인은 눌리지 않는다. 주소의 `view`가 아직 못 그리는 보기면 주간으로 그린다
 * - 오류(출처별 격리): 일부만 못 읽으면 달력은 그대로 + 「…를 읽지 못해 빠져 있어요」, 「미편성」으로 단정하지 않는다. 카드·미션·운영 항목을 모두 못 읽으면 안내 카드 하나
 * - 빈 기간은 「이 기간에는 올라온 항목이 없어요」 + [오늘로 이동](오늘이 그 주에 있으면 이동 버튼 없음), 못 읽은 재료가 있으면 빈 기간이라고 단정하지 않는다
 * - 칸에 상태 칩·신호 칩·오늘·장기 카드 비활성 수·자동 실행 접힘 줄·운영 미션 막대가 서버에서 읽은 값 그대로 그려진다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const hoisted = vi.hoisted(() => ({
  props: {} as Record<string, Record<string, unknown>>,
  load: { value: null as unknown, error: null as Error | null, calls: [] as Array<Record<string, unknown>> },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-schedule',
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('../../_home/sections', () => ({
  SampleSwitchSection: (props: Record<string, unknown>) => {
    hoisted.props.switch = props
    return <div data-section="switch" />
  },
}))

vi.mock('@/lib/admin/opsSchedule/load', () => ({
  loadScheduleWeek: vi.fn(async (options: Record<string, unknown>) => {
    hoisted.load.calls.push(options)
    if (hoisted.load.error) throw hoisted.load.error
    return hoisted.load.value
  }),
}))

import OpsSchedulePage from '../page'
import { ScheduleBody, SCHEDULE_SOURCE_NOTICES } from '../ScheduleBody'
import { ScheduleToolbar } from '../ScheduleToolbar'
import { parseScheduleParams } from '@/lib/admin/opsSchedule/params'
import type { LoadedScheduleWeek } from '@/lib/admin/opsSchedule/load'
import type { ScheduleDay, ScheduleItem, ScheduleWeek } from '@/lib/admin/opsSchedule/weekView'
import { shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'

const NOW = new Date('2026-10-07T03:00:00.000Z') // KST 2026-10-07(수) 12:00
const WEEK_START = '2026-10-05'

function item(over: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 'ops-i1-2026-10-06',
    origin: 'ops',
    drawerKey: 'i1',
    kind: 'home_feed_card',
    title: '운영 카드',
    time: '09:30',
    status: 'reviewing',
    isSample: false,
    dim: false,
    href: '/admin/ops-inbox/b1?item=i1',
    note: null,
    ...over,
  }
}

function day(date: string, over: Partial<ScheduleDay> = {}): ScheduleDay {
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return {
    date,
    weekdayLabel: weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()],
    dateLabel: `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`,
    isToday: false,
    items: [],
    longActiveCount: 0,
    longInactiveCount: 0,
    automation: [],
    signals: null,
    representative: null,
    ...over,
  }
}

function week(over: Partial<ScheduleWeek> = {}, dayOver: Record<string, Partial<ScheduleDay>> = {}, weekStart = WEEK_START): ScheduleWeek {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateStr(weekStart, index)
    return day(date, dayOver[date])
  })
  return {
    weekStart,
    weekEnd: shiftDateStr(weekStart, 6),
    days,
    missionBars: [],
    openEndedMissionCount: 0,
    contentCount: days.reduce((sum, entry) => sum + entry.items.length + entry.longActiveCount + entry.longInactiveCount, 0),
    ...over,
  }
}

function loaded(w: ScheduleWeek, sourceErrors: LoadedScheduleWeek['sourceErrors'] = {}): LoadedScheduleWeek {
  return { week: w, sourceErrors }
}

async function renderPage(query: Record<string, string | string[] | undefined> = {}): Promise<string> {
  return renderToStaticMarkup(await OpsSchedulePage({ searchParams: Promise.resolve(query) }))
}

async function renderBody(query: Record<string, string | string[] | undefined> = {}): Promise<string> {
  return renderToStaticMarkup(await ScheduleBody({ params: parseScheduleParams(query, NOW) }))
}

beforeEach(() => {
  hoisted.props = {}
  hoisted.load.value = loaded(week({}, { '2026-10-06': { items: [item()] } }))
  hoisted.load.error = null
  hoisted.load.calls = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('일정표 머리와 틀', () => {
  it('제목은 「일정표」이고 부제가 있다', async () => {
    const out = await renderPage()
    expect(out).toContain('<h1 class="text-2xl font-bold">일정표</h1>')
    expect(out).toContain('한 주·한 달·몇 주 치 일정을 보고, 누르면 그 기획을 바로 열어요')
  })

  it('시험 묶음 스위치(S1과 같은 구역 부품)가 머리에 있고 sample=1을 읽어 넘긴다', async () => {
    await renderPage({ sample: '1' })
    expect(hoisted.props.switch).toMatchObject({ includeSample: true })
    await renderPage({})
    expect(hoisted.props.switch).toMatchObject({ includeSample: false })
  })

  it('머리 → 도구줄 → 본문 순서이고 본문 영역은 aria-busy 틀 안에 있다', async () => {
    // 본문은 비동기 서버 컴포넌트라 정적 렌더에서는 `Suspense`의 대체 화면 자리로 보인다(읽은 뒤 내용은 아래 「본문」 시험이 본다)
    const out = await renderPage()
    expect(out.indexOf('data-section="switch"')).toBeLessThan(out.indexOf('aria-label="보기 전환"'))
    expect(out.indexOf('aria-label="보기 전환"')).toBeLessThan(out.indexOf('aria-label="불러오는 중"'))
    expect(out).toContain('aria-busy="false"')
  })

  it('본문을 읽는 중이어도 머리와 도구줄은 바로 보이고 본문 자리만 「불러오는 중」이다', async () => {
    hoisted.load.value = null
    // 끝나지 않는 읽기: 가장 가까운 Suspense의 대체 화면이 보인다
    const { loadScheduleWeek } = await import('@/lib/admin/opsSchedule/load')
    vi.mocked(loadScheduleWeek).mockImplementationOnce(() => new Promise(() => {}))
    const out = await renderPage()
    expect(out).toContain('일정표</h1>')
    expect(out).toContain('aria-label="보기 전환"')
    expect(out.match(/role="status" aria-label="불러오는 중"/g)).toHaveLength(1)
  })

  it('주소의 date·sample이 본문 읽기에 그대로 넘어간다(월요일로 맞춘 주)', async () => {
    await renderPage({ date: '2026-10-14', sample: '1' })
    expect(hoisted.load.calls.at(-1)).toEqual({ weekStart: '2026-10-12', includeSample: true })
    await renderPage({})
    expect(hoisted.load.calls.at(-1)).toEqual({ weekStart: WEEK_START, includeSample: false })
  })

  it('옛 ?week=만 있어도 그 주를 읽는다(읽기 호환)', async () => {
    await renderPage({ week: '2026-09-21' })
    expect(hoisted.load.calls.at(-1)).toEqual({ weekStart: '2026-09-21', includeSample: false })
  })

  it('loading.tsx 없이 페이지 안 Suspense만 쓴다(소스 계약은 no-html 테스트가 지킨다)', async () => {
    expect(await renderPage()).not.toContain('NEXT_')
  })
})

describe('도구줄 — 보기 탭·기간 이동', () => {
  function toolbar(query: Record<string, string | string[] | undefined> = {}, view: 'week' | 'month' | 'timeline' = 'week'): string {
    return renderToStaticMarkup(<ScheduleToolbar view={view} params={parseScheduleParams(query, NOW)} />)
  }

  it('주간 탭만 눌리고 월간·타임라인은 눌리지 않는 글자다(③-c가 연다)', () => {
    const out = toolbar()
    expect(out).toMatch(/<a[^>]*aria-current="page"[^>]*>주간<\/a>/)
    expect(out).toMatch(/<span[^>]*aria-disabled="true"[^>]*>월간<\/span>/)
    expect(out).toMatch(/<span[^>]*aria-disabled="true"[^>]*>타임라인<\/span>/)
    expect(out).not.toMatch(/<a[^>]*>월간<\/a>/)
  })

  it('이전·오늘·다음 링크는 view·date를 담는다(주 이동 7일)', () => {
    const out = toolbar({ date: '2026-10-07' })
    expect(out).toContain('href="/admin/ops-schedule?view=week&amp;date=2026-09-30"')
    expect(out).toContain('href="/admin/ops-schedule?view=week&amp;date=2026-10-14"')
    expect(out).toContain('href="/admin/ops-schedule?view=week&amp;date=2026-10-07"')
    expect(out).toContain('aria-label="이전 주"')
    expect(out).toContain('aria-label="다음 주"')
    expect(out).toContain('>오늘<')
    expect(out).toContain('2026년 10월 5일 ~ 10월 11일')
  })

  it('주 이동·오늘·보기 탭이 모두 sample=1을 잃지 않는다(②-c 게이트 메모)', () => {
    const out = toolbar({ date: '2026-10-07', sample: '1' })
    const hrefs = [...out.matchAll(/href="([^"]+)"/g)].map((match) => match[1])
    expect(hrefs).toHaveLength(4)
    for (const href of hrefs) expect(href, href).toContain('sample=1')
    expect(toolbar({ date: '2026-10-07' })).not.toContain('sample=1')
  })

  it('거르기는 이어 가고 서랍은 닫힌다(기간을 옮기면 서랍 키를 잇지 않는다)', () => {
    const out = toolbar({
      date: '2026-10-07',
      kind: ['mission'],
      tribe: 'runner',
      pattern: 'P02',
      drawer: 'item',
      item: '3f2b8c1e-0000-4000-8000-000000000001',
    })
    expect(out).toContain('kind=mission')
    expect(out).toContain('tribe=runner')
    expect(out).toContain('pattern=P02')
    expect(out).not.toContain('drawer=')
    expect(out).not.toContain('item=')
  })

  it('오늘 링크의 날짜는 지금(KST)이다', () => {
    expect(toolbar({ date: '2026-12-25' })).toContain(`date=${todayKstDateString()}`)
  })
})

describe('주소의 view', () => {
  it('아직 그릴 수 없는 보기(월간·타임라인)는 주간으로 그린다', async () => {
    for (const view of ['month', 'timeline']) {
      const out = await renderPage({ view, date: '2026-10-07' })
      expect(out, view).toMatch(/<a[^>]*aria-current="page"[^>]*>주간<\/a>/)
      expect(out, view).toContain('2026년 10월 5일 ~ 10월 11일')
      expect(hoisted.load.calls.at(-1)).toEqual({ weekStart: WEEK_START, includeSample: false })
    }
  })
})

describe('본문 — 칸 내용', () => {
  it('운영 항목은 상태 칩·시험 칩과 항목 서랍을 여는 버튼으로 칸에 그려진다(③-b: 기획 상세 링크는 서랍 안에 있다)', async () => {
    hoisted.load.value = loaded(
      week({}, { '2026-10-06': { items: [item({ isSample: true, status: 'scheduled' })] } })
    )
    const out = await renderBody({ date: '2026-10-07', sample: '1' })
    expect(out).toContain('운영 카드')
    expect(out).toContain('예약됨</span>')
    expect(out).toContain('시험</span>')
    expect(out).toContain('data-drawer-trigger="item:i1"')
    expect(out).toContain('data-drawer-key="i1"')
    expect(out).not.toContain('href="/admin/ops-inbox/b1?item=i1"')
  })

  it('그날 가장 높은 신호 수준 칩과 건수, 오늘 표시가 칸 머리에 있다', async () => {
    hoisted.load.value = loaded(
      week(
        {},
        {
          '2026-10-07': {
            isToday: true,
            signals: { checked: true, topLevel: 'stop', count: 2, lines: [] },
          },
          '2026-10-08': { signals: { checked: true, topLevel: null, count: 0, lines: [] } },
        }
      )
    )
    const out = (await renderBody({ date: '2026-10-07' })).replace(/<!-- -->/g, '')
    expect(out).toContain('중단</span>')
    expect(out).toContain('>2건<')
    expect(out).toContain('>오늘<')
    expect(out.match(/aria-current="date"/g)).toHaveLength(1)
    // 건수 0·확인 기간 밖 칸에는 칩이 없다(이상 없음을 말하지 않는다)
    expect(out.match(/건</g)).toHaveLength(1)
    expect(out).not.toContain('이상 없')
  })

  it('비활성 장기 카드가 있는 날은 「장기 카드 N장 · 비활성 M장」이다', async () => {
    hoisted.load.value = loaded(week({}, { '2026-10-06': { longActiveCount: 2, longInactiveCount: 1 } }))
    expect((await renderBody()).replace(/<!-- -->/g, '')).toContain('장기 카드 2장 · 비활성 1장')
  })

  it('자동 실행은 칸 항목과 따로 「자동 실행 N개」 접힘 줄이다', async () => {
    hoisted.load.value = loaded(
      week({}, { '2026-10-06': { automation: [{ id: 'cron-1', time: '09:00', label: 'POI 정리', routine: false, dim: false }] } })
    )
    const out = (await renderBody()).replace(/<!-- -->/g, '')
    expect(out).toContain('<details')
    expect(out).toContain('자동 실행 1개')
    expect(out).toContain('POI 정리')
  })

  it('운영 미션은 막대에 상태 칩과 함께 두고 상시 미션 수를 보인다', async () => {
    hoisted.load.value = loaded(
      week({
        missionBars: [
          {
            id: 'ops-i9',
            title: '운영 미션',
            startCol: 1,
            endCol: 3,
            startsThisWeek: true,
            endsThisWeek: true,
            isGate: false,
            status: 'live',
            isSample: false,
            drawerKey: 'i9',
            href: '/admin/ops-inbox/b1?item=i9',
          },
        ],
        openEndedMissionCount: 4,
        contentCount: 1,
      })
    )
    const out = (await renderBody()).replace(/<!-- -->/g, '')
    expect(out).toContain('운영 미션')
    expect(out).toContain('게재중</span>')
    expect(out).toContain('style="grid-column:2 / 5"')
    expect(out).toContain('상시 미션 4개')
  })

  it('달력은 이전·다음 주 단추를 그리지 않고(도구줄이 한다) 폭에 맞춰 바뀌는 틀이다', async () => {
    const out = await renderBody()
    expect(out).not.toContain('aria-label="이전 주"')
    expect(out).toContain('@container')
    expect(out).toContain('@[56rem]:grid-cols-7')
  })

  it('옛 「미편성」 표시는 없다(새 신호가 대신한다, 승인 #15)', async () => {
    expect(await renderBody()).not.toContain('미편성')
  })
})

describe('본문 — 오류(출처별 격리)', () => {
  it('일부 재료를 못 읽으면 달력은 그대로 그리고 못 읽은 재료만 알린다', async () => {
    hoisted.load.value = loaded(week({}, { '2026-10-06': { items: [item()] } }), {
      cards: '카드 조회 실패(시험)',
      signals: '신호 조회 실패(시험)',
    })
    const out = await renderBody()
    expect(out).toContain('일부 일정을 불러오지 못했어요')
    expect(out).toContain(SCHEDULE_SOURCE_NOTICES.cards)
    expect(out).toContain(SCHEDULE_SOURCE_NOTICES.signals)
    expect(out).not.toContain(SCHEDULE_SOURCE_NOTICES.missions)
    expect(out).toContain('새로 고쳐 다시 불러와 주세요')
    // 달력은 그대로
    expect(out).toContain('운영 카드')
    expect(out).not.toContain('미편성')
  })

  it('카드를 못 읽었을 때 「홈피드 카드를 읽지 못해 빠져 있어요」이고 비었다고 단정하지 않는다', async () => {
    hoisted.load.value = loaded(week({ contentCount: 0 }), { cards: '카드 조회 실패(시험)' })
    const out = await renderBody()
    expect(out).toContain('홈피드 카드를 읽지 못해 빠져 있어요')
    expect(out).not.toContain('이 기간에는 올라온 항목이 없어요')
    expect(out).not.toContain('미편성')
  })

  it('신호를 못 읽은 안내는 「신호가 없다는 뜻은 아니에요」를 함께 말한다', () => {
    expect(SCHEDULE_SOURCE_NOTICES.signals).toContain('신호가 없다는 뜻은 아니에요')
  })

  it('카드·미션·운영 항목을 모두 못 읽으면 본문은 안내 카드 하나이고 달력이 없다', async () => {
    hoisted.load.value = loaded(week(), { cards: 'a', missions: 'b', bundles: 'c' })
    const out = await renderBody()
    expect(out).toContain('일정을 불러오지 못했어요')
    expect(out).toContain('새로 고치기')
    expect(out).not.toContain('@container')
    expect(out).not.toContain('일부 일정을')
  })

  it('카드·미션만 못 읽고 운영 항목은 읽었으면 달력이 그대로 있다', async () => {
    hoisted.load.value = loaded(week({}, { '2026-10-06': { items: [item()] } }), { cards: 'a', missions: 'b' })
    const out = await renderBody()
    expect(out).toContain('@container')
    expect(out).toContain('운영 카드')
  })

  it('읽기 자체가 던지면 구역 안내 카드이고 서버 로그에 남는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    hoisted.load.error = new Error('서비스 키가 없어요(시험)')
    const out = await renderBody()
    expect(out).toContain('일정을 불러오지 못했어요')
    expect(out).toContain('새로 고치기')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('본문 — 빈 기간', () => {
  it('오늘이 없는 주가 비어 있으면 「이 기간에는 올라온 항목이 없어요」 + [오늘로 이동]이다', async () => {
    const lastWeek = '2026-09-28'
    hoisted.load.value = loaded(week({ contentCount: 0 }, {}, lastWeek))
    const out = await renderBody({ date: lastWeek, sample: '1' })
    expect(out).toContain('이 기간에는 올라온 항목이 없어요')
    expect(out).toContain('href="/admin/ops-schedule?view=week&amp;date=2026-10-07&amp;sample=1"')
    expect(out).toContain('오늘로 이동')
    // 달력(날 칸 「일정 없음」)은 그대로 있다
    expect(out).toContain('일정 없음')
  })

  it('오늘이 그 주에 있으면 이동 버튼은 없다', async () => {
    hoisted.load.value = loaded(week({ contentCount: 0 }))
    const out = await renderBody({ date: '2026-10-07' })
    expect(out).toContain('이 기간에는 올라온 항목이 없어요')
    expect(out).not.toContain('오늘로 이동')
  })

  it('항목이 하나라도 있으면 빈 안내가 없다', async () => {
    expect(await renderBody({ date: '2026-10-07' })).not.toContain('이 기간에는 올라온 항목이 없어요')
  })

  it('자동 실행만 있는 주도 비어 있다(자동 실행은 올라온 항목이 아니다)', async () => {
    hoisted.load.value = loaded(
      week({ contentCount: 0 }, { '2026-10-06': { automation: [{ id: 'c', time: '09:00', label: 'POI 정리', routine: false, dim: false }] } })
    )
    const out = await renderBody({ date: '2026-10-07' })
    expect(out).toContain('이 기간에는 올라온 항목이 없어요')
    expect(out).toContain('자동 실행 1개')
  })
})
