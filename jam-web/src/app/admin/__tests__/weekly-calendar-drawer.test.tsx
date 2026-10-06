/**
 * 주간 캘린더의 서랍 모드 (티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 「칸 머리를 누르면 날짜 서랍, 항목을 누르면 항목 서랍」)
 *
 * 저장소에 jsdom·testing-library가 없어(`weekly-calendar.test.tsx`와 같은 방식) `renderToStaticMarkup`으로 그린 모양을 고정한다. 클릭은 브라우저 동작이라
 * 여기서 다루지 않는다(서랍을 여는 값·포커스 복귀 선택자는 `lib/admin/opsSchedule/__tests__/drawerParams.test.ts`가 지킨다).
 *
 * 지키는 것:
 * - 칸 머리·항목·미션 막대(넓은 달력·좁은 목록 모두)가 링크가 아니라 서랍을 여는 버튼이다. 버튼마다 `data-drawer-trigger`가 있고 보조 기기용 「서랍 열기」 글자가 붙는다
 * - 선택한 항목·날짜 머리는 `aria-current="true"`와 왼쪽 굵은 선·배경이다. 상태가 방금 바뀐 항목은 잔상 배경이다(선택과 겹쳐 그리지 않는다)
 * - 서랍 키가 없는 항목(자동 실행)은 눌리지 않고, 옛 카드·미션 키(`card:`·`mission:`)도 같은 방식이다
 * - 버튼은 포커스 표시가 있고 40rem 미만에서는 44px 높이다
 * - 서랍을 주지 않으면 서랍 표식이 하나도 없다(③-a 출력 그대로)
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

import WeeklyCalendar, { type CalendarColumn, type CalendarDrawerControl } from '../ops-schedule/WeeklyCalendar'
import { OPS_ITEM_STATUS_LABELS } from '@/lib/admin/opsInbox/labels'

const ITEM_KEY = '3f2a9c1e-0000-4000-8000-0000000000a1'
const OTHER_KEY = '3f2a9c1e-0000-4000-8000-0000000000b2'

const ops = {
  id: 'ops-1',
  time: '09:30',
  label: '운영 카드',
  itemKind: 'home_feed_card',
  status: 'reviewing',
  isSample: true,
  note: '노출 3 · 열람 1',
  href: '/admin/ops-inbox/b1?item=i1',
  drawerKey: ITEM_KEY,
}

function column(over: Partial<CalendarColumn> = {}): CalendarColumn {
  return { date: '2026-10-06', weekdayLabel: '화', dateLabel: '10월 6일', items: [ops], ...over }
}

function render(columns: CalendarColumn[], props: Partial<ComponentProps<typeof WeeklyCalendar>> = {}): string {
  return renderToStaticMarkup(
    <WeeklyCalendar columns={columns} {...props} />
  )
}

/** React가 인접한 글자 사이에 넣는 주석 표식을 지운다. */
const plain = (markup: string) => markup.replace(/<!-- -->/g, '')
/** 태그를 벗겨 읽히는 글자만 남긴다. */
const text = (markup: string) => plain(markup).replace(/<[^>]+>/g, '')

const control = (over: Partial<CalendarDrawerControl> = {}): CalendarDrawerControl => ({ onOpen: vi.fn(), selected: null, ...over })

/** 서랍을 여는 버튼 하나(여는 태그부터 닫는 태그까지)를 돌려준다. 없으면 빈 글자다. */
function buttonOf(out: string, trigger: string): string {
  const start = out.indexOf(`data-drawer-trigger="${trigger}"`)
  if (start === -1) return ''
  const open = out.lastIndexOf('<button', start)
  return out.slice(open, out.indexOf('</button>', start) + '</button>'.length)
}

