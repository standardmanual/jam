/**
 * 주간 캘린더 컴포넌트 (티켓 20260924_0904~0908 옛 모드, 티켓 20261006_1536 ③-a 일정표 확장)
 *
 * 저장소에 jsdom·testing-library가 없어(`app/admin/__tests__/home-sections.test.tsx`와 같은 방식) `renderToStaticMarkup`으로 그려 모양을 고정한다.
 *
 * 지키는 것:
 * - **옛 모드 출력은 그대로다**: 확장 속성을 하나도 주지 않으면 운영 홈이 그리던 마크업과 글자 단위로 같다
 *   (`fixtures/weekly-calendar-old-mode.html`은 확장 전 컴포넌트가 아래 `OLD_MODE_PROPS`로 그린 실제 출력이다).
 * - 확장은 모두 선택이다: 항목 종류·상태·시험 칩, 칸 머리 신호 칩, 오늘 표시, 장기 카드 줄의 비활성 수, 「자동 실행 N개」 접힘 줄, 이전·다음 주 이동 끄기, 달력 폭에 맞는 7열↔날짜별 가로 줄
 * - 신호·상태는 색만이 아니라 아이콘 + 글자로 말한다
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ComponentProps } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

import WeeklyCalendar, { type CalendarColumn } from '../WeeklyCalendar'
import { OPS_ITEM_STATUS_LABELS } from '@/lib/admin/opsInbox/labels'

const OLD_MODE_MARKUP = readFileSync(path.join(__dirname, 'fixtures/weekly-calendar-old-mode.html'), 'utf8')

const OLD_MODE_PROPS = {
  weekStart: '2026-09-21',
  weekRangeLabel: '2026년 9월 21일 ~ 9월 27일',
  columns: [
    {
      date: '2026-09-21',
      weekdayLabel: '월',
      dateLabel: '9월 21일',
      items: [
        { id: 'card-1', time: 'T03', label: '카드 하나', kind: 'card' as const, href: '/admin/today/1?date=2026-09-21', note: '노출 3 · 열람 1' },
        { id: 'card-2', time: '유형 없음', label: '꺼진 카드', kind: 'card' as const, dim: true },
        { id: 'mission-1', time: '상시', label: '새 상시 미션', kind: 'mission' as const, href: '/admin/missions/1' },
        { id: 'cron-1', time: '09:00', label: 'POI 정리' },
        { id: 'routine-1', time: '10:00', label: '주간 루틴', kind: 'routine' as const, dim: true },
      ],
      longCardsCount: 2,
      unprogrammed: false,
    },
    { date: '2026-09-22', weekdayLabel: '화', dateLabel: '9월 22일', items: [], unprogrammed: true },
    { date: '2026-09-23', weekdayLabel: '수', dateLabel: '9월 23일', items: [] },
  ],
  missionBars: [
    { id: 'm1', title: '기간 미션', startCol: 0, endCol: 2, startsThisWeek: true, endsThisWeek: false, isGate: true },
    { id: 'm2', title: '다른 미션', startCol: 1, endCol: 1, startsThisWeek: false, endsThisWeek: true, isGate: false },
  ],
  openEndedMissionCount: 5,
}

function column(over: Partial<CalendarColumn> = {}): CalendarColumn {
  return { date: '2026-10-06', weekdayLabel: '화', dateLabel: '10월 6일', items: [], ...over }
}

function render(columns: CalendarColumn[], props: Partial<ComponentProps<typeof WeeklyCalendar>> = {}): string {
  return renderToStaticMarkup(
    <WeeklyCalendar weekStart="2026-10-05" weekRangeLabel="2026년 10월 5일 ~ 10월 11일" columns={columns} {...props} />
  )
}

/** React가 인접한 글자 사이에 넣는 주석 표식을 지운다. */
const plain = (markup: string) => markup.replace(/<!-- -->/g, '')

describe('WeeklyCalendar — 옛 모드(운영 홈)', () => {
  it('확장 속성을 주지 않으면 확장 전 출력과 글자 단위로 같다', () => {
    expect(renderToStaticMarkup(<WeeklyCalendar {...OLD_MODE_PROPS} />)).toBe(OLD_MODE_MARKUP)
  })

  it('옛 모드에는 확장의 흔적이 없다(오늘·신호·접힘 줄·컨테이너 클래스·aria-current)', () => {
    for (const marker of ['오늘', 'aria-current', '<details', '@container', '@[56rem]', 'data-drawer-key', '비활성']) {
      expect(OLD_MODE_MARKUP, marker).not.toContain(marker)
    }
    expect(OLD_MODE_MARKUP).toContain('aria-label="이전 주"')
    expect(OLD_MODE_MARKUP).toContain('미편성')
  })
})

