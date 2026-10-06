/**
 * 일정표 서랍 배치 (티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 서랍)
 *
 * 저장소에 jsdom·testing-library가 없어(`ops-schedule.test.tsx`와 같은 방식) 보기 래퍼(`OpsScheduleBoard`)를 `renderToStaticMarkup`으로 그려 모양을 고정한다.
 * 주소의 서랍 값은 `useSearchParams` 가짜로 넣는다(실제 주소를 바꾸는 `replaceState`·포커스 이동은 브라우저 동작이라 카리나가 실렌더로 본다).
 *
 * 지키는 것:
 * - 서랍이 닫혀 있으면 서랍 틀도 2열 배치도 없다
 * - `?drawer=day&date=`·`?drawer=item&item=`으로 열린 서랍은 **달력의 형제 요소**다: 딤·`fixed`가 없고 달력 칸이 그대로 DOM에 남는다
 * - 68rem 이상이면 `[달력 | 28rem 서랍]` 2열, 좁으면 쌓인다(그리드 클래스는 서랍이 열렸을 때만). 서랍이 열려도 달력은 컨테이너 쿼리로 56rem 미만에서 날짜별 가로 줄이 된다
 * - 선택한 칸 머리·항목은 `aria-current`이고 닫으면 돌아올 칸은 `data-drawer-trigger`로 남는다
 * - 옛 카드·미션 키(`card:`·`mission:`)와 없는 항목도 열리며 달력은 그대로다
 * - 페이지는 같은 주 안에서 `date`가 바뀌어도 본문을 다시 만들지 않는다(Suspense key가 기준일이 아니라 기간의 시작일이다)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Suspense, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'

const hoisted = vi.hoisted(() => ({ search: '' }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-schedule',
  useSearchParams: () => new URLSearchParams(hoisted.search),
}))

vi.mock('../../_home/sections', () => ({
  SampleSwitchSection: () => <div data-section="switch" />,
}))

import OpsSchedulePage from '../page'
import { OpsScheduleBoard } from '../OpsScheduleBoard'
import type { ScheduleDay, ScheduleItem, ScheduleWeek } from '@/lib/admin/opsSchedule/weekView'
import { shiftDateStr } from '@/lib/admin/today-calendar'

const WEEK_START = '2026-10-05'
const ITEM_ID = '3f2a9c1e-0000-4000-8000-0000000000a1'
const CARD_ID = '3f2a9c1e-0000-4000-8000-0000000000c1'

function opsItem(over: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: `ops-${ITEM_ID}-2026-10-06`,
    origin: 'ops',
    drawerKey: ITEM_ID,
    kind: 'home_feed_card',
    title: '운영 카드',
    time: '09:30',
    status: 'scheduled',
    isSample: false,
    dim: false,
    href: `/admin/ops-inbox/b1?item=${ITEM_ID}`,
    note: null,
    ...over,
  }
}

function legacyCard(): ScheduleItem {
  return {
    id: `card-${CARD_ID}-2026-10-06`,
    origin: 'card',
    drawerKey: `card:${CARD_ID}`,
    kind: 'home_feed_card',
    title: '옛 카드 제목',
    time: 'T03',
    status: null,
    isSample: false,
    dim: false,
    href: `/admin/today/${CARD_ID}?date=2026-10-06`,
    note: '노출 3 · 열람 1',
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

function week(): ScheduleWeek {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateStr(WEEK_START, index)
    return day(date, date === '2026-10-06' ? { items: [opsItem(), legacyCard()] } : {})
  })
  return { weekStart: WEEK_START, weekEnd: '2026-10-11', days, missionBars: [], openEndedMissionCount: 0, contentCount: 2 }
}

function board(search: string, sourceErrors: ComponentProps<typeof OpsScheduleBoard>['sourceErrors'] = {}): string {
  hoisted.search = search
  return renderToStaticMarkup(<OpsScheduleBoard week={week()} sourceErrors={sourceErrors} />)
}

const WIDE_GRID = '@[68rem]:grid-cols-[minmax(0,1fr)_28rem]'

beforeEach(() => {
  hoisted.search = ''
})

describe('서랍이 닫혀 있을 때', () => {
  it('서랍 틀도 2열 배치도 없고 달력만 있다', () => {
    const out = board('view=week&date=2026-10-06')
    expect(out).not.toContain('<aside')
    expect(out).not.toContain(WIDE_GRID)
    expect(out).toContain('data-drawer-trigger="day:2026-10-06"')
    expect(out).not.toContain('aria-current="true"')
  })

  it('항목 서랍 값이 틀리면(UUID가 아닌 키) 닫혀 있다', () => {
    expect(board('drawer=item&item=not-a-uuid')).not.toContain('<aside')
    expect(board('drawer=item')).not.toContain('<aside')
  })
})

describe('날짜 서랍(?drawer=day&date=)', () => {
  const out = () => board('view=week&date=2026-10-06&drawer=day')

  it('서랍은 달력의 형제 요소이고 달력 칸 7개가 그대로 DOM에 남는다', () => {
    const markup = out()
    expect(markup).toContain('<aside aria-label="서랍 · 10월 6일(화)"')
    // 달력 영역(section)이 끝난 바로 뒤에 같은 그리드의 다음 칸으로 서랍이 온다
    expect(markup).toMatch(/<\/section><\/div><aside /)
    expect(markup.indexOf('</section>')).toBeLessThan(markup.indexOf('<aside'))
    for (let index = 0; index < 7; index += 1) expect(markup).toContain(`data-drawer-trigger="day:${shiftDateStr(WEEK_START, index)}"`)
    expect(markup).toContain('운영 카드')
  })

  it('딤과 fixed 배치가 없다', () => {
    const markup = out()
    expect(markup).not.toContain('bg-black/80')
    expect(markup).not.toMatch(/class="[^"]*\bfixed\b/)
    expect(markup).not.toContain('aria-modal')
    expect(markup).not.toContain('role="dialog"')
  })

  it('68rem 이상이면 달력 | 28rem 서랍 2열이고 좁으면 쌓인다(서랍이 열렸을 때만 2열 클래스)', () => {
    const markup = out()
    expect(markup).toContain('class="@container"')
    expect(markup).toContain(`grid grid-cols-1 gap-4 ${WIDE_GRID}`)
    expect(markup).toMatch(/<aside[^>]*class="[^"]*@\[68rem\]:sticky/)
  })

  it('달력은 서랍이 열려도 컨테이너 쿼리로 56rem 미만이면 날짜별 가로 줄이 된다', () => {
    const markup = out()
    expect(markup).toContain('class="mb-10 @container"')
    expect(markup).toContain('grid-cols-1 @[56rem]:grid-cols-7')
    expect(markup).toContain('@[56rem]:block')
  })

  it('열린 날짜의 칸 머리가 선택이다', () => {
    const markup = out()
    const head = markup.slice(markup.indexOf('data-drawer-trigger="day:2026-10-06"') - 40)
    expect(head.slice(0, head.indexOf('</button>'))).toContain('aria-current="true"')
    const other = markup.slice(markup.indexOf('data-drawer-trigger="day:2026-10-07"') - 40)
    expect(other.slice(0, other.indexOf('</button>'))).not.toContain('aria-current')
  })

  it('날짜 서랍 안에 그날 항목이 있고 서랍 닫기 버튼이 있다', () => {
    const markup = out()
    expect(markup).toContain('서랍 닫기')
    expect(markup).toContain('항목 2개')
  })
})

describe('날짜 서랍 — 항목이 0개일 때 못 읽은 재료를 「없다」고 하지 않는다(③-b에서 넘어온 조건, 티켓 20261006_1538)', () => {
  const empty = (sourceErrors: ComponentProps<typeof OpsScheduleBoard>['sourceErrors']) => board('view=week&date=2026-10-08&drawer=day', sourceErrors)

  it('모두 읽었으면 「이 날짜에는 올라온 항목이 없어요」이다', () => {
    const markup = empty({})
    expect(markup).toContain('이 날짜에는 올라온 항목이 없어요')
    expect(markup).not.toContain('일부 항목을 읽지 못해')
  })

  it('카드·미션·묶음 중 하나라도 못 읽었으면 「일부 항목을 읽지 못해 빠져 있을 수 있어요」만 보이고 「없어요」 단정은 없다', () => {
    for (const source of ['cards', 'missions', 'bundles'] as const) {
      const markup = empty({ [source]: '읽기 실패' })
      expect(markup, source).toContain('일부 항목을 읽지 못해 빠져 있을 수 있어요')
      expect(markup, source).not.toContain('올라온 항목이 없어요')
      expect(markup, source).not.toContain('항목 0개')
    }
  })

  it('항목이 있는 날짜는 못 읽은 재료가 있어도 항목 목록과 안내가 함께 보인다', () => {
    const markup = board('view=week&date=2026-10-06&drawer=day', { cards: '읽기 실패' })
    expect(markup).toContain('항목 2개')
    expect(markup).toContain('일부 항목을 읽지 못해 빠져 있을 수 있어요')
    expect(markup).toContain('운영 카드')
  })
})

describe('항목 서랍(?drawer=item&item=)', () => {
  it('운영 항목 서랍은 받는 중 상태로 열리고 달력의 그 항목이 선택이다', () => {
    const markup = board(`view=week&date=2026-10-06&drawer=item&item=${ITEM_ID}`)
    expect(markup).toContain('<aside aria-label="서랍"')
    expect(markup).toContain('aria-label="불러오는 중"')
    expect(markup).toMatch(/<\/section><\/div><aside /)
    expect(markup).toMatch(new RegExp(`data-drawer-trigger="item:${ITEM_ID}"[^>]*aria-current="true"|aria-current="true"[^>]*data-drawer-trigger="item:${ITEM_ID}"`))
    expect(markup).toContain(WIDE_GRID)
  })

  it('옛 카드 서랍은 이미 읽은 주간 데이터로 바로 그린다', () => {
    const markup = board(`view=week&date=2026-10-06&drawer=item&item=card:${CARD_ID}`)
    expect(markup).toContain('서랍 · 홈피드 카드 「옛 카드 제목」')
    expect(markup).toContain('카드 상세 열기')
    expect(markup).toContain('운영 카드') // 달력은 그대로
  })

  it('주소의 서랍 키는 대소문자를 가리지 않고 달력의 그 항목을 선택한다', () => {
    const markup = board(`view=week&date=2026-10-06&drawer=item&item=${ITEM_ID.toUpperCase()}`)
    expect(markup).toContain('<aside')
    expect(markup).toMatch(/aria-current="true"/)
  })

  it('이 주에 없는 옛 카드는 서랍 안에서만 「찾을 수 없는 항목이에요」다', () => {
    const markup = board('view=week&date=2026-10-06&drawer=item&item=card:3f2a9c1e-0000-4000-8000-0000000000ff')
    expect(markup).toContain('찾을 수 없는 항목이에요')
    expect(markup).toContain('data-drawer-trigger="day:2026-10-06"') // 달력은 그대로
  })
})

describe('페이지 — 같은 주 안에서 서랍을 열어도 본문을 다시 만들지 않는다', () => {
  /** 요소 트리에서 `Suspense`의 key를 모은다. */
  function suspenseKeys(node: ReactNode): string[] {
    if (!isValidElement(node)) return Array.isArray(node) ? node.flatMap((child) => suspenseKeys(child)) : []
    const element = node as ReactElement<{ children?: ReactNode }>
    const own = element.type === Suspense && element.key !== null ? [String(element.key)] : []
    return [...own, ...suspenseKeys(element.props.children)]
  }
  const keyOf = async (query: Record<string, string>) =>
    suspenseKeys(await OpsSchedulePage({ searchParams: Promise.resolve(query) })).filter((key) => key.startsWith('week-'))

  it('key는 기준일이 아니라 기간(주)의 시작일이다 — 같은 주의 다른 날짜는 같은 key다', async () => {
    const monday = await keyOf({ view: 'week', date: '2026-10-05' })
    const thursday = await keyOf({ view: 'week', date: '2026-10-08', drawer: 'day' })
    expect(monday).toEqual([`week-${WEEK_START}-false`])
    expect(thursday).toEqual(monday)
  })

  it('다른 주·시험 포함이 바뀌면 key가 바뀐다', async () => {
    const base = await keyOf({ view: 'week', date: '2026-10-05' })
    expect(await keyOf({ view: 'week', date: '2026-10-12' })).not.toEqual(base)
    expect(await keyOf({ view: 'week', date: '2026-10-05', sample: '1' })).not.toEqual(base)
  })
})