describe('항목·칸 머리', () => {
  it('항목은 서랍을 여는 버튼이고 항목 링크(href)는 칸 안에 없다', () => {
    const out = render([column()], { adaptive: true, drawer: control() })
    const button = buttonOf(out, `item:${ITEM_KEY}`)
    expect(button).toContain('type="button"')
    expect(button).toContain('운영 카드')
    expect(button).toContain('노출 3 · 열람 1')
    expect(button).toContain(OPS_ITEM_STATUS_LABELS.reviewing)
    expect(button).toContain('시험</span>')
    expect(plain(button)).toContain('서랍 열기')
    expect(out).not.toContain('href="/admin/ops-inbox/b1?item=i1"')
    expect(out).toContain(`data-drawer-key="${ITEM_KEY}"`)
  })

  it('칸 머리는 날짜 서랍을 여는 버튼이고 날짜·오늘·신호 칩이 한 버튼 안에 있다', () => {
    const out = render([column({ isToday: true, signal: { level: 'stop', count: 2 } })], { adaptive: true, drawer: control() })
    const head = buttonOf(out, 'day:2026-10-06')
    expect(text(head)).toContain('화 10월 6일')
    expect(head).toContain('오늘')
    expect(head).toContain('2건')
    expect(head).toContain('tabler-icon')
    expect(plain(head)).toContain('서랍 열기')
  })

  it('신호도 오늘 표시도 없는 칸 머리도 버튼이다(날짜마다 서랍을 열 수 있다)', () => {
    const out = render([column({ items: [] })], { adaptive: true, drawer: control() })
    expect(buttonOf(out, 'day:2026-10-06')).not.toBe('')
  })

  it('서랍 키가 없는 항목(자동 실행)은 눌리지 않는다', () => {
    const out = render([column({ items: [], automationItems: [{ id: 'cron-1', time: '09:00', label: 'POI 정리' }] })], { drawer: control() })
    expect(out).toContain('POI 정리')
    expect(out.match(/data-drawer-trigger="item:/g)).toBeNull()
  })

  it('옛 카드·미션 키(card:·mission:)도 같은 방식으로 버튼이다', () => {
    const legacy = { id: 'card-1', time: 'T03', label: '옛 카드', kind: 'card' as const, itemKind: 'home_feed_card', drawerKey: `card:${ITEM_KEY}` }
    const out = render([column({ items: [legacy] })], { drawer: control() })
    expect(buttonOf(out, `item:card:${ITEM_KEY}`)).toContain('옛 카드')
  })

  it('버튼은 포커스 표시가 있고 40rem 미만에서는 44px 높이다', () => {
    const out = render([column()], { adaptive: true, drawer: control() })
    const button = buttonOf(out, `item:${ITEM_KEY}`)
    expect(button).toContain('focus-visible:ring-2')
    expect(button).toContain('min-h-11')
    expect(button).toContain('@[40rem]:min-h-0')
    const head = buttonOf(out, 'day:2026-10-06')
    expect(head).toContain('focus-visible:ring-2')
    expect(head).toContain('min-h-11')
  })
})

describe('선택과 잔상', () => {
  it('선택한 항목은 aria-current와 왼쪽 굵은 선·배경이고 나머지는 아니다', () => {
    const other = { ...ops, id: 'ops-2', drawerKey: OTHER_KEY }
    const out = render([column({ items: [ops, other] })], { drawer: control({ selected: { kind: 'item', key: ITEM_KEY } }) })
    expect(buttonOf(out, `item:${ITEM_KEY}`)).toContain('aria-current="true"')
    expect(buttonOf(out, `item:${OTHER_KEY}`)).not.toContain('aria-current')
    // 선택은 그 항목 한 줄뿐이다
    expect(out.match(/border-foreground bg-muted/g)).toHaveLength(1)
  })

  it('날짜 서랍이 열려 있으면 그 날짜의 칸 머리가 선택이다', () => {
    const out = render([column({ date: '2026-10-06' }), column({ date: '2026-10-07', weekdayLabel: '수', dateLabel: '10월 7일' })], {
      drawer: control({ selected: { kind: 'day', date: '2026-10-07' } }),
    })
    expect(buttonOf(out, 'day:2026-10-07')).toContain('aria-current="true"')
    expect(buttonOf(out, 'day:2026-10-06')).not.toContain('aria-current')
  })

  it('상태가 방금 바뀐 항목은 잔상 배경이고, 선택된 항목은 겹쳐 그리지 않는다', () => {
    const flashing = render([column()], { drawer: control({ flashingKeys: new Set([ITEM_KEY]) }) })
    expect(flashing).toMatch(/<li[^>]*data-drawer-key="[^"]*"[^>]*class="[^"]*\bbg-muted\b/)
    const notFlashing = render([column()], { drawer: control() })
    expect(notFlashing).not.toMatch(/<li[^>]*data-drawer-key="[^"]*"[^>]*class="[^"]*\bbg-muted\b/)
    const both = render([column()], { drawer: control({ selected: { kind: 'item', key: ITEM_KEY }, flashingKeys: new Set([ITEM_KEY]) }) })
    expect(both.match(/border-foreground bg-muted/g)).toHaveLength(1)
  })
})

describe('미션 막대', () => {
  const bar = {
    id: 'ops-i1',
    title: '운영 미션',
    startCol: 1,
    endCol: 2,
    startsThisWeek: true,
    endsThisWeek: false,
    isGate: false,
    status: 'scheduled',
    isSample: false,
    href: '/admin/ops-inbox/b1?item=i1',
    drawerKey: ITEM_KEY,
  }
  const legacyBar = {
    id: 'm2',
    title: '옛 미션',
    startCol: 0,
    endCol: 0,
    startsThisWeek: false,
    endsThisWeek: true,
    isGate: false,
    status: null,
    drawerKey: `mission:${ITEM_KEY}`,
  }
  const days = [
    column({ date: '2026-10-05', weekdayLabel: '월', dateLabel: '10월 5일', items: [] }),
    column({ date: '2026-10-06', weekdayLabel: '화', dateLabel: '10월 6일', items: [] }),
    column({ date: '2026-10-07', weekdayLabel: '수', dateLabel: '10월 7일', items: [] }),
  ]

  it('막대는 서랍을 여는 버튼이고 열 위치는 그대로다(링크가 아니다)', () => {
    const out = render(days, { missionBars: [bar, legacyBar], adaptive: true, drawer: control() })
    const wide = buttonOf(out, `item:${ITEM_KEY}`)
    expect(wide).toContain('style="grid-column:2 / 4"')
    expect(wide).toContain('운영 미션')
    expect(wide).toContain(OPS_ITEM_STATUS_LABELS.scheduled)
    expect(buttonOf(out, `item:mission:${ITEM_KEY}`)).toContain('style="grid-column:1 / 2"')
    expect(out).not.toContain('href="/admin/ops-inbox/b1?item=i1"')
    expect(out).not.toContain('href="/admin/missions/m2"')
  })

  it('좁은 달력의 막대 목록도 버튼이고 기간 글자가 붙는다', () => {
    const out = render(days, { missionBars: [bar], adaptive: true, drawer: control() })
    const narrow = out.slice(out.indexOf('<ul class="mb-2 space-y-1 @[56rem]:hidden">'))
    expect(narrow).toContain('data-drawer-trigger')
    expect(plain(narrow)).toContain('10월 6일 ~ 10월 7일')
  })

  it('선택한 막대는 aria-current이고, 서랍 키가 없는 막대는 옛 링크 그대로다', () => {
    const out = render(days, {
      missionBars: [bar, { ...legacyBar, drawerKey: undefined }],
      drawer: control({ selected: { kind: 'item', key: ITEM_KEY } }),
    })
    expect(buttonOf(out, `item:${ITEM_KEY}`)).toContain('aria-current="true"')
    expect(out).toContain('href="/admin/missions/m2"')
  })
})

describe('서랍을 주지 않을 때', () => {
  it('서랍 표식이 하나도 없고 항목은 옛처럼 링크다(③-a 출력 그대로)', () => {
    const out = render([column({ signal: { level: 'warn', count: 1 }, isToday: true })], { adaptive: true })
    expect(out).not.toContain('data-drawer-trigger')
    expect(out).not.toContain('서랍 열기')
    expect(out).toContain('href="/admin/ops-inbox/b1?item=i1"')
  })
})