describe('WeeklyCalendar — 이동·틀', () => {
  it('nav={false}면 이전·다음 주 이동을 그리지 않는다', () => {
    const out = render([column()], { nav: false })
    expect(out).not.toContain('aria-label="이전 주"')
    expect(out).not.toContain('aria-label="다음 주"')
    expect(out).not.toContain('2026년 10월 5일 ~ 10월 11일')
  })

  it('adaptive면 달력 영역이 컨테이너이고 56rem 이상은 7열·미만은 날짜별 가로 줄이다', () => {
    const out = render([column()], { adaptive: true })
    expect(out).toContain('class="mb-10 @container"')
    expect(out).toContain('grid-cols-1 @[56rem]:grid-cols-7')
    expect(out).toContain('grid-cols-[6rem_minmax(0,1fr)]')
    expect(out).toContain('@[56rem]:block')
    expect(out).toContain('min-w-0')
  })

  it('adaptive가 아니면 컨테이너 클래스가 없다', () => {
    expect(render([column()])).not.toContain('@container')
  })
})

describe('WeeklyCalendar — 항목(종류·상태·시험)', () => {
  const ops = {
    id: 'ops-1',
    time: '09:30',
    label: '운영 카드',
    itemKind: 'home_feed_card',
    status: 'reviewing',
    isSample: true,
    href: '/admin/ops-inbox/b1?item=i1',
    drawerKey: 'i1',
  }

  it('종류 아이콘(보조 기기용 글자 포함)·시각·제목 / 상태 칩 + 시험 칩 두 줄이다', () => {
    const out = render([column({ items: [ops] })])
    expect(out).toContain('tabler-icon')
    expect(out).toContain('<span class="sr-only">홈피드 카드</span>')
    expect(out).toContain('>09:30<')
    expect(out).toContain('운영 카드')
    expect(out).toContain(OPS_ITEM_STATUS_LABELS.reviewing)
    expect(out).toContain('시험</span>')
    expect(out).toContain('href="/admin/ops-inbox/b1?item=i1"')
    expect(out).toContain('data-drawer-key="i1"')
  })

  it('상태는 아이콘과 글자를 함께 그린다(색만으로 나누지 않는다)', () => {
    const out = render([column({ items: [{ ...ops, status: 'live', isSample: false }] })])
    expect(out).toMatch(/<span class="[^"]*rounded-full[^"]*"><svg[^>]*aria-hidden="true"[^>]*>.*<\/svg>게재중<\/span>/)
    expect(out).not.toContain('시험</span>')
  })

  it('이어지는 날(시각이 빈 글자)은 시각 칸을 그리지 않는다', () => {
    const out = render([column({ items: [{ ...ops, time: '', isSample: false }] })])
    expect(out).not.toContain('font-mono')
  })

  it('옛 카드(종류 아이콘만 있고 상태가 없다)는 상태 칩이 없고 흐림·노출 줄이 그대로다', () => {
    const out = render([
      column({
        items: [{ id: 'c1', time: 'T03', label: '꺼진 카드', itemKind: 'home_feed_card', dim: true, note: '노출 1 · 열람 0', href: '/admin/today/c1?date=2026-10-06' }],
      }),
    ])
    expect(out).toContain('opacity-40')
    expect(out).toContain('노출 1 · 열람 0')
    for (const label of Object.values(OPS_ITEM_STATUS_LABELS)) expect(out).not.toContain(`${label}</span>`)
  })

  it('모르는 상태 값은 「상태 확인 필요」로 그린다', () => {
    expect(render([column({ items: [{ ...ops, status: 'weird' }] })])).toContain('상태 확인 필요')
  })

  it('제목의 HTML은 글자로만 그린다', () => {
    const out = render([column({ items: [{ ...ops, label: '<img src=x onerror=alert(1)>' }] })])
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })
})

describe('WeeklyCalendar — 칸 머리(오늘·신호)', () => {
  it('오늘 칸은 「오늘」 글자와 굵은 테두리와 aria-current다', () => {
    const out = render([column({ isToday: true }), column({ date: '2026-10-07', dateLabel: '10월 7일' })])
    expect(out.match(/aria-current="date"/g)).toHaveLength(1)
    expect(out).toContain('>오늘<')
    expect(out).toContain('border-foreground ring-1 ring-foreground')
  })

  it('신호 칩은 그날 가장 높은 수준 하나와 건수다(아이콘 + 글자)', () => {
    const out = plain(render([column({ signal: { level: 'stop', count: 3 } })]))
    expect(out).toContain('중단</span>')
    expect(out).toContain('>3건<')
    expect(out.match(/rounded-full/g)).toHaveLength(1)
    expect(out).toMatch(/<svg[^>]*aria-hidden="true"/)
  })

  it('신호가 없거나 null이면 칩이 없다', () => {
    for (const signal of [undefined, null]) {
      const out = render([column({ signal })])
      expect(out).not.toContain('rounded-full')
      expect(out).not.toContain('건<')
    }
  })

  it('오늘이 아니고 신호도 없는 칸의 머리는 옛 모양 그대로다', () => {
    expect(render([column()])).toContain(
      '<p class="text-xs font-semibold text-muted-foreground mb-2">화 <span class="font-normal">10월 6일</span></p>'
    )
  })
})

