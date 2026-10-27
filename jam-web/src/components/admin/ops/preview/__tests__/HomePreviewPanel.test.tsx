/**
 * 홈피드 미리보기 부품의 그림 (티켓 20261026_2025 2회차)
 *
 * 상태·요청을 맡는 `HomePreviewPanel`은 훅을 쓰고 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 돌릴 수 없다.
 * 값을 받아 그리기만 하는 `HomePreviewPanelView`를 서버 렌더(`renderToStaticMarkup`)로 확인한다. «조건이 바뀌면 다시 부른다»는
 * 요청 주소가 조건에 따라 달라지는지(`homePreviewClient.test.ts`)로 확인한다.
 *
 * 확인하는 것: 7칸 렌더와 «칸의 카드 수 = 휴대폰 틀에 그려지는 카드 수», 조건 줄(트라이브 목록·시간대·특일), 저장된 값이 없는 날의 안내,
 * 실패 문구와 «다시 불러오기», 승인 전 카드의 점선·표시, 「기획 이유 보기」 칩 토글, 카드가 0장인 날.
 *
 * 실행: cd jam-web && npx vitest run src/components/admin/ops/preview/__tests__/HomePreviewPanel.test.tsx
 */
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/today/TodayCardTracker', () => ({
  default: ({ cardId, children }: { cardId: string; children: ReactNode }) => <div data-tracker={cardId}>{children}</div>,
}))

import { TooltipProvider } from '@/components/admin/ui/tooltip'
import {
  EMPTY_DAY_TEXT,
  LOAD_ERROR_TEXT,
  RETRY_LABEL,
  annotationsFor,
  HomePreviewPanelView,
  type HomePreviewPanelViewProps,
} from '../HomePreviewPanel'
import { DEFAULT_CONDITIONS } from '../homePreviewClient'
import { live, makeDay, makeWeek, pending } from './fixtures'

const noop = () => {}

function view(over: Partial<HomePreviewPanelViewProps> = {}) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <HomePreviewPanelView
        fromDate="2026-10-05"
        onFromDateChange={noop}
        conditions={DEFAULT_CONDITIONS}
        onConditionsChange={noop}
        tribes={[{ id: '11111111-1111-4111-8111-111111111111', name: '러너' }]}
        status="ready"
        days={makeWeek()}
        selectedDate="2026-10-07"
        onSelectDate={noop}
        hasBundle={false}
        showRationale={false}
        onShowRationaleChange={noop}
        onRetry={noop}
        {...over}
      />
    </TooltipProvider>,
  ).replace(/<!-- -->/g, '')
}

describe('HomePreviewPanelView — 7칸과 휴대폰 틀', () => {
  it('7칸을 그리고, 선택한 날(10/7, 카드 2장)의 카드만 틀에 그린다 — 칸의 카드 수와 틀의 카드 수가 같다', () => {
    const html = view()
    expect(html.match(/data-day-cell=/g)).toHaveLength(7)
    const week = makeWeek()
    const selected = week.find((d) => d.date === '2026-10-07')!
    const cellCount = Number(new RegExp(`data-day-cell="2026-10-07"[\\s\\S]*?data-day-count[^>]*>(\\d+)<`).exec(html)![1])
    expect(cellCount).toBe(selected.entries.length)
    // 틀에는 선택한 날의 카드 제목만, 한 번씩 나온다
    for (const entry of selected.entries) expect(html.match(new RegExp(entry.card.title, 'g'))).toHaveLength(1)
    for (const other of week.filter((d) => d.date !== '2026-10-07'))
      for (const entry of other.entries) expect(html).not.toContain(entry.card.title)
    expect(html).toContain(`카드 ${selected.entries.length}장`)
    expect(html).toContain('2026년 10월 7일 (수)')
  })

  it('카드는 서비스 카드로 계측 없이 그린다 — 눌러도 이동하는 링크가 없다', () => {
    const html = view()
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('<a ')
  })

  it('다른 날을 선택하면 그 날의 카드가 틀에 그려진다', () => {
    const week = makeWeek()
    const html = view({ selectedDate: '2026-10-09' })
    for (const entry of week[4].entries) expect(html).toContain(entry.card.title)
    expect(week[4].entries.length).toBe(4)
  })

  it('카드가 0장인 날은 안내 문구를 그린다', () => {
    const html = view({ selectedDate: '2026-10-05' })
    expect(html).toContain(EMPTY_DAY_TEXT)
    expect(html).toContain('카드 0장')
  })
})

describe('HomePreviewPanelView — 조건 줄', () => {
  it('트라이브 고르기, 시간대, 날씨, 특일 토글, 신규 유저를 그린다', () => {
    const html = view()
    for (const label of ['시작 날짜', '트라이브', '시간대', '날씨', '특일', '신규 유저']) expect(html).toContain(label)
    for (const label of ['저장된 값', '공휴일', '절기', '기념일']) expect(html).toContain(label)
    // 고르기 목록의 값 글자는 브라우저에서만 채워지므로(Radix Select) 선택지·값 연결은 HomePreviewConditions.test.tsx가 요소 트리로 확인한다
  })

  it('저장된 날씨·특일이 있는 날은 안내 문구가 없다', () => {
    const html = view()
    expect(html).not.toContain('저장된 값이 없어요')
  })

  it('저장된 값이 없는 날(미래)은 «저장된 값이 없어요» 한 줄로 알리고, 직접 고른 항목은 빼고 알린다', () => {
    const future = [makeDay('2026-12-30', [live('f')], { weather: null, specialDays: null, stored: false })]
    const html = view({ days: future, selectedDate: '2026-12-30', fromDate: '2026-12-30' })
    expect(html).toContain('저장된 값이 없어요: 날씨, 특일.')
    const picked = view({
      days: future,
      selectedDate: '2026-12-30',
      conditions: { ...DEFAULT_CONDITIONS, weather: 'clear' },
    })
    expect(picked).toContain('저장된 값이 없어요: 특일.')
    const bothPicked = view({
      days: future,
      selectedDate: '2026-12-30',
      conditions: { ...DEFAULT_CONDITIONS, weather: 'clear', special: ['holiday_today'] },
    })
    expect(bothPicked).not.toContain('저장된 값이 없어요')
  })
})

describe('HomePreviewPanelView — 불러오기 상태', () => {
  it('실패하면 한 줄 오류와 «다시 불러오기»를 보이고 이전 목록은 보이지 않는다(빈 목록으로 보이지도 않는다)', () => {
    const html = view({ status: 'error' })
    expect(html).toContain(LOAD_ERROR_TEXT)
    expect(html).toContain(RETRY_LABEL)
    expect(html).not.toContain('data-day-cell')
    expect(html).not.toContain(EMPTY_DAY_TEXT)
  })

  it('처음 읽는 중이면 «불러오는 중...», 다시 읽는 중에는 이전 목록을 흐리게 남긴다', () => {
    expect(view({ status: 'loading', days: [] })).toContain('불러오는 중...')
    const refetch = view({ status: 'loading' })
    expect(refetch).toContain('aria-busy="true"')
    expect(refetch).toContain('opacity-60')
    expect(refetch).toContain('data-day-cell')
  })
})

describe('HomePreviewPanelView — 승인 전 카드와 기획 이유', () => {
  const day = makeDay('2026-10-08', [
    live('a'),
    pending('p1', [{ kind: 'weather', label: '비 오는 날' }]),
    pending('p2', []),
  ])

  it('승인 전 카드만 점선과 «승인 전»을 두른다', () => {
    const html = view({ days: [day], selectedDate: '2026-10-08' })
    expect(html.match(/data-preview-pending/g)).toHaveLength(2)
    expect(html).toContain('border-dashed')
    expect(html.match(/>승인 전</g)).toHaveLength(2)
    // 칸에도 승인 전 수
    expect(html).toContain('승인 전 2')
  })

  it('«기획 이유 보기»는 묶음이 있을 때만 보이고, 켜기 전에는 이유 칩이 없다', () => {
    expect(view({ days: [day], selectedDate: '2026-10-08', hasBundle: false })).not.toContain('기획 이유 보기')
    const off = view({ days: [day], selectedDate: '2026-10-08', hasBundle: true, showRationale: false })
    expect(off).toContain('기획 이유 보기')
    expect(off).not.toContain('data-rationale-kind')
    expect(off).not.toContain('비 오는 날')
  })

  it('켜면 이유가 있는 카드 위에 이유 칩이 올라온다', () => {
    const on = view({ days: [day], selectedDate: '2026-10-08', hasBundle: true, showRationale: true })
    expect(on.match(/data-rationale-kind="weather"/g)).toHaveLength(1)
    expect(on.indexOf('비 오는 날')).toBeLessThan(on.indexOf('카드 p1'))
  })

  it('annotationsFor: 실제 카드는 null, 승인 전 카드는 pending, 이유는 켠 때만 칩을 단다', () => {
    expect(annotationsFor(day, false).map((a) => a && { pending: a.pending, chips: Boolean(a.chips) })).toEqual([
      null,
      { pending: true, chips: false },
      { pending: true, chips: false },
    ])
    expect(annotationsFor(day, true).map((a) => a && { pending: a.pending, chips: Boolean(a.chips) })).toEqual([
      null,
      { pending: true, chips: true },
      { pending: true, chips: false },
    ])
  })
})