describe('WeeklyCalendar — 장기 카드 줄(1151)', () => {
  it('비활성 장기 카드가 있으면 「장기 카드 N장 · 비활성 M장」이다', () => {
    const out = render([column({ longCardsCount: 2, longInactiveCount: 1 })])
    expect(out).toContain('href="/admin/today?date=2026-10-06"')
    expect(plain(out)).toContain('장기 카드 2장 · 비활성 1장')
  })

  it('활성 장기 카드가 없고 비활성만 있어도 줄이 있다', () => {
    expect(plain(render([column({ longInactiveCount: 2 })]))).toContain('장기 카드 0장 · 비활성 2장')
  })

  it('비활성이 없는 날은 지금과 같다', () => {
    const out = plain(render([column({ longCardsCount: 2, longInactiveCount: 0 })]))
    expect(out).toContain('장기 카드 2장</a>')
    expect(out).not.toContain('비활성')
  })

  it('장기 카드만 있는 칸은 「일정 없음」이 아니다', () => {
    expect(render([column({ longInactiveCount: 1 })])).not.toContain('일정 없음')
  })
})

describe('WeeklyCalendar — 자동 실행 접힘 줄(승인 #14)', () => {
  const automation = [
    { id: 'cron-1', time: '09:00', label: 'POI 정리' },
    { id: 'routine-1', time: '10:00', label: '주간 루틴', kind: 'routine' as const, dim: true },
  ]

  it('칸 항목과 따로 「자동 실행 N개」 접힘 줄에 들어간다(처음에는 접혀 있다)', () => {
    const out = render([column({ items: [{ id: 'a', time: '12:00', label: '카드', itemKind: 'home_feed_card' }], automationItems: automation })])
    expect(out).toContain('<details')
    expect(out).not.toContain('<details open')
    expect(plain(out)).toContain('자동 실행 2개')
    const [before, folded] = out.split('<details')
    expect(before).toContain('카드')
    expect(before).not.toContain('POI 정리')
    expect(folded).toContain('POI 정리')
    expect(folded).toContain('주간 루틴')
    expect(folded).toContain('루틴</span>')
  })

  it('자동 실행만 있는 칸도 「일정 없음」과 접힘 줄이 함께 있다', () => {
    const out = render([column({ automationItems: automation })])
    expect(out).toContain('일정 없음')
    expect(out).toContain('<details')
  })

  it('자동 실행이 없으면 접힘 줄이 없다', () => {
    expect(render([column({ automationItems: [] })])).not.toContain('<details')
  })

  it('접힘 표시 아이콘은 장식이고 모션을 줄이는 설정이면 회전 전환이 없다', () => {
    const out = render([column({ automationItems: automation })])
    expect(out).toMatch(/<svg[^>]*class="[^"]*group-open:rotate-90[^"]*motion-reduce:transition-none[^"]*"[^>]*aria-hidden="true"/)
  })
})

describe('WeeklyCalendar — 미션 막대', () => {
  const bars = [
    {
      id: 'ops-i1',
      title: '운영 미션',
      startCol: 1,
      endCol: 2,
      startsThisWeek: true,
      endsThisWeek: false,
      isGate: false,
      status: 'scheduled',
      isSample: true,
      href: '/admin/ops-inbox/b1?item=i1',
      drawerKey: 'i1',
    },
    { id: 'm2', title: '옛 미션', startCol: 0, endCol: 0, startsThisWeek: false, endsThisWeek: true, isGate: true, status: null },
  ]
  const days = [
    column({ date: '2026-10-05', weekdayLabel: '월', dateLabel: '10월 5일' }),
    column({ date: '2026-10-06', weekdayLabel: '화', dateLabel: '10월 6일' }),
    column({ date: '2026-10-07', weekdayLabel: '수', dateLabel: '10월 7일' }),
  ]

  it('운영 미션 막대에는 상태·시험 칩과 운영 항목 링크가 붙고 옛 미션은 옛 링크다', () => {
    const out = render(days, { missionBars: bars })
    expect(out).toContain('href="/admin/ops-inbox/b1?item=i1"')
    expect(out).toContain(`${OPS_ITEM_STATUS_LABELS.scheduled}</span>`)
    expect(out).toContain('시험</span>')
    expect(out).toContain('href="/admin/missions/m2"')
    expect(out).toContain('style="grid-column:2 / 4"')
    expect(out).toContain('게이트')
  })

  it('adaptive는 넓은 달력에는 7열 막대, 좁은 달력에는 기간 글자가 붙은 목록을 둔다', () => {
    const out = render(days, { missionBars: bars, adaptive: true })
    expect(out).toContain('hidden @[56rem]:grid')
    expect(out).toContain('@[56rem]:hidden')
    expect(plain(out)).toContain('10월 6일 ~ 10월 7일')
  })

  it('상시 미션 수는 그대로 링크다', () => {
    expect(render(days, { openEndedMissionCount: 4 })).toContain('상시 미션 4개')
  })
})
